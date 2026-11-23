-- Operational backend tables, O(log n) indexes, message queue outbox, and protected Admin RPCs.

-- 1. Audit log & foreign-key indexes for O(log n) lookups
create index if not exists admin_audit_created_at_idx on public.admin_audit (created_at desc, id desc);
create index if not exists admin_audit_action_target_idx on public.admin_audit (action, target);
create index if not exists admin_audit_actor_id_idx on public.admin_audit (actor_id);
create index if not exists staff_invitations_created_by_idx on public.staff_invitations (created_by);
create index if not exists staff_sectors_sector_id_idx on public.staff_sectors (sector_id);

-- 2. Public website & governance content table
create table if not exists public.portal_content (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(btrim(title)) between 2 and 160),
  summary text not null default '' check (length(summary) <= 500),
  body text not null check (length(btrim(body)) between 10 and 5000),
  kind text not null check (kind in ('Public pages','FAQs','Announcements','Partners')),
  audience text not null default 'Public website' check (length(btrim(audience)) between 2 and 80),
  stage text not null default 'Draft' check (stage in ('Draft','Awaiting review','Published','Archived')),
  version integer not null default 1 check (version >= 1),
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists portal_content_kind_stage_idx on public.portal_content (kind, stage, updated_at desc);
create index if not exists portal_content_updated_by_idx on public.portal_content (updated_by);
alter table public.portal_content enable row level security;
revoke all on public.portal_content from public, anon, authenticated;
create policy portal_content_direct_access_denied on public.portal_content as restrictive for all to public using(false) with check(false);

