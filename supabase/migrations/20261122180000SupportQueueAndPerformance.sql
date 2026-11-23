-- Support Officer Queue sorting context, reopened tracking, and optional satisfaction feedback.
alter table public.admin_matters
  add column if not exists reopened_count integer not null default 0,
  add column if not exists satisfaction_rating smallint check (satisfaction_rating between 1 and 5),
  add column if not exists satisfaction_comment text;

create or replace function ceda_private.support_ticket_list()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform ceda_private.require_support_officer();
  return coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'id', m.reference,
        'title', m.title,
        'kind', m.kind,
        'reporter', m.reporter,
        'priority', m.priority,
        'state', m.state,
        'owner', m.owner_name,
        'reported', to_char(m.reported_at at time zone 'Africa/Gaborone', 'YYYY-MM-DD HH24:MI'),
        'updatedAt', to_char(m.updated_at at time zone 'Africa/Gaborone', 'YYYY-MM-DD HH24:MI'),
        'application', m.application_ref,
        'detail', m.detail,
        'steps', m.steps,
        'thread', m.thread_messages,
        'history', m.history,
        'reopenedCount', coalesce(m.reopened_count, 0),
        'satisfactionRating', m.satisfaction_rating
      ) order by
        case m.state when 'Open' then 1 when 'Investigating' then 2 when 'Waiting' then 3 else 4 end,
        m.updated_at desc,
        m.reference asc
    )
    from public.admin_matters m
    where m.owner_id is not null and m.kind in ('Bug', 'Support', 'Feedback')
  ), '[]'::jsonb);
end $$;

create or replace function ceda_private.support_update_ticket(
  p_reference text,
  p_state text,
  p_reason text,
  p_reply text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := ceda_private.require_support_officer();
  actor_name text;
  current_matter public.admin_matters;
  clean_reply text := nullif(btrim(coalesce(p_reply, '')), '');
  now_bw text := to_char(now() at time zone 'Africa/Gaborone', 'YYYY-MM-DD HH24:MI');
  next_thread jsonb;
  linked_app_id uuid;
  was_reopened boolean := false;
begin
  if p_reference is null or length(btrim(p_reference)) not between 3 and 32
    or p_state not in ('Open', 'Investigating', 'Waiting', 'Resolved')
    or p_reason is null or length(btrim(p_reason)) not between 5 and 500 then
    raise exception 'Provide a valid request, status and internal action note (5-500 characters)';
  end if;
  if clean_reply is not null and length(clean_reply) not between 2 and 2000 then
    raise exception 'Reply message must be between 2 and 2000 characters';
  end if;

  select * into current_matter
  from public.admin_matters
  where reference = btrim(p_reference)
    and owner_id is not null
    and kind in ('Bug', 'Support', 'Feedback')
  for update;
  if not found then raise exception 'Support request not found'; end if;

  was_reopened := (current_matter.state = 'Resolved' and p_state <> 'Resolved');

  select coalesce(p.full_name, 'Support Officer') into actor_name
  from public.profiles p where p.id = actor;
  next_thread := coalesce(current_matter.thread_messages, '[]'::jsonb);

  if clean_reply is not null then
    next_thread := next_thread || jsonb_build_array(jsonb_build_object(
      'sender', actor_name, 'role', 'support', 'body', clean_reply, 'at', now_bw
    ));
  elsif p_state <> current_matter.state then
    next_thread := next_thread || jsonb_build_array(jsonb_build_object(
      'sender', actor_name, 'role', 'system',
      'body', 'Support request status updated to ' || p_state || '.', 'at', now_bw
    ));
  end if;

  update public.admin_matters
  set owner_name = actor_name,
      state = p_state,
      reopened_count = case when was_reopened then coalesce(current_matter.reopened_count, 0) + 1 else coalesce(current_matter.reopened_count, 0) end,
      thread_messages = next_thread,
      history = coalesce(current_matter.history, '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
        'actor', actor_name,
        'action', 'Support Officer updated status from ' || current_matter.state || ' to ' || p_state || '. ' || btrim(p_reason),
        'at', now_bw
      )),
      updated_at = now()
  where id = current_matter.id;

  if current_matter.application_ref is not null then
    select id into linked_app_id from public.innovation_applications
    where reference = current_matter.application_ref and owner_id = current_matter.owner_id limit 1;
  end if;

  if clean_reply is not null then
    insert into public.portal_messages(
      owner_id, application_id, application_ref, thread_type, subject,
      sender_id, sender_name, sender_role, body, is_read_by_innovator
    ) values (
      current_matter.owner_id, linked_app_id, current_matter.application_ref, 'support',
      current_matter.reference || ' - ' || current_matter.title,
      actor, actor_name, 'support', clean_reply, false
    );
  end if;

  if clean_reply is not null or p_state <> current_matter.state then
    insert into public.innovator_notifications(user_id, kind, title, message, application_ref, target_hash)
    values (
      current_matter.owner_id,
      'support',
      current_matter.reference || ' - Support request updated (' || p_state || ')',
      coalesce(left(clean_reply, 180), 'Your support request status is now ' || p_state || '.'),
      current_matter.application_ref,
      case when current_matter.title = 'Human support follow-up from Optimus Prime' then '#optimus' else '#support' end
    );
  end if;

  insert into public.admin_audit(actor_id, action, target, detail)
  values (actor, 'support.ticket.updated', current_matter.reference, jsonb_build_object(
    'before_state', current_matter.state,
    'after_state', p_state,
    'replied', clean_reply is not null,
    'reopened', was_reopened,
    'reason', btrim(p_reason)
  ));

  return ceda_private.support_ticket_list();
