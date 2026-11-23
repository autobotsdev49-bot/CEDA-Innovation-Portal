-- Multi-user Live Chat (09:00hrs-16:00hrs working days ONLY in Africa/Gaborone),
-- unified escalation handling (Optimus Prime, Submission Wizard, Application/Clarification, Help & Support),
-- busy/after-hours/non-working-day notification messages, and Online Chat Analytics Reporting.

alter table public.profiles
  add column if not exists support_availability text not null default 'Available'
    check (support_availability in ('Available', 'Busy', 'Offline')),
  add column if not exists support_max_concurrent integer not null default 5
    check (support_max_concurrent between 1 and 20),
  add column if not exists support_last_active_at timestamptz;

alter table public.admin_matters
  add column if not exists assigned_officer_id uuid references public.profiles(id),
  add column if not exists escalation_source text not null default 'Help & Support',
  add column if not exists wizard_step smallint,
  add column if not exists queued_outside_hours boolean not null default false,
  add column if not exists availability_status text not null default 'available',
  add column if not exists availability_notice text,
  add column if not exists first_response_at timestamptz,
  add column if not exists resolved_at timestamptz;

create index if not exists idx_admin_matters_live_chat_queue
  on public.admin_matters (state, priority, updated_at desc);

create index if not exists idx_admin_matters_assigned_officer
  on public.admin_matters (assigned_officer_id, state);

-- Backfill escalation_source for existing Optimus escalations
update public.admin_matters
set escalation_source = 'Optimus Prime'
where escalation_source = 'Help & Support'
  and (title ilike '%optimus%' or steps ilike '%optimus%' or detail ilike '%optimus%');

-- Authoritative server-side CEDA Live Chat availability evaluator (09:00hrs to 16:00hrs working days ONLY, Africa/Gaborone)
create or replace function ceda_private.live_chat_availability_status(
  p_now timestamptz default now()
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  local_ts timestamp := p_now at time zone 'Africa/Gaborone';
  iso_dow integer := extract(isodow from local_ts)::integer;
  hr integer := extract(hour from local_ts)::integer;
  mm_dd text := to_char(local_ts, 'MM-DD');
  date_key text := to_char(local_ts, 'YYYY-MM-DD');
  time_cat text := to_char(local_ts, 'HH24:MI');
  day_name text := trim(to_char(local_ts, 'Day'));
  is_holiday boolean := mm_dd in ('01-01', '01-02', '05-01', '07-01', '09-30', '10-01', '12-25', '12-26');
  is_working_day boolean := (iso_dow between 1 and 5) and not is_holiday;
  is_within_hours boolean := (hr >= 9 and hr < 16);
  total_support_officers integer := 0;
  available_agents integer := 0;
  busy_agents integer := 0;
  online_agents integer := 0;
  total_active_chats integer := 0;
  total_capacity integer := 0;
  status_key text := 'available';
  badge_label text := 'Live Chat Online (09:00–16:00)';
  notice_msg text := 'CEDA service consultants are online (09:00hrs to 16:00hrs working days). Multi-user live chat and escalations connect in real time.';
  agents_json jsonb := '[]'::jsonb;
begin
  with officer_load as (
    select
      p.id,
      coalesce(nullif(btrim(p.full_name), ''), 'Support Officer') as full_name,
      coalesce(nullif(split_part(btrim(coalesce(p.full_name, '')), ' ', 1), ''), 'Support') as first_name,
      p.support_availability as availability,
      coalesce(p.support_max_concurrent, 5) as max_concurrent,
      (
        select count(*)::integer
        from public.admin_matters m
        where m.state = 'Investigating'
          and (
            m.assigned_officer_id = p.id
            or lower(btrim(coalesce(m.owner_name, ''))) = lower(btrim(coalesce(p.full_name, '')))
          )
      ) as active_chats
    from public.profiles p
    where p.account_role = 'support'
      and p.account_status = 'active'
  )
  select
    count(*)::integer,
    count(*) filter (where availability = 'Available' and active_chats < max_concurrent)::integer,
    count(*) filter (where availability = 'Busy' or (availability = 'Available' and active_chats >= max_concurrent))::integer,
    count(*) filter (where availability in ('Available', 'Busy'))::integer,
    coalesce(sum(active_chats), 0)::integer,
    coalesce(sum(case when availability in ('Available', 'Busy') then max_concurrent else 0 end), 0)::integer,
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', id,
          'name', full_name,
          'firstName', first_name,
          'availability', availability,
          'activeChats', active_chats,
          'maxConcurrent', max_concurrent
        ) order by full_name
      ),
      '[]'::jsonb
    )
  into
    total_support_officers,
    available_agents,
    busy_agents,
    online_agents,
    total_active_chats,
    total_capacity,
    agents_json
  from officer_load;

  -- If no support officer rows exist yet in test/demo environments, model default consultant pool
  if total_support_officers = 0 then
    available_agents := 1;
    online_agents := 1;
    total_capacity := 5;
  end if;

  if not is_working_day then
    status_key := 'non_working_day';
    badge_label := case when is_holiday then 'Public Holiday · Offline' else 'Weekend · Non-Working Day' end;
    notice_msg := 'Agent not available at the moment — CEDA Live Chat is available from 09:00hrs to 16:00hrs on working days ONLY (Monday to Friday, excluding public holidays). Your message or escalation is saved in the queue for the next working day at 09:00hrs.';
  elsif not is_within_hours then
    status_key := 'after_hours';
    badge_label := 'After Hours (Open 09:00–16:00)';
    notice_msg := 'Agent not available at the moment — CEDA Live Chat operates from 09:00hrs to 16:00hrs on working days ONLY. Your message or escalation has been queued for the next available service consultant at 09:00hrs.';
  elsif available_agents = 0 then
    status_key := 'all_agents_busy';
    badge_label := 'All Agents Busy · Queue Active';
    notice_msg := 'Agent not available at the moment — all CEDA service consultants are currently busy attending to other live chats. Your chat is queued and the next available consultant will connect shortly.';
  end if;

  return jsonb_build_object(
    'status', status_key,
    'isLiveAvailable', (status_key = 'available'),
    'isWorkingDay', is_working_day,
    'isHoliday', is_holiday,
    'isWithinHours', is_within_hours,
    'dateKey', date_key,
    'currentDayLabel', day_name,
    'currentTimeCat', time_cat,
    'scheduleLabel', '09:00hrs to 16:00hrs on working days ONLY (Monday–Friday CAT)',
    'shortScheduleLabel', '09:00–16:00 Mon–Fri CAT',
    'badgeLabel', badge_label,
    'notificationMessage', notice_msg,
    'availableAgentsCount', available_agents,
    'busyAgentsCount', busy_agents,
    'onlineAgentsCount', online_agents,
    'totalActiveChats', total_active_chats,
    'totalCapacity', total_capacity,
    'agents', agents_json
  );
