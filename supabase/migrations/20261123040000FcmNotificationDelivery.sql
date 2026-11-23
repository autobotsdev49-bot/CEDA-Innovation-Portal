-- FCM Push Notification Delivery: device registrations, delivery attempts, queue outbox leasing,
-- multi-role queue triggers, and protected RPCs.

-- 1. User-bound FCM device registrations
create table if not exists public.notification_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  fcm_token text not null unique check (length(btrim(fcm_token)) between 20 and 4096),
  platform text not null check (platform in ('android', 'ios', 'web')),
  app_role text not null check (app_role in ('innovator', 'admin', 'assessor', 'support')),
  device_label text not null default '' check (length(device_label) <= 120),
  permission_status text not null default 'granted' check (permission_status in ('granted', 'denied', 'undetermined', 'provisional')),
  is_active boolean not null default true,
  last_seen_at timestamptz not null default now(),
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists notification_devices_user_active_idx
  on public.notification_devices (user_id, is_active, last_seen_at desc);

create index if not exists notification_devices_role_active_idx
  on public.notification_devices (app_role, is_active)
  where is_active = true;

alter table public.notification_devices enable row level security;
revoke all on public.notification_devices from public, anon, authenticated;
create policy notification_devices_direct_access_denied
  on public.notification_devices
  as restrictive
  for all
  to public
  using (false)
  with check (false);

-- 2. Extend public.notification_queue with targeted recipients, routing payload, lease & retry tracking
alter table public.notification_queue
  add column if not exists recipient_user_id uuid references auth.users(id) on delete set null,
  add column if not exists event_key text,
  add column if not exists application_ref text,
  add column if not exists target_hash text not null default '#overview',
  add column if not exists data_payload jsonb not null default '{}'::jsonb,
  add column if not exists next_attempt_at timestamptz not null default now(),
  add column if not exists leased_until timestamptz,
  add column if not exists leased_by text,
  add column if not exists last_error text,
  add column if not exists provider text not null default 'fcm',
  add column if not exists provider_message_id text,
  add column if not exists sent_at timestamptz,
  add column if not exists updated_at timestamptz not null default now();

create index if not exists notification_queue_pending_fcm_idx
  on public.notification_queue (status, next_attempt_at, created_at)
  where status in ('Queued', 'Failed');

create index if not exists notification_queue_recipient_idx
  on public.notification_queue (recipient_user_id, created_at desc)
  where recipient_user_id is not null;

-- 3. Per-device delivery audit trail
create table if not exists public.notification_delivery_attempts (
  id uuid primary key default gen_random_uuid(),
  queue_id uuid not null references public.notification_queue(id) on delete cascade,
  device_id uuid references public.notification_devices(id) on delete set null,
  recipient_user_id uuid references auth.users(id) on delete set null,
  channel text not null default 'fcm' check (channel in ('fcm', 'email', 'in_app')),
  status text not null check (status in ('sent', 'failed', 'unregistered', 'deferred', 'skipped')),
  provider_message_id text,
  error_code text,
  error_message text,
  attempted_at timestamptz not null default now()
);

create index if not exists notification_delivery_attempts_queue_idx
  on public.notification_delivery_attempts (queue_id, attempted_at desc);

create index if not exists notification_delivery_attempts_device_idx
  on public.notification_delivery_attempts (device_id, attempted_at desc)
  where device_id is not null;

create index if not exists notification_delivery_attempts_recipient_idx
  on public.notification_delivery_attempts (recipient_user_id, attempted_at desc)
  where recipient_user_id is not null;

alter table public.notification_delivery_attempts enable row level security;
revoke all on public.notification_delivery_attempts from public, anon, authenticated;
create policy notification_delivery_attempts_direct_access_denied
  on public.notification_delivery_attempts
  as restrictive
  for all
  to public
  using (false)
  with check (false);

-- 4. Update templates and profile push preference defaults
update public.notification_templates
set channel = 'In-app + Email + Push',
    updated_at = now()
where event_key in ('submission_received', 'review_started', 'info_requested', 'panel_assignment', 'outcome_released')
  and channel = 'In-app + Email';

insert into public.notification_templates (event_key, title, kind, channel, audience, status, message)
values
  ('support_reply', 'Support desk update', 'Push template', 'In-app + Push', 'Innovator', 'Enabled', 'A CEDA Support Officer responded to your support request. Open the portal to view the message.'),
  ('support_ticket_queued', 'Support queue alert', 'Push template', 'In-app + Push', 'Support Officer', 'Enabled', 'A support conversation or escalation is waiting in the CEDA Support Desk queue.')
on conflict (event_key) do nothing;

-- 5. Active-user session verifier across all portal roles
create or replace function ceda_private.require_active_user()
returns public.profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  prof public.profiles;
begin
  if uid is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select p.* into prof
  from public.profiles p
  join auth.users u on u.id = p.id
  join auth.sessions s on s.user_id = p.id and s.id::text = (auth.jwt()->>'session_id')
  where p.id = uid
    and p.account_status = 'active'
    and p.account_role in ('innovator', 'admin', 'assessor', 'support')
    and u.email_confirmed_at is not null
    and not u.is_anonymous
    and (u.banned_until is null or u.banned_until < now())
    and (s.not_after is null or s.not_after > now());

  if not found then
    raise exception 'Active verified portal session required' using errcode = '42501';
  end if;

  return prof;
