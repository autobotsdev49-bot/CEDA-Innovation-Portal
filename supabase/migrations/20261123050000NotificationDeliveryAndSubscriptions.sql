-- Notification Delivery (Email + Push + In-app + Realtime) & Free Submission Alert Subscriptions
-- Covers Portal Req 8 (Free alerts at no charge on submission updates) & Outcome 3.2(c) (Real-time
-- submission status tracking for applicants and internal/external committee stakeholders).

-- 1. Free Per-Submission Alert Subscriptions (explicitly zero-fee)
create table if not exists public.application_alert_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  application_id uuid not null references public.innovation_applications(id) on delete cascade,
  application_ref text not null,
  is_subscribed boolean not null default true,
  channels jsonb not null default '{"email": true, "inApp": true, "push": true}'::jsonb,
  events jsonb not null default '{"status": true, "clarifications": true, "messages": true, "award": true}'::jsonb,
  fee_amount numeric(10, 2) not null default 0.00 check (fee_amount = 0.00),
  fee_label text not null default 'No charge (Free — P0.00)',
  subscribed_at timestamptz not null default now(),
  unsubscribed_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (user_id, application_id)
);

create index if not exists application_alert_subs_user_app_idx
  on public.application_alert_subscriptions (user_id, application_id);

create index if not exists application_alert_subs_ref_active_idx
  on public.application_alert_subscriptions (user_id, application_ref)
  where is_subscribed = true;

alter table public.application_alert_subscriptions enable row level security;
revoke all on public.application_alert_subscriptions from public, anon, authenticated;
create policy application_alert_subscriptions_direct_access_denied
  on public.application_alert_subscriptions
  as restrictive
  for all
  to public
  using (false)
  with check (false);

-- Backfill Smart Default free subscriptions for existing applications (no charge)
insert into public.application_alert_subscriptions (user_id, application_id, application_ref, is_subscribed)
select a.owner_id, a.id, a.reference, true
from public.innovation_applications a
where a.owner_id is not null
on conflict (user_id, application_id) do nothing;

-- Auto-subscribe newly created applications at no charge (Smart Default)
create or replace function ceda_private.auto_subscribe_application_alerts()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if NEW.owner_id is not null then
    insert into public.application_alert_subscriptions (
      user_id, application_id, application_ref, is_subscribed, fee_amount, fee_label
    )
    values (
      NEW.owner_id, NEW.id, NEW.reference, true, 0.00, 'No charge (Free — P0.00)'
    )
    on conflict (user_id, application_id) do nothing;
  end if;
  return NEW;
end $$;

create or replace trigger trg_application_default_alert_subscription
  after insert on public.innovation_applications
  for each row
  execute function ceda_private.auto_subscribe_application_alerts();

-- 2. Extend notification_queue for independent Email outbox tracking & Committee role support
alter table public.notification_queue
  add column if not exists recipient_email text,
  add column if not exists email_status text not null default 'Pending' check (email_status in ('Pending', 'Queued', 'Sent', 'Skipped', 'Failed')),
  add column if not exists email_attempts integer not null default 0,
  add column if not exists email_next_attempt_at timestamptz not null default now(),
  add column if not exists email_leased_until timestamptz,
  add column if not exists email_leased_by text,
  add column if not exists email_last_error text,
  add column if not exists email_provider text,
  add column if not exists email_message_id text,
  add column if not exists email_sent_at timestamptz;

create index if not exists notification_queue_pending_email_idx
  on public.notification_queue (email_status, email_next_attempt_at, created_at)
  where email_status in ('Queued', 'Failed');

-- Backfill existing queued Email rows so the email-dispatch worker picks them up cleanly
update public.notification_queue
set email_status = 'Queued'
where email_status = 'Pending'
  and channel ilike '%Email%'
  and status in ('Queued', 'Open');

-- Allow committee members in notification_devices & require_active_user
do $$
declare
  c record;
begin
  for c in
    select conname
    from pg_constraint
    where conrelid = 'public.notification_devices'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%app_role%'
  loop
    execute format('alter table public.notification_devices drop constraint if exists %I', c.conname);
  end loop;
end $$;

alter table public.notification_devices
  add constraint notification_devices_app_role_check
  check (app_role in ('innovator', 'admin', 'assessor', 'support', 'committee'));

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
    and p.account_role in ('innovator', 'admin', 'assessor', 'support', 'committee')
    and u.email_confirmed_at is not null
    and not u.is_anonymous
    and (u.banned_until is null or u.banned_until < now())
    and (s.not_after is null or s.not_after > now());

  if not found then
    raise exception 'Active verified portal session required' using errcode = '42501';
  end if;

  return prof;