end $$;

create or replace function public.live_chat_status()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$ select ceda_private.live_chat_availability_status(now()) $$;

revoke all on function ceda_private.live_chat_availability_status(timestamptz) from public, anon, authenticated;
revoke all on function public.live_chat_status() from public, anon;
grant execute on function public.live_chat_status() to authenticated;

-- Support Officer availability & multi-chat capacity update RPC
create or replace function ceda_private.support_set_availability(
  p_availability text,
  p_max_concurrent integer default 5
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := ceda_private.require_support_officer();
  clean_avail text := btrim(coalesce(p_availability, ''));
  clean_max integer := greatest(1, least(20, coalesce(p_max_concurrent, 5)));
begin
  if clean_avail not in ('Available', 'Busy', 'Offline') then
    raise exception 'Choose Available, Busy, or Offline';
  end if;

  update public.profiles
  set support_availability = clean_avail,
      support_max_concurrent = clean_max,
      support_last_active_at = now(),
      updated_at = now()
  where id = actor;

  insert into public.admin_audit(actor_id, action, target, detail)
  values (
    actor,
    'support.availability.updated',
    actor::text,
    jsonb_build_object('availability', clean_avail, 'max_concurrent', clean_max)
  );

  return ceda_private.live_chat_availability_status(now());
end $$;

create or replace function public.support_set_availability(
  p_availability text,
  p_max_concurrent integer default 5
)
returns jsonb
language sql
security definer
set search_path = ''
as $$ select ceda_private.support_set_availability(p_availability, p_max_concurrent) $$;

revoke all on function ceda_private.support_set_availability(text, integer) from public, anon, authenticated;
revoke all on function public.support_set_availability(text, integer) from public, anon;
grant execute on function public.support_set_availability(text, integer) to authenticated;

-- Enrich innovator-facing support request projection with live chat & escalation metadata
create or replace function ceda_private.optimus_project_support_requests(p_actor uuid)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select coalesce((
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
        'escalationSource', coalesce(m.escalation_source, 'Help & Support'),
        'wizardStep', m.wizard_step,
        'queuedOutsideHours', coalesce(m.queued_outside_hours, false),
        'availabilityStatus', coalesce(m.availability_status, 'available'),
        'availabilityNotice', m.availability_notice,
        'satisfactionRating', m.satisfaction_rating,
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
        'reportedAt', to_char(m.reported_at at time zone 'Africa/Gaborone', 'YYYY-MM-DD HH24:MI'),
        'updatedAt', to_char(m.updated_at at time zone 'Africa/Gaborone', 'YYYY-MM-DD HH24:MI')
      ) order by m.updated_at desc, m.reported_at desc
    )
    from public.admin_matters m
    where m.owner_id = p_actor
  ), '[]'::jsonb);