end $$;

revoke all on function ceda_private.require_active_user() from public, anon, authenticated;

-- 6. Device registration, sign-out deactivation, listing & push preferences
create or replace function ceda_private.register_notification_device(
  p_fcm_token text,
  p_platform text default 'android',
  p_device_label text default '',
  p_permission_status text default 'granted'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  prof public.profiles := ceda_private.require_active_user();
  clean_token text := btrim(coalesce(p_fcm_token, ''));
  clean_platform text := lower(btrim(coalesce(p_platform, 'android')));
  clean_perm text := lower(btrim(coalesce(p_permission_status, 'granted')));
  clean_label text := left(regexp_replace(btrim(coalesce(p_device_label, '')), '[[:cntrl:]]', '', 'g'), 120);
  row_rec public.notification_devices;
begin
  if length(clean_token) not between 20 and 4096 or clean_token ~ '[[:space:]]' then
    raise exception 'Provide a valid FCM device registration token';
  end if;
  if clean_platform not in ('android', 'ios', 'web') then
    raise exception 'Unsupported device platform';
  end if;
  if clean_perm not in ('granted', 'denied', 'undetermined', 'provisional') then
    raise exception 'Unsupported notification permission status';
  end if;

  insert into public.notification_devices (
    user_id, fcm_token, platform, app_role, device_label, permission_status,
    is_active, last_seen_at, revoked_at, updated_at
  )
  values (
    prof.id,
    clean_token,
    clean_platform,
    prof.account_role,
    clean_label,
    clean_perm,
    (clean_perm in ('granted', 'provisional')),
    now(),
    case when clean_perm in ('granted', 'provisional') then null else now() end,
    now()
  )
  on conflict (fcm_token) do update
  set user_id = prof.id,
      platform = excluded.platform,
      app_role = prof.account_role,
      device_label = case when length(excluded.device_label) > 0 then excluded.device_label else public.notification_devices.device_label end,
      permission_status = excluded.permission_status,
      is_active = excluded.is_active,
      revoked_at = excluded.revoked_at,
      last_seen_at = now(),
      updated_at = now()
  returning * into row_rec;

  return jsonb_build_object(
    'id', row_rec.id,
    'platform', row_rec.platform,
    'appRole', row_rec.app_role,
    'deviceLabel', row_rec.device_label,
    'permissionStatus', row_rec.permission_status,
    'isActive', row_rec.is_active,
    'lastSeenAt', to_char(row_rec.last_seen_at at time zone 'Africa/Gaborone', 'YYYY-MM-DD HH24:MI'),
    'tokenSuffix', right(row_rec.fcm_token, 8)
  );
end $$;

create or replace function ceda_private.unregister_notification_device(
  p_fcm_token text default null
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  clean_token text := nullif(btrim(coalesce(p_fcm_token, '')), '');
  affected integer := 0;
begin
  if uid is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  update public.notification_devices
  set is_active = false,
      revoked_at = now(),
      updated_at = now()
  where user_id = uid
    and is_active = true
    and (clean_token is null or fcm_token = clean_token);

  get diagnostics affected = row_count;
  return affected;
end $$;

create or replace function ceda_private.my_notification_devices()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  prof public.profiles := ceda_private.require_active_user();
begin
  return jsonb_build_object(
    'pushEnabled', coalesce((prof.preferences->>'pushNotifications')::boolean, true),
    'devices', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', d.id,
          'platform', d.platform,
          'appRole', d.app_role,
          'deviceLabel', d.device_label,
          'permissionStatus', d.permission_status,
          'isActive', d.is_active,
          'tokenSuffix', right(d.fcm_token, 8),
          'lastSeenAt', to_char(d.last_seen_at at time zone 'Africa/Gaborone', 'YYYY-MM-DD HH24:MI')
        ) order by d.last_seen_at desc
      )
      from public.notification_devices d
      where d.user_id = prof.id
    ), '[]'::jsonb)
  );
end $$;