end $$;

-- Seed committee stakeholder milestone notification template idempotently
insert into public.notification_templates (event_key, title, kind, channel, audience, status, message)
values (
  'committee_stage_milestone',
  'Submission lifecycle stage update',
  'Email template',
  'In-app + Email',
  'Committee',
  'Enabled',
  'A CEDA innovation submission has progressed to a new lifecycle stage. Open the Committee Observer workspace for read-only timeline details.'
)
on conflict (event_key) do nothing;

-- 3. Preference & Subscription enforcement helper
create or replace function ceda_private.user_wants_alert(
  p_user_id uuid,
  p_application_ref text,
  p_kind text,
  p_channel text default 'email'
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  prefs jsonb;
  sub_rec record;
  chan_ok boolean := true;
  event_ok boolean := true;
  clean_kind text := lower(coalesce(p_kind, 'status'));
  clean_chan text := lower(coalesce(p_channel, 'email'));
begin
  if p_user_id is null then
    return true;
  end if;

  select preferences into prefs
  from public.profiles
  where id = p_user_id;

  prefs := coalesce(prefs, '{}'::jsonb);

  if clean_chan = 'email' then
    chan_ok := coalesce((prefs->>'emailNotifications')::boolean, true);
  elsif clean_chan = 'push' then
    chan_ok := coalesce((prefs->>'pushNotifications')::boolean, true);
  elsif clean_chan = 'in_app' then
    chan_ok := coalesce((prefs->>'inAppNotifications')::boolean, true);
  end if;

  if not chan_ok then
    return false;
  end if;

  if clean_kind in ('submission', 'status', 'outcome', 'award', 'submission_received', 'review_started', 'outcome_released', 'award_conferred', 'committee_stage_milestone') then
    event_ok := coalesce((prefs->>'notifyStatus')::boolean, (prefs->>'statusAlerts')::boolean, true);
  elsif clean_kind in ('clarification', 'info_requested') then
    event_ok := coalesce((prefs->>'notifyClarifications')::boolean, (prefs->>'clarificationAlerts')::boolean, true);
  elsif clean_kind in ('message', 'support', 'message_received', 'support_update', 'support_reply') then
    event_ok := coalesce((prefs->>'notifyMessages')::boolean, true);
  end if;

  if not event_ok then
    return false;
  end if;

  if p_application_ref is not null and length(btrim(p_application_ref)) > 0 then
    select * into sub_rec
    from public.application_alert_subscriptions s
    where s.user_id = p_user_id
      and upper(s.application_ref) = upper(btrim(p_application_ref))
    order by s.updated_at desc
    limit 1;

    if found then
      if sub_rec.is_subscribed is not true then
        return false;
      end if;
      if clean_chan = 'email' and coalesce((sub_rec.channels->>'email')::boolean, true) is not true then
        return false;
      end if;
      if clean_chan = 'push' and coalesce((sub_rec.channels->>'push')::boolean, true) is not true then
        return false;
      end if;
      if clean_chan = 'in_app' and coalesce((sub_rec.channels->>'inApp')::boolean, true) is not true then
        return false;
      end if;
      if clean_kind in ('clarification', 'info_requested') and coalesce((sub_rec.events->>'clarifications')::boolean, true) is not true then
        return false;
      elsif clean_kind in ('award', 'award_conferred') and coalesce((sub_rec.events->>'award')::boolean, true) is not true then
        return false;
      elsif clean_kind in ('message', 'support', 'message_received', 'support_update') and coalesce((sub_rec.events->>'messages')::boolean, true) is not true then
        return false;
      elsif clean_kind in ('submission', 'status', 'outcome', 'submission_received', 'review_started', 'outcome_released') and coalesce((sub_rec.events->>'status')::boolean, true) is not true then
        return false;
      end if;
    end if;
  end if;

  return true;
end $$;

revoke all on function ceda_private.user_wants_alert(uuid, text, text, text) from public, anon, authenticated;

-- 4. Upgrade notification enqueue triggers for Email + Push + Award + Committee milestones
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
  wants_email boolean;
  wants_push boolean;
  channel_label text;
  target_email text;
begin
  mapped_event := case NEW.kind
    when 'submission' then 'submission_received'
    when 'clarification' then 'info_requested'
    when 'outcome' then 'outcome_released'
    when 'award' then 'award_conferred'
    when 'status' then 'review_started'
    when 'message' then 'message_received'
    when 'support' then 'support_update'
    else 'system_notice'
  end;

  mapped_category := case NEW.kind
    when 'submission' then 'Submission receipt'
    when 'clarification' then 'Clarification requested'
    when 'outcome' then 'Outcome released'
    when 'award' then 'Award conferred'
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

  wants_email := ceda_private.user_wants_alert(NEW.user_id, NEW.application_ref, NEW.kind, 'email');
  wants_push := ceda_private.user_wants_alert(NEW.user_id, NEW.application_ref, NEW.kind, 'push');

  channel_label := 'In-app'
    || case when wants_email then ' + Email' else '' end
    || case when wants_push then ' + Push' else '' end;

  if wants_email then
    select lower(email) into target_email
    from auth.users
    where id = NEW.user_id;
  end if;

  insert into public.notification_queue (
    idempotency_key,
    recipient_user_id,
    recipient_email,
    event_key,
    category,
    title,
    message,
    channel,
    audience,
    status,
    email_status,
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
    target_email,
    mapped_event,
    mapped_category,
    left(NEW.title, 160),
    left(NEW.message, 2000),
    channel_label,
    'Innovator',
    case when wants_push or wants_email then 'Queued' else 'Sent' end,
    case when wants_email then 'Queued' else 'Skipped' end,
    mapped_target,
    NEW.application_ref,
    coalesce(nullif(btrim(NEW.target_hash), ''), '#applications'),
    jsonb_strip_nulls(jsonb_build_object(
      'notificationId', NEW.id::text,
      'kind', NEW.kind,
      'eventKey', mapped_event,
      'applicationRef', NEW.application_ref,
      'targetHash', coalesce(nullif(btrim(NEW.target_hash), ''), '#applications'),
      'audience', 'innovator',
      'freeSubscription', true
    )),
    case when wants_email and wants_push then 'multi' when wants_email then 'email' else 'fcm' end,
    NEW.user_id
  )
  on conflict (idempotency_key) do nothing;

  return NEW;
end $$;

-- Automatically alert internal/external CEDA innovation committee observers on lifecycle stage transitions
create or replace function ceda_private.enqueue_committee_stage_alerts()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  stage_name text;
  committee_member record;
  wants_email boolean;
  wants_push boolean;
begin
  if NEW.status = 'Draft' then
    return NEW;
  end if;
  if TG_OP = 'UPDATE' and NEW.status is not distinct from OLD.status then
    return NEW;
  end if;

  stage_name := case NEW.status
    when 'Awarded' then 'Award'
    when 'Approved' then 'Approval'
    when 'Changes requested' then 'Feedback'
    when 'In review' then 'Review'
    when 'Rejected' then 'Outcome'
    when 'Withdrawn' then 'Withdrawn'
    else 'Submission'
  end;

  for committee_member in
    select p.id as user_id, lower(u.email) as email
    from public.profiles p
    join auth.users u on u.id = p.id
    where p.account_role = 'committee'
      and p.account_status = 'active'
      and u.email_confirmed_at is not null
      and not u.is_anonymous
      and (
        not exists (select 1 from public.staff_sectors ss where ss.user_id = p.id)
        or exists (select 1 from public.staff_sectors ss where ss.user_id = p.id and ss.sector_id = NEW.sector_id)
      )
  loop
    wants_email := ceda_private.user_wants_alert(committee_member.user_id, NEW.reference, 'status', 'email');
    wants_push := ceda_private.user_wants_alert(committee_member.user_id, NEW.reference, 'status', 'push');
    if wants_email or wants_push then
      insert into public.notification_queue (
        idempotency_key,
        recipient_user_id,
        recipient_email,
        event_key,
        category,
        title,
        message,
        channel,
        audience,
        status,
        email_status,
        action_target,
        application_ref,
        target_hash,
        data_payload,
        provider,
        created_by
      )
      values (
        'cmt-' || NEW.id::text || '-' || NEW.version::text || '-' || committee_member.user_id::text,
        committee_member.user_id,
        case when wants_email then committee_member.email else null end,
        'committee_stage_milestone',
        'Committee stage update',
        left(NEW.reference || ' moved to ' || stage_name || ' (' || NEW.status || ')', 160),
        left('Submission "' || NEW.title || '" (' || NEW.sector || ') reached the ' || stage_name || ' stage. View the live pipeline in your Committee Observer workspace.', 2000),
        'In-app' || case when wants_email then ' + Email' else '' end || case when wants_push then ' + Push' else '' end,
        'Committee',
        case when wants_push or wants_email then 'Queued' else 'Sent' end,
        case when wants_email then 'Queued' else 'Skipped' end,
        'overview',
        NEW.reference,
        '#applications',
        jsonb_build_object(
          'eventKey', 'committee_stage_milestone',
          'applicationRef', NEW.reference,
          'status', NEW.status,
          'stage', stage_name,
          'audience', 'committee'
        ),
        case when wants_email and wants_push then 'multi' when wants_email then 'email' else 'fcm' end,
        NEW.owner_id
      )
      on conflict (idempotency_key) do nothing;
    end if;
  end loop;

  return NEW;
end $$;

create or replace trigger trg_innovation_applications_committee_alerts
  after insert or update of status on public.innovation_applications
  for each row
  execute function ceda_private.enqueue_committee_stage_alerts();

-- Also respect per-submission opt-outs inside FCM queue leasing
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
          and ceda_private.user_wants_alert(d.user_id, u.application_ref, u.event_key, 'push')
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
                or (u.audience = 'Committee' and p.account_role = 'committee')
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

-- 5. Service-role Email outbox leasing & completion RPCs
create or replace function public.email_lease_queue_batch(
  p_limit integer default 25,
  p_worker_id text default 'edge-email',
  p_queue_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  safe_limit integer := greatest(1, least(50, coalesce(p_limit, 25)));
  clean_worker text := left(coalesce(nullif(btrim(p_worker_id), ''), 'edge-email'), 80);
  leased_rows jsonb := '[]'::jsonb;
begin
  if coalesce(current_setting('request.jwt.claim.role', true), '') is distinct from 'service_role'
     and current_user not in ('postgres', 'service_role') then
    raise exception 'Service role required' using errcode = '42501';
  end if;

  with candidates as (
    select q.id
    from public.notification_queue q
    where q.channel ilike '%Email%'
      and (
        (
          p_queue_id is null
          and q.email_status in ('Queued', 'Failed')
          and q.email_next_attempt_at <= now()
          and q.email_attempts < 5
          and (q.email_leased_until is null or q.email_leased_until < now())
        )
        or (p_queue_id is not null and q.id = p_queue_id and q.email_status in ('Queued', 'Failed', 'Pending'))
      )
    order by q.created_at asc
    limit safe_limit
    for update skip locked
  ),
  updated as (
    update public.notification_queue q
    set email_leased_until = now() + interval '2 minutes',
        email_leased_by = clean_worker,
        email_attempts = q.email_attempts + 1,
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
      'attempts', u.email_attempts,
      'applicationRef', u.application_ref,
      'targetHash', u.target_hash,
      'recipients', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'userId', p.id,
            'email', lower(au.email),
            'fullName', p.full_name,
            'role', p.account_role
          )
        )
        from public.profiles p
        join auth.users au on au.id = p.id
        where p.account_status = 'active'
          and au.email_confirmed_at is not null
          and not au.is_anonymous
          and au.email is not null
          and (au.banned_until is null or au.banned_until < now())
          and ceda_private.user_wants_alert(p.id, u.application_ref, u.event_key, 'email')
          and (
            (u.recipient_user_id is not null and p.id = u.recipient_user_id)
            or (
              u.recipient_user_id is null
              and (
                u.audience = 'All visitors'
                or (u.audience = 'Innovator' and p.account_role = 'innovator')
                or (u.audience = 'Assessor' and p.account_role = 'assessor')
                or (u.audience = 'Support Officer' and p.account_role = 'support')
                or (u.audience = 'Administrator' and p.account_role = 'admin')
                or (u.audience = 'Committee' and p.account_role = 'committee')
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

create or replace function public.email_complete_queue_item(
  p_queue_id uuid,
  p_email_status text,
  p_provider text default null,
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
  rec_user uuid;
  att_status text;
  cur public.notification_queue;
begin
  if coalesce(current_setting('request.jwt.claim.role', true), '') is distinct from 'service_role'
     and current_user not in ('postgres', 'service_role') then
    raise exception 'Service role required' using errcode = '42501';
  end if;

  if p_email_status not in ('Queued', 'Sent', 'Failed', 'Skipped') then
    raise exception 'Invalid email completion status';
  end if;

  select * into cur from public.notification_queue where id = p_queue_id for update;
  if not found then
    return;
  end if;

  update public.notification_queue
  set email_status = p_email_status,
      email_provider = coalesce(nullif(btrim(coalesce(p_provider, '')), ''), email_provider),
      email_message_id = coalesce(nullif(btrim(coalesce(p_provider_message_id, '')), ''), email_message_id),
      email_last_error = nullif(left(btrim(coalesce(p_last_error, '')), 500), ''),
      email_next_attempt_at = coalesce(p_next_attempt_at, email_next_attempt_at),
      email_sent_at = case when p_email_status = 'Sent' then now() else email_sent_at end,
      email_leased_until = null,
      email_leased_by = null,
      status = case
        when p_email_status in ('Sent', 'Skipped') and cur.channel not ilike '%Push%' then 'Sent'
        when p_email_status = 'Failed' and cur.channel not ilike '%Push%' then 'Failed'
        else cur.status
      end,
      sent_at = case
        when p_email_status in ('Sent', 'Skipped') and cur.channel not ilike '%Push%' and cur.sent_at is null then now()
        else cur.sent_at
      end,
      updated_at = now()
  where id = p_queue_id;

  if jsonb_typeof(coalesce(p_attempts_json, '[]'::jsonb)) = 'array' then
    for attempt_item in select value from jsonb_array_elements(coalesce(p_attempts_json, '[]'::jsonb)) loop
      rec_user := nullif(btrim(coalesce(attempt_item->>'userId', '')), '')::uuid;
      att_status := coalesce(attempt_item->>'status', 'failed');
      if att_status not in ('sent', 'failed', 'unregistered', 'deferred', 'skipped') then
        att_status := 'failed';
      end if;

      insert into public.notification_delivery_attempts (
        queue_id, recipient_user_id, channel, status,
        provider_message_id, error_code, error_message
      )
      values (
        p_queue_id,
        rec_user,
        'email',
        att_status,
        nullif(btrim(coalesce(attempt_item->>'providerMessageId', '')), ''),
        nullif(left(btrim(coalesce(attempt_item->>'errorCode', '')), 80), ''),
        nullif(left(btrim(coalesce(attempt_item->>'errorMessage', '')), 400), '')
      );
    end loop;
  end if;
end $$;

-- 6. User Free Alert Subscriptions & Preferences RPCs
create or replace function ceda_private.project_alert_subscriptions(p_user_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'applicationId', a.id,
        'applicationRef', a.reference,
        'applicationTitle', a.title,
        'status', a.status,
        'isSubscribed', coalesce(s.is_subscribed, true),
        'channels', coalesce(s.channels, '{"email": true, "inApp": true, "push": true}'::jsonb),
        'events', coalesce(s.events, '{"status": true, "clarifications": true, "messages": true, "award": true}'::jsonb),
        'feeAmount', 0.00,
        'feeLabel', coalesce(s.fee_label, 'No charge (Free — P0.00)'),
        'subscribedAt', case when s.subscribed_at is not null then to_char(s.subscribed_at at time zone 'Africa/Gaborone', 'YYYY-MM-DD HH24:MI') else a.created_at end,
        'unsubscribedAt', case when s.unsubscribed_at is not null then to_char(s.unsubscribed_at at time zone 'Africa/Gaborone', 'YYYY-MM-DD HH24:MI') else null end
      ) order by a.updated_at desc
    )
    from public.innovation_applications a
    left join public.application_alert_subscriptions s
      on s.application_id = a.id and s.user_id = p_user_id
    where a.owner_id = p_user_id
  ), '[]'::jsonb);
$$;

revoke all on function ceda_private.project_alert_subscriptions(uuid) from public, anon, authenticated;

create or replace function ceda_private.innovator_toggle_submission_alerts(
  p_application_id uuid,
  p_is_subscribed boolean,
  p_channels jsonb default null,
  p_events jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := ceda_private.require_innovator();
  app_rec public.innovation_applications;
  next_channels jsonb;
  next_events jsonb;
begin
  select * into app_rec
  from public.innovation_applications
  where id = p_application_id and owner_id = actor;

  if not found then
    raise exception 'Application not found';
  end if;

  next_channels := coalesce(p_channels, '{"email": true, "inApp": true, "push": true}'::jsonb);
  next_events := coalesce(p_events, '{"status": true, "clarifications": true, "messages": true, "award": true}'::jsonb);

  insert into public.application_alert_subscriptions (
    user_id, application_id, application_ref, is_subscribed, channels, events,
    fee_amount, fee_label, subscribed_at, unsubscribed_at, updated_at
  )
  values (
    actor,
    app_rec.id,
    app_rec.reference,
    coalesce(p_is_subscribed, true),
    next_channels,
    next_events,
    0.00,
    'No charge (Free — P0.00)',
    case when coalesce(p_is_subscribed, true) then now() else null end,
    case when coalesce(p_is_subscribed, true) then null else now() end,
    now()
  )
  on conflict (user_id, application_id) do update
  set is_subscribed = excluded.is_subscribed,
      channels = coalesce(p_channels, public.application_alert_subscriptions.channels),
      events = coalesce(p_events, public.application_alert_subscriptions.events),
      subscribed_at = case when excluded.is_subscribed then coalesce(public.application_alert_subscriptions.subscribed_at, now()) else public.application_alert_subscriptions.subscribed_at end,
      unsubscribed_at = case when excluded.is_subscribed then null else now() end,
      updated_at = now();

  return ceda_private.project_alert_subscriptions(actor);
end $$;

create or replace function public.innovator_toggle_submission_alerts(
  p_application_id uuid,
  p_is_subscribed boolean,
  p_channels jsonb default null,
  p_events jsonb default null
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$ select ceda_private.innovator_toggle_submission_alerts(p_application_id, p_is_subscribed, p_channels, p_events) $$;

create or replace function ceda_private.innovator_update_alert_preferences(
  p_email_enabled boolean,
  p_push_enabled boolean,
  p_notify_status boolean,
  p_notify_clarifications boolean,
  p_notify_messages boolean
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
    || jsonb_build_object(
      'emailNotifications', coalesce(p_email_enabled, true),
      'pushNotifications', coalesce(p_push_enabled, true),
      'notifyStatus', coalesce(p_notify_status, true),
      'statusAlerts', coalesce(p_notify_status, true),
      'notifyClarifications', coalesce(p_notify_clarifications, true),
      'clarificationAlerts', coalesce(p_notify_clarifications, true),
      'notifyMessages', coalesce(p_notify_messages, true),
      'freeAlertPlan', true
    );

  update public.profiles
  set preferences = merged,
      updated_at = now()
  where id = prof.id;

  return merged;
end $$;

create or replace function public.innovator_update_alert_preferences(
  p_email_enabled boolean,
  p_push_enabled boolean,
  p_notify_status boolean,
  p_notify_clarifications boolean,
  p_notify_messages boolean
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$ select ceda_private.innovator_update_alert_preferences(p_email_enabled, p_push_enabled, p_notify_status, p_notify_clarifications, p_notify_messages) $$;

-- 7. Incremental real-time polling RPC & updated innovator_workspace_bootstrap
create or replace function ceda_private.innovator_poll_notifications(p_since timestamptz default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor uuid := ceda_private.require_innovator();
  prefs jsonb;
begin
  select preferences into prefs from public.profiles where id = actor;
  return jsonb_build_object(
    'serverTime', now(),
    'preferences', coalesce(prefs, '{}'::jsonb),
    'unreadCount', (select count(*)::int from public.innovator_notifications where user_id = actor and is_read = false),
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
          'createdAt', to_char(n.created_at at time zone 'Africa/Gaborone', 'YYYY-MM-DD HH24:MI'),
          'createdIso', n.created_at
        ) order by n.created_at desc
      )
      from (
        select * from public.innovator_notifications
        where user_id = actor
          and (p_since is null or created_at >= p_since - interval '5 seconds')
        order by created_at desc
        limit 40
      ) n
    ), '[]'::jsonb),
    'applicationStatuses', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', a.id,
          'reference', a.reference,
          'status', a.status,
          'version', a.version,
          'updatedAt', to_char(a.updated_at at time zone 'Africa/Gaborone', 'YYYY-MM-DD HH24:MI')
        ) order by a.updated_at desc
      )
      from public.innovation_applications a
      where a.owner_id = actor
    ), '[]'::jsonb),
    'alertSubscriptions', ceda_private.project_alert_subscriptions(actor)
  );
