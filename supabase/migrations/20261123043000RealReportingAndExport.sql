-- Collect sanitized telemetry, expose real server-side admin reporting, and audit all admin report exports.

-- 1. Seeded demo records (DEMO001-DEMO006, BUG001, TKT002, DEL001, FB001, FB002, BUG002, seed-del001)
--    are intentionally KEPT. They are included in every report and export and tagged with
--    source = 'Demo' so live and demo totals can always be told apart.
create or replace function ceda_private.is_demo_reference(p_reference text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(p_reference, '') in (
    'DEMO001', 'DEMO002', 'DEMO003', 'DEMO004', 'DEMO005', 'DEMO006',
    'BUG001', 'TKT002', 'DEL001', 'FB001', 'FB002', 'BUG002'
  );
$$;

revoke all on function ceda_private.is_demo_reference(text) from public, anon, authenticated;

-- 2. Idempotent turnaround columns & O(log n) composite reporting indexes
alter table public.admin_matters
  add column if not exists first_response_at timestamptz,
  add column if not exists resolved_at timestamptz;

create index if not exists idx_innovation_applications_status_submitted
  on public.innovation_applications (status, submitted_at desc);

create index if not exists idx_optimus_interactions_created_escalated
  on public.optimus_interactions (created_at desc, escalated);

create index if not exists idx_admin_audit_action_created
  on public.admin_audit (action, created_at desc);

-- 3. Safe Gaborone / ISO timestamp parser (returns NULL instead of raising)
create or replace function ceda_private.parse_gaborone_timestamp(
  p_raw text
)
returns timestamptz
language plpgsql
immutable
set search_path = ''
as $$
declare
  trimmed text := nullif(btrim(coalesce(p_raw, '')), '');
begin
  if trimmed is null then
    return null;
  end if;
  if trimmed ~ '^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(:\d{2})?$' then
    return (trimmed::timestamp at time zone 'Africa/Gaborone');
  end if;
  if trimmed ~ '^\d{4}-\d{2}-\d{2}$' then
    return ((trimmed || ' 09:00:00')::timestamp at time zone 'Africa/Gaborone');
  end if;
  return trimmed::timestamptz;
exception
  when others then
    return null;
end $$;

-- Backfill first_response_at & resolved_at on existing non-demo tickets where reliable
update public.admin_matters m
set
  first_response_at = coalesce(
    m.first_response_at,
    case
      when m.state in ('Investigating', 'Waiting', 'Resolved') then coalesce(
        (
          select min(ceda_private.parse_gaborone_timestamp(h->>'at'))
          from jsonb_array_elements(coalesce(m.history, '[]'::jsonb)) h
          where coalesce(h->>'at', '') <> ''
        ),
        m.updated_at
      )
      else null
    end
  ),
  resolved_at = coalesce(
    m.resolved_at,
    case
      when m.state = 'Resolved' then coalesce(
        (
          select max(ceda_private.parse_gaborone_timestamp(h->>'at'))
          from jsonb_array_elements(coalesce(m.history, '[]'::jsonb)) h
          where lower(coalesce(h->>'action', '')) like '%resolved%'
        ),
        m.updated_at
      )
      else null
    end
  )
where m.first_response_at is null
   or (m.state = 'Resolved' and m.resolved_at is null);

-- 4. Privacy-safe telemetry events table (14-day retention, zero PII/IP/tokens/answers)
create table if not exists public.telemetry_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null
    check (event_type in ('page_view', 'screen_view', 'web_vital', 'workflow_step', 'request_error')),
  route text not null
    check (
      char_length(route) between 1 and 120
      and position('?' in route) = 0
      and position('#' in route) = 0
    ),
  route_label text not null default ''
    check (char_length(route_label) <= 120),
  portal_role text not null default 'public'
    check (portal_role in ('public', 'innovator', 'assessor', 'support', 'committee', 'admin')),
  device_class text not null default 'Desktop'
    check (device_class in ('Mobile', 'Desktop', 'Tablet')),
  session_key text not null
    check (char_length(session_key) between 8 and 64),
  dedup_key text unique,
  lcp_ms integer check (lcp_ms is null or (lcp_ms >= 0 and lcp_ms <= 120000)),
  inp_ms integer check (inp_ms is null or (inp_ms >= 0 and inp_ms <= 60000)),
  cls_score numeric(6,4) check (cls_score is null or (cls_score >= 0 and cls_score <= 25)),
  ttfb_ms integer check (ttfb_ms is null or (ttfb_ms >= 0 and ttfb_ms <= 120000)),
  status_code integer check (status_code is null or (status_code >= 100 and status_code <= 599)),
  workflow_name text check (workflow_name is null or char_length(workflow_name) <= 64),
  created_at timestamptz not null default now()
);