-- 3. Notification templates & asynchronous message queue outbox
create table if not exists public.notification_templates (
  id uuid primary key default gen_random_uuid(),
  event_key text not null unique check (length(btrim(event_key)) between 2 and 80),
  title text not null check (length(btrim(title)) between 2 and 160),
  kind text not null default 'Email template' check (kind in ('Announcement','Email template','Push template')),
  channel text not null default 'In-app + Email' check (length(btrim(channel)) between 2 and 60),
  audience text not null default 'Innovator' check (audience in ('Innovator','Assessor','Support Officer','All visitors','Administrator')),
  status text not null default 'Enabled' check (status in ('Enabled','Draft','Disabled')),
  message text not null check (length(btrim(message)) between 10 and 2000),
  version integer not null default 1 check (version >= 1),
  updated_at timestamptz not null default now()
);
create table if not exists public.notification_queue (
  id uuid primary key default gen_random_uuid(),
  idempotency_key text not null unique,
  category text not null default 'Announcement' check (length(btrim(category)) between 2 and 80),
  title text not null check (length(btrim(title)) between 2 and 160),
  message text not null default '' check (length(message) <= 2000),
  channel text not null default 'In-app + Email',
  audience text not null default 'All visitors',
  status text not null default 'Queued' check (status in ('Queued','Sent','Failed','Open','Active','Preview','Draft')),
  attempts integer not null default 0 check (attempts >= 0),
  action_target text not null default 'templates',
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
create index if not exists notification_queue_status_created_idx on public.notification_queue (status, created_at desc);
create index if not exists notification_queue_created_by_idx on public.notification_queue (created_by);
alter table public.notification_templates enable row level security;
alter table public.notification_queue enable row level security;
revoke all on public.notification_templates, public.notification_queue from public, anon, authenticated;
create policy notification_templates_direct_access_denied on public.notification_templates as restrictive for all to public using(false) with check(false);
create policy notification_queue_direct_access_denied on public.notification_queue as restrictive for all to public using(false) with check(false);

-- 4. Admin follow-up & user feedback matters table
create table if not exists public.admin_matters (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique check (length(btrim(reference)) between 3 and 32),
  title text not null check (length(btrim(title)) between 2 and 200),
  kind text not null check (kind in ('Bug','Support','Delivery','Feedback')),
  reporter text not null check (length(btrim(reporter)) between 2 and 120),
  priority text not null default 'Normal' check (priority in ('High','Normal')),
  state text not null default 'Open' check (state in ('Open','Investigating','Waiting','Resolved')),
  owner_name text not null default 'Unassigned' check (length(btrim(owner_name)) between 2 and 120),
  application_ref text,
  detail text not null check (length(btrim(detail)) between 5 and 2000),
  steps text not null default 'Not supplied',
  history jsonb not null default '[]'::jsonb,
  reported_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists admin_matters_state_kind_idx on public.admin_matters (state, kind, priority, reported_at desc);
create index if not exists admin_matters_app_ref_idx on public.admin_matters (application_ref) where application_ref is not null;
alter table public.admin_matters enable row level security;
revoke all on public.admin_matters from public, anon, authenticated;
create policy admin_matters_direct_access_denied on public.admin_matters as restrictive for all to public using(false) with check(false);

-- 5. Innovation applications table with revision snapshot and status intervention support
create table if not exists public.innovation_applications (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique check (length(btrim(reference)) between 3 and 40),
  title text not null check (length(btrim(title)) between 2 and 200),
  applicant text not null check (length(btrim(applicant)) between 2 and 200),
  sector text not null check (length(btrim(sector)) between 2 and 100),
  status text not null default 'Submitted' check (status in ('Submitted','In review','Approved','Rejected')),
  summary text not null check (length(btrim(summary)) between 2 and 5000),
  submitted_date date not null default current_date,
  version integer not null default 1 check (version >= 1),
  reassessment_required boolean not null default false,
  original_snapshot jsonb not null default '{}'::jsonb,
  exclusions jsonb not null default '[]'::jsonb,
  history jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists innovation_applications_status_date_idx on public.innovation_applications (status, submitted_date desc);
create index if not exists innovation_applications_sector_status_idx on public.innovation_applications (lower(sector), status);
alter table public.innovation_applications enable row level security;
revoke all on public.innovation_applications from public, anon, authenticated;
create policy innovation_applications_direct_access_denied on public.innovation_applications as restrictive for all to public using(false) with check(false);

-- 6. Versioned portal & Optimus Prime AI configurations
create table if not exists public.portal_configurations (
  config_key text primary key check (config_key in ('optimus_guidance','optimus_knowledge','portal_policies')),
  payload jsonb not null default '{}'::jsonb,
  version integer not null default 1 check (version >= 1),
  reason text not null default 'Initial baseline configuration',
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);
alter table public.portal_configurations enable row level security;
create index if not exists portal_configurations_updated_by_idx on public.portal_configurations (updated_by);
revoke all on public.portal_configurations from public, anon, authenticated;
create policy portal_configurations_direct_access_denied on public.portal_configurations as restrictive for all to public using(false) with check(false);

-- 7. Seed baseline operational data idempotently
insert into public.sectors (name, status)
values
  ('Creative Industries', 'published'),
  ('Agriculture', 'published'),
  ('Environment', 'published'),
  ('Education', 'published')
on conflict (name) do nothing;

insert into public.portal_content (title, summary, body, kind, audience, stage, version, updated_at)
select * from (values
  ('How to submit an innovation', 'Step-by-step guidance for individual and company applicants.', 'Prepare your innovation overview, problem statement, proposed solution, alignment with Botswana priorities, feasibility evidence and declarations before submitting.', 'Public pages', 'Public website', 'Published', 1, '2026-11-19T10:00:00Z'::timestamptz),
  ('What information should I prepare?', 'Checklist of problem, solution, impact and feasibility evidence.', 'Applicants may attach up to four supporting files per section (maximum 10 MB each) and provide an HTTPS link for video demonstrations.', 'FAQs', 'Applicants', 'Published', 1, '2026-11-18T14:30:00Z'::timestamptz),
  ('Innovation submissions are open', 'Cycle announcement for the CEDA Innovation Portal.', 'The CEDA Innovation Portal is open for individual and registered company innovation submissions across published sectors.', 'Announcements', 'All visitors', 'Published', 1, '2026-11-20T08:00:00Z'::timestamptz),
  ('Partner ecosystem directory', 'Overview of CEDA innovation support and institutional partners.', 'Directory of reviewed innovation ecosystem partners and incubation support institutions.', 'Partners', 'Public website', 'Awaiting review', 1, '2026-11-17T16:15:00Z'::timestamptz)
) as v(title, summary, body, kind, audience, stage, version, updated_at)
where not exists (select 1 from public.portal_content limit 1);

insert into public.notification_templates (event_key, title, kind, channel, audience, status, message)
values
  ('submission_received', 'Submission received', 'Email template', 'In-app + Email', 'Innovator', 'Enabled', 'We have received your CEDA innovation submission. Sign in to view your reference and progress timeline.'),
  ('review_started', 'Review started', 'Email template', 'In-app + Email', 'Innovator', 'Enabled', 'Your innovation submission is now under assessment by the review panel.'),
  ('info_requested', 'Additional information requested', 'Email template', 'In-app + Email', 'Innovator', 'Enabled', 'The assessment panel requested clarification on your submission. Sign in to respond.'),
  ('panel_assignment', 'Assessment panel assignment', 'Email template', 'In-app + Email', 'Assessor', 'Enabled', 'A new innovation application is available in your Assessor workspace.'),
  ('outcome_released', 'Outcome released', 'Email template', 'In-app + Email', 'Innovator', 'Enabled', 'Your CEDA innovation assessment has an update. Sign in to view the released outcome and feedback.')
on conflict (event_key) do nothing;

insert into public.notification_queue (idempotency_key, category, title, message, channel, audience, status, action_target, created_at)
values
  ('seed-del001', 'Delivery alert', 'DEL001 / Application notification delivery failed', 'Email delivery failed for a notification receipt. Inspect in Admin follow-up before retrying.', 'Email', 'Administrator', 'Open', 'followup', '2026-11-18T14:05:00Z'::timestamptz),
  ('seed-mfa-policy', 'Security policy', 'Authenticator verification required for role assignments', 'All staff creation and role modifications require AAL2 multi-factor verification.', 'In-app', 'Administrator', 'Active', 'security', '2026-11-20T06:00:00Z'::timestamptz),
  ('seed-templates-ready', 'Templates', 'Submission & outcome templates ready for review', 'Five standard transactional notification templates are configured.', 'In-app + Email', 'Administrator', 'Preview', 'templates', '2026-11-20T07:30:00Z'::timestamptz)
on conflict (idempotency_key) do nothing;

insert into public.admin_matters (reference, title, kind, reporter, priority, state, owner_name, application_ref, detail, steps, history, reported_at)
values
  ('BUG001', 'Attachment picker does not open', 'Bug', 'Sample innovator D', 'High', 'Investigating', 'Sample admin C', 'DEMO001', 'Selecting the attachment control on a narrow mobile screen does not open the file picker.', 'On a narrow screen select Add attachment.', '[{"actor":"Sample admin C","action":"Started investigation","at":"2026-11-19 11:00"}]'::jsonb, '2026-11-19T08:15:00Z'::timestamptz),
  ('TKT002', 'Unable to access verification email', 'Support', 'Sample officer A', 'Normal', 'Open', 'Unassigned', null, 'Support escalation requiring an email delivery investigation.', 'Not supplied', '[]'::jsonb, '2026-11-20T07:20:00Z'::timestamptz),
  ('DEL001', 'Application notification delivery failed', 'Delivery', 'Notification service', 'Normal', 'Open', 'Sample admin C', null, 'Service alert. Inspect delivery logs before any retry.', 'Not supplied', '[]'::jsonb, '2026-11-18T14:05:00Z'::timestamptz),
  ('FB001', 'Explain eligibility in simpler language', 'Feedback', 'Sample innovator G', 'Normal', 'Open', 'Unassigned', null, 'Provide plain-language examples for individual versus company eligibility on the public guidance page.', 'Not supplied', '[]'::jsonb, '2026-11-19T13:40:00Z'::timestamptz),
  ('FB002', 'Make forms easier to use with a screen reader', 'Feedback', 'Sample visitor H', 'Normal', 'Investigating', 'Sample admin C', null, 'Ensure every field group and modal action announces clear labels and status updates.', 'Not supplied', '[{"actor":"Sample admin C","action":"Assigned for accessibility review","at":"2026-11-19 09:10"}]'::jsonb, '2026-11-18T09:25:00Z'::timestamptz),
  ('BUG002', 'Help link on mobile overlaps text', 'Bug', 'Sample innovator E', 'Normal', 'Resolved', 'Sample admin C', null, 'Layout issue resolved for interface review.', 'Not supplied', '[{"actor":"Sample admin C","action":"Resolved issue","at":"2026-11-18 13:20"}]'::jsonb, '2026-11-17T06:30:00Z'::timestamptz)
on conflict (reference) do nothing;

insert into public.innovation_applications (reference, title, applicant, sector, status, submitted_date, summary, original_snapshot, exclusions, history)
values
  ('DEMO001', 'Community craft marketplace', 'Sample enterprise A', 'Creative Industries', 'In review', '2026-11-18', 'A proposed digital marketplace connecting local craft makers with buyers.', '{"title":"Community craft marketplace","applicant":"Sample enterprise A","sector":"Creative Industries","summary":"A proposed digital marketplace connecting local craft makers with buyers."}'::jsonb, '[{"assessorId":"b","reason":"Conflict of interest declared","actor":"Lead Assessor"}]'::jsonb, '[]'::jsonb),
  ('DEMO002', 'Waterwise crop monitoring', 'Sample innovator B', 'Agriculture', 'In review', '2026-11-18', 'A sensor concept helping growers monitor crop irrigation requirements.', '{"title":"Waterwise crop monitoring","applicant":"Sample innovator B","sector":"Agriculture","summary":"A sensor concept helping growers monitor crop irrigation requirements."}'::jsonb, '[]'::jsonb, '[]'::jsonb),
  ('DEMO003', 'Neighbourhood recycling network', 'Sample enterprise C', 'Environment', 'Submitted', '2026-11-19', 'A proposed collection network for recyclable household materials.', '{"title":"Neighbourhood recycling network","applicant":"Sample enterprise C","sector":"Environment","summary":"A proposed collection network for recyclable household materials."}'::jsonb, '[]'::jsonb, '[]'::jsonb),
  ('DEMO004', 'Accessible learning toolkit', 'Sample innovator D', 'Education', 'Approved', '2026-11-15', 'An accessible teaching toolkit concept supporting different learning needs.', '{"title":"Accessible learning toolkit","applicant":"Sample innovator D","sector":"Education","summary":"An accessible teaching toolkit concept supporting different learning needs."}'::jsonb, '[]'::jsonb, '[]'::jsonb),
  ('DEMO005', 'Creative studio booking', 'Sample enterprise E', 'Creative Industries', 'Rejected', '2026-11-14', 'A booking service concept for shared creative workspaces.', '{"title":"Creative studio booking","applicant":"Sample enterprise E","sector":"Creative Industries","summary":"A booking service concept for shared creative workspaces."}'::jsonb, '[]'::jsonb, '[]'::jsonb),
  ('DEMO006', 'Solar cold storage', 'Sample innovator F', 'Agriculture', 'In review', '2026-11-19', 'A solar-powered cold storage concept for small agricultural producers.', '{"title":"Solar cold storage","applicant":"Sample innovator F","sector":"Agriculture","summary":"A solar-powered cold storage concept for small agricultural producers."}'::jsonb, '[]'::jsonb, '[]'::jsonb)
on conflict (reference) do nothing;

insert into public.portal_configurations (config_key, payload, version, reason)
values
  ('optimus_guidance', '{"tone":"Clear and professional","length":"Balanced","instructions":"Use plain language, cite approved CEDA guidance and explain the next step clearly.","handoff":"Offer human support when the answer is uncertain or an applicant needs case-specific assistance."}'::jsonb, 1, 'Initial Optimus Prime response guidance'),
  ('optimus_knowledge', '{"source":"https://www.ceda.co.bw/","notes":"Applicants may submit as an individual or registered company across published innovation sectors.","questions":"Who is eligible to submit an innovation?\nWhat supporting evidence files are accepted?"}'::jsonb, 1, 'Initial Optimus Prime approved knowledge'),
  ('portal_policies', '{"area":"Submission & evidence rules","proposal":"Up to 4 files per section (10 MB max) plus validated HTTPS video links; 6 unweighted assessment criteria (1-5)."}'::jsonb, 1, 'Baseline CEDA Innovation Portal policy')
on conflict (config_key) do nothing;

-- 8. Update ceda_private.admin_sectors() to include live per-sector application counts
create or replace function ceda_private.admin_sectors()
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  perform ceda_private.require_admin();
  return coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'id', s.id,
        'name', s.name,
        'status', s.status,
        'created_at', s.created_at,
        'applications_count', coalesce(c.total_count, 0),
        'approved_count', coalesce(c.approved_count, 0),
        'in_review_count', coalesce(c.review_count, 0),
        'rejected_count', coalesce(c.rejected_count, 0)
      ) order by s.name
    )
    from public.sectors s
    left join (
      select lower(a.sector) as sector_key,
        count(*)::int as total_count,
        count(*) filter (where a.status = 'Approved')::int as approved_count,
        count(*) filter (where a.status = 'In review')::int as review_count,
        count(*) filter (where a.status = 'Rejected')::int as rejected_count
      from public.innovation_applications a
      group by lower(a.sector)
    ) c on c.sector_key = lower(s.name)
  ), '[]'::jsonb);