create or replace function ceda_private.update_push_preferences(
  p_push_enabled boolean,
  p_notify_status boolean default null,
  p_notify_clarifications boolean default null,
  p_notify_messages boolean default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  prof public.profiles := ceda_private.require_active_user();
  merged jsonb;
begin
  merged := coalesce(prof.preferences, '{}'::jsonb)
    || jsonb_build_object('pushNotifications', coalesce(p_push_enabled, true))
    || case when p_notify_status is not null then jsonb_build_object('notifyStatus', p_notify_status) else '{}'::jsonb end
    || case when p_notify_clarifications is not null then jsonb_build_object('notifyClarifications', p_notify_clarifications) else '{}'::jsonb end
    || case when p_notify_messages is not null then jsonb_build_object('notifyMessages', p_notify_messages) else '{}'::jsonb end;

  update public.profiles
  set preferences = merged,
      updated_at = now()
  where id = prof.id;

  return merged;
end $$;

-- 7. Automatic queue triggers for Innovators, Assessors, Support Officers, and Admins
create or replace function ceda_private.enqueue_fcm_from_innovator_notification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  mapped_event text;
  mapped_category text;
  mapped_target text;
begin
  mapped_event := case NEW.kind
    when 'submission' then 'submission_received'
    when 'clarification' then 'info_requested'
    when 'outcome' then 'outcome_released'
    when 'status' then 'review_started'
    when 'message' then 'message_received'
    when 'support' then 'support_update'
    else 'system_notice'
  end;

  mapped_category := case NEW.kind
    when 'submission' then 'Submission receipt'
    when 'clarification' then 'Clarification requested'
    when 'outcome' then 'Outcome released'
    when 'status' then 'Status update'
    when 'message' then 'Portal message'
    when 'support' then 'Support update'
    else 'Portal alert'
  end;

  mapped_target := case
    when NEW.target_hash = '#support' then 'support'
    when NEW.target_hash = '#optimus' then 'optimus'
    when NEW.target_hash = '#messages' then 'messages'
    else 'applications'
  end;

  insert into public.notification_queue (
    idempotency_key,
    recipient_user_id,
    event_key,
    category,
    title,
    message,
    channel,
    audience,
    status,
    action_target,
    application_ref,
    target_hash,
    data_payload,
    provider,
    created_by
  )
  values (
    'in-' || NEW.id::text,
    NEW.user_id,
    mapped_event,
    mapped_category,
    left(NEW.title, 160),
    left(NEW.message, 2000),
    'In-app + Push',
    'Innovator',
    'Queued',
    mapped_target,
    NEW.application_ref,
    coalesce(nullif(btrim(NEW.target_hash), ''), '#applications'),
    jsonb_strip_nulls(jsonb_build_object(
      'notificationId', NEW.id::text,
      'kind', NEW.kind,
      'eventKey', mapped_event,
      'applicationRef', NEW.application_ref,
      'targetHash', coalesce(nullif(btrim(NEW.target_hash), ''), '#applications'),
      'audience', 'innovator'
    )),
    'fcm',
    NEW.user_id
  )
  on conflict (idempotency_key) do nothing;

  return NEW;
end $$;

create or replace trigger trg_innovator_notifications_enqueue_fcm
  after insert on public.innovator_notifications
  for each row
  execute function ceda_private.enqueue_fcm_from_innovator_notification();

create or replace function ceda_private.enqueue_fcm_from_assessment_member()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  app_rec record;
begin
  select a.id as case_id, a.reference, a.title
  into app_rec
  from ceda_private.assessment_rounds r
  join public.innovation_applications a on a.id = r.case_id
  where r.id = NEW.round_id;

  if app_rec.reference is null then
    return NEW;
  end if;

  insert into public.notification_queue (
    idempotency_key,
    recipient_user_id,
    event_key,
    category,
    title,
    message,
    channel,
    audience,
    status,
    action_target,
    application_ref,
    target_hash,
    data_payload,
    provider,
    created_by
  )
  values (
    'asgn-' || NEW.round_id::text || '-' || NEW.user_id::text,
    NEW.user_id,
    'panel_assignment',
    'Assessment assignment',
    left(app_rec.reference || ' — Assessment assignment', 160),
    left('You have an assessment round assignment for ' || app_rec.reference || '. Sign in to complete conflict check and review.', 2000),
    'In-app + Push',
    'Assessor',
    'Queued',
    'assessments',
    app_rec.reference,
    '#assessments',
    jsonb_build_object(
      'eventKey', 'panel_assignment',
      'caseId', app_rec.case_id::text,
      'roundId', NEW.round_id::text,
      'applicationRef', app_rec.reference,
      'targetHash', '#assessments',
      'audience', 'assessor'
    ),
    'fcm',
    NEW.user_id
  )
  on conflict (idempotency_key) do nothing;

  return NEW;
end $$;

create or replace trigger trg_assessment_members_enqueue_fcm
  after insert on ceda_private.assessment_members
  for each row
  execute function ceda_private.enqueue_fcm_from_assessment_member();

create or replace function ceda_private.enqueue_fcm_from_assessment_round()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  app_rec record;
  member_rec record;
  evt_key text;
  evt_title text;
  evt_body text;
begin
  if NEW.state is not distinct from OLD.state or NEW.state not in ('review', 'voting') then
    return NEW;
  end if;

  select a.id as case_id, a.reference
  into app_rec
  from public.innovation_applications a
  where a.id = NEW.case_id;

  if app_rec.reference is null then
    return NEW;
  end if;

  evt_key := case when NEW.state = 'voting' then 'voting_opened' else 'review_started' end;
  evt_title := case when NEW.state = 'voting'
    then app_rec.reference || ' — Voting open'
    else app_rec.reference || ' — Assessment review open'
  end;
  evt_body := case when NEW.state = 'voting'
    then 'Panel voting is now open for ' || app_rec.reference || '. Open your Assessor workspace to cast your vote.'
    else 'Assessment review has started for ' || app_rec.reference || '. Open your Assessor workspace to begin scoring.'
  end;

  for member_rec in
    select m.user_id
    from ceda_private.assessment_members m
    where m.round_id = NEW.id
      and m.conflict <> 'recused'
  loop
    insert into public.notification_queue (
      idempotency_key,
      recipient_user_id,
      event_key,
      category,
      title,
      message,
      channel,
      audience,
      status,
      action_target,
      application_ref,
      target_hash,
      data_payload,
      provider,
      created_by
    )
    values (
      'rnd-' || NEW.id::text || '-' || NEW.state || '-' || member_rec.user_id::text,
      member_rec.user_id,
      evt_key,
      'Assessment round',
      left(evt_title, 160),
      left(evt_body, 2000),
      'In-app + Push',
      'Assessor',
      'Queued',
      'assessments',
      app_rec.reference,
      '#assessments',
      jsonb_build_object(
        'eventKey', evt_key,
        'caseId', app_rec.case_id::text,
        'roundId', NEW.id::text,
        'applicationRef', app_rec.reference,
        'targetHash', '#assessments',
        'audience', 'assessor'
      ),
      'fcm',
      member_rec.user_id
    )
    on conflict (idempotency_key) do nothing;
  end loop;

  return NEW;
end $$;

create or replace trigger trg_assessment_rounds_enqueue_fcm
  after update of state on ceda_private.assessment_rounds
  for each row
  execute function ceda_private.enqueue_fcm_from_assessment_round();

create or replace function ceda_private.enqueue_fcm_from_admin_matter()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  last_msg jsonb;
  old_len integer := 0;
  new_len integer := 0;
  target_officer_id uuid := null;
  target_audience text := 'Support Officer';
begin
  if TG_OP = 'INSERT' then
    if NEW.owner_id is not null and NEW.kind in ('Bug', 'Support', 'Feedback') then
      insert into public.notification_queue (
        idempotency_key,
        recipient_user_id,
        event_key,
        category,
        title,
        message,
        channel,
        audience,
        status,
        action_target,
        application_ref,
        target_hash,
        data_payload,
        provider,
        created_by
      )
      values (
        'sup-new-' || NEW.id::text,
        null,
        'support_ticket_queued',
        'Support queue',
        left(NEW.reference || ' — New ' || lower(NEW.kind) || ' request (' || NEW.priority || ')', 160),
        left('Support ticket ' || NEW.reference || ' is waiting in the CEDA Support Desk queue.', 2000),
        'In-app + Push',
        'Support Officer',
        'Queued',
        'queue',
        NEW.application_ref,
        '#queue',
        jsonb_strip_nulls(jsonb_build_object(
          'eventKey', 'support_ticket_queued',
          'ticketRef', NEW.reference,
          'priority', NEW.priority,
          'applicationRef', NEW.application_ref,
          'targetHash', '#queue',
          'audience', 'support'
        )),
        'fcm',
        NEW.owner_id
      )
      on conflict (idempotency_key) do nothing;
    end if;

    if NEW.kind = 'Delivery' or (NEW.kind = 'Bug' and NEW.priority = 'High') then
      insert into public.notification_queue (
        idempotency_key,
        recipient_user_id,
        event_key,
        category,
        title,
        message,
        channel,
        audience,
        status,
        action_target,
        application_ref,
        target_hash,
        data_payload,
        provider
      )
      values (
        'adm-matter-' || NEW.id::text,
        null,
        'admin_alert',
        'Follow-up alert',
        left(NEW.reference || ' — ' || NEW.kind || ' alert (' || NEW.priority || ')', 160),
        left('Administrator follow-up item ' || NEW.reference || ' requires review in Follow-ups.', 2000),
        'In-app + Push',
        'Administrator',
        'Queued',
        'followup',
        NEW.application_ref,
        '#followup',
        jsonb_strip_nulls(jsonb_build_object(
          'eventKey', 'admin_alert',
          'matterRef', NEW.reference,
          'priority', NEW.priority,
          'targetHash', '#followup',
          'audience', 'admin'
        )),
        'fcm'
      )
      on conflict (idempotency_key) do nothing;
    end if;
    return NEW;
  end if;

  if TG_OP = 'UPDATE' then
    old_len := coalesce(jsonb_array_length(OLD.thread_messages), 0);
    new_len := coalesce(jsonb_array_length(NEW.thread_messages), 0);
    if new_len > old_len then
      last_msg := NEW.thread_messages -> (new_len - 1);
      if coalesce(last_msg->>'role', '') = 'innovator' then
        if nullif(btrim(coalesce(NEW.owner_name, '')), '') is not null and NEW.owner_name <> 'Unassigned' then
          select p.id into target_officer_id
          from public.profiles p
          where lower(btrim(p.full_name)) = lower(btrim(NEW.owner_name))
            and p.account_role = 'support'
            and p.account_status = 'active'
          limit 1;
        end if;

        insert into public.notification_queue (
          idempotency_key,
          recipient_user_id,
          event_key,
          category,
          title,
          message,
          channel,
          audience,
          status,
          action_target,
          application_ref,
          target_hash,
          data_payload,
          provider
        )
        values (
          'sup-reply-' || NEW.id::text || '-' || new_len::text,
          target_officer_id,
          'support_innovator_reply',
          'Support reply',
          left(NEW.reference || ' — Innovator replied', 160),
          left('An innovator replied on support ticket ' || NEW.reference || '. Open Support Desk to respond.', 2000),
          'In-app + Push',
          target_audience,
          'Queued',
          'queue',
          NEW.application_ref,
          '#queue',
          jsonb_strip_nulls(jsonb_build_object(
            'eventKey', 'support_innovator_reply',
            'ticketRef', NEW.reference,
            'applicationRef', NEW.application_ref,
            'targetHash', '#queue',
            'audience', 'support'
          )),
          'fcm'
        )
        on conflict (idempotency_key) do nothing;
      end if;
    end if;
  end if;

  return NEW;
end $$;

create or replace trigger trg_admin_matters_enqueue_fcm
  after insert or update of thread_messages on public.admin_matters
  for each row
  execute function ceda_private.enqueue_fcm_from_admin_matter();

-- 8. Upgraded Admin notification overview, save, retry and self-test push RPCs
create or replace function ceda_private.admin_notifications_overview()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform ceda_private.require_admin();
  return jsonb_build_object(
    'templates', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', t.id,
          'eventKey', t.event_key,
          'title', t.title,
          'kind', t.kind,
          'channel', t.channel,
          'audience', t.audience,
          'status', t.status,
          'message', t.message,
          'version', t.version
        ) order by t.updated_at desc, t.title asc
      )
      from public.notification_templates t
    ), '[]'::jsonb),
    'inbox', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', q.id,
          'title', q.title,
          'category', q.category,
          'channel', q.channel,
          'audience', q.audience,
          'status', q.status,
          'attempts', q.attempts,
          'lastError', q.last_error,
          'applicationRef', q.application_ref,
          'eventKey', q.event_key,
          'sentAt', case when q.sent_at is not null then to_char(q.sent_at at time zone 'Africa/Gaborone', 'YYYY-MM-DD HH24:MI') else null end,
          'when', to_char(q.created_at at time zone 'Africa/Gaborone', 'YYYY-MM-DD HH24:MI'),
          'action', q.action_target
        ) order by q.created_at desc
      )
      from (select * from public.notification_queue order by created_at desc limit 40) q
    ), '[]'::jsonb),
    'fcmSummary', jsonb_build_object(
      'activeDevices', (select count(*)::int from public.notification_devices where is_active = true),
      'queuedPush', (select count(*)::int from public.notification_queue where status = 'Queued' and channel ilike '%Push%'),
      'processingPush', (select count(*)::int from public.notification_queue where status in ('Queued', 'Failed') and leased_until > now() and channel ilike '%Push%'),
      'sentPush', (select count(*)::int from public.notification_queue where status = 'Sent' and channel ilike '%Push%'),
      'failedPush', (select count(*)::int from public.notification_queue where status = 'Failed' and channel ilike '%Push%'),
      'skippedPush', (select count(distinct queue_id)::int from public.notification_delivery_attempts where status = 'skipped'),
      'devicesByRole', coalesce((
        select jsonb_object_agg(role_key, role_count)
        from (
          select app_role as role_key, count(*)::int as role_count
          from public.notification_devices
          where is_active = true
          group by app_role
        ) r
      ), '{}'::jsonb),
      'recentAttempts', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'id', a.id,
            'queueId', a.queue_id,
            'status', a.status,
            'errorCode', a.error_code,
            'errorMessage', a.error_message,
            'providerMessageId', a.provider_message_id,
            'at', to_char(a.attempted_at at time zone 'Africa/Gaborone', 'YYYY-MM-DD HH24:MI')
          ) order by a.attempted_at desc
        )
        from (select * from public.notification_delivery_attempts order by attempted_at desc limit 15) a
      ), '[]'::jsonb)
    )
  );