end $$;

create or replace function public.innovator_poll_notifications(p_since timestamptz default null)
returns jsonb
language sql
security invoker
set search_path = ''
as $$ select ceda_private.innovator_poll_notifications(p_since) $$;

-- Update innovator_workspace_bootstrap to also return alertSubscriptions alongside all existing fields
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
    'alertSubscriptions', ceda_private.project_alert_subscriptions(actor),
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
        jsonb_build_object(
          'id', c.id,
          'title', c.title,
          'summary', c.summary,
          'body', c.body,
          'kind', c.kind,
          'authorityCode', c.authority_code,
          'contactDetails', c.contact_details,
          'externalUrl', c.external_url
        )
        order by c.updated_at desc, c.title asc
      )
      from public.portal_content c
      where c.stage in ('Published', 'Published preview')
        and c.kind in ('FAQs', 'Public pages', 'Announcements')
    ), '[]'::jsonb),
    'portalDocuments', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', c.id,
          'kind', c.kind,
          'title', c.title,
          'summary', c.summary,
          'body', c.body,
          'attachmentName', c.attachment_name,
          'attachmentMime', c.attachment_mime,
          'attachmentSize', c.attachment_size,
          'attachmentPath', c.attachment_path,
          'externalUrl', c.external_url,
          'updated', to_char(c.updated_at at time zone 'Africa/Gaborone', 'YYYY-MM-DD')
        )
        order by c.kind asc, c.updated_at desc
      )
      from public.portal_content c
      where c.stage in ('Published', 'Published preview')
        and c.kind in ('Application form', 'Accompanying copies')
    ), '[]'::jsonb),
    'regulatoryContacts', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', c.id,
          'title', c.title,
          'summary', c.summary,
          'body', c.body,
          'authorityCode', c.authority_code,
          'contactDetails', c.contact_details,
          'externalUrl', coalesce(c.external_url, c.contact_details->>'website')
        )
        order by c.title asc
      )
      from public.portal_content c
      where c.stage in ('Published', 'Published preview')
        and c.kind = 'Regulatory contacts'
    ), '[]'::jsonb),
    'applicationFormConfig', coalesce(
      (select payload from public.portal_configurations where config_key = 'application_form_config'),
      '{}'::jsonb
    ),
    'optimusHistory', ceda_private.optimus_project_history(actor)
  );