end $$;

-- 9. Applications list, revision and status intervention RPCs
create or replace function ceda_private.admin_applications()
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  perform ceda_private.require_admin();
  return coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'id', a.reference,
        'uuid', a.id,
        'title', a.title,
        'applicant', a.applicant,
        'sector', a.sector,
        'status', a.status,
        'date', a.submitted_date::text,
        'summary', a.summary,
        'version', a.version,
        'reassessmentRequired', a.reassessment_required,
        'original', a.original_snapshot,
        'exclusions', a.exclusions,
        'history', a.history,
        'reportedIssues', coalesce((
          select jsonb_agg(
            jsonb_build_object(
              'id', m.reference,
              'title', m.title,
              'description', m.detail,
              'reporter', m.reporter,
              'priority', m.priority,
              'status', m.state,
              'owner', m.owner_name,
              'at', to_char(m.reported_at at time zone 'Africa/Gaborone', 'YYYY-MM-DD')
            ) order by m.reported_at desc
          )
          from public.admin_matters m
          where m.application_ref = a.reference
        ), '[]'::jsonb)
      ) order by a.submitted_date desc, a.reference asc
    )
    from public.innovation_applications a
  ), '[]'::jsonb);
end $$;

create or replace function ceda_private.admin_revise_application(
  app_ref text,
  new_title text,
  new_applicant text,
  new_sector text,
  new_summary text,
  expected_version integer,
  reason text
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := ceda_private.require_admin();
  actor_name text;
  current_row public.innovation_applications;
  before_snap jsonb;
  after_snap jsonb;
  new_entry jsonb;
begin
  if app_ref is null or reason is null or length(btrim(reason)) not between 5 and 500
    or new_title is null or length(btrim(new_title)) not between 2 and 200
    or new_applicant is null or length(btrim(new_applicant)) not between 2 and 200
    or new_sector is null or length(btrim(new_sector)) not between 2 and 100
    or new_summary is null or length(btrim(new_summary)) not between 2 and 5000 then
    raise exception 'Provide valid application fields and a reason (5-500 characters)';
  end if;
  select * into current_row from public.innovation_applications where reference = btrim(app_ref) for update;
  if not found then raise exception 'Application not found'; end if;
  if expected_version is not null and current_row.version <> expected_version then
    raise exception 'Application has been updated by another session. Refresh and try again.';
  end if;
  select coalesce(p.full_name, 'Administrator') into actor_name from public.profiles p where p.id = actor;
  before_snap := jsonb_build_object('title', current_row.title, 'applicant', current_row.applicant, 'sector', current_row.sector, 'summary', current_row.summary);
  after_snap := jsonb_build_object('title', btrim(new_title), 'applicant', btrim(new_applicant), 'sector', btrim(new_sector), 'summary', btrim(new_summary));
  new_entry := jsonb_build_object(
    'type', 'Admin submission correction',
    'actor', actor_name,
    'reason', btrim(reason),
    'at', to_char(now() at time zone 'Africa/Gaborone', 'YYYY-MM-DD HH24:MI'),
    'before', before_snap,
    'after', after_snap
  );
  update public.innovation_applications
  set title = btrim(new_title),
      applicant = btrim(new_applicant),
      sector = btrim(new_sector),
      summary = btrim(new_summary),
      version = current_row.version + 1,
      reassessment_required = true,
      original_snapshot = case when current_row.original_snapshot = '{}'::jsonb then before_snap else current_row.original_snapshot end,
      history = current_row.history || jsonb_build_array(new_entry),
      updated_at = now()
  where id = current_row.id;

  insert into public.admin_audit(actor_id, action, target, detail)
  values (actor, 'application.revised', current_row.reference, jsonb_build_object('before', before_snap, 'after', after_snap, 'version', current_row.version + 1, 'reason', btrim(reason)));

  return ceda_private.admin_applications();
end $$;

create or replace function ceda_private.admin_intervene_application_status(
  app_ref text,
  new_status text,
  expected_version integer,
  confirmed boolean,
  reason text
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := ceda_private.require_admin();
  actor_name text;
  current_row public.innovation_applications;
  new_entry jsonb;
begin
  if not coalesce(confirmed, false) then
    raise exception 'Confirm this administrator status intervention';
  end if;
  if app_ref is null or new_status is null or new_status not in ('Submitted','In review','Approved','Rejected')
    or reason is null or length(btrim(reason)) not between 5 and 500 then
    raise exception 'Provide a valid status and reason (5-500 characters)';
  end if;
  select * into current_row from public.innovation_applications where reference = btrim(app_ref) for update;
  if not found then raise exception 'Application not found'; end if;
  if expected_version is not null and current_row.version <> expected_version then
    raise exception 'Application has been updated by another session. Refresh and try again.';
  end if;
  select coalesce(p.full_name, 'Administrator') into actor_name from public.profiles p where p.id = actor;
  new_entry := jsonb_build_object(
    'type', 'Admin status intervention',
    'actor', actor_name,
    'reason', btrim(reason),
    'at', to_char(now() at time zone 'Africa/Gaborone', 'YYYY-MM-DD HH24:MI'),
    'before', jsonb_build_object('status', current_row.status),
    'after', jsonb_build_object('status', new_status)
  );
  update public.innovation_applications
  set status = new_status,
      version = current_row.version + 1,
      history = current_row.history || jsonb_build_array(new_entry),
      updated_at = now()
  where id = current_row.id;

  insert into public.admin_audit(actor_id, action, target, detail)
  values (actor, 'application.status.intervened', current_row.reference, jsonb_build_object('before_status', current_row.status, 'after_status', new_status, 'version', current_row.version + 1, 'reason', btrim(reason)));

  return ceda_private.admin_applications();
end $$;

-- 10. Content management RPCs
create or replace function ceda_private.admin_content_list()
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  perform ceda_private.require_admin();
  return coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'id', c.id,
        'title', c.title,
        'summary', c.summary,
        'body', c.body,
        'kind', c.kind,
        'audience', c.audience,
        'stage', c.stage,
        'version', c.version,
        'updated', to_char(c.updated_at at time zone 'Africa/Gaborone', 'YYYY-MM-DD')
      ) order by c.updated_at desc, c.title asc
    )
    from public.portal_content c
  ), '[]'::jsonb);