$$;

-- Start or escalate a conversation into Live Chat with a CEDA service consultant
-- during the submission process or for any other inquiry/escalation.
create or replace function ceda_private.innovator_start_live_chat(
  p_title text,
  p_message text,
  p_escalation_source text default 'Live Chat',
  p_application_ref text default null,
  p_wizard_step integer default null,
  p_kind text default 'Support',
  p_priority text default 'Normal'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := ceda_private.require_innovator();
  clean_title text := btrim(coalesce(p_title, ''));
  clean_msg text := btrim(coalesce(p_message, ''));
  clean_source text := coalesce(nullif(btrim(coalesce(p_escalation_source, '')), ''), 'Live Chat');
  clean_kind text := case when p_kind in ('Bug', 'Support', 'Feedback') then p_kind else 'Support' end;
  clean_priority text := case when p_priority = 'High' or clean_kind = 'Bug' then 'High' else 'Normal' end;
  clean_step smallint := case when p_wizard_step between 1 and 12 then p_wizard_step::smallint else null end;
  reporter_name text;
  linked_app_id uuid;
  clean_app_ref text := null;
  avail jsonb := ceda_private.live_chat_availability_status(now());
  avail_status text := coalesce(avail->>'status', 'available');
  avail_notice text := avail->>'notificationMessage';
  outside_hours boolean := (avail_status in ('after_hours', 'non_working_day'));
  now_bw text := to_char(now() at time zone 'Africa/Gaborone', 'YYYY-MM-DD HH24:MI');
  ref_prefix text;
  new_ref text;
  initial_thread jsonb;
  steps_label text;
begin
  if length(clean_msg) not between 2 and 2000 then
    raise exception 'Enter a message between 2 and 2000 characters';
  end if;
  if length(clean_title) < 3 then
    clean_title := case
      when clean_step is not null then 'Submission live chat · Step ' || clean_step::text
      when clean_source = 'Optimus Prime' then 'Human support follow-up from Optimus Prime'
      else 'Live chat with CEDA Service Consultant'
    end;
  end if;
  clean_title := left(clean_title, 200);

  if p_application_ref is not null and length(btrim(p_application_ref)) > 0 then
    select a.id, a.reference
    into linked_app_id, clean_app_ref
    from public.innovation_applications a
    where a.owner_id = actor and upper(a.reference) = upper(btrim(p_application_ref))
    limit 1;
  end if;

  select coalesce(nullif(btrim(full_name), ''), 'Innovator')
  into reporter_name
  from public.profiles
  where id = actor;

  steps_label := case
    when clean_step is not null then 'Live Chat · Submission Step ' || clean_step::text
    when clean_source ilike '%optimus%' then 'Escalated from Optimus Prime'
    when clean_source ilike '%application%' or clean_source ilike '%clarif%' then 'Escalated to Live Chat · Application'
    else 'Live Chat · ' || clean_source
  end;

  initial_thread := jsonb_build_array(
    jsonb_build_object(
      'sender', reporter_name,
      'role', 'innovator',
      'body', clean_msg,
      'at', now_bw
    ),
    jsonb_build_object(
      'sender', 'CEDA Live Chat',
      'role', 'system',
      'body', case
        when avail_status = 'available'
          then 'Connected to CEDA Live Chat queue (09:00hrs–16:00hrs working days). A CEDA service consultant will attend to your chat shortly.'
        else avail_notice
      end,
      'at', now_bw
    )
  );

  ref_prefix := case clean_kind when 'Bug' then 'BUG-' when 'Feedback' then 'FB-' else 'CHAT-' end;
  new_ref := ref_prefix || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));

  insert into public.admin_matters (
    reference, title, kind, reporter, owner_id, priority, state, owner_name,
    application_ref, detail, steps, escalation_source, wizard_step,
    queued_outside_hours, availability_status, availability_notice, thread_messages
  )
  values (
    new_ref,
    clean_title,
    clean_kind,
    reporter_name,
    actor,
    clean_priority,
    'Open',
    'Unassigned',
    clean_app_ref,
    left(case when length(clean_msg) < 10 then clean_title || ' — ' || clean_msg else clean_msg end, 2000),
    steps_label,
    clean_source,
    clean_step,
    outside_hours,
    avail_status,
    case when avail_status <> 'available' then avail_notice else null end,
    initial_thread
  );

  insert into public.portal_messages (
    owner_id, application_id, application_ref, thread_type, subject,
    sender_id, sender_name, sender_role, body, is_read_by_innovator
  )
  values (
    actor, linked_app_id, clean_app_ref, 'support',
    new_ref || ' — ' || clean_title, actor, reporter_name, 'innovator', clean_msg, true
  );

  insert into public.innovator_notifications (
    user_id, kind, title, message, application_ref, target_hash
  )
  values (
    actor,
    'support',
    new_ref || case when avail_status = 'available' then ' connected to CEDA Live Chat' else ' queued in CEDA Live Chat' end,
    case when avail_status = 'available'
      then 'Your live chat "' || clean_title || '" is active in the CEDA consultant queue.'
      else avail_notice
    end,
    clean_app_ref,
    '#optimus'
  );

  return ceda_private.optimus_project_support_requests(actor);
