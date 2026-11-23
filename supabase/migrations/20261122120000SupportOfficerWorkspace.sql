-- Support Officer workspace: protected queue, conversation replies and ticket status updates.
create or replace function ceda_private.require_support_officer()
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare actor uuid := auth.uid();
begin
  if actor is null or not exists (
    select 1
    from public.profiles p
    join auth.users u on u.id = p.id
    where p.id = actor
      and p.account_role = 'support'
      and p.account_status = 'active'
      and u.email_confirmed_at is not null
      and not u.is_anonymous
      and (u.banned_until is null or u.banned_until < now())
  ) or not exists (
    select 1 from auth.sessions s
    where s.user_id = actor
      and s.id::text = (auth.jwt()->>'session_id')
      and (s.not_after is null or s.not_after > now())
  ) then
    raise exception 'Support Officer access required' using errcode = '42501';
  end if;
  return actor;
end $$;

revoke all on function ceda_private.require_support_officer() from public, anon, authenticated;

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
        'thread', m.thread_messages
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
    'reason', btrim(p_reason)
  ));

  return ceda_private.support_ticket_list();
end $$;

create or replace function public.support_ticket_list()
returns jsonb
language sql
security invoker
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
security invoker
set search_path = ''
as $$ select ceda_private.support_update_ticket(p_reference, p_state, p_reason, p_reply) $$;

revoke all on function ceda_private.support_ticket_list() from public, anon, authenticated;
revoke all on function ceda_private.support_update_ticket(text,text,text,text) from public, anon, authenticated;
revoke all on function public.support_ticket_list() from public, anon;
revoke all on function public.support_update_ticket(text,text,text,text) from public, anon;
grant execute on function public.support_ticket_list() to authenticated;
grant execute on function public.support_update_ticket(text,text,text,text) to authenticated;