end $$;

create or replace function ceda_private.admin_save_notification_with_target(
  entry_kind text,
  entry_title text,
  entry_message text,
  reason text default 'Prepared in Admin Notification Center',
  entry_audience text default null,
  entry_channel text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := ceda_private.require_admin();
  target_ref text;
  slug text;
  clean_audience text := coalesce(nullif(btrim(coalesce(entry_audience, '')), ''), case when entry_kind = 'Announcement' then 'All visitors' else 'Innovator' end);
  clean_channel text := coalesce(nullif(btrim(coalesce(entry_channel, '')), ''), case when entry_kind = 'Push template' then 'Push' else 'In-app + Email + Push' end);
begin
  if entry_kind is null or entry_kind not in ('Announcement', 'Email template', 'Push template')
    or entry_title is null or length(btrim(entry_title)) not between 2 and 160
    or entry_message is null or length(btrim(entry_message)) not between 10 and 2000
    or reason is null or length(btrim(reason)) not between 5 and 500
    or clean_audience not in ('Innovator', 'Assessor', 'Support Officer', 'All visitors', 'Administrator')
    or length(clean_channel) not between 2 and 60 then
    raise exception 'Invalid notification draft fields';
  end if;

  if entry_kind = 'Announcement' then
    target_ref := 'ann-' || extract(epoch from clock_timestamp())::bigint::text || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 6);
    insert into public.notification_queue(
      idempotency_key, event_key, category, title, message, channel, audience,
      status, action_target, target_hash, data_payload, provider, created_by
    )
    values (
      target_ref,
      'announcement',
      'Announcement',
      btrim(entry_title),
      btrim(entry_message),
      clean_channel,
      clean_audience,
      'Queued',
      'overview',
      '#overview',
      jsonb_build_object(
        'eventKey', 'announcement',
        'audience', lower(clean_audience),
        'targetHash', '#overview'
      ),
      'fcm',
      actor
    );
  else
    slug := lower(regexp_replace(btrim(entry_title), '[^a-zA-Z0-9]+', '_', 'g'));
    target_ref := left(slug, 64);
    insert into public.notification_templates(event_key, title, kind, channel, audience, status, message)
    values (
      target_ref,
      btrim(entry_title),
      entry_kind,
      clean_channel,
      clean_audience,
      'Enabled',
      btrim(entry_message)
    )
    on conflict (event_key) do update
    set title = excluded.title,
        kind = excluded.kind,
        channel = excluded.channel,
        audience = excluded.audience,
        message = excluded.message,
        version = public.notification_templates.version + 1,
        updated_at = now();
  end if;

  insert into public.admin_audit(actor_id, action, target, detail)
  values (actor, 'notification.saved', target_ref, jsonb_build_object('kind', entry_kind, 'audience', clean_audience, 'channel', clean_channel, 'title', btrim(entry_title), 'reason', btrim(reason)));

  return ceda_private.admin_notifications_overview();