end $$;

create or replace function ceda_private.admin_save_content(
  content_kind text,
  content_title text,
  content_body text,
  reason text,
  content_id uuid default null,
  content_stage text default 'Draft'
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := ceda_private.require_admin();
  saved_id uuid;
  computed_summary text;
begin
  if content_kind is null or content_kind not in ('Public pages','FAQs','Announcements','Partners')
    or content_title is null or length(btrim(content_title)) not between 2 and 160
    or content_body is null or length(btrim(content_body)) not between 10 and 5000
    or content_stage is null or content_stage not in ('Draft','Awaiting review','Published','Archived')
    or reason is null or length(btrim(reason)) not between 5 and 500 then
    raise exception 'Invalid content fields or reason';
  end if;
  computed_summary := left(btrim(content_body), 160);
  if content_id is not null and exists (select 1 from public.portal_content where id = content_id) then
    update public.portal_content
    set kind = content_kind,
        title = btrim(content_title),
        summary = computed_summary,
        body = btrim(content_body),
        stage = content_stage,
        version = version + 1,
        updated_by = actor,
        updated_at = now()
    where id = content_id
    returning id into saved_id;
  else
    insert into public.portal_content(kind, title, summary, body, stage, updated_by)
    values (content_kind, btrim(content_title), computed_summary, btrim(content_body), content_stage, actor)
    returning id into saved_id;
  end if;

  insert into public.admin_audit(actor_id, action, target, detail)
  values (actor, 'content.saved', saved_id::text, jsonb_build_object('title', btrim(content_title), 'kind', content_kind, 'stage', content_stage, 'reason', btrim(reason)));

  return ceda_private.admin_content_list();
end $$;

-- 11. Notifications & message queue RPCs
create or replace function ceda_private.admin_notifications_overview()
returns jsonb language plpgsql security definer set search_path = '' as $$
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
          'status', q.status,
          'when', to_char(q.created_at at time zone 'Africa/Gaborone', 'YYYY-MM-DD HH24:MI'),
          'action', q.action_target
        ) order by q.created_at desc
      )
      from (select * from public.notification_queue order by created_at desc limit 25) q
    ), '[]'::jsonb)
  );