end $$;

-- 8. Upgrade Admin Notifications Overview with Email delivery stats, free subscription stats & Email retry/test
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
          'emailStatus', q.email_status,
          'emailAttempts', q.email_attempts,
          'emailLastError', q.email_last_error,
          'emailSentAt', case when q.email_sent_at is not null then to_char(q.email_sent_at at time zone 'Africa/Gaborone', 'YYYY-MM-DD HH24:MI') else null end,
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
      'skippedPush', (select count(distinct queue_id)::int from public.notification_delivery_attempts where channel = 'fcm' and status = 'skipped'),
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
            'channel', a.channel,
            'status', a.status,
            'errorCode', a.error_code,
            'errorMessage', a.error_message,
            'providerMessageId', a.provider_message_id,
            'at', to_char(a.attempted_at at time zone 'Africa/Gaborone', 'YYYY-MM-DD HH24:MI')
          ) order by a.attempted_at desc
        )
        from (select * from public.notification_delivery_attempts order by attempted_at desc limit 15) a
      ), '[]'::jsonb)
    ),
    'emailSummary', jsonb_build_object(
      'queuedEmail', (select count(*)::int from public.notification_queue where email_status = 'Queued' and channel ilike '%Email%'),
      'sentEmail', (select count(*)::int from public.notification_queue where email_status = 'Sent'),
      'failedEmail', (select count(*)::int from public.notification_queue where email_status = 'Failed'),
      'skippedEmail', (select count(*)::int from public.notification_queue where email_status = 'Skipped'),
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
        from (select * from public.notification_delivery_attempts where channel = 'email' order by attempted_at desc limit 15) a
      ), '[]'::jsonb)
    ),
    'subscriptionStats', jsonb_build_object(
      'freePlan', true,
      'feeLabel', 'No charge (Free — P0.00)',
      'totalSubscriptions', (select count(*)::int from public.application_alert_subscriptions),
      'activeSubscriptions', (select count(*)::int from public.application_alert_subscriptions where is_subscribed = true),
      'unsubscribedCount', (select count(*)::int from public.application_alert_subscriptions where is_subscribed = false)
    )
  );