create index if not exists idx_telemetry_events_type_created
  on public.telemetry_events (event_type, created_at desc);

create index if not exists idx_telemetry_events_created_route
  on public.telemetry_events (created_at desc, route);

create index if not exists idx_telemetry_events_session_created
  on public.telemetry_events (created_at desc, session_key);

create index if not exists idx_telemetry_events_created_at
  on public.telemetry_events (created_at);

alter table public.telemetry_events enable row level security;

drop policy if exists telemetry_events_deny_direct on public.telemetry_events;
create policy telemetry_events_deny_direct
  on public.telemetry_events
  for all
  using (false)
  with check (false);

revoke all on table public.telemetry_events from public, anon, authenticated;

-- 5. Sanitized non-PII telemetry intake RPC (capped batch retention prune)
create or replace function ceda_private.record_telemetry_event(
  p_event_type text,
  p_route text,
  p_route_label text default '',
  p_portal_role text default 'public',
  p_device_class text default 'Desktop',
  p_session_key text default '',
  p_lcp_ms integer default null,
  p_inp_ms integer default null,
  p_cls_score numeric default null,
  p_ttfb_ms integer default null,
  p_status_code integer default null,
  p_workflow_name text default null,
  p_dedup_key text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event text := lower(btrim(coalesce(p_event_type, '')));
  v_route text := btrim(coalesce(p_route, '/'));
  v_label text := left(btrim(coalesce(p_route_label, '')), 120);
  v_role text := lower(btrim(coalesce(p_portal_role, 'public')));
  v_device text := initcap(lower(btrim(coalesce(p_device_class, 'desktop'))));
  v_session text := left(regexp_replace(coalesce(p_session_key, ''), '[^a-zA-Z0-9_-]', '', 'g'), 64);
  v_dedup text := nullif(left(btrim(coalesce(p_dedup_key, '')), 120), '');
  v_workflow text := nullif(left(btrim(coalesce(p_workflow_name, '')), 64), '');
  v_lcp integer := case when p_lcp_ms between 0 and 120000 then p_lcp_ms else null end;
  v_inp integer := case when p_inp_ms between 0 and 60000 then p_inp_ms else null end;
  v_cls numeric(6,4) := case when p_cls_score is not null and p_cls_score >= 0 and p_cls_score <= 25 then round(p_cls_score, 4) else null end;
  v_ttfb integer := case when p_ttfb_ms between 0 and 120000 then p_ttfb_ms else null end;
  v_status integer := case when p_status_code between 100 and 599 then p_status_code else null end;
begin
  if v_event not in ('page_view', 'screen_view', 'web_vital', 'workflow_step', 'request_error') then
    return jsonb_build_object('ok', false, 'reason', 'invalid_event_type');
  end if;

  if v_role not in ('public', 'innovator', 'assessor', 'support', 'committee', 'admin') then
    v_role := 'public';
  end if;

  if v_device not in ('Mobile', 'Desktop', 'Tablet') then
    v_device := 'Desktop';
  end if;

  if char_length(v_session) < 8 then
    v_session := replace(gen_random_uuid()::text, '-', '');
  end if;

  -- Strip query strings, fragments, UUIDs, CEDA reference codes, or email-like fragments from routes
  v_route := split_part(split_part(v_route, '?', 1), '#', 1);
  if v_route = '' then
    v_route := '/';
  end if;
  if left(v_route, 1) <> '/' then
    v_route := '/' || v_route;
  end if;
  v_route := regexp_replace(v_route, '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}', ':id', 'g');
  v_route := regexp_replace(v_route, 'CEDA-INN-[0-9-]+', ':ref', 'gi');
  v_route := regexp_replace(v_route, '[^\s/@]+@[^\s/]+', ':email', 'g');
  v_route := left(v_route, 120);

  if v_label = '' then
    v_label := v_route;
  end if;

  insert into public.telemetry_events (
    event_type,
    route,
    route_label,
    portal_role,
    device_class,
    session_key,
    dedup_key,
    lcp_ms,
    inp_ms,
    cls_score,
    ttfb_ms,
    status_code,
    workflow_name
  ) values (
    v_event,
    v_route,
    v_label,
    v_role,
    v_device,
    v_session,
    v_dedup,
    v_lcp,
    v_inp,
    v_cls,
    v_ttfb,
    v_status,
    v_workflow
  )
  on conflict (dedup_key) do nothing;

  -- Enforce 14-day telemetry retention in bounded micro-batches
  delete from public.telemetry_events
  where id in (
    select id
    from public.telemetry_events
    where created_at < now() - interval '14 days'
    limit 100
  );

  return jsonb_build_object('ok', true);
end $$;

create or replace function public.record_telemetry_event(
  p_event_type text,
  p_route text,
  p_route_label text default '',
  p_portal_role text default 'public',
  p_device_class text default 'Desktop',
  p_session_key text default '',
  p_lcp_ms integer default null,
  p_inp_ms integer default null,
  p_cls_score numeric default null,
  p_ttfb_ms integer default null,
  p_status_code integer default null,
  p_workflow_name text default null,
  p_dedup_key text default null
)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select ceda_private.record_telemetry_event(
    p_event_type,
    p_route,
    p_route_label,
    p_portal_role,
    p_device_class,
    p_session_key,
    p_lcp_ms,
    p_inp_ms,
    p_cls_score,
    p_ttfb_ms,
    p_status_code,
    p_workflow_name,
    p_dedup_key
  );
$$;

revoke all on function ceda_private.record_telemetry_event(text, text, text, text, text, text, integer, integer, numeric, integer, integer, text, text) from public, anon, authenticated;
grant execute on function public.record_telemetry_event(text, text, text, text, text, text, integer, integer, numeric, integer, integer, text, text) to anon, authenticated;

-- 6. Real server-side admin reporting aggregation RPC (never exposes assessor ballots/identities or PII)
create or replace function ceda_private.admin_reporting_summary(
  p_period_days integer default 7
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_period integer := case when p_period_days in (1, 7, 30) then p_period_days else 7 end;
  v_end_date date := (now() at time zone 'Africa/Gaborone')::date;
  v_start_date date := ((now() at time zone 'Africa/Gaborone')::date - (case when p_period_days in (1, 7, 30) then p_period_days else 7 end - 1));
  v_start_ts timestamptz := (v_start_date::timestamp at time zone 'Africa/Gaborone');
  v_end_ts timestamptz := ((v_end_date + 1)::timestamp at time zone 'Africa/Gaborone');
  v_participation jsonb;
  v_applications jsonb;
  v_sectors jsonb;
  v_turnaround jsonb;
  v_telemetry jsonb;
  v_optimus jsonb;
  v_notifications jsonb;
  v_matters jsonb;
  v_owners jsonb;
begin
  perform ceda_private.require_admin(false);

  -- Participation (profiles + applicant types + active 5-min sessions)
  select jsonb_build_object(
    'totalUsers', (select count(*)::int from public.profiles),
    'activeUsers', (select count(*) filter (where account_status = 'active')::int from public.profiles),
    'suspendedUsers', (select count(*) filter (where account_status <> 'active')::int from public.profiles),
    'innovators', (select count(*) filter (where account_role = 'innovator')::int from public.profiles),
    'assessors', (select count(*) filter (where account_role = 'assessor')::int from public.profiles),
    'committeeMembers', (select count(*) filter (where account_role = 'committee')::int from public.profiles),
    'supportOfficers', (select count(*) filter (where account_role = 'support')::int from public.profiles),
    'admins', (select count(*) filter (where account_role = 'admin')::int from public.profiles),
    'individuals', (
      select count(*) filter (
        where status <> 'Draft'
          and lower(coalesce(applicant_type, 'individual')) not like '%company%'
          and lower(coalesce(applicant_type, '')) not like '%enterprise%'
          and lower(coalesce(applicant_type, '')) not like '%entity%'
      )::int
      from public.innovation_applications
    ),
    'registeredCompanies', (
      select count(*) filter (
        where status <> 'Draft'
          and (
            lower(coalesce(applicant_type, '')) like '%company%'
            or lower(coalesce(applicant_type, '')) like '%enterprise%'
            or lower(coalesce(applicant_type, '')) like '%entity%'
          )
      )::int
      from public.innovation_applications
    ),
    'activeVisitorsNow', (
      select count(distinct session_key)::int
      from public.telemetry_events
      where created_at >= now() - interval '5 minutes'
    )
  ) into v_participation;

  -- Applications pipeline, approval rate & daily submissions
  with non_draft as (
    select
      a.id,
      a.reference,
      a.title,
      a.applicant,
      a.sector,
      a.sector_id,
      a.status,
      a.applicant_type,
      a.version,
      (a.owner_id is null and ceda_private.is_demo_reference(a.reference)) as is_demo,
      coalesce(
        a.submitted_at,
        ceda_private.parse_gaborone_timestamp(a.submitted_date::text),
        a.created_at
      ) as effective_submitted_at,
      coalesce(
        (a.submitted_at at time zone 'Africa/Gaborone')::date,
        a.submitted_date,
        (a.created_at at time zone 'Africa/Gaborone')::date
      ) as gaborone_submitted_date
    from public.innovation_applications a
    where a.status <> 'Draft'
  ),
  daily_subs as (
    select
      d::date as day_date,
      coalesce((select count(*)::int from non_draft nd where nd.gaborone_submitted_date = d::date), 0) as cnt
    from generate_series(v_start_date, v_end_date, interval '1 day') as d
    order by d::date asc
  ),
  agg_apps as (
    select
      count(*)::int as total,
      count(*) filter (where status = 'Submitted')::int as submitted,
      count(*) filter (where status = 'In review')::int as in_review,
      count(*) filter (where status = 'Changes requested')::int as changes_requested,
      count(*) filter (where status = 'Approved')::int as approved,
      count(*) filter (where status = 'Awarded')::int as awarded,
      count(*) filter (where status = 'Rejected')::int as rejected,
      count(*) filter (where status = 'Withdrawn')::int as withdrawn,
      count(*) filter (where gaborone_submitted_date between v_start_date and v_end_date)::int as in_window_total,
      count(*) filter (where is_demo)::int as demo_total,
      count(*) filter (where not is_demo)::int as live_total
    from non_draft
  )
  select jsonb_build_object(
    'total', agg.total,
    'submitted', agg.submitted,
    'inReview', agg.in_review,
    'changesRequested', agg.changes_requested,
    'approved', agg.approved,
    'awarded', agg.awarded,
    'rejected', agg.rejected,
    'withdrawn', agg.withdrawn,
    'demoTotal', agg.demo_total,
    'liveTotal', agg.live_total,
    'draftsExcluded', (select count(*) filter (where status = 'Draft')::int from public.innovation_applications),
    'inWindowTotal', agg.in_window_total,
    'decidedCount', (agg.approved + agg.awarded + agg.rejected),
    'approvalRatePct', case
      when (agg.approved + agg.awarded + agg.rejected) > 0
        then round(((agg.approved + agg.awarded)::numeric / (agg.approved + agg.awarded + agg.rejected)::numeric) * 100.0, 1)
      else null
    end,
    'dailySubmissions', coalesce((
      select jsonb_agg(jsonb_build_object('date', to_char(day_date, 'YYYY-MM-DD'), 'count', cnt) order by day_date asc)
      from daily_subs
    ), '[]'::jsonb),
    'records', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', nd.id,
          'reference', nd.reference,
          'title', nd.title,
          'applicant', nd.applicant,
          'sector', nd.sector,
          'status', nd.status,
          'applicantType', coalesce(nd.applicant_type, 'individual'),
          'isDemo', nd.is_demo,
          'source', case when nd.is_demo then 'Demo' else 'Live' end,
          'submittedDate', to_char(nd.gaborone_submitted_date, 'YYYY-MM-DD'),
          'version', coalesce(nd.version, 1)
        ) order by nd.is_demo asc, nd.effective_submitted_at desc
      )
      from non_draft nd
    ), '[]'::jsonb)
  )
  into v_applications
  from agg_apps agg;

  -- Sector breakdown (excluding drafts)
  select coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'id', s.id,
        'name', s.name,
        'status', s.status,
        'total', coalesce(c.total_count, 0),
        'submitted', coalesce(c.submitted_count, 0),
        'inReview', coalesce(c.review_count, 0),
        'changesRequested', coalesce(c.changes_count, 0),
        'approved', coalesce(c.approved_count, 0),
        'awarded', coalesce(c.awarded_count, 0),
        'rejected', coalesce(c.rejected_count, 0),
        'withdrawn', coalesce(c.withdrawn_count, 0)
      ) order by coalesce(c.total_count, 0) desc, s.name asc
    )
    from public.sectors s
    left join (
      select
        lower(btrim(a.sector)) as sector_key,
        count(*)::int as total_count,
        count(*) filter (where a.status = 'Submitted')::int as submitted_count,
        count(*) filter (where a.status = 'In review')::int as review_count,
        count(*) filter (where a.status = 'Changes requested')::int as changes_count,
        count(*) filter (where a.status = 'Approved')::int as approved_count,
        count(*) filter (where a.status = 'Awarded')::int as awarded_count,
        count(*) filter (where a.status = 'Rejected')::int as rejected_count,
        count(*) filter (where a.status = 'Withdrawn')::int as withdrawn_count
      from public.innovation_applications a
      where a.status <> 'Draft'
      group by lower(btrim(a.sector))
    ) c on c.sector_key = lower(btrim(s.name))
  ), '[]'::jsonb)
  into v_sectors;

  -- Turnaround SLA metrics across submission, assessment, clarification, and support
  with app_timings as (
    select
      a.id,
      a.reference,
      a.status,
      coalesce(a.submitted_at, ceda_private.parse_gaborone_timestamp(a.submitted_date::text), a.created_at) as sub_ts,
      least(
        (select min(r.created_at) from ceda_private.assessment_rounds r where r.case_id = a.id),
        (
          select min(ceda_private.parse_gaborone_timestamp(h->>'at'))
          from jsonb_array_elements(coalesce(a.history, '[]'::jsonb)) h
          where coalesce(h->'after'->>'status', '') = 'In review'
             or lower(coalesce(h->>'type', '')) like '%review started%'
        )
      ) as review_start_ts,
      case
        when a.status in ('Approved', 'Awarded', 'Rejected', 'Withdrawn') then coalesce(
          ceda_private.parse_gaborone_timestamp(a.outcome_data->>'decidedAt'),
          (
            select max(ceda_private.parse_gaborone_timestamp(h->>'at'))
            from jsonb_array_elements(coalesce(a.history, '[]'::jsonb)) h
            where coalesce(h->'after'->>'status', '') = a.status
          ),
          a.updated_at
        )
        else null
      end as decision_ts,
      (
        select min(ceda_private.parse_gaborone_timestamp(h->>'at'))
        from jsonb_array_elements(coalesce(a.history, '[]'::jsonb)) h
        where coalesce(h->'after'->>'status', '') = 'Changes requested'
      ) as clarif_req_ts,
      (
        select min(ceda_private.parse_gaborone_timestamp(h->>'at'))
        from jsonb_array_elements(coalesce(a.history, '[]'::jsonb)) h
        where (
          coalesce(h->'after'->>'status', '') in ('Submitted', 'In review')
          and coalesce(h->'before'->>'status', '') = 'Changes requested'
        )
        or lower(coalesce(h->>'type', '')) like '%clarif%'
      ) as clarif_done_ts
    from public.innovation_applications a
    where a.status <> 'Draft'
  ),
  round_timings as (
    select
      extract(epoch from (completed_at - r.created_at)) / 3600.0 as hours
    from ceda_private.assessment_rounds r
    cross join lateral (
      select coalesce(
        (
          select max(au.created_at)
          from public.admin_audit au
          join public.innovation_applications app on app.reference = au.target
          where app.id = r.case_id
            and au.action in ('assessment.close-vote', 'assessment.release')
            and au.created_at >= r.created_at
        ),
        case
          when r.state in ('closed', 'released', 'archived') then (
            select max(am.submitted_at)
            from ceda_private.assessment_members am
            where am.round_id = r.id
              and am.submitted_at is not null
          )
          else null
        end
      ) as completed_at
    ) comp
    where comp.completed_at is not null
      and comp.completed_at >= r.created_at
  ),
  sub_to_rev as (
    select
      count(*)::int as cnt,
      round(avg(hrs)::numeric, 2) as avg_h,
      round((percentile_cont(0.5) within group (order by hrs))::numeric, 2) as med_h,
      round((percentile_cont(0.95) within group (order by hrs))::numeric, 2) as p95_h
    from (
      select extract(epoch from (review_start_ts - sub_ts)) / 3600.0 as hrs
      from app_timings
      where review_start_ts is not null and sub_ts is not null and review_start_ts >= sub_ts
    ) s
  ),
  round_dur as (
    select
      count(*)::int as cnt,
      round(avg(hours)::numeric, 2) as avg_h,
      round((percentile_cont(0.5) within group (order by hours))::numeric, 2) as med_h,
      round((percentile_cont(0.95) within group (order by hours))::numeric, 2) as p95_h
    from round_timings
  ),
  sub_to_dec as (
    select
      count(*)::int as cnt,
      round(avg(hrs)::numeric, 2) as avg_h,
      round((percentile_cont(0.5) within group (order by hrs))::numeric, 2) as med_h,
      round((percentile_cont(0.95) within group (order by hrs))::numeric, 2) as p95_h
    from (
      select extract(epoch from (decision_ts - sub_ts)) / 3600.0 as hrs
      from app_timings
      where decision_ts is not null and sub_ts is not null and decision_ts >= sub_ts
    ) s
  ),
  clarif_dur as (
    select
      count(*)::int as cnt,
      round(avg(hrs)::numeric, 2) as avg_h,
      round((percentile_cont(0.5) within group (order by hrs))::numeric, 2) as med_h,
      round((percentile_cont(0.95) within group (order by hrs))::numeric, 2) as p95_h
    from (
      select extract(epoch from (clarif_done_ts - clarif_req_ts)) / 3600.0 as hrs
      from app_timings
      where clarif_req_ts is not null and clarif_done_ts is not null and clarif_done_ts >= clarif_req_ts
    ) s
  ),
  sup_first as (
    select
      count(*)::int as cnt,
      round(avg(hrs)::numeric, 2) as avg_h,
      round((percentile_cont(0.5) within group (order by hrs))::numeric, 2) as med_h,
      round((percentile_cont(0.95) within group (order by hrs))::numeric, 2) as p95_h
    from (
      select extract(epoch from (first_response_at - reported_at)) / 3600.0 as hrs
      from public.admin_matters
      where first_response_at is not null and reported_at is not null and first_response_at >= reported_at
    ) s
  ),
  sup_res as (
    select
      count(*)::int as cnt,
      round(avg(hrs)::numeric, 2) as avg_h,
      round((percentile_cont(0.5) within group (order by hrs))::numeric, 2) as med_h,
      round((percentile_cont(0.95) within group (order by hrs))::numeric, 2) as p95_h
    from (
      select extract(epoch from (coalesce(resolved_at, updated_at) - reported_at)) / 3600.0 as hrs
      from public.admin_matters
      where state = 'Resolved'
        and reported_at is not null
        and coalesce(resolved_at, updated_at) >= reported_at
    ) s
  )
  select jsonb_build_object(
    'submissionToReviewStart', jsonb_build_object('sampleCount', r1.cnt, 'avgHours', r1.avg_h, 'medianHours', r1.med_h, 'p95Hours', r1.p95_h),
    'assessmentRoundDuration', jsonb_build_object('sampleCount', r2.cnt, 'avgHours', r2.avg_h, 'medianHours', r2.med_h, 'p95Hours', r2.p95_h),
    'submissionToDecision', jsonb_build_object('sampleCount', r3.cnt, 'avgHours', r3.avg_h, 'medianHours', r3.med_h, 'p95Hours', r3.p95_h),
    'clarificationCycle', jsonb_build_object('sampleCount', r4.cnt, 'avgHours', r4.avg_h, 'medianHours', r4.med_h, 'p95Hours', r4.p95_h),
    'supportFirstResponse', jsonb_build_object('sampleCount', r5.cnt, 'avgHours', r5.avg_h, 'medianHours', r5.med_h, 'p95Hours', r5.p95_h),
    'supportResolution', jsonb_build_object('sampleCount', r6.cnt, 'avgHours', r6.avg_h, 'medianHours', r6.med_h, 'p95Hours', r6.p95_h)
  )
  into v_turnaround
  from sub_to_rev r1, round_dur r2, sub_to_dec r3, clarif_dur r4, sup_first r5, sup_res r6;

  -- Telemetry: page/screen views, device mix, top routes, Core Web Vitals & request errors
  with win_events as (
    select
      e.*,
      (e.created_at at time zone 'Africa/Gaborone')::date as gaborone_date
    from public.telemetry_events e
    where e.created_at >= v_start_ts
      and e.created_at < v_end_ts
  ),
  daily_tel as (
    select
      d::date as day_date,
      count(*) filter (where we.event_type in ('page_view', 'screen_view'))::int as views,
      count(distinct we.session_key) filter (where we.event_type in ('page_view', 'screen_view'))::int as uniq_sessions,
      round((percentile_cont(0.75) within group (order by we.lcp_ms) filter (where we.lcp_ms is not null))::numeric, 0) as lcp_ms,
      round((percentile_cont(0.75) within group (order by we.inp_ms) filter (where we.inp_ms is not null))::numeric, 0) as inp_ms,
      count(*) filter (where we.event_type = 'request_error')::int as req_errors
    from generate_series(v_start_date, v_end_date, interval '1 day') as d
    left join win_events we on we.gaborone_date = d::date
    group by d::date
    order by d::date asc
  ),
  vitals_agg as (
    select
      count(*) filter (where event_type = 'web_vital' or lcp_ms is not null or inp_ms is not null or cls_score is not null or ttfb_ms is not null)::int as sample_count,
      round((percentile_cont(0.75) within group (order by lcp_ms) filter (where lcp_ms is not null))::numeric, 0) as lcp_ms,
      round((percentile_cont(0.75) within group (order by inp_ms) filter (where inp_ms is not null))::numeric, 0) as inp_ms,
      round((percentile_cont(0.75) within group (order by cls_score) filter (where cls_score is not null))::numeric, 2) as cls,
      round((percentile_cont(0.75) within group (order by ttfb_ms) filter (where ttfb_ms is not null))::numeric, 0) as ttfb_ms,
      count(*) filter (where event_type = 'request_error')::int as error_count,
      count(*) filter (where event_type in ('page_view', 'screen_view', 'request_error'))::int as total_requests
    from win_events
  )
  select jsonb_build_object(
    'totalViews', (select count(*) filter (where event_type in ('page_view', 'screen_view'))::int from win_events),
    'uniqueSessions', (select count(distinct session_key) filter (where event_type in ('page_view', 'screen_view'))::int from win_events),
    'dailyViews', coalesce((
      select jsonb_agg(jsonb_build_object(
        'date', to_char(day_date, 'YYYY-MM-DD'),
        'views', views,
        'uniqueSessions', uniq_sessions
      ) order by day_date asc)
      from daily_tel
    ), '[]'::jsonb),
    'dailyTelemetryHealth', coalesce((
      select jsonb_agg(jsonb_build_object(
        'date', to_char(day_date, 'YYYY-MM-DD'),
        'lcpMs', lcp_ms,
        'inpMs', inp_ms,
        'errorCount', req_errors,
        'requestErrorCount', req_errors
      ) order by day_date asc)
      from daily_tel
    ), '[]'::jsonb),
    'devices', coalesce((
      select jsonb_agg(jsonb_build_object('name', d.device_class, 'count', d.cnt) order by d.cnt desc, d.device_class asc)
      from (
        select device_class, count(*)::int as cnt
        from win_events
        where event_type in ('page_view', 'screen_view')
        group by device_class
      ) d
    ), '[]'::jsonb),
    'topRoutes', coalesce((
      select jsonb_agg(jsonb_build_object('route', r.route, 'label', r.label, 'views', r.cnt) order by r.cnt desc, r.route asc)
      from (
        select
          route,
          coalesce(max(nullif(route_label, '')), route) as label,
          count(*)::int as cnt
        from win_events
        where event_type in ('page_view', 'screen_view')
        group by route
        order by count(*) desc, route asc
        limit 8
      ) r
    ), '[]'::jsonb),
    'webVitals', (
      select jsonb_build_object(
        'sampleCount', sample_count,
        'lcpMs', lcp_ms,
        'inpMs', inp_ms,
        'cls', cls,
        'ttfbMs', ttfb_ms,
        'errorCount', error_count,
        'errorRatePct', case
          when total_requests > 0 then round((error_count::numeric / total_requests::numeric) * 100.0, 2)
          else null
        end,
        'availabilityPct', case
          when total_requests > 0 then round(((total_requests - error_count)::numeric / total_requests::numeric) * 100.0, 2)
          else null
        end
      )
      from vitals_agg
    )
  ) into v_telemetry;

  -- Optimus Prime AI usage & reliability
  with daily_opt as (
    select
      d::date as day_date,
      count(oi.id)::int as cnt,
      count(oi.id) filter (where oi.escalated)::int as esc_cnt
    from generate_series(v_start_date, v_end_date, interval '1 day') as d
    left join public.optimus_interactions oi
      on (oi.created_at at time zone 'Africa/Gaborone')::date = d::date
    group by d::date
    order by d::date asc
  )
  select jsonb_build_object(
    'totalInteractions', (select count(*)::int from public.optimus_interactions),
    'inWindowInteractions', (select count(*)::int from public.optimus_interactions where created_at >= v_start_ts and created_at < v_end_ts),
    'helpfulCount', (select count(*) filter (where rating = 'helpful')::int from public.optimus_interactions),
    'notHelpfulCount', (select count(*) filter (where rating in ('unhelpful', 'not_helpful'))::int from public.optimus_interactions),
    'escalations', (select count(*) filter (where escalated)::int from public.optimus_interactions),
    'inWindowEscalations', (select count(*) filter (where escalated and created_at >= v_start_ts and created_at < v_end_ts)::int from public.optimus_interactions),
    'avgLatencyMs', null,
    'errorCount', (select count(*) filter (where coalesce(ai_provider, '') = 'error')::int from public.optimus_interactions),
    'dailyInteractions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'date', to_char(day_date, 'YYYY-MM-DD'),
        'count', cnt,
        'escalations', esc_cnt,
        'avgLatencyMs', null
      ) order by day_date asc)
      from daily_opt
    ), '[]'::jsonb)
  ) into v_optimus;

  -- Notification queue health
  select jsonb_build_object(
    'total', count(*)::int,
    'queued', count(*) filter (where status = 'Queued')::int,
    'sent', count(*) filter (where status = 'Sent')::int,
    'failed', count(*) filter (where status = 'Failed')::int,
    'open', count(*) filter (where status = 'Open')::int,
    'active', count(*) filter (where status = 'Active')::int
  )
  into v_notifications
  from public.notification_queue;

  -- Follow-up matters summary
  select jsonb_build_object(
    'total', count(*)::int,
    'open', count(*) filter (where state = 'Open')::int,
    'investigating', count(*) filter (where state = 'Investigating')::int,
    'waiting', count(*) filter (where state = 'Waiting')::int,
    'resolved', count(*) filter (where state = 'Resolved')::int,
    'demoTotal', count(*) filter (where (owner_id is null and ceda_private.is_demo_reference(reference)))::int,
    'liveTotal', count(*) filter (where not (owner_id is null and ceda_private.is_demo_reference(reference)))::int,
    'inWindowReported', count(*) filter (where reported_at >= v_start_ts and reported_at < v_end_ts)::int,
    'inWindowResolved', count(*) filter (where state = 'Resolved' and coalesce(resolved_at, updated_at) >= v_start_ts and coalesce(resolved_at, updated_at) < v_end_ts)::int,
    'records', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', m.id,
          'reference', m.reference,
          'title', m.title,
          'kind', m.kind,
          'priority', m.priority,
          'state', m.state,
          'ownerName', m.owner_name,
          'applicationRef', m.application_ref,
          'isDemo', (m.owner_id is null and ceda_private.is_demo_reference(m.reference)),
          'source', case when (m.owner_id is null and ceda_private.is_demo_reference(m.reference)) then 'Demo' else 'Live' end,
          'reportedAt', to_char((m.reported_at at time zone 'Africa/Gaborone'), 'YYYY-MM-DD HH24:MI'),
          'resolvedAt', to_char((m.resolved_at at time zone 'Africa/Gaborone'), 'YYYY-MM-DD HH24:MI')
        ) order by (m.owner_id is null and ceda_private.is_demo_reference(m.reference)) asc, m.reported_at desc
      )
      from public.admin_matters m
    ), '[]'::jsonb)
  )
  into v_matters
  from public.admin_matters;

  -- Real admin & support staff directory names for follow-up assignment selectors
  select coalesce((
    select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.full_name, 'role', p.account_role) order by p.full_name asc)
    from public.profiles p
    where p.account_status = 'active'
      and p.account_role in ('admin', 'support')
      and nullif(btrim(coalesce(p.full_name, '')), '') is not null
  ), '[]'::jsonb)
  into v_owners;

  return jsonb_build_object(
    'generatedAt', now(),
    'periodDays', v_period,
    'windowStart', to_char(v_start_date, 'YYYY-MM-DD'),
    'windowEnd', to_char(v_end_date, 'YYYY-MM-DD'),
    'participation', v_participation,
    'applications', v_applications,
    'sectors', v_sectors,
    'turnaround', v_turnaround,
    'telemetry', v_telemetry,
    'optimus', v_optimus,
    'notifications', v_notifications,
    'matters', v_matters,
    'owners', v_owners
  );