end $$;

create or replace function public.innovator_start_live_chat(
  p_title text,
  p_message text,
  p_escalation_source text default 'Live Chat',
  p_application_ref text default null,
  p_wizard_step integer default null,
  p_kind text default 'Support',
  p_priority text default 'Normal'
)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select ceda_private.innovator_start_live_chat(
    p_title, p_message, p_escalation_source, p_application_ref, p_wizard_step, p_kind, p_priority
  );
$$;

revoke all on function ceda_private.innovator_start_live_chat(text, text, text, text, integer, text, text) from public, anon, authenticated;
revoke all on function public.innovator_start_live_chat(text, text, text, text, integer, text, text) from public, anon;
grant execute on function public.innovator_start_live_chat(text, text, text, text, integer, text, text) to authenticated;

-- Upgrade innovator_create_support_request to include live chat availability notification & projection
create or replace function ceda_private.innovator_create_support_request(
  p_kind text,
  p_title text,
  p_detail text,
  p_application_ref text default null,
  p_steps text default 'Not supplied'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := ceda_private.require_innovator();
  reporter_name text;
  ref_prefix text;
  new_ref text;
  now_bw text := to_char(now() at time zone 'Africa/Gaborone', 'YYYY-MM-DD HH24:MI');
  linked_app_id uuid;
  clean_app_ref text := null;
  avail jsonb := ceda_private.live_chat_availability_status(now());
  avail_status text := coalesce(avail->>'status', 'available');
  avail_notice text := avail->>'notificationMessage';
  outside_hours boolean := (avail_status in ('after_hours', 'non_working_day'));
  esc_source text;
  init_thread jsonb;
begin
  if p_kind not in ('Bug', 'Support', 'Feedback')
    or p_title is null or length(btrim(p_title)) not between 3 and 200
    or p_detail is null or length(btrim(p_detail)) not between 10 and 2000 then
    raise exception 'Provide a valid category, subject and description (at least 10 characters)';
  end if;

  if p_application_ref is not null and length(btrim(p_application_ref)) > 0 then
    select id, reference into linked_app_id, clean_app_ref
    from public.innovation_applications
    where upper(reference) = upper(btrim(p_application_ref)) and owner_id = actor
    limit 1;
  end if;

  select coalesce(nullif(btrim(full_name), ''), 'Innovator') into reporter_name
  from public.profiles where id = actor;

  esc_source := case
    when btrim(p_title) ilike '%optimus%' or coalesce(p_steps, '') ilike '%optimus%' then 'Optimus Prime'
    when coalesce(p_steps, '') ilike '%wizard%' or coalesce(p_steps, '') ilike '%submission step%' then 'Submission Wizard'
    when coalesce(p_steps, '') ilike '%escalat%' or coalesce(p_steps, '') ilike '%live chat%' then 'Live Chat'
    else 'Help & Support'
  end;

  ref_prefix := case p_kind when 'Bug' then 'BUG-' when 'Feedback' then 'FB-' else 'TKT-' end;
  new_ref := ref_prefix || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));

  init_thread := jsonb_build_array(
    jsonb_build_object('sender', reporter_name, 'role', 'innovator', 'body', btrim(p_detail), 'at', now_bw)
  );
  if avail_status <> 'available' then
    init_thread := init_thread || jsonb_build_array(
      jsonb_build_object('sender', 'CEDA Live Chat', 'role', 'system', 'body', avail_notice, 'at', now_bw)
    );
  end if;

  insert into public.admin_matters (
    reference, title, kind, reporter, owner_id, priority, state, owner_name,
    application_ref, detail, steps, escalation_source,
    queued_outside_hours, availability_status, availability_notice, thread_messages
  )
  values (
    new_ref,
    btrim(p_title),
    p_kind,
    reporter_name,
    actor,
    case when p_kind = 'Bug' then 'High' else 'Normal' end,
    'Open',
    'Unassigned',
    clean_app_ref,
    btrim(p_detail),
    coalesce(nullif(btrim(p_steps), ''), 'Not supplied'),
    esc_source,
    outside_hours,
    avail_status,
    case when avail_status <> 'available' then avail_notice else null end,
    init_thread
  );

  insert into public.portal_messages (
    owner_id, application_id, application_ref, thread_type, subject, sender_id, sender_name, sender_role, body, is_read_by_innovator
  )
  values (
    actor, linked_app_id, clean_app_ref, 'support',
    new_ref || ' — ' || btrim(p_title), actor, reporter_name, 'innovator', btrim(p_detail), true
  );

  insert into public.innovator_notifications (user_id, kind, title, message, application_ref, target_hash)
  values (
    actor, 'support', new_ref || ' support chat logged',
    case when avail_status = 'available'
      then 'We received "' || btrim(p_title) || '". Track live consultant responses in Live Chat or Help and support.'
      else avail_notice
    end,
    clean_app_ref,
    case when esc_source = 'Optimus Prime' then '#optimus' else '#support' end
  );

  return ceda_private.optimus_project_support_requests(actor);