end $$;

create or replace function ceda_private.admin_save_notification(
  entry_kind text,
  entry_title text,
  entry_message text,
  reason text default 'Prepared in Admin Notification Center'
)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select ceda_private.admin_save_notification_with_target(entry_kind, entry_title, entry_message, reason, null, null);
$$;

create or replace function ceda_private.admin_retry_notification(
  p_queue_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := ceda_private.require_admin();
  row_rec public.notification_queue;
begin
  if p_queue_id is null then
    raise exception 'Select a queued notification to retry';
  end if;

  update public.notification_queue
  set status = 'Queued',
      next_attempt_at = now(),
      leased_until = null,
      leased_by = null,
      last_error = null,
      updated_at = now()
  where id = p_queue_id
    and status in ('Queued', 'Failed', 'Open')
  returning * into row_rec;

  if not found then
    raise exception 'Notification queue item cannot be retried or was not found';
  end if;

  insert into public.admin_audit(actor_id, action, target, detail)
  values (actor, 'notification.retried', row_rec.idempotency_key, jsonb_build_object('queue_id', row_rec.id, 'title', row_rec.title));

  return ceda_private.admin_notifications_overview();
end $$;

create or replace function ceda_private.admin_send_test_push(
  p_title text default 'CEDA Innovation push check',
  p_message text default 'FCM notification delivery is active for your administrator device.'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := ceda_private.require_admin();
  clean_title text := left(coalesce(nullif(btrim(p_title), ''), 'CEDA Innovation push check'), 160);
  clean_msg text := left(coalesce(nullif(btrim(p_message), ''), 'FCM notification delivery is active for your administrator device.'), 2000);
  new_id uuid;
  idem text := 'test-adm-' || extract(epoch from clock_timestamp())::bigint::text || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 6);
begin
  if length(clean_title) < 2 or length(clean_msg) < 5 then
    raise exception 'Enter a valid test title and message';
  end if;

  insert into public.notification_queue (
    idempotency_key, recipient_user_id, event_key, category, title, message,
    channel, audience, status, action_target, target_hash, data_payload, provider, created_by
  )
  values (
    idem, actor, 'admin_test_push', 'Push test', clean_title, clean_msg,
    'Push', 'Administrator', 'Queued', 'overview', '#overview',
    jsonb_build_object('eventKey', 'admin_test_push', 'targetHash', '#overview', 'audience', 'admin'),
    'fcm', actor
  )
  returning id into new_id;

  insert into public.admin_audit(actor_id, action, target, detail)
  values (actor, 'notification.test_push.queued', idem, jsonb_build_object('queue_id', new_id, 'title', clean_title));

  return jsonb_build_object(
    'queueId', new_id,
    'overview', ceda_private.admin_notifications_overview()
  );
end $$;

-- 9. Service-role-only queue leasing & completion RPCs for fcm-dispatch Edge Function
create or replace function public.fcm_lease_queue_batch(
  p_limit integer default 20,
  p_worker_id text default 'edge-fcm',
  p_queue_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  safe_limit integer := greatest(1, least(50, coalesce(p_limit, 20)));
  clean_worker text := left(coalesce(nullif(btrim(p_worker_id), ''), 'edge-fcm'), 80);
  leased_rows jsonb := '[]'::jsonb;
begin
  if coalesce(current_setting('request.jwt.claim.role', true), '') is distinct from 'service_role'
     and current_user not in ('postgres', 'service_role') then
    raise exception 'Service role required' using errcode = '42501';
  end if;

  with candidates as (
    select q.id
    from public.notification_queue q
    where q.channel ilike '%Push%'
      and (
        (
          p_queue_id is null
          and q.status in ('Queued', 'Failed')
          and q.next_attempt_at <= now()
          and q.attempts < 5
          and (q.leased_until is null or q.leased_until < now())
        )
        or (p_queue_id is not null and q.id = p_queue_id and q.status in ('Queued', 'Failed'))
      )
    order by q.created_at asc
    limit safe_limit
    for update skip locked
  ),
  updated as (
    update public.notification_queue q
    set leased_until = now() + interval '2 minutes',
        leased_by = clean_worker,
        attempts = q.attempts + 1,
        updated_at = now()
    from candidates c
    where q.id = c.id
    returning q.*
  )
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', u.id,
      'idempotencyKey', u.idempotency_key,
      'recipientUserId', u.recipient_user_id,
      'eventKey', u.event_key,
      'category', u.category,
      'title', u.title,
      'message', u.message,
      'channel', u.channel,
      'audience', u.audience,
      'attempts', u.attempts,
      'applicationRef', u.application_ref,
      'targetHash', u.target_hash,
      'dataPayload', u.data_payload,
      'devices', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'deviceId', d.id,
            'userId', d.user_id,
            'fcmToken', d.fcm_token,
            'platform', d.platform,
            'appRole', d.app_role
          )
        )
        from public.notification_devices d
        join public.profiles p on p.id = d.user_id
        join auth.users au on au.id = p.id
        where d.is_active = true
          and d.permission_status in ('granted', 'provisional')
          and p.account_status = 'active'
          and au.email_confirmed_at is not null
          and not au.is_anonymous
          and (au.banned_until is null or au.banned_until < now())
          and coalesce((p.preferences->>'pushNotifications')::boolean, true) = true
          and (
            (u.event_key in ('submission_received', 'review_started', 'outcome_released') and coalesce((p.preferences->>'notifyStatus')::boolean, (p.preferences->>'statusAlerts')::boolean, true) = true)
            or (u.event_key = 'info_requested' and coalesce((p.preferences->>'notifyClarifications')::boolean, (p.preferences->>'clarificationAlerts')::boolean, true) = true)
            or (u.event_key in ('message_received', 'support_update') and coalesce((p.preferences->>'notifyMessages')::boolean, true) = true)
            or coalesce(u.event_key, '') not in ('submission_received', 'review_started', 'outcome_released', 'info_requested', 'message_received', 'support_update')
          )
          and (
            (u.recipient_user_id is not null and d.user_id = u.recipient_user_id)
            or (
              u.recipient_user_id is null
              and (
                u.audience = 'All visitors'
                or (u.audience = 'Innovator' and p.account_role = 'innovator')
                or (u.audience = 'Assessor' and p.account_role = 'assessor')
                or (u.audience = 'Support Officer' and p.account_role = 'support')
                or (u.audience = 'Administrator' and p.account_role = 'admin')
              )
            )
          )
      ), '[]'::jsonb)
    ) order by u.created_at asc
  ), '[]'::jsonb)
  into leased_rows
  from updated u;

  return leased_rows;