end $$;

create or replace function public.admin_reporting_summary(
  p_period_days integer default 7
)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select ceda_private.admin_reporting_summary(p_period_days);
$$;

revoke all on function ceda_private.admin_reporting_summary(integer) from public, anon, authenticated;
revoke all on function public.admin_reporting_summary(integer) from public, anon;
grant execute on function public.admin_reporting_summary(integer) to authenticated;

-- 7. Audited report export logger RPC
create or replace function ceda_private.admin_log_report_export(
  p_report_key text,
  p_format text default 'csv',
  p_period_days integer default 7
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
  v_key text := lower(btrim(coalesce(p_report_key, 'executive')));
  v_fmt text := lower(btrim(coalesce(p_format, 'csv')));
  v_days integer := case when p_period_days in (1, 7, 30) then p_period_days else 7 end;
  v_audit_id bigint;
begin
  v_actor := ceda_private.require_admin(false);

  if v_key not in ('executive', 'outcomes', 'sectors', 'turnaround', 'health', 'applications', 'matters') then
    v_key := 'executive';
  end if;

  if v_fmt not in ('csv', 'pdf', 'print', 'share') then
    v_fmt := 'csv';
  end if;

  insert into public.admin_audit (actor_id, action, target, detail)
  values (
    v_actor,
    'report.exported',
    format('%s (%s · %sd)', v_key, upper(v_fmt), v_days),
    jsonb_build_object(
      'reportKey', v_key,
      'format', v_fmt,
      'periodDays', v_days,
      'timezone', 'Africa/Gaborone'
    )
  )
  returning id into v_audit_id;

  return jsonb_build_object(
    'ok', true,
    'auditId', v_audit_id,
    'reportKey', v_key,
    'format', v_fmt,
    'periodDays', v_days,
    'exportedAt', now()
  );
end $$;

create or replace function public.admin_log_report_export(
  p_report_key text,
  p_format text default 'csv',
  p_period_days integer default 7
)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select ceda_private.admin_log_report_export(p_report_key, p_format, p_period_days);
$$;

revoke all on function ceda_private.admin_log_report_export(text, text, integer) from public, anon, authenticated;
revoke all on function public.admin_log_report_export(text, text, integer) from public, anon;
grant execute on function public.admin_log_report_export(text, text, integer) to authenticated;