end $$;

-- Upgrade innovator_reply_support_request to also notify client when replying outside hours or when all agents are busy
create or replace function ceda_private.innovator_reply_support_request(
  p_reference text,
  p_message text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := ceda_private.require_innovator();
  sender_display text;
  matter_row public.admin_matters;
  now_bw text := to_char(now() at time zone 'Africa/Gaborone', 'YYYY-MM-DD HH24:MI');
  next_state text;
  reopened boolean := false;
  history_note text := null;
  avail jsonb := ceda_private.live_chat_availability_status(now());
  avail_status text := coalesce(avail->>'status', 'available');
  avail_notice text := avail->>'notificationMessage';
  appended_messages jsonb;
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

  appended_messages := jsonb_build_array(
    jsonb_build_object('sender', coalesce(sender_display, 'Innovator'), 'role', 'innovator', 'body', btrim(p_message), 'at', now_bw)
  );
  if avail_status <> 'available' and (matter_row.availability_status is distinct from avail_status or reopened) then
    appended_messages := appended_messages || jsonb_build_array(
      jsonb_build_object('sender', 'CEDA Live Chat', 'role', 'system', 'body', avail_notice, 'at', now_bw)
    );
  end if;

  update public.admin_matters
  set thread_messages = coalesce(matter_row.thread_messages, '[]'::jsonb) || appended_messages,
      state = next_state,
      availability_status = avail_status,
      availability_notice = case when avail_status <> 'available' then avail_notice else null end,
      reopened_count = case when reopened then coalesce(matter_row.reopened_count, 0) + 1 else coalesce(matter_row.reopened_count, 0) end,
      history = case when history_note is not null
        then coalesce(matter_row.history, '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
          'actor', coalesce(sender_display, 'Innovator'), 'action', history_note, 'at', now_bw
        ))
        else matter_row.history end,
      updated_at = now()
  where id = matter_row.id;

  return ceda_private.optimus_project_support_requests(actor);
end $$;