end $$;

create or replace function ceda_private.admin_save_notification(
  entry_kind text,
  entry_title text,
  entry_message text,
  reason text default 'Prepared in Admin Notification Center'
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := ceda_private.require_admin();
  target_ref text;
  slug text;
begin
  if entry_kind is null or entry_kind not in ('Announcement','Email template','Push template')
    or entry_title is null or length(btrim(entry_title)) not between 2 and 160
    or entry_message is null or length(btrim(entry_message)) not between 10 and 2000
    or reason is null or length(btrim(reason)) not between 5 and 500 then
    raise exception 'Invalid notification draft fields';
  end if;

  if entry_kind = 'Announcement' then
    target_ref := 'ann-' || extract(epoch from clock_timestamp())::bigint::text;
    insert into public.notification_queue(idempotency_key, category, title, message, channel, audience, status, action_target, created_by)
    values (target_ref, 'Announcement', btrim(entry_title), btrim(entry_message), 'In-app + Email', 'All visitors', 'Queued', 'templates', actor);
  else
    slug := lower(regexp_replace(btrim(entry_title), '[^a-zA-Z0-9]+', '_', 'g'));
    target_ref := left(slug, 64);
    insert into public.notification_templates(event_key, title, kind, channel, audience, status, message)
    values (
      target_ref,
      btrim(entry_title),
      entry_kind,
      case when entry_kind = 'Push template' then 'Push' else 'In-app + Email' end,
      'Innovator',
      'Enabled',
      btrim(entry_message)
    )
    on conflict (event_key) do update
    set title = excluded.title,
        kind = excluded.kind,
        channel = excluded.channel,
        message = excluded.message,
        version = public.notification_templates.version + 1,
        updated_at = now();
  end if;

  insert into public.admin_audit(actor_id, action, target, detail)
  values (actor, 'notification.saved', target_ref, jsonb_build_object('kind', entry_kind, 'title', btrim(entry_title), 'reason', btrim(reason)));

  return ceda_private.admin_notifications_overview();
end $$;

-- 12. Admin follow-up & feedback matters RPCs
create or replace function ceda_private.admin_matters_list()
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  perform ceda_private.require_admin();
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
        'application', m.application_ref,
        'detail', m.detail,
        'steps', m.steps,
        'history', m.history
      ) order by m.reported_at desc, m.reference asc
    )
    from public.admin_matters m
  ), '[]'::jsonb);
