-- Support Officer AI handoff context in ticket feed, one-click Connect RPC, and first-name-only innovator display.

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
        'ownerFirstName', case
          when m.owner_name is null or btrim(m.owner_name) = '' or m.owner_name = 'Unassigned' then null
          else split_part(btrim(m.owner_name), ' ', 1)
        end,
        'reported', to_char(m.reported_at at time zone 'Africa/Gaborone', 'YYYY-MM-DD HH24:MI'),
        'updatedAt', to_char(m.updated_at at time zone 'Africa/Gaborone', 'YYYY-MM-DD HH24:MI'),
        'application', m.application_ref,
        'detail', m.detail,
        'steps', m.steps,
        'thread', m.thread_messages,
        'history', m.history,
        'reopenedCount', coalesce(m.reopened_count, 0),
        'satisfactionRating', m.satisfaction_rating,
        'aiConversation', coalesce((
          select jsonb_agg(
            jsonb_build_object(
              'id', o.id,
              'topic', o.topic,
              'question', o.question,
              'answer', o.answer,
              'sourceArticle', o.source_article,
              'escalated', o.escalated,
              'createdAt', to_char(o.created_at at time zone 'Africa/Gaborone', 'YYYY-MM-DD HH24:MI')
            ) order by o.created_at asc
          )
          from (
            select o.*
            from public.optimus_interactions o
            where o.user_id = m.owner_id
              and o.created_at <= m.reported_at + interval '1 minute'
              and o.created_at > coalesce((
                select max(prev.reported_at)
                from public.admin_matters prev
                where prev.owner_id = m.owner_id
                  and prev.reported_at < m.reported_at
                  and (prev.title ilike '%optimus%' or prev.steps ilike '%optimus%')
              ), '-infinity'::timestamptz)
            order by o.created_at desc
            limit 20
          ) o
        ), '[]'::jsonb)
      ) order by
        case m.state when 'Open' then 1 when 'Investigating' then 2 when 'Waiting' then 3 else 4 end,
        m.updated_at desc,
        m.reference asc
    )
    from public.admin_matters m
    where m.owner_id is not null and m.kind in ('Bug', 'Support', 'Feedback')
  ), '[]'::jsonb);
end $$;