-- Allow innovators to rate their support / live chat conversation (1-5 stars) for CSAT reporting
create or replace function ceda_private.innovator_rate_support_chat(
  p_reference text,
  p_rating integer,
  p_comment text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := ceda_private.require_innovator();
begin
  if p_reference is null or p_rating is null or p_rating not between 1 and 5 then
    raise exception 'Select a satisfaction rating from 1 to 5';
  end if;

  update public.admin_matters
  set satisfaction_rating = p_rating::smallint,
      satisfaction_comment = left(btrim(coalesce(p_comment, '')), 500),
      updated_at = now()
  where reference = btrim(p_reference)
    and owner_id = actor;

  if not found then
    raise exception 'Support chat not found';
  end if;

  return ceda_private.optimus_project_support_requests(actor);
end $$;

create or replace function public.innovator_rate_support_chat(
  p_reference text,
  p_rating integer,
  p_comment text default null
)
returns jsonb
language sql
security definer
set search_path = ''
as $$ select ceda_private.innovator_rate_support_chat(p_reference, p_rating, p_comment) $$;

revoke all on function ceda_private.innovator_rate_support_chat(text, integer, text) from public, anon, authenticated;
revoke all on function public.innovator_rate_support_chat(text, integer, text) from public, anon;
grant execute on function public.innovator_rate_support_chat(text, integer, text) to authenticated;

-- Upgrade support_ticket_list and support_connect_ticket for multi-user live chat concurrency & metadata
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
        'assignedOfficerId', m.assigned_officer_id,
        'ownerFirstName', case
          when m.owner_name is null or btrim(m.owner_name) = '' or m.owner_name = 'Unassigned' then null
          else split_part(btrim(m.owner_name), ' ', 1)
        end,
        'reported', to_char(m.reported_at at time zone 'Africa/Gaborone', 'YYYY-MM-DD HH24:MI'),
        'updatedAt', to_char(m.updated_at at time zone 'Africa/Gaborone', 'YYYY-MM-DD HH24:MI'),
        'application', m.application_ref,
        'detail', m.detail,
        'steps', m.steps,
        'escalationSource', coalesce(m.escalation_source, 'Help & Support'),
        'wizardStep', m.wizard_step,
        'queuedOutsideHours', coalesce(m.queued_outside_hours, false),
        'availabilityStatus', coalesce(m.availability_status, 'available'),
        'availabilityNotice', m.availability_notice,
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
  max_cap integer := 5;
  active_count integer := 0;
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

  select
    coalesce(nullif(btrim(p.full_name), ''), 'Support Officer'),
    coalesce(p.support_max_concurrent, 5)
  into actor_name, max_cap
  from public.profiles p where p.id = actor;

  first_name := coalesce(nullif(split_part(actor_name, ' ', 1), ''), 'Support');
  already_same_owner := (current_matter.owner_name = actor_name);

  if not already_same_owner then
    select count(*)::integer into active_count
    from public.admin_matters m
    where m.state = 'Investigating'
      and m.id <> current_matter.id
      and (m.assigned_officer_id = actor or lower(btrim(coalesce(m.owner_name, ''))) = lower(actor_name));

    if active_count >= max_cap then
      raise exception 'You are already attending to % active live chats (your maximum concurrent limit). Move a chat to Waiting or Resolved before connecting to another.', max_cap;
    end if;
  end if;

  next_state := case when current_matter.state = 'Open' then 'Investigating' else current_matter.state end;
  next_thread := coalesce(current_matter.thread_messages, '[]'::jsonb);
  next_history := coalesce(current_matter.history, '[]'::jsonb);

  if not already_same_owner then
    next_thread := next_thread || jsonb_build_array(jsonb_build_object(
      'sender', actor_name,
      'role', 'system',
      'body', first_name || ' connected to help with this live chat.',
      'at', now_bw
    ));
    next_history := next_history || jsonb_build_array(jsonb_build_object(
      'actor', actor_name,
      'action', 'Support Officer connected to live chat (' || next_state || ').',
      'at', now_bw
    ));

    update public.admin_matters
    set owner_name = actor_name,
        assigned_officer_id = actor,
        state = next_state,
        first_response_at = coalesce(current_matter.first_response_at, now()),
        thread_messages = next_thread,
        history = next_history,
        updated_at = now()
    where id = current_matter.id;

    update public.profiles
    set support_last_active_at = now()
    where id = actor;

    insert into public.innovator_notifications(user_id, kind, title, message, application_ref, target_hash)
    values (
      current_matter.owner_id,
      'support',
      current_matter.reference || ' - ' || first_name || ' joined your live chat',
      'You are now connected to ' || first_name || ' from CEDA Support.',
      current_matter.application_ref,
      '#optimus'
    );

    insert into public.admin_audit(actor_id, action, target, detail)
    values (actor, 'support.ticket.connected', current_matter.reference, jsonb_build_object(
      'before_owner', current_matter.owner_name,
      'after_owner', actor_name,
      'before_state', current_matter.state,
      'after_state', next_state,
      'active_concurrent_chats', active_count + 1
    ));
  end if;

  return ceda_private.support_ticket_list();
end $$;

-- Update innovator_workspace_bootstrap to include liveChatStatus and full supportRequests projection
create or replace function ceda_private.innovator_workspace_bootstrap()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
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
    'liveChatStatus', ceda_private.live_chat_availability_status(now()),
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
    'supportRequests', ceda_private.optimus_project_support_requests(actor),
    'faqs', coalesce((
      select jsonb_agg(
        jsonb_build_object('id', c.id, 'title', c.title, 'summary', c.summary, 'body', c.body, 'kind', c.kind)
        order by c.updated_at desc
      )
      from public.portal_content c
      where c.stage = 'Published' and c.kind in ('FAQs','Public pages','Announcements')
    ), '[]'::jsonb),
    'optimusHistory', ceda_private.optimus_project_history(actor)
  );