end $$;

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
  set status = case when channel ilike '%Push%' then 'Queued' else status end,
      next_attempt_at = now(),
      leased_until = null,
      leased_by = null,
      last_error = null,
      email_status = case when channel ilike '%Email%' then 'Queued' else email_status end,
      email_next_attempt_at = now(),
      email_leased_until = null,
      email_leased_by = null,
      email_last_error = null,
      updated_at = now()
  where id = p_queue_id
    and (
      status in ('Queued', 'Failed', 'Open')
      or email_status in ('Queued', 'Failed', 'Pending')
    )
  returning * into row_rec;

  if not found then
    raise exception 'Notification queue item cannot be retried or was not found';
  end if;

  insert into public.admin_audit(actor_id, action, target, detail)
  values (actor, 'notification.retried', row_rec.idempotency_key, jsonb_build_object('queue_id', row_rec.id, 'title', row_rec.title));

  return ceda_private.admin_notifications_overview();
end $$;

create or replace function ceda_private.admin_send_test_email(
  p_title text default 'CEDA Innovation free email alert check',
  p_message text default 'Your CEDA Innovation Portal free email alert subscription channel is configured and working.'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := ceda_private.require_admin();
  clean_title text := left(coalesce(nullif(btrim(p_title), ''), 'CEDA Innovation free email alert check'), 160);
  clean_msg text := left(coalesce(nullif(btrim(p_message), ''), 'Your CEDA Innovation Portal free email alert subscription channel is configured and working.'), 2000);
  actor_email text;
  new_id uuid;
  idem text := 'test-email-' || extract(epoch from clock_timestamp())::bigint::text || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 6);