create or replace function ceda_private.support_connect_ticket(
  p_reference text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := ceda_private.require_support_officer();
  actor_name text;
  first_name text;
  current_matter public.admin_matters;
  now_bw text := to_char(now() at time zone 'Africa/Gaborone', 'YYYY-MM-DD HH24:MI');
  next_state text;
  next_thread jsonb;
  next_history jsonb;
  already_same_owner boolean := false;
begin
  if p_reference is null or length(btrim(p_reference)) not between 3 and 32 then
    raise exception 'Provide a valid support ticket reference';
  end if;

  select * into current_matter
  from public.admin_matters
  where reference = btrim(p_reference)
    and owner_id is not null
    and kind in ('Bug', 'Support', 'Feedback')
  for update;
  if not found then raise exception 'Support request not found'; end if;

  select coalesce(nullif(btrim(p.full_name), ''), 'Support Officer') into actor_name
  from public.profiles p where p.id = actor;
  first_name := coalesce(nullif(split_part(actor_name, ' ', 1), ''), 'Support');
  already_same_owner := (current_matter.owner_name = actor_name);

  next_state := case when current_matter.state = 'Open' then 'Investigating' else current_matter.state end;
  next_thread := coalesce(current_matter.thread_messages, '[]'::jsonb);
  next_history := coalesce(current_matter.history, '[]'::jsonb);

  if not already_same_owner then
    next_thread := next_thread || jsonb_build_array(jsonb_build_object(
      'sender', actor_name,
      'role', 'system',
      'body', first_name || ' connected to help with this conversation.',
      'at', now_bw
    ));
    next_history := next_history || jsonb_build_array(jsonb_build_object(
      'actor', actor_name,
      'action', 'Support Officer connected to conversation (' || next_state || ').',
      'at', now_bw
    ));

    update public.admin_matters
    set owner_name = actor_name,
        state = next_state,
        thread_messages = next_thread,
        history = next_history,
        updated_at = now()
    where id = current_matter.id;

    insert into public.innovator_notifications(user_id, kind, title, message, application_ref, target_hash)
    values (
      current_matter.owner_id,
      'support',
      current_matter.reference || ' - ' || first_name || ' joined your support chat',
      'You are now connected to ' || first_name || ' from CEDA Support.',
      current_matter.application_ref,
      case when current_matter.title = 'Human support follow-up from Optimus Prime' then '#optimus' else '#support' end
    );

    insert into public.admin_audit(actor_id, action, target, detail)
    values (actor, 'support.ticket.connected', current_matter.reference, jsonb_build_object(
      'before_owner', current_matter.owner_name,
      'after_owner', actor_name,
      'before_state', current_matter.state,
      'after_state', next_state
    ));
  end if;

  return ceda_private.support_ticket_list();
end $$;

create or replace function public.support_connect_ticket(p_reference text)
returns jsonb
language sql
security definer
set search_path = ''
as $$ select ceda_private.support_connect_ticket(p_reference) $$;

revoke all on function ceda_private.support_connect_ticket(text) from public, anon, authenticated;
revoke all on function public.support_connect_ticket(text) from public, anon;
grant execute on function public.support_connect_ticket(text) to authenticated;

-- Redact Support Officer full names to first name only on Innovator-facing payloads.
create or replace function ceda_private.innovator_workspace_bootstrap()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := ceda_private.require_innovator();
  prof record;
begin
  select p.id, p.full_name, u.email, p.account_role, p.account_status,
         p.phone, p.district, p.expertise, p.company_name, p.company_reg_number,
         p.company_sector, p.company_role, p.preferences
  into prof
  from public.profiles p join auth.users u on u.id = p.id
  where p.id = actor;

  return jsonb_build_object(
    'profile', jsonb_build_object(
      'id', prof.id,
      'fullName', prof.full_name,
      'email', prof.email,
      'phone', prof.phone,
      'district', prof.district,
      'expertise', prof.expertise,
      'companyName', prof.company_name,
      'companyRegNumber', prof.company_reg_number,
      'companySector', prof.company_sector,
      'companyRole', prof.company_role,
      'preferences', prof.preferences
    ),
    'sectors', coalesce((
      select jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name) order by s.name)
      from public.sectors s where s.status = 'published'
    ), '[]'::jsonb),
    'applications', coalesce((
      select jsonb_agg(ceda_private.project_innovator_application(a) order by a.updated_at desc)
      from public.innovation_applications a
      where a.owner_id = actor
    ), '[]'::jsonb),
    'documents', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', d.id,
          'applicationId', d.application_id,
          'applicationRef', app.reference,
          'sectionKey', d.section_key,
          'docKind', d.doc_kind,
          'title', d.title,
          'category', d.category,
          'description', d.description,
          'fileName', d.file_name,
          'mimeType', d.mime_type,
          'fileSize', d.file_size,
          'storagePath', d.storage_path,
          'videoUrl', d.video_url,
          'passwordProtected', d.password_protected,
          'version', d.version,
          'uploadStatus', d.upload_status,
          'createdAt', to_char(d.created_at at time zone 'Africa/Gaborone', 'YYYY-MM-DD HH24:MI')
        ) order by d.created_at desc
      )
      from public.application_documents d
      join public.innovation_applications app on app.id = d.application_id
      where d.owner_id = actor and d.upload_status <> 'Removed'
    ), '[]'::jsonb),
    'messages', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', m.id,
          'applicationId', m.application_id,
          'applicationRef', m.application_ref,
          'threadType', m.thread_type,
          'subject', m.subject,
          'senderName', case
            when m.sender_role in ('support', 'admin')
              then coalesce(nullif(split_part(btrim(coalesce(m.sender_name, '')), ' ', 1), ''), 'CEDA Support')
            else m.sender_name
          end,
          'senderRole', m.sender_role,
          'body', m.body,
          'attachmentName', m.attachment_name,
          'attachmentPath', m.attachment_path,
          'isRead', m.is_read_by_innovator,
          'createdAt', to_char(m.created_at at time zone 'Africa/Gaborone', 'YYYY-MM-DD HH24:MI')
        ) order by m.created_at asc
      )
      from public.portal_messages m
      where m.owner_id = actor
    ), '[]'::jsonb),
    'notifications', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', n.id,
          'kind', n.kind,
          'title', n.title,
          'message', n.message,
          'applicationRef', n.application_ref,
          'targetHash', n.target_hash,
          'isRead', n.is_read,
          'createdAt', to_char(n.created_at at time zone 'Africa/Gaborone', 'YYYY-MM-DD HH24:MI')
        ) order by n.created_at desc
      )
      from (select * from public.innovator_notifications where user_id = actor order by created_at desc limit 40) n
    ), '[]'::jsonb),
    'supportRequests', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', m.reference,
          'title', m.title,
          'kind', m.kind,
          'priority', m.priority,
          'state', m.state,
          'owner', case
            when m.owner_name = 'Unassigned' then 'CEDA Support Desk'
            else coalesce(nullif(split_part(btrim(m.owner_name), ' ', 1), ''), 'CEDA Support')
          end,
          'applicationRef', m.application_ref,
          'detail', m.detail,
          'steps', m.steps,
          'thread', coalesce((
            select jsonb_agg(
              case
                when (t.elem->>'role') in ('support', 'admin', 'system')
                  and nullif(btrim(coalesce(t.elem->>'sender', '')), '') is not null
                  then jsonb_set(t.elem, '{sender}', to_jsonb(split_part(btrim(t.elem->>'sender'), ' ', 1)))
                else t.elem
              end
              order by t.ord
            )
            from jsonb_array_elements(coalesce(m.thread_messages, '[]'::jsonb)) with ordinality as t(elem, ord)
          ), '[]'::jsonb),
          'reportedAt', to_char(m.reported_at at time zone 'Africa/Gaborone', 'YYYY-MM-DD HH24:MI')
        ) order by m.reported_at desc
      )
      from public.admin_matters m
      where m.owner_id = actor
    ), '[]'::jsonb),
    'faqs', coalesce((
      select jsonb_agg(
        jsonb_build_object('id', c.id, 'title', c.title, 'summary', c.summary, 'body', c.body, 'kind', c.kind)
        order by c.updated_at desc
      )
      from public.portal_content c
      where c.stage = 'Published' and c.kind in ('FAQs','Public pages','Announcements')
    ), '[]'::jsonb),
    'optimusHistory', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', o.id,
          'topic', o.topic,
          'question', o.question,
          'answer', o.answer,
          'sourceArticle', o.source_article,
          'escalated', o.escalated,
          'rating', o.rating,
          'createdAt', to_char(o.created_at at time zone 'Africa/Gaborone', 'YYYY-MM-DD HH24:MI')
        ) order by o.created_at desc
      )
      from (select * from public.optimus_interactions where user_id = actor order by created_at desc limit 20) o
    ), '[]'::jsonb)
  );
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
        'owner', case
          when m.owner_name = 'Unassigned' then 'CEDA Support Desk'
          else coalesce(nullif(split_part(btrim(m.owner_name), ' ', 1), ''), 'CEDA Support')
        end,
        'applicationRef', m.application_ref,
        'detail', m.detail,
        'steps', m.steps,
        'thread', coalesce((
          select jsonb_agg(
            case
              when (t.elem->>'role') in ('support', 'admin', 'system')
                and nullif(btrim(coalesce(t.elem->>'sender', '')), '') is not null
                then jsonb_set(t.elem, '{sender}', to_jsonb(split_part(btrim(t.elem->>'sender'), ' ', 1)))
              else t.elem
            end
            order by t.ord
          )
          from jsonb_array_elements(coalesce(m.thread_messages, '[]'::jsonb)) with ordinality as t(elem, ord)
        ), '[]'::jsonb),
        'reportedAt', to_char(m.reported_at at time zone 'Africa/Gaborone', 'YYYY-MM-DD HH24:MI')
      ) order by m.reported_at desc
    )
    from public.admin_matters m
    where m.owner_id = actor
  ), '[]'::jsonb);
end $$;