end $$;

-- Upgrade innovator_record_optimus_turn so Optimus auto-escalations also attach live chat availability notices
create or replace function ceda_private.innovator_record_optimus_turn(
  p_question text,
  p_answer text,
  p_topic text default 'general',
  p_source_article text default 'CEDA Approved Guidance',
  p_auto_escalate boolean default false,
  p_escalation_reason text default null,
  p_escalation_category text default 'support',
  p_escalation_priority text default 'Normal',
  p_related_app_ref text default null,
  p_ai_provider text default 'controlled-fallback',
  p_interaction_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := ceda_private.require_innovator();
  clean_question text := left(btrim(coalesce(p_question, '')), 1000);
  clean_answer text := left(btrim(coalesce(p_answer, '')), 4000);
  clean_topic text := coalesce(nullif(btrim(coalesce(p_topic, '')), ''), 'general');
  clean_source text := coalesce(nullif(btrim(coalesce(p_source_article, '')), ''), 'CEDA Approved Guidance');
  clean_reason text := nullif(btrim(coalesce(p_escalation_reason, '')), '');
  clean_priority text := case when p_escalation_priority = 'High' then 'High' else 'Normal' end;
  ticket_kind text := case when p_escalation_category = 'bug' then 'Bug' else 'Support' end;
  reporter_name text;
  linked_app_id uuid;
  clean_app_ref text;
  new_interaction_id uuid;
  existing_ticket record;
  new_ref text;
  ticket_ref text := null;
  now_bw text := to_char(now() at time zone 'Africa/Gaborone', 'YYYY-MM-DD HH24:MI');
  ticket_detail text;
  avail jsonb := ceda_private.live_chat_availability_status(now());
  avail_status text := coalesce(avail->>'status', 'available');
  avail_notice text := avail->>'notificationMessage';
  outside_hours boolean := (avail_status in ('after_hours', 'non_working_day'));
  esc_thread jsonb;
begin
  if length(clean_question) < 2 then
    raise exception 'Enter a question between 2 and 1000 characters';
  end if;
  if length(clean_answer) < 2 then
    clean_answer := 'I have reviewed your question and routed it for accurate assistance.';
  end if;

  if p_related_app_ref is not null and length(btrim(p_related_app_ref)) > 0 then
    select a.id, a.reference
    into linked_app_id, clean_app_ref
    from public.innovation_applications a
    where a.owner_id = actor and upper(a.reference) = upper(btrim(p_related_app_ref))
    limit 1;
  end if;

  insert into public.optimus_interactions (
    user_id, topic, question, answer, source_article, escalated, escalation_reason, ai_provider, interaction_id
  )
  values (
    actor,
    clean_topic,
    clean_question,
    clean_answer,
    clean_source,
    coalesce(p_auto_escalate, false),
    clean_reason,
    coalesce(nullif(btrim(coalesce(p_ai_provider, '')), ''), 'controlled-fallback'),
    nullif(btrim(coalesce(p_interaction_id, '')), '')
  )
  returning id into new_interaction_id;

  if coalesce(p_auto_escalate, false) then
    select full_name into reporter_name from public.profiles where id = actor;
    reporter_name := coalesce(nullif(btrim(reporter_name), ''), 'Innovator');

    select * into existing_ticket
    from public.admin_matters m
    where m.owner_id = actor
      and m.state <> 'Resolved'
      and (m.escalation_source = 'Optimus Prime' or m.steps ilike '%Optimus%' or m.title ilike '%Optimus Prime%')
    order by m.reported_at desc
    limit 1;

    ticket_detail := left(
      btrim(
        coalesce(clean_reason, 'Auto-escalated by Optimus Prime to CEDA Live Chat.')
        || E'\n\nInnovator message: ' || clean_question
      ),
      2000
    );
    if length(ticket_detail) < 5 then
      ticket_detail := 'Auto-escalated by Optimus Prime.';
    end if;

    esc_thread := jsonb_build_array(
      jsonb_build_object(
        'sender', reporter_name,
        'role', 'innovator',
        'body', clean_question,
        'at', now_bw
      ),
      jsonb_build_object(
        'sender', 'Optimus Prime',
        'role', 'system',
        'body', coalesce(clean_reason, 'Automatically escalated to CEDA Live Chat.')
          || case when avail_status <> 'available' then ' ' || avail_notice else '' end,
        'at', now_bw
      )
    );

    if existing_ticket.id is not null then
      ticket_ref := existing_ticket.reference;
      update public.admin_matters
      set thread_messages = coalesce(thread_messages, '[]'::jsonb) || esc_thread,
          priority = case when clean_priority = 'High' then 'High' else priority end,
          application_ref = coalesce(application_ref, clean_app_ref),
          escalation_source = 'Optimus Prime',
          availability_status = avail_status,
          availability_notice = case when avail_status <> 'available' then avail_notice else availability_notice end,
          updated_at = now()
      where id = existing_ticket.id;

      insert into public.portal_messages (
        owner_id, application_id, application_ref, thread_type, subject,
        sender_id, sender_name, sender_role, body, is_read_by_innovator
      )
      values (
        actor, linked_app_id, clean_app_ref, 'support',
        ticket_ref || ' — Optimus Prime Follow-Up',
        actor, reporter_name, 'innovator', clean_question, true
      );
    else
      new_ref := (case when ticket_kind = 'Bug' then 'BUG-' else 'TKT-' end)
        || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
      ticket_ref := new_ref;

      insert into public.admin_matters (
        reference, title, kind, reporter, owner_id, priority, state, owner_name,
        application_ref, detail, steps, escalation_source,
        queued_outside_hours, availability_status, availability_notice, thread_messages
      )
      values (
        new_ref,
        'Human support follow-up from Optimus Prime',
        ticket_kind,
        reporter_name,
        actor,
        clean_priority,
        'Open',
        'Unassigned',
        clean_app_ref,
        ticket_detail,
        'Escalated from Optimus Prime',
        'Optimus Prime',
        outside_hours,
        avail_status,
        case when avail_status <> 'available' then avail_notice else null end,
        esc_thread
      );

      insert into public.portal_messages (
        owner_id, application_id, application_ref, thread_type, subject,
        sender_id, sender_name, sender_role, body, is_read_by_innovator
      )
      values (
        actor, linked_app_id, clean_app_ref, 'support',
        new_ref || ' — Human support follow-up from Optimus Prime',
        actor, reporter_name, 'innovator', ticket_detail, true
      );

      insert into public.innovator_notifications (
        user_id, kind, title, message, application_ref, target_hash
      )
      values (
        actor,
        'support',
        new_ref || ' escalated to CEDA Live Chat',
        case when avail_status = 'available'
          then coalesce(clean_reason, 'Optimus Prime routed your conversation directly to CEDA Live Chat.')
          else avail_notice
        end,
        clean_app_ref,
        '#optimus'
      );
    end if;
  end if;

  return jsonb_build_object(
    'latest', (
      select jsonb_build_object(
        'id', o.id,
        'topic', o.topic,
        'question', o.question,
        'answer', o.answer,
        'sourceArticle', o.source_article,
        'escalated', o.escalated,
        'escalationReason', o.escalation_reason,
        'aiProvider', o.ai_provider,
        'rating', o.rating,
        'createdAt', to_char(o.created_at at time zone 'Africa/Gaborone', 'YYYY-MM-DD HH24:MI')
      )
      from public.optimus_interactions o where o.id = new_interaction_id
    ),
    'history', ceda_private.optimus_project_history(actor),
    'supportRequests', ceda_private.optimus_project_support_requests(actor),
    'liveChatStatus', avail,
    'autoEscalated', coalesce(p_auto_escalate, false),
    'escalatedTicketRef', ticket_ref
  );
end $$;