begin
  select lower(email) into actor_email from auth.users where id = actor;
  insert into public.notification_queue (
    idempotency_key, recipient_user_id, recipient_email, event_key, category, title, message,
    channel, audience, status, email_status, action_target, target_hash, data_payload, provider, created_by
  )
  values (
    idem, actor, actor_email, 'admin_test_email', 'Email test', clean_title, clean_msg,
    'Email', 'Administrator', 'Queued', 'Queued', 'overview', '#overview',
    jsonb_build_object('eventKey', 'admin_test_email', 'targetHash', '#overview', 'audience', 'admin'),
    'email', actor
  )
  returning id into new_id;

  insert into public.admin_audit(actor_id, action, target, detail)
  values (actor, 'notification.test_email.queued', idem, jsonb_build_object('queue_id', new_id, 'title', clean_title));

  return jsonb_build_object(
    'queueId', new_id,
    'overview', ceda_private.admin_notifications_overview()
  );
end $$;

create or replace function public.admin_send_test_email(
  p_title text default 'CEDA Innovation free email alert check',
  p_message text default 'Your CEDA Innovation Portal free email alert subscription channel is configured and working.'
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$ select ceda_private.admin_send_test_email(p_title, p_message) $$;

-- Update admin_save_notification_with_target so email_status is also set to 'Queued' when channel includes Email
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
    or clean_audience not in ('Innovator', 'Assessor', 'Support Officer', 'All visitors', 'Administrator', 'Committee')
    or length(clean_channel) not between 2 and 60 then
    raise exception 'Invalid notification draft fields';
  end if;

  if entry_kind = 'Announcement' then
    target_ref := 'ann-' || extract(epoch from clock_timestamp())::bigint::text || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 6);
    insert into public.notification_queue(
      idempotency_key, event_key, category, title, message, channel, audience,
      status, email_status, action_target, target_hash, data_payload, provider, created_by
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
      case when clean_channel ilike '%Email%' then 'Queued' else 'Skipped' end,
      'overview',
      '#overview',
      jsonb_build_object(
        'eventKey', 'announcement',
        'audience', lower(clean_audience),
        'targetHash', '#overview'
      ),
      case when clean_channel ilike '%Email%' and clean_channel ilike '%Push%' then 'multi' when clean_channel ilike '%Email%' then 'email' else 'fcm' end,
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

-- 9. Enable Supabase Realtime publication on notifications and applications safely
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin
      alter publication supabase_realtime add table public.innovator_notifications;
    exception when duplicate_object then null; when others then null;
    end;
    begin
      alter publication supabase_realtime add table public.innovation_applications;
    exception when duplicate_object then null; when others then null;
    end;
    begin
      alter publication supabase_realtime add table public.notification_queue;
    exception when duplicate_object then null; when others then null;
    end;
  end if;
end $$;

-- 10. Strict RPC Grants
revoke all on function
  ceda_private.innovator_toggle_submission_alerts(uuid, boolean, jsonb, jsonb),
  ceda_private.innovator_update_alert_preferences(boolean, boolean, boolean, boolean, boolean),
  ceda_private.innovator_poll_notifications(timestamptz),
  ceda_private.admin_send_test_email(text, text),
  public.innovator_toggle_submission_alerts(uuid, boolean, jsonb, jsonb),
  public.innovator_update_alert_preferences(boolean, boolean, boolean, boolean, boolean),
  public.innovator_poll_notifications(timestamptz),
  public.admin_send_test_email(text, text)
from public, anon;

grant execute on function
  ceda_private.innovator_toggle_submission_alerts(uuid, boolean, jsonb, jsonb),
  ceda_private.innovator_update_alert_preferences(boolean, boolean, boolean, boolean, boolean),
  ceda_private.innovator_poll_notifications(timestamptz),
  ceda_private.admin_send_test_email(text, text),
  public.innovator_toggle_submission_alerts(uuid, boolean, jsonb, jsonb),
  public.innovator_update_alert_preferences(boolean, boolean, boolean, boolean, boolean),
  public.innovator_poll_notifications(timestamptz),
  public.admin_send_test_email(text, text)
to authenticated;

revoke all on function
  public.email_lease_queue_batch(integer, text, uuid),
  public.email_complete_queue_item(uuid, text, text, text, text, timestamptz, jsonb)
from public, anon, authenticated;

grant execute on function
  public.email_lease_queue_batch(integer, text, uuid),
  public.email_complete_queue_item(uuid, text, text, text, text, timestamptz, jsonb)
to service_role;