end $$;

create or replace function ceda_private.innovator_reply_support_request(
  p_reference text,
  p_message text
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := ceda_private.require_innovator();
  sender_display text;
  matter_row public.admin_matters;
  now_bw text := to_char(now() at time zone 'Africa/Gaborone', 'YYYY-MM-DD HH24:MI');
  next_state text;
  reopened boolean := false;
  history_note text := null;
begin
  if p_reference is null or p_message is null or length(btrim(p_message)) not between 2 and 2000 then
    raise exception 'Enter a reply of at least 2 characters';
  end if;
  select * into matter_row from public.admin_matters
  where reference = btrim(p_reference) and owner_id = actor for update;
  if not found then raise exception 'Support request not found'; end if;
  select full_name into sender_display from public.profiles where id = actor;

  reopened := (matter_row.state = 'Resolved');
  next_state := case when matter_row.state in ('Waiting', 'Resolved') then 'Open' else matter_row.state end;
  if matter_row.state = 'Waiting' then
    history_note := 'Innovator replied from Waiting to Open';
  elsif matter_row.state = 'Resolved' then
    history_note := 'Innovator reopened from Resolved to Open';
  end if;

  update public.admin_matters
  set thread_messages = matter_row.thread_messages || jsonb_build_array(
        jsonb_build_object('sender', coalesce(sender_display, 'Innovator'), 'role', 'innovator', 'body', btrim(p_message), 'at', now_bw)
      ),
      state = next_state,
      reopened_count = case when reopened then coalesce(matter_row.reopened_count, 0) + 1 else coalesce(matter_row.reopened_count, 0) end,
      history = case when history_note is not null
        then coalesce(matter_row.history, '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
          'actor', coalesce(sender_display, 'Innovator'), 'action', history_note, 'at', now_bw
        ))
        else matter_row.history end,
      updated_at = now()
  where id = matter_row.id;

  return coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'id', m.reference,
        'title', m.title,
        'kind', m.kind,
        'priority', m.priority,
        'state', m.state,
        'owner', case when m.owner_name = 'Unassigned' then 'CEDA Support Desk' else m.owner_name end,
        'applicationRef', m.application_ref,
        'detail', m.detail,
        'steps', m.steps,
        'thread', m.thread_messages,
        'reportedAt', to_char(m.reported_at at time zone 'Africa/Gaborone', 'YYYY-MM-DD HH24:MI')
      ) order by m.reported_at desc
    )
    from public.admin_matters m
    where m.owner_id = actor
  ), '[]'::jsonb);
end $$;

create or replace function public.support_ticket_list()
returns jsonb
language sql
security definer
set search_path = ''
as $$ select ceda_private.support_ticket_list() $$;

create or replace function public.support_update_ticket(
  p_reference text,
  p_state text,
  p_reason text,
  p_reply text default null
)
returns jsonb
language sql
security definer
set search_path = ''
as $$ select ceda_private.support_update_ticket(p_reference, p_state, p_reason, p_reply) $$;

revoke all on function ceda_private.support_ticket_list() from public, anon, authenticated;
revoke all on function ceda_private.support_update_ticket(text, text, text, text) from public, anon, authenticated;
revoke all on function public.support_ticket_list() from public, anon;
revoke all on function public.support_update_ticket(text, text, text, text) from public, anon;
grant execute on function public.support_ticket_list() to authenticated;
grant execute on function public.support_update_ticket(text, text, text, text) to authenticated;