end $$;

create or replace function public.fcm_complete_queue_item(
  p_queue_id uuid,
  p_status text,
  p_provider_message_id text default null,
  p_last_error text default null,
  p_next_attempt_at timestamptz default null,
  p_attempts_json jsonb default '[]'::jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  attempt_item jsonb;
  dev_id uuid;
  rec_user uuid;
  att_status text;
begin
  if coalesce(current_setting('request.jwt.claim.role', true), '') is distinct from 'service_role'
     and current_user not in ('postgres', 'service_role') then
    raise exception 'Service role required' using errcode = '42501';
  end if;

  if p_status not in ('Queued', 'Sent', 'Failed') then
    raise exception 'Invalid queue completion status';
  end if;

  update public.notification_queue
  set status = p_status,
      provider_message_id = coalesce(nullif(btrim(coalesce(p_provider_message_id, '')), ''), provider_message_id),
      last_error = nullif(left(btrim(coalesce(p_last_error, '')), 500), ''),
      next_attempt_at = coalesce(p_next_attempt_at, next_attempt_at),
      sent_at = case when p_status = 'Sent' then now() else sent_at end,
      leased_until = null,
      leased_by = null,
      updated_at = now()
  where id = p_queue_id;

  if jsonb_typeof(coalesce(p_attempts_json, '[]'::jsonb)) = 'array' then
    for attempt_item in select value from jsonb_array_elements(coalesce(p_attempts_json, '[]'::jsonb)) loop
      dev_id := nullif(btrim(coalesce(attempt_item->>'deviceId', '')), '')::uuid;
      rec_user := nullif(btrim(coalesce(attempt_item->>'userId', '')), '')::uuid;
      att_status := coalesce(attempt_item->>'status', 'failed');
      if att_status not in ('sent', 'failed', 'unregistered', 'deferred', 'skipped') then
        att_status := 'failed';
      end if;

      insert into public.notification_delivery_attempts (
        queue_id, device_id, recipient_user_id, channel, status,
        provider_message_id, error_code, error_message
      )
      values (
        p_queue_id,
        dev_id,
        rec_user,
        'fcm',
        att_status,
        nullif(btrim(coalesce(attempt_item->>'providerMessageId', '')), ''),
        nullif(left(btrim(coalesce(attempt_item->>'errorCode', '')), 80), ''),
        nullif(left(btrim(coalesce(attempt_item->>'errorMessage', '')), 400), '')
      );

      if att_status = 'unregistered' and dev_id is not null then
        update public.notification_devices
        set is_active = false,
            revoked_at = now(),
            updated_at = now()
        where id = dev_id;
      end if;
    end loop;
  end if;
end $$;

-- 10. Public SECURITY INVOKER wrappers & strict privilege grants
create or replace function public.register_notification_device(
  p_fcm_token text,
  p_platform text default 'android',
  p_device_label text default '',
  p_permission_status text default 'granted'
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$ select ceda_private.register_notification_device(p_fcm_token, p_platform, p_device_label, p_permission_status) $$;

create or replace function public.unregister_notification_device(
  p_fcm_token text default null
)
returns integer
language sql
security invoker
set search_path = ''
as $$ select ceda_private.unregister_notification_device(p_fcm_token) $$;

create or replace function public.my_notification_devices()
returns jsonb
language sql
security invoker
set search_path = ''
as $$ select ceda_private.my_notification_devices() $$;

create or replace function public.update_push_preferences(
  p_push_enabled boolean,
  p_notify_status boolean default null,
  p_notify_clarifications boolean default null,
  p_notify_messages boolean default null
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$ select ceda_private.update_push_preferences(p_push_enabled, p_notify_status, p_notify_clarifications, p_notify_messages) $$;

create or replace function public.admin_save_notification_with_target(
  entry_kind text,
  entry_title text,
  entry_message text,
  reason text default 'Prepared in Admin Notification Center',
  entry_audience text default null,
  entry_channel text default null
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$ select ceda_private.admin_save_notification_with_target(entry_kind, entry_title, entry_message, reason, entry_audience, entry_channel) $$;

create or replace function public.admin_save_notification(
  entry_kind text,
  entry_title text,
  entry_message text,
  reason text default 'Prepared in Admin Notification Center'
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$ select ceda_private.admin_save_notification(entry_kind, entry_title, entry_message, reason) $$;

create or replace function public.admin_retry_notification(
  p_queue_id uuid
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$ select ceda_private.admin_retry_notification(p_queue_id) $$;

create or replace function public.admin_send_test_push(
  p_title text default 'CEDA Innovation push check',
  p_message text default 'FCM notification delivery is active for your administrator device.'
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$ select ceda_private.admin_send_test_push(p_title, p_message) $$;

revoke all on function
  ceda_private.register_notification_device(text, text, text, text),
  ceda_private.unregister_notification_device(text),
  ceda_private.my_notification_devices(),
  ceda_private.update_push_preferences(boolean, boolean, boolean, boolean),
  ceda_private.admin_notifications_overview(),
  ceda_private.admin_save_notification(text, text, text, text),
  ceda_private.admin_save_notification_with_target(text, text, text, text, text, text),
  ceda_private.admin_retry_notification(uuid),
  ceda_private.admin_send_test_push(text, text),
  public.register_notification_device(text, text, text, text),
  public.unregister_notification_device(text),
  public.my_notification_devices(),
  public.update_push_preferences(boolean, boolean, boolean, boolean),
  public.admin_notifications_overview(),
  public.admin_save_notification(text, text, text, text),
  public.admin_save_notification_with_target(text, text, text, text, text, text),
  public.admin_retry_notification(uuid),
  public.admin_send_test_push(text, text)
from public, anon;

grant execute on function
  ceda_private.register_notification_device(text, text, text, text),
  ceda_private.unregister_notification_device(text),
  ceda_private.my_notification_devices(),
  ceda_private.update_push_preferences(boolean, boolean, boolean, boolean),
  ceda_private.admin_notifications_overview(),
  ceda_private.admin_save_notification(text, text, text, text),
  ceda_private.admin_save_notification_with_target(text, text, text, text, text, text),
  ceda_private.admin_retry_notification(uuid),
  ceda_private.admin_send_test_push(text, text),
  public.register_notification_device(text, text, text, text),
  public.unregister_notification_device(text),
  public.my_notification_devices(),
  public.update_push_preferences(boolean, boolean, boolean, boolean),
  public.admin_notifications_overview(),
  public.admin_save_notification(text, text, text, text),
  public.admin_save_notification_with_target(text, text, text, text, text, text),
  public.admin_retry_notification(uuid),
  public.admin_send_test_push(text, text)
to authenticated;

revoke all on function
  public.fcm_lease_queue_batch(integer, text, uuid),
  public.fcm_complete_queue_item(uuid, text, text, text, timestamptz, jsonb)
from public, anon, authenticated;

grant execute on function
  public.fcm_lease_queue_batch(integer, text, uuid),
  public.fcm_complete_queue_item(uuid, text, text, text, timestamptz, jsonb)
to service_role;