end $$;

create or replace function ceda_private.admin_update_matter(
  matter_ref text,
  new_owner text,
  new_state text,
  reason text
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := ceda_private.require_admin();
  actor_name text;
  current_matter public.admin_matters;
  action_note text;
  history_entry jsonb;
begin
  if matter_ref is null or new_owner is null or length(btrim(new_owner)) not between 2 and 120
    or new_state is null or new_state not in ('Open','Investigating','Waiting','Resolved')
    or reason is null or length(btrim(reason)) not between 5 and 500 then
    raise exception 'Provide valid owner, status and reason (5-500 characters)';
  end if;
  select * into current_matter from public.admin_matters where reference = btrim(matter_ref) for update;
  if not found then raise exception 'Matter not found'; end if;
  select coalesce(p.full_name, 'Administrator') into actor_name from public.profiles p where p.id = actor;
  action_note := format('Owner: %s to %s; status: %s to %s. %s', current_matter.owner_name, btrim(new_owner), current_matter.state, new_state, btrim(reason));
  history_entry := jsonb_build_object(
    'actor', actor_name,
    'action', action_note,
    'at', to_char(now() at time zone 'Africa/Gaborone', 'YYYY-MM-DD HH24:MI')
  );
  update public.admin_matters
  set owner_name = btrim(new_owner),
      state = new_state,
      history = current_matter.history || jsonb_build_array(history_entry),
      updated_at = now()
  where id = current_matter.id;

  insert into public.admin_audit(actor_id, action, target, detail)
  values (actor, 'matter.updated', current_matter.reference, jsonb_build_object('before_owner', current_matter.owner_name, 'after_owner', btrim(new_owner), 'before_state', current_matter.state, 'after_state', new_state, 'reason', btrim(reason)));

  return ceda_private.admin_matters_list();
end $$;

-- 13. Portal & Optimus Prime AI configuration RPCs
create or replace function ceda_private.admin_get_configurations()
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  perform ceda_private.require_admin();
  return coalesce((
    select jsonb_object_agg(
      c.config_key,
      jsonb_build_object(
        'payload', c.payload,
        'version', c.version,
        'reason', c.reason,
        'updated_at', to_char(c.updated_at at time zone 'Africa/Gaborone', 'YYYY-MM-DD HH24:MI')
      )
    )
    from public.portal_configurations c
  ), '{}'::jsonb);
end $$;

create or replace function ceda_private.admin_save_configuration(
  target_key text,
  new_payload jsonb,
  reason text
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := ceda_private.require_admin();
  prev_payload jsonb;
  next_version integer;
begin
  if target_key is null or target_key not in ('optimus_guidance','optimus_knowledge','portal_policies')
    or new_payload is null or jsonb_typeof(new_payload) <> 'object'
    or reason is null or length(btrim(reason)) not between 5 and 500 then
    raise exception 'Invalid configuration key, payload or reason';
  end if;
  select payload into prev_payload from public.portal_configurations where config_key = target_key for update;
  insert into public.portal_configurations(config_key, payload, version, reason, updated_by, updated_at)
  values (target_key, new_payload, 1, btrim(reason), actor, now())
  on conflict (config_key) do update
  set payload = excluded.payload,
      version = public.portal_configurations.version + 1,
      reason = excluded.reason,
      updated_by = actor,
      updated_at = now()
  returning version into next_version;

  insert into public.admin_audit(actor_id, action, target, detail)
  values (actor, 'configuration.saved', target_key, jsonb_build_object('before', prev_payload, 'after', new_payload, 'version', next_version, 'reason', btrim(reason)));

  return ceda_private.admin_get_configurations();
end $$;

-- 14. Restrict ceda_private implementations to authenticated callers and expose public invoker wrappers
revoke all on function
  ceda_private.admin_audit_feed(text,integer),
  ceda_private.admin_applications(),
  ceda_private.admin_revise_application(text,text,text,text,text,integer,text),
  ceda_private.admin_intervene_application_status(text,text,integer,boolean,text),
  ceda_private.admin_content_list(),
  ceda_private.admin_save_content(text,text,text,text,uuid,text),
  ceda_private.admin_notifications_overview(),
  ceda_private.admin_save_notification(text,text,text,text),
  ceda_private.admin_matters_list(),
  ceda_private.admin_update_matter(text,text,text,text),
  ceda_private.admin_get_configurations(),
  ceda_private.admin_save_configuration(text,jsonb,text)
from public, anon;

grant execute on function
  ceda_private.admin_audit_feed(text,integer),
  ceda_private.admin_applications(),
  ceda_private.admin_revise_application(text,text,text,text,text,integer,text),
  ceda_private.admin_intervene_application_status(text,text,integer,boolean,text),
  ceda_private.admin_content_list(),
  ceda_private.admin_save_content(text,text,text,text,uuid,text),
  ceda_private.admin_notifications_overview(),
  ceda_private.admin_save_notification(text,text,text,text),
  ceda_private.admin_matters_list(),
  ceda_private.admin_update_matter(text,text,text,text),
  ceda_private.admin_get_configurations(),
  ceda_private.admin_save_configuration(text,jsonb,text)
to authenticated;

create or replace function public.admin_applications()
returns jsonb language sql security invoker set search_path = ''
as $$ select ceda_private.admin_applications() $$;

create or replace function public.admin_revise_application(
  app_ref text,
  new_title text,
  new_applicant text,
  new_sector text,
  new_summary text,
  expected_version integer,
  reason text
)
returns jsonb language sql security invoker set search_path = ''
as $$ select ceda_private.admin_revise_application(app_ref, new_title, new_applicant, new_sector, new_summary, expected_version, reason) $$;

create or replace function public.admin_intervene_application_status(
  app_ref text,
  new_status text,
  expected_version integer,
  confirmed boolean,
  reason text
)
returns jsonb language sql security invoker set search_path = ''
as $$ select ceda_private.admin_intervene_application_status(app_ref, new_status, expected_version, confirmed, reason) $$;

create or replace function public.admin_content_list()
returns jsonb language sql security invoker set search_path = ''
as $$ select ceda_private.admin_content_list() $$;

create or replace function public.admin_save_content(
  content_kind text,
  content_title text,
  content_body text,
  reason text,
  content_id uuid default null,
  content_stage text default 'Draft'
)
returns jsonb language sql security invoker set search_path = ''
as $$ select ceda_private.admin_save_content(content_kind, content_title, content_body, reason, content_id, content_stage) $$;

create or replace function public.admin_notifications_overview()
returns jsonb language sql security invoker set search_path = ''
as $$ select ceda_private.admin_notifications_overview() $$;

create or replace function public.admin_save_notification(
  entry_kind text,
  entry_title text,
  entry_message text,
  reason text default 'Prepared in Admin Notification Center'
)
returns jsonb language sql security invoker set search_path = ''
as $$ select ceda_private.admin_save_notification(entry_kind, entry_title, entry_message, reason) $$;

create or replace function public.admin_matters_list()
returns jsonb language sql security invoker set search_path = ''
as $$ select ceda_private.admin_matters_list() $$;

create or replace function public.admin_update_matter(
  matter_ref text,
  new_owner text,
  new_state text,
  reason text
)
returns jsonb language sql security invoker set search_path = ''
as $$ select ceda_private.admin_update_matter(matter_ref, new_owner, new_state, reason) $$;

create or replace function public.admin_get_configurations()
returns jsonb language sql security invoker set search_path = ''
as $$ select ceda_private.admin_get_configurations() $$;

create or replace function public.admin_save_configuration(
  target_key text,
  new_payload jsonb,
  reason text
)
returns jsonb language sql security invoker set search_path = ''
as $$ select ceda_private.admin_save_configuration(target_key, new_payload, reason) $$;

revoke all on function
  public.admin_applications(),
  public.admin_revise_application(text,text,text,text,text,integer,text),
  public.admin_intervene_application_status(text,text,integer,boolean,text),
  public.admin_content_list(),
  public.admin_save_content(text,text,text,text,uuid,text),
  public.admin_notifications_overview(),
  public.admin_save_notification(text,text,text,text),
  public.admin_matters_list(),
  public.admin_update_matter(text,text,text,text),
  public.admin_get_configurations(),
  public.admin_save_configuration(text,jsonb,text)
from public, anon;

grant execute on function
  public.admin_applications(),
  public.admin_revise_application(text,text,text,text,text,integer,text),
  public.admin_intervene_application_status(text,text,integer,boolean,text),
  public.admin_content_list(),
  public.admin_save_content(text,text,text,text,uuid,text),
  public.admin_notifications_overview(),
  public.admin_save_notification(text,text,text,text),
  public.admin_matters_list(),
  public.admin_update_matter(text,text,text,text),
  public.admin_get_configurations(),
  public.admin_save_configuration(text,jsonb,text)
to authenticated;
