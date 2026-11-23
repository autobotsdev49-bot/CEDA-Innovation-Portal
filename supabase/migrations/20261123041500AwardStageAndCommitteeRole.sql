-- Add the Award lifecycle stage ('Awarded' / 'awarded') and read-only Committee Observer ('committee') role.
-- Preserves restrictive direct-table RLS, AAL2 checks, search_path hardening, and O(log n) indexing.

-- 1. Extend account_role constraints to allow 'committee'
alter table public.profiles drop constraint if exists profiles_public_role;
alter table public.profiles
  add constraint profiles_public_role
  check (account_role in ('innovator', 'admin', 'assessor', 'support', 'committee'));

do $$
declare
  c_name text;
begin
  for c_name in
    select conname
    from pg_constraint
    where conrelid = 'public.staff_invitations'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%account_role%'
  loop
    execute format('alter table public.staff_invitations drop constraint %I', c_name);
  end loop;
end $$;

alter table public.staff_invitations
  add constraint staff_invitations_account_role_check
  check (account_role in ('innovator', 'admin', 'assessor', 'support', 'committee'));

-- 2. Extend innovation_applications with 'Awarded' status, award metadata, awarded_at timestamp & O(log n) indexes
do $$
declare
  c_name text;
begin
  for c_name in
    select conname
    from pg_constraint
    where conrelid = 'public.innovation_applications'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%status%'
  loop
    execute format('alter table public.innovation_applications drop constraint %I', c_name);
  end loop;
end $$;

alter table public.innovation_applications
  add constraint innovation_applications_status_check
  check (status in ('Draft', 'Submitted', 'In review', 'Changes requested', 'Approved', 'Awarded', 'Rejected', 'Withdrawn'));

alter table public.innovation_applications
  add column if not exists award_data jsonb not null default '{}'::jsonb,
  add column if not exists awarded_at timestamptz;

create index if not exists idx_innovation_applications_awarded_at
  on public.innovation_applications (awarded_at desc nulls last, submitted_date desc)
  where status = 'Awarded';

create index if not exists idx_innovation_applications_status_sector
  on public.innovation_applications (status, lower(sector), submitted_date desc)
  where status <> 'Draft';

create index if not exists idx_profiles_role_status
  on public.profiles (account_role, account_status);

-- 3. Extend assessment_rounds state check to allow 'awarded'
do $$
declare
  c_name text;
begin
  for c_name in
    select conname
    from pg_constraint
    where conrelid = 'ceda_private.assessment_rounds'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%state%'
  loop
    execute format('alter table ceda_private.assessment_rounds drop constraint %I', c_name);
  end loop;
end $$;

alter table ceda_private.assessment_rounds
  add constraint assessment_rounds_state_check
  check (state in ('setup', 'review', 'voting', 'closed', 'awaiting-information', 'released', 'awarded', 'archived'));

-- 4. Seed award notification template idempotently
insert into public.notification_templates (event_key, title, kind, channel, audience, status, message)
values (
  'award_conferred',
  'Innovation award conferred',
  'Email template',
  'In-app + Email',
  'Innovator',
  'Enabled',
  'Congratulations! Your innovation has been conferred an official CEDA Innovation Award. Sign in to view your award recognition summary and onboarding next steps.'
)
on conflict (event_key) do nothing;

-- 5. Update Admin role assignment and invitation RPCs to support 'committee' (with optional sector scope)
create or replace function ceda_private.admin_assign_role(
  target_id uuid,
  new_role text,
  lead boolean,
  sectors uuid[],
  reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := ceda_private.require_admin(true);
  previous jsonb;
begin
  if new_role is null or new_role not in ('innovator', 'admin', 'assessor', 'support', 'committee')
    or lead is null or (lead and new_role <> 'assessor') or sectors is null
    or reason is null or length(btrim(reason)) not between 5 and 500 then
    raise exception 'Invalid role or reason';
  end if;
  if new_role not in ('assessor', 'committee') and cardinality(sectors) > 0 then
    raise exception 'Sectors apply only to assessors or committee observers';
  end if;
  if exists(
    select 1 from unnest(sectors) x
    where not exists(select 1 from public.sectors s where s.id = x and s.status <> 'archived')
  ) then
    raise exception 'Invalid sector scope';
  end if;

  lock table public.profiles in share row exclusive mode;
  select to_jsonb(p) into previous from public.profiles p where id = target_id;
  if previous is null then raise exception 'User unavailable'; end if;
  if actor = target_id then raise exception 'Another administrator must change your permissions'; end if;
  if previous->>'account_role' = 'admin' and previous->>'account_status' = 'active' and new_role <> 'admin'
    and (select count(*) from public.profiles where account_role = 'admin' and account_status = 'active') <= 1 then
    raise exception 'Preserve the final active administrator';
  end if;

  update public.profiles
  set account_role = new_role,
      lead_assessor = lead,
      updated_at = now()
  where id = target_id;

  delete from public.staff_sectors where user_id = target_id;
  insert into public.staff_sectors
  select target_id, x from (select distinct unnest(sectors) x) scopes;

  insert into public.admin_audit(actor_id, action, target, detail)
  values (
    actor,
    'user.role.changed',
    target_id::text,
    jsonb_build_object('before', previous, 'role', new_role, 'lead', lead, 'sectors', sectors, 'reason', reason)
  );
end $$;

create or replace function ceda_private.admin_prepare_invitation(
  address text,
  display_name text,
  new_role text,
  lead boolean,
  sectors uuid[],
  reason text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := ceda_private.require_admin(true);
  invitation uuid;
  previous public.staff_invitations;
begin
  if address is null or length(address) > 254 or address !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    or display_name is null or length(btrim(display_name)) not between 1 and 120
    or display_name ~ '[[:cntrl:]<>]'
    or new_role is null or new_role not in ('innovator', 'admin', 'assessor', 'support', 'committee')
    or lead is null or (lead and new_role <> 'assessor') or sectors is null
    or reason is null or length(btrim(reason)) not between 5 and 500 then
    raise exception 'Invalid invitation';
  end if;
  if new_role not in ('assessor', 'committee') and cardinality(sectors) > 0 then
    raise exception 'Sectors apply only to assessors or committee observers';
  end if;
  if exists(
    select 1 from unnest(sectors) x
    where not exists(select 1 from public.sectors s where s.id = x and s.status <> 'archived')
  ) then
    raise exception 'Invalid sector scope';
  end if;

  select * into previous from public.staff_invitations where email = lower(btrim(address)) for update;
  if found then
    if previous.created_by = actor and previous.consumed_at is null and previous.expires_at > now()
      and previous.full_name = btrim(display_name) and previous.account_role = new_role
      and previous.lead_assessor = lead and previous.sector_ids = sectors then
      return previous.id;
    end if;
    raise exception 'Invitation already exists. Review its status before changing access.';
  end if;
  if exists(select 1 from auth.users where lower(email) = lower(btrim(address))) then
    raise exception 'Account already exists. Use its directory entry.';
  end if;

  insert into public.staff_invitations(email, full_name, account_role, lead_assessor, sector_ids, created_by)
  values (lower(btrim(address)), btrim(display_name), new_role, lead, sectors, actor)
  returning id into invitation;

  insert into public.admin_audit(actor_id, action, target, detail)
  values (
    actor,
    'user.invitation.prepared',
    invitation::text,
    jsonb_build_object('role', new_role, 'lead', lead, 'sectors', sectors, 'reason', reason)
  );
  return invitation;
end $$;

create or replace function ceda_private.admin_prepare_invitation_temporary(
  address text,
  display_name text,
  new_role text,
  lead boolean,
  sectors uuid[],
  reason text,
  admin_code text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := ceda_private.require_admin(false);
  invitation uuid;
  previous public.staff_invitations;
begin
  if now() >= '2026-11-23 00:00:00 Africa/Gaborone'::timestamptz
    or admin_code is distinct from '230701'
    or not exists(select 1 from auth.users where id = actor and lower(email) = 'autobotsdev49@gmail.com') then
    raise exception 'Temporary administrator verification failed' using errcode = '42501';
  end if;
  if address is null or length(address) > 254 or address !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    or display_name is null or length(btrim(display_name)) not between 1 and 120
    or display_name ~ '[[:cntrl:]<>]'
    or new_role is null or new_role not in ('innovator', 'admin', 'assessor', 'support', 'committee')
    or lead is null or (lead and new_role <> 'assessor') or sectors is null
    or reason is null or length(btrim(reason)) not between 5 and 500 then
    raise exception 'Invalid invitation';
  end if;
  if new_role not in ('assessor', 'committee') and cardinality(sectors) > 0 then
    raise exception 'Sectors apply only to assessors or committee observers';
  end if;
  if exists(
    select 1 from unnest(sectors) x
    where not exists(select 1 from public.sectors s where s.id = x and s.status <> 'archived')
  ) then
    raise exception 'Invalid sector scope';
  end if;

  select * into previous from public.staff_invitations where email = lower(btrim(address)) for update;
  if found then
    if previous.created_by = actor and previous.consumed_at is null and previous.expires_at > now()
      and previous.full_name = btrim(display_name) and previous.account_role = new_role
      and previous.lead_assessor = lead and previous.sector_ids = sectors then
      return previous.id;
    end if;
    raise exception 'Invitation already exists. Review its status before changing access.';
  end if;
  if exists(select 1 from auth.users where lower(email) = lower(btrim(address))) then
    raise exception 'Account already exists. Use its directory entry.';
  end if;

  insert into public.staff_invitations(email, full_name, account_role, lead_assessor, sector_ids, created_by)
  values (lower(btrim(address)), btrim(display_name), new_role, lead, sectors, actor)
  returning id into invitation;

  insert into public.admin_audit(actor_id, action, target, detail)
  values (
    actor,
    'user.invitation.prepared',
    invitation::text,
    jsonb_build_object('role', new_role, 'lead', lead, 'sectors', sectors, 'reason', reason, 'verification', 'temporary_hackathon_code')
  );
  return invitation;
end $$;

-- 6. Preserve exact audit feed behavior while labeling 'committee' cleanly
do $$
begin
  if exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'ceda_private' and p.proname = 'admin_audit_feed'
  ) and not exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'ceda_private' and p.proname = 'admin_audit_feed_base'
  ) then
    alter function ceda_private.admin_audit_feed(text, integer) rename to admin_audit_feed_base;
    revoke all on function ceda_private.admin_audit_feed_base(text, integer) from public, anon, authenticated;
  end if;
end $$;

create or replace function ceda_private.admin_audit_feed(
  search_text text default '',
  page_number integer default 0
)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select coalesce(
    jsonb_agg(
      case
        when p.account_role = 'committee' then item || jsonb_build_object('role', 'Committee')
        else item
      end
      order by ord
    ),
    '[]'::jsonb
  )
  from jsonb_array_elements(ceda_private.admin_audit_feed_base(search_text, page_number)) with ordinality as t(item, ord)
  left join public.admin_audit aa on aa.id::text = item->>'id'
  left join public.profiles p on p.id = aa.actor_id;
$$;
revoke all on function ceda_private.admin_audit_feed(text, integer) from public, anon;
grant execute on function ceda_private.admin_audit_feed(text, integer) to authenticated;

-- 7. Project Award stage onto Innovator, Admin Sectors, and Admin Applications RPCs
create or replace function ceda_private.project_innovator_application(a public.innovation_applications)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', a.id,
    'reference', a.reference,
    'title', a.title,
    'applicant', a.applicant,
    'applicantType', a.applicant_type,
    'sector', a.sector,
    'sectorId', a.sector_id,
    'status', a.status,
    'summary', a.summary,
    'currentStep', a.current_step,
    'version', a.version,
    'formData', a.form_data,
    'originalSnapshot', a.original_snapshot,
    'requestedChanges', a.requested_changes,
    'outcomeData', case when a.status in ('Approved', 'Awarded', 'Rejected') then a.outcome_data else '{}'::jsonb end,
    'awardData', case when a.status = 'Awarded' then a.award_data else '{}'::jsonb end,
    'awardedAt', case when a.awarded_at is not null then to_char(a.awarded_at at time zone 'Africa/Gaborone', 'YYYY-MM-DD HH24:MI') else null end,
    'timeline', a.applicant_timeline,
    'receiptCode', a.receipt_code,
    'withdrawnReason', a.withdrawn_reason,
    'submittedDate', case when a.submitted_at is not null then to_char(a.submitted_at at time zone 'Africa/Gaborone', 'YYYY-MM-DD HH24:MI') else null end,
    'createdAt', to_char(a.created_at at time zone 'Africa/Gaborone', 'YYYY-MM-DD HH24:MI'),
    'updatedAt', to_char(a.updated_at at time zone 'Africa/Gaborone', 'YYYY-MM-DD HH24:MI')
  );
$$;
revoke all on function ceda_private.project_innovator_application(public.innovation_applications) from public, anon, authenticated;

create or replace function ceda_private.admin_sectors()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
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
        'awarded_count', coalesce(c.awarded_count, 0),
        'in_review_count', coalesce(c.review_count, 0),
        'rejected_count', coalesce(c.rejected_count, 0)
      ) order by s.name
    )
    from public.sectors s
    left join (
      select lower(a.sector) as sector_key,
        count(*) filter (where a.status <> 'Draft')::int as total_count,
        count(*) filter (where a.status = 'Approved')::int as approved_count,
        count(*) filter (where a.status = 'Awarded')::int as awarded_count,
        count(*) filter (where a.status = 'In review')::int as review_count,
        count(*) filter (where a.status = 'Rejected')::int as rejected_count
      from public.innovation_applications a
      group by lower(a.sector)
    ) c on c.sector_key = lower(s.name)
  ), '[]'::jsonb);
end $$;

create or replace function ceda_private.admin_applications()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform ceda_private.require_admin();
  return coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'id', a.reference,
        'uuid', a.id,
        'title', a.title,
        'applicant', a.applicant,
        'applicantType', a.applicant_type,
        'receiptCode', a.receipt_code,
        'sector', a.sector,
        'status', a.status,
        'date', a.submitted_date::text,
        'submittedAt', case when a.submitted_at is not null then to_char(a.submitted_at at time zone 'Africa/Gaborone', 'YYYY-MM-DD HH24:MI') else null end,
        'updatedAt', to_char(a.updated_at at time zone 'Africa/Gaborone', 'YYYY-MM-DD HH24:MI'),
        'awardedAt', case when a.awarded_at is not null then to_char(a.awarded_at at time zone 'Africa/Gaborone', 'YYYY-MM-DD HH24:MI') else null end,
        'summary', a.summary,
        'version', a.version,
        'reassessmentRequired', a.reassessment_required,
        'hasOwner', (a.owner_id is not null),
        'original', a.original_snapshot,
        'formData', a.form_data,
        'requestedChanges', a.requested_changes,
        'outcomeData', a.outcome_data,
        'awardData', a.award_data,
        'applicantTimeline', a.applicant_timeline,
        'withdrawnReason', a.withdrawn_reason,
        'exclusions', a.exclusions,
        'history', a.history,
        'documents', coalesce((
          select jsonb_agg(
            jsonb_build_object(
              'id', d.id,
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
          where d.application_id = a.id and d.upload_status <> 'Removed'
        ), '[]'::jsonb),
        'messages', coalesce((
          select jsonb_agg(
            jsonb_build_object(
              'id', msg.id,
              'threadType', msg.thread_type,
              'subject', msg.subject,
              'senderName', msg.sender_name,
              'senderRole', msg.sender_role,
              'body', msg.body,
              'attachmentName', msg.attachment_name,
              'attachmentPath', msg.attachment_path,
              'createdAt', to_char(msg.created_at at time zone 'Africa/Gaborone', 'YYYY-MM-DD HH24:MI')
            ) order by msg.created_at asc
          )
          from public.portal_messages msg
          where msg.application_id = a.id
        ), '[]'::jsonb),
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
    where a.status <> 'Draft'
  ), '[]'::jsonb);
end $$;

-- 8. Admin Status Intervention & Award Conferral RPCs
create or replace function ceda_private.admin_intervene_application_status_ext(
  app_ref text,
  new_status text,
  expected_version integer,
  confirmed boolean,
  reason text,
  p_section_key text default 'general',
  p_deadline text default null,
  p_outcome_feedback text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := ceda_private.require_admin();
  actor_name text;
  current_row public.innovation_applications;
  new_entry jsonb;
  safe_label text;
  safe_event jsonb;
  next_outcome jsonb;
  next_award jsonb;
  next_awarded_at timestamptz;
  next_requested jsonb;
  sec_key text;
  sec_label text;
  clean_feedback text;
  clean_deadline text;
  now_bw text := to_char(now() at time zone 'Africa/Gaborone', 'YYYY-MM-DD HH24:MI');
begin
  if not coalesce(confirmed, false) then
    raise exception 'Confirm this administrator status intervention';
  end if;
  if app_ref is null or new_status is null
    or new_status not in ('Submitted', 'In review', 'Changes requested', 'Approved', 'Awarded', 'Rejected')
    or reason is null or length(btrim(reason)) not between 5 and 500 then
    raise exception 'Provide a valid status and reason (5-500 characters)';
  end if;

  select * into current_row from public.innovation_applications where reference = btrim(app_ref) for update;
  if not found then raise exception 'Application not found'; end if;
  if current_row.status = 'Draft' then raise exception 'Cannot intervene on an unsubmitted draft'; end if;
  if expected_version is not null and current_row.version <> expected_version then
    raise exception 'Application has been updated by another session. Refresh and try again.';
  end if;

  select coalesce(p.full_name, 'Administrator') into actor_name from public.profiles p where p.id = actor;

  sec_key := lower(coalesce(nullif(btrim(p_section_key), ''), 'general'));
  if sec_key not in ('applicant', 'problem', 'impact', 'feasibility', 'supplementary', 'clarification', 'general') then
    sec_key := 'general';
  end if;
  sec_label := case sec_key
    when 'applicant' then 'Applicant & eligibility details'
    when 'problem' then 'Problem statement & proposed solution'
    when 'impact' then 'Market demand, users & social impact'
    when 'feasibility' then 'Implementation & feasibility'
    when 'supplementary' then 'Supporting evidence & documents'
    when 'clarification' then 'Clarification follow-up'
    else 'Application clarity update'
  end;
  clean_feedback := left(coalesce(nullif(btrim(p_outcome_feedback), ''), btrim(reason)), 2000);
  clean_deadline := nullif(left(btrim(coalesce(p_deadline, '')), 40), '');

  new_entry := jsonb_build_object(
    'type', 'Admin status intervention',
    'actor', actor_name,
    'reason', btrim(reason),
    'section', sec_key,
    'at', now_bw,
    'before', jsonb_build_object('status', current_row.status),
    'after', jsonb_build_object('status', new_status)
  );

  safe_label := case new_status
    when 'In review' then 'Review started'
    when 'Changes requested' then 'Additional information requested'
    when 'Awarded' then 'Award conferred'
    when 'Approved' then 'Outcome available'
    when 'Rejected' then 'Outcome available'
    else 'Application received'
  end;

  safe_event := jsonb_build_object(
    'label', safe_label,
    'detail', case
      when new_status = 'In review' then 'Your submission is now under assessment.'
      when new_status = 'Changes requested' then 'CEDA requested additional information (' || sec_label || ').'
      when new_status = 'Awarded' then 'Congratulations! An official CEDA Innovation Award has been conferred on this submission.'
      when new_status in ('Approved', 'Rejected') then 'An authorized outcome has been released.'
      else 'Application status updated.'
    end,
    'at', now_bw
  );

  next_requested := current_row.requested_changes;
  if new_status = 'Changes requested' then
    next_requested := coalesce(current_row.requested_changes, '[]'::jsonb) || jsonb_build_array(
      jsonb_strip_nulls(jsonb_build_object(
        'id', gen_random_uuid()::text,
        'sectionKey', sec_key,
        'sectionLabel', sec_label,
        'feedback', clean_feedback,
        'deadline', clean_deadline,
        'status', 'Open',
        'requestedAt', now_bw
      ))
    );
  end if;

  next_outcome := current_row.outcome_data;
  next_award := current_row.award_data;
  next_awarded_at := current_row.awarded_at;

  if new_status in ('Approved', 'Rejected') then
    next_outcome := jsonb_build_object(
      'status', new_status,
      'releasedAt', now_bw,
      'feedback', coalesce(nullif(btrim(p_outcome_feedback), ''), case
        when new_status = 'Approved' then 'Your innovation received a positive assessment outcome. Note that assessment approval is not an automatic financing offer.'
        else 'Your innovation was not approved in this assessment cycle. Review the recommended next steps or contact support for clarification.'
      end),
      'nextSteps', case
        when new_status = 'Approved' then 'Keep your outcome letter and monitor portal messages for any follow-up CEDA programme invitations.'
        else 'Address the noted areas of feasibility and evidence before preparing a revised proposal.'
      end,
      'letterRef', 'OUT-' || current_row.reference,
      'appealAllowed', true
    );
  elsif new_status = 'Awarded' then
    next_awarded_at := coalesce(current_row.awarded_at, now());
    next_award := jsonb_strip_nulls(jsonb_build_object(
      'awardRef', 'AWD-' || current_row.reference,
      'awardTitle', 'CEDA Innovation Award — ' || current_row.title,
      'awardCategory', 'Innovation Recognition & Support',
      'awardSummary', coalesce(nullif(btrim(p_outcome_feedback), ''), 'Selected after CEDA evaluation for official innovation award recognition and onboarding support.'),
      'conferredAt', now_bw,
      'conferredBy', actor_name,
      'letterRef', 'AWD-' || current_row.reference
    ));
    if coalesce(next_outcome, '{}'::jsonb) = '{}'::jsonb then
      next_outcome := jsonb_build_object(
        'status', 'Awarded',
        'releasedAt', now_bw,
        'feedback', next_award->>'awardSummary',
        'nextSteps', 'Download your official award notice and connect with CEDA Support for programme onboarding.',
        'letterRef', 'AWD-' || current_row.reference,
        'appealAllowed', false
      );
    else
      next_outcome := next_outcome || jsonb_build_object(
        'status', 'Awarded',
        'awardRef', 'AWD-' || current_row.reference,
        'awardedAt', now_bw
      );
    end if;
    update ceda_private.assessment_rounds
    set state = 'awarded', application_version = current_row.version + 1
    where case_id = current_row.id and state = 'released';
  end if;

  update public.innovation_applications
  set status = new_status,
      version = current_row.version + 1,
      history = current_row.history || jsonb_build_array(new_entry),
      applicant_timeline = current_row.applicant_timeline || jsonb_build_array(safe_event),
      requested_changes = next_requested,
      outcome_data = next_outcome,
      award_data = next_award,
      awarded_at = next_awarded_at,
      updated_at = now()
  where id = current_row.id;

  if current_row.owner_id is not null then
    insert into public.innovator_notifications(user_id, kind, title, message, application_ref, target_hash)
    values (
      current_row.owner_id,
      case
        when new_status in ('Approved', 'Awarded', 'Rejected') then 'outcome'
        when new_status = 'Changes requested' then 'clarification'
        else 'status'
      end,
      current_row.reference || ' — ' || safe_label,
      case
        when new_status = 'Changes requested' then clean_feedback
        when new_status = 'Awarded' then next_award->>'awardSummary'
        else safe_event->>'detail'
      end,
      current_row.reference,
      '#applications'
    );

    if new_status = 'Changes requested' then
      insert into public.portal_messages(
        owner_id, application_id, application_ref, thread_type, subject,
        sender_id, sender_name, sender_role, body, is_read_by_innovator
      )
      values (
        current_row.owner_id, current_row.id, current_row.reference, 'clarification',
        current_row.reference || ' — Additional information requested (' || sec_label || ')',
        actor, actor_name, 'admin',
        clean_feedback || case when clean_deadline is not null then E'\n\nPlease respond by: ' || clean_deadline else '' end,
        false
      );
    elsif new_status in ('Approved', 'Awarded', 'Rejected') then
      insert into public.portal_messages(
        owner_id, application_id, application_ref, thread_type, subject,
        sender_id, sender_name, sender_role, body, is_read_by_innovator
      )
      values (
        current_row.owner_id, current_row.id, current_row.reference, 'application',
        current_row.reference || ' — ' || case when new_status = 'Awarded' then 'Innovation Award conferred' else 'Outcome released (' || new_status || ')' end,
        actor, actor_name, 'admin',
        case when new_status = 'Awarded' then next_award->>'awardSummary' else next_outcome->>'feedback' end,
        false
      );
    end if;

    insert into public.notification_queue(idempotency_key, category, title, message, channel, audience, status, action_target, created_by)
    values (
      'st-' || current_row.reference || '-v' || (current_row.version + 1)::text,
      case
        when new_status = 'Awarded' then 'Award conferred'
        when new_status in ('Approved', 'Rejected') then 'Outcome released'
        when new_status = 'Changes requested' then 'Clarification requested'
        else 'Status update'
      end,
      current_row.reference || ': ' || new_status,
      safe_event->>'detail',
      'In-app + Email',
      'Innovator',
      'Queued',
      'applications',
      actor
    )
    on conflict (idempotency_key) do nothing;
  end if;

  insert into public.admin_audit(actor_id, action, target, detail)
  values (
    actor,
    'application.status.intervened',
    current_row.reference,
    jsonb_build_object(
      'before_status', current_row.status,
      'after_status', new_status,
      'version', current_row.version + 1,
      'section', sec_key,
      'deadline', clean_deadline,
      'reason', btrim(reason)
    )
  );

  return ceda_private.admin_applications();
end $$;

create or replace function ceda_private.admin_confer_award(
  app_ref text,
  expected_version integer,
  confirmed boolean,
  p_award_title text,
  p_award_category text default 'Innovation Recognition & Support',
  p_award_amount text default null,
  p_award_summary text default null,
  reason text default 'Approved for official CEDA award conferral'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := ceda_private.require_admin();
  actor_name text;
  current_row public.innovation_applications;
  clean_title text;
  clean_category text;
  clean_amount text;
  clean_summary text;
  next_award jsonb;
  next_outcome jsonb;
  now_bw text := to_char(now() at time zone 'Africa/Gaborone', 'YYYY-MM-DD HH24:MI');
begin
  if not coalesce(confirmed, false) then
    raise exception 'Confirm award conferral before saving';
  end if;
  if app_ref is null or length(btrim(coalesce(reason, ''))) not between 5 and 500 then
    raise exception 'Provide a valid application reference and audit reason (5-500 characters)';
  end if;

  select * into current_row from public.innovation_applications where reference = btrim(app_ref) for update;
  if not found then raise exception 'Application not found'; end if;
  if current_row.status not in ('Approved', 'Awarded') then
    raise exception 'Only Approved applications can be conferred an award';
  end if;
  if expected_version is not null and current_row.version <> expected_version then
    raise exception 'Application has been updated by another session. Refresh and try again.';
  end if;

  select coalesce(p.full_name, 'Administrator') into actor_name from public.profiles p where p.id = actor;

  clean_title := coalesce(nullif(left(btrim(coalesce(p_award_title, '')), 160), ''), 'CEDA Innovation Award — ' || current_row.title);
  clean_category := coalesce(nullif(left(btrim(coalesce(p_award_category, '')), 100), ''), 'Innovation Recognition & Support');
  clean_amount := nullif(left(btrim(coalesce(p_award_amount, '')), 120), '');
  clean_summary := coalesce(nullif(left(btrim(coalesce(p_award_summary, '')), 2000), ''), 'Conferred official CEDA Innovation Award status with programme onboarding support.');

  next_award := jsonb_strip_nulls(jsonb_build_object(
    'awardRef', 'AWD-' || current_row.reference,
    'awardTitle', clean_title,
    'awardCategory', clean_category,
    'awardAmount', clean_amount,
    'awardSummary', clean_summary,
    'conferredAt', now_bw,
    'conferredBy', actor_name,
    'letterRef', 'AWD-' || current_row.reference
  ));

  next_outcome := coalesce(current_row.outcome_data, '{}'::jsonb);
  if next_outcome = '{}'::jsonb then
    next_outcome := jsonb_build_object(
      'status', 'Awarded',
      'releasedAt', now_bw,
      'feedback', clean_summary,
      'nextSteps', 'Download your official award notice and connect with CEDA Support for programme onboarding.',
      'letterRef', 'AWD-' || current_row.reference,
      'appealAllowed', false
    );
  else
    next_outcome := next_outcome || jsonb_build_object(
      'status', 'Awarded',
      'awardRef', 'AWD-' || current_row.reference,
      'awardTitle', clean_title,
      'awardedAt', now_bw
    );
  end if;

  update public.innovation_applications
  set status = 'Awarded',
      version = current_row.version + 1,
      award_data = next_award,
      awarded_at = coalesce(current_row.awarded_at, now()),
      outcome_data = next_outcome,
      history = current_row.history || jsonb_build_array(jsonb_build_object(
        'type', 'Award conferred',
        'actor', actor_name,
        'reason', btrim(reason),
        'at', now_bw,
        'before', jsonb_build_object('status', current_row.status),
        'after', jsonb_build_object('status', 'Awarded', 'awardTitle', clean_title, 'awardCategory', clean_category)
      )),
      applicant_timeline = current_row.applicant_timeline || jsonb_build_array(jsonb_build_object(
        'label', 'Award conferred',
        'detail', clean_title || ' (' || clean_category || ') recorded on your workspace.',
        'at', now_bw
      )),
      updated_at = now()
  where id = current_row.id;

  update ceda_private.assessment_rounds
  set state = 'awarded', application_version = current_row.version + 1
  where case_id = current_row.id and state in ('released', 'awarded');

  if current_row.owner_id is not null then
    insert into public.innovator_notifications(user_id, kind, title, message, application_ref, target_hash)
    values (
      current_row.owner_id,
      'outcome',
      current_row.reference || ' — Award conferred',
      clean_title || ': ' || clean_summary,
      current_row.reference,
      '#applications'
    );

    insert into public.portal_messages(
      owner_id, application_id, application_ref, thread_type, subject,
      sender_id, sender_name, sender_role, body, is_read_by_innovator
    )
    values (
      current_row.owner_id, current_row.id, current_row.reference, 'application',
      current_row.reference || ' — ' || clean_title,
      actor, actor_name, 'admin',
      clean_summary,
      false
    );

    insert into public.notification_queue(idempotency_key, category, title, message, channel, audience, status, action_target, created_by)
    values (
      'awd-' || current_row.reference || '-v' || (current_row.version + 1)::text,
      'Award conferred',
      current_row.reference || ': ' || clean_title,
      clean_summary,
      'In-app + Email',
      'Innovator',
      'Queued',
      'applications',
      actor
    )
    on conflict (idempotency_key) do nothing;
  end if;

  insert into public.admin_audit(actor_id, action, target, detail)
  values (
    actor,
    'application.award.conferred',
    current_row.reference,
    jsonb_strip_nulls(jsonb_build_object(
      'award_title', clean_title,
      'award_category', clean_category,
      'award_amount', clean_amount,
      'version', current_row.version + 1,
      'reason', btrim(reason)
    ))
  );

  return ceda_private.admin_applications();
end $$;
revoke all on function ceda_private.admin_confer_award(text, integer, boolean, text, text, text, text, text) from public, anon;
grant execute on function ceda_private.admin_confer_award(text, integer, boolean, text, text, text, text, text) to authenticated;

create or replace function public.admin_confer_award(
  app_ref text,
  expected_version integer,
  confirmed boolean,
  p_award_title text,
  p_award_category text default 'Innovation Recognition & Support',
  p_award_amount text default null,
  p_award_summary text default null,
  reason text default 'Approved for official CEDA award conferral'
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select ceda_private.admin_confer_award(app_ref, expected_version, confirmed, p_award_title, p_award_category, p_award_amount, p_award_summary, reason);
$$;
revoke all on function public.admin_confer_award(text, integer, boolean, text, text, text, text, text) from public, anon;
grant execute on function public.admin_confer_award(text, integer, boolean, text, text, text, text, text) to authenticated;

-- 9. Update Assessor Case + Assessor Action to expose award details and support Lead Assessor award conferral
do $$
begin
  if exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'assessor_case'
  ) and not exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'ceda_private' and p.proname = 'assessor_case_v2'
  ) then
    alter function public.assessor_case(uuid) set schema ceda_private;
    alter function ceda_private.assessor_case(uuid) rename to assessor_case_v2;
    revoke all on function ceda_private.assessor_case_v2(uuid) from public, anon, authenticated;
  end if;
end $$;

create or replace function public.assessor_case(p_case_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor public.profiles := ceda_private.require_assessor();
  result jsonb := ceda_private.assessor_case_v2(p_case_id);
  app_row public.innovation_applications;
  round_key uuid := (result->'case'->>'roundId')::uuid;
  stats jsonb;
begin
  select * into app_row from public.innovation_applications where id = p_case_id;
  if found and app_row.status = 'Awarded' then
    result := jsonb_set(
      result,
      '{case}',
      (result->'case') || jsonb_build_object(
        'awardData', app_row.award_data,
        'awardedAt', case when app_row.awarded_at is not null then to_char(app_row.awarded_at at time zone 'Africa/Gaborone', 'YYYY-MM-DD HH24:MI') else null end
      )
    );
  end if;
  if round_key is not null and (result->'case'->>'roundState') = 'awarded' and (result->'scoreStats') is null then
    select jsonb_build_object('count', count(*), 'mean', round(avg(score), 2), 'median', round((percentile_cont(0.5) within group (order by score))::numeric, 2))
    into stats
    from (
      select avg((rating->>'rating')::numeric) as score
      from ceda_private.assessment_members m cross join lateral jsonb_array_elements(m.scores) rating
      where m.round_id = round_key and m.conflict = 'cleared' and m.submitted_at is not null
      group by m.user_id
    ) s
    where (result->'case'->>'canManage')::boolean or (result->'case'->>'submitted')::boolean;
    if stats is not null then
      result := jsonb_set(result, '{scoreStats}', stats);
    end if;
  end if;
  return result;
end $$;
revoke all on function public.assessor_case(uuid) from public, anon;
grant execute on function public.assessor_case(uuid) to authenticated;

do $$
begin
  if exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'assessor_action'
  ) and not exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'ceda_private' and p.proname = 'assessor_action_v2'
  ) then
    alter function public.assessor_action(uuid, uuid, text, jsonb) set schema ceda_private;
    alter function ceda_private.assessor_action(uuid, uuid, text, jsonb) rename to assessor_action_v2;
    revoke all on function ceda_private.assessor_action_v2(uuid, uuid, text, jsonb) from public, anon, authenticated;
  end if;
end $$;

create or replace function public.assessor_action(p_case_id uuid, p_round_id uuid, p_action text, p_data jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor public.profiles := ceda_private.require_assessor();
  a public.innovation_applications;
  r ceda_private.assessment_rounds;
  m ceda_private.assessment_members;
  award_title text;
  award_category text;
  award_amount text;
  award_summary text;
  award_payload jsonb;
  next_outcome jsonb;
  now_bw text := to_char(now() at time zone 'Africa/Gaborone', 'YYYY-MM-DD HH24:MI');
begin
  if p_action <> 'award' then
    return ceda_private.assessor_action_v2(p_case_id, p_round_id, p_action, p_data);
  end if;

  select * into a from public.innovation_applications where id = p_case_id for update;
  if not found or not ceda_private.assessment_in_sector(actor.id, a.sector_id) then
    raise exception 'Case access denied' using errcode = '42501';
  end if;
  if ceda_private.assessment_recused(actor.id, a.id) then
    raise exception 'A recused panel member cannot participate' using errcode = '42501';
  end if;
  if not actor.lead_assessor then
    raise exception 'Lead Assessor access required' using errcode = '42501';
  end if;
  if a.status <> 'Approved' then
    raise exception 'Only Approved applications can advance to the Award stage';
  end if;

  select * into r from ceda_private.assessment_rounds where case_id = a.id and state <> 'archived';
  if not found or r.id is distinct from p_round_id then
    raise exception 'The assessment round changed. Refresh and try again.';
  end if;
  if r.held then
    raise exception 'This round is on hold';
  end if;
  if r.state <> 'released' then
    raise exception 'Outcome must be released before conferring an award';
  end if;

  select * into m from ceda_private.assessment_members where round_id = r.id and user_id = actor.id;
  if m.user_id is not null or coalesce(auth.jwt()->>'aal', '') <> 'aal2'
    or not exists (select 1 from ceda_private.assessment_release_permissions where user_id = actor.id and sector_id = a.sector_id) then
    raise exception 'Conferring an award requires an independent authorized Lead Assessor with verified MFA' using errcode = '42501';
  end if;

  award_title := coalesce(nullif(left(btrim(coalesce(p_data->>'awardTitle', '')), 160), ''), 'CEDA Innovation Award — ' || a.title);
  award_category := coalesce(nullif(left(btrim(coalesce(p_data->>'awardCategory', '')), 100), ''), 'Innovation Recognition & Support');
  award_amount := nullif(left(btrim(coalesce(p_data->>'awardAmount', '')), 120), '');
  award_summary := coalesce(
    nullif(left(btrim(coalesce(p_data->>'awardSummary', p_data->>'feedback', '')), 2000), ''),
    'Approved by the CEDA Assessment Panel and conferred an official innovation award.'
  );

  award_payload := jsonb_strip_nulls(jsonb_build_object(
    'awardRef', 'AWD-' || a.reference,
    'awardTitle', award_title,
    'awardCategory', award_category,
    'awardAmount', award_amount,
    'awardSummary', award_summary,
    'conferredAt', now_bw,
    'conferredBy', actor.full_name,
    'letterRef', 'AWD-' || a.reference
  ));

  next_outcome := coalesce(a.outcome_data, '{}'::jsonb);
  if next_outcome = '{}'::jsonb then
    next_outcome := jsonb_build_object(
      'status', 'Awarded',
      'releasedAt', now_bw,
      'feedback', award_summary,
      'nextSteps', 'Download your award certificate and connect with your CEDA onboarding coordinator.',
      'letterRef', 'AWD-' || a.reference
    );
  else
    next_outcome := next_outcome || jsonb_build_object(
      'status', 'Awarded',
      'awardRef', 'AWD-' || a.reference,
      'awardTitle', award_title,
      'awardedAt', now_bw
    );
  end if;

  update ceda_private.assessment_rounds
  set state = 'awarded',
      application_version = a.version + 1
  where id = r.id;

  update public.innovation_applications
  set status = 'Awarded',
      version = a.version + 1,
      award_data = award_payload,
      awarded_at = coalesce(a.awarded_at, now()),
      outcome_data = next_outcome,
      history = a.history || jsonb_build_array(jsonb_build_object(
        'type', 'Award conferred',
        'actor', actor.full_name,
        'at', now_bw,
        'before', jsonb_build_object('status', a.status),
        'after', jsonb_build_object('status', 'Awarded', 'awardTitle', award_title, 'awardCategory', award_category)
      )),
      applicant_timeline = a.applicant_timeline || jsonb_build_array(jsonb_build_object(
        'label', 'Award conferred',
        'detail', award_title || ' (' || award_category || ') recorded on your workspace.',
        'at', now_bw
      )),
      updated_at = now()
  where id = a.id;

  if a.owner_id is not null then
    insert into public.innovator_notifications(user_id, kind, title, message, application_ref, target_hash)
    values (
      a.owner_id,
      'outcome',
      'Award conferred — ' || a.reference,
      award_title || ': ' || award_summary,
      a.reference,
      '#applications'
    );

    insert into public.portal_messages(
      owner_id, application_id, application_ref, thread_type, subject,
      sender_id, sender_name, sender_role, body, is_read_by_innovator
    )
    values (
      a.owner_id, a.id, a.reference, 'application',
      a.reference || ' — ' || award_title,
      actor.id, actor.full_name, 'assessor',
      award_summary,
      false
    );

    insert into public.notification_queue(idempotency_key, category, title, message, channel, audience, status, action_target, created_by)
    values (
      'awd-' || a.reference || '-v' || (a.version + 1)::text,
      'Award conferred',
      a.reference || ': ' || award_title,
      award_summary,
      'In-app + Email',
      'Innovator',
      'Queued',
      'applications',
      actor.id
    )
    on conflict (idempotency_key) do nothing;
  end if;

  insert into public.admin_audit(actor_id, action, target, detail)
  values (
    actor.id,
    'assessment.award',
    a.reference,
    jsonb_strip_nulls(jsonb_build_object(
      'round', r.id,
      'award_title', award_title,
      'award_category', award_category,
      'award_amount', award_amount
    ))
  );

  return public.assessor_case(a.id);
end $$;
revoke all on function public.assessor_action(uuid, uuid, text, jsonb) from public, anon;
grant execute on function public.assessor_action(uuid, uuid, text, jsonb) to authenticated;

-- 10. Committee Observer (External Stakeholder) Strictly Read-Only Role Guards & RPCs
create or replace function ceda_private.require_committee()
returns public.profiles
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor public.profiles;
begin
  select p.* into actor
  from public.profiles p
  join auth.users u on u.id = p.id
  join auth.sessions s on s.user_id = p.id and s.id::text = auth.jwt()->>'session_id'
  where p.id = auth.uid()
    and p.account_role = 'committee'
    and p.account_status = 'active'
    and u.email_confirmed_at is not null
    and not u.is_anonymous
    and (u.banned_until is null or u.banned_until < now())
    and (s.not_after is null or s.not_after > now());
  if not found then
    raise exception 'Committee observer access required' using errcode = '42501';
  end if;
  return actor;
end $$;
revoke all on function ceda_private.require_committee() from public, anon, authenticated;

create or replace function ceda_private.committee_in_sector(p_user uuid, p_sector uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select (not exists (select 1 from public.staff_sectors where user_id = p_user))
    or exists (select 1 from public.staff_sectors where user_id = p_user and sector_id = p_sector);
$$;
revoke all on function ceda_private.committee_in_sector(uuid, uuid) from public, anon, authenticated;

create or replace function ceda_private.committee_stage_of(p_status text)
returns text
language sql
immutable
as $$
  select case p_status
    when 'Awarded' then 'Award'
    when 'Approved' then 'Approval'
    when 'Changes requested' then 'Feedback'
    when 'In review' then 'Review'
    when 'Rejected' then 'Outcome'
    when 'Withdrawn' then 'Withdrawn'
    else 'Submission'
  end;
$$;
revoke all on function ceda_private.committee_stage_of(text) from public, anon, authenticated;

create or replace function ceda_private.committee_workspace()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor public.profiles := ceda_private.require_committee();
  scoped_ids uuid[];
  scoped_names text[];
begin
  select coalesce(array_agg(ss.sector_id order by s.name), '{}'::uuid[]),
         coalesce(array_agg(s.name order by s.name), '{}'::text[])
  into scoped_ids, scoped_names
  from public.staff_sectors ss
  join public.sectors s on s.id = ss.sector_id
  where ss.user_id = actor.id;

  return jsonb_build_object(
    'profile', jsonb_build_object(
      'id', actor.id,
      'name', actor.full_name,
      'role', 'committee',
      'readOnly', true,
      'sectors', to_jsonb(coalesce(scoped_ids, '{}'::uuid[])),
      'sectorNames', to_jsonb(coalesce(scoped_names, '{}'::text[]))
    ),
    'pipeline', (
      select jsonb_build_object(
        'total', count(*)::int,
        'submitted', count(*) filter (where a.status = 'Submitted')::int,
        'inReview', count(*) filter (where a.status = 'In review')::int,
        'changesRequested', count(*) filter (where a.status = 'Changes requested')::int,
        'approved', count(*) filter (where a.status = 'Approved')::int,
        'awarded', count(*) filter (where a.status = 'Awarded')::int,
        'rejected', count(*) filter (where a.status = 'Rejected')::int,
        'withdrawn', count(*) filter (where a.status = 'Withdrawn')::int
      )
      from public.innovation_applications a
      where a.status <> 'Draft'
        and ceda_private.committee_in_sector(actor.id, a.sector_id)
    ),
    'sectors', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', s.id,
          'name', s.name,
          'status', s.status,
          'totalCount', count(a.id)::int,
          'submittedCount', count(a.id) filter (where a.status = 'Submitted')::int,
          'inReviewCount', count(a.id) filter (where a.status = 'In review')::int,
          'changesCount', count(a.id) filter (where a.status = 'Changes requested')::int,
          'approvedCount', count(a.id) filter (where a.status = 'Approved')::int,
          'awardedCount', count(a.id) filter (where a.status = 'Awarded')::int,
          'rejectedCount', count(a.id) filter (where a.status = 'Rejected')::int
        ) order by s.name
      )
      from public.sectors s
      left join public.innovation_applications a
        on a.status <> 'Draft'
       and (a.sector_id = s.id or (a.sector_id is null and lower(a.sector) = lower(s.name)))
      where s.status <> 'archived'
        and ceda_private.committee_in_sector(actor.id, s.id)
      group by s.id, s.name, s.status
    ), '[]'::jsonb),
    'applications', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', a.id,
          'reference', a.reference,
          'title', a.title,
          'applicant', a.applicant,
          'applicantType', a.applicant_type,
          'sector', a.sector,
          'sectorId', a.sector_id,
          'status', a.status,
          'stage', ceda_private.committee_stage_of(a.status),
          'summary', a.summary,
          'innovationStage', nullif(a.form_data->>'stage', ''),
          'district', nullif(a.form_data->>'district', ''),
          'submittedDate', case when a.submitted_at is not null then to_char(a.submitted_at at time zone 'Africa/Gaborone', 'YYYY-MM-DD HH24:MI') else a.submitted_date::text end,
          'updatedAt', to_char(a.updated_at at time zone 'Africa/Gaborone', 'YYYY-MM-DD HH24:MI'),
          'awardedAt', case when a.awarded_at is not null then to_char(a.awarded_at at time zone 'Africa/Gaborone', 'YYYY-MM-DD HH24:MI') else null end,
          'roundState', r.state,
          'outcomeData', case when a.status in ('Approved', 'Awarded', 'Rejected') then a.outcome_data else '{}'::jsonb end,
          'awardData', case when a.status = 'Awarded' then a.award_data else '{}'::jsonb end,
          'timeline', a.applicant_timeline,
          'documentCount', (
            select count(*)::int from public.application_documents d
            where d.application_id = a.id and d.upload_status <> 'Removed'
          ),
          'readOnly', true
        ) order by coalesce(a.awarded_at, a.updated_at) desc, a.reference asc
      )
      from public.innovation_applications a
      left join ceda_private.assessment_rounds r on r.case_id = a.id and r.state <> 'archived'
      where a.status <> 'Draft'
        and ceda_private.committee_in_sector(actor.id, a.sector_id)
    ), '[]'::jsonb),
    'timelineEvents', coalesce((
      select jsonb_agg(evt order by evt->>'at' desc nulls last, evt->>'reference' asc)
      from (
        select jsonb_build_object(
          'applicationId', a.id,
          'reference', a.reference,
          'title', a.title,
          'applicant', a.applicant,
          'sector', a.sector,
          'status', a.status,
          'stage', ceda_private.committee_stage_of(a.status),
          'label', coalesce(entry.item->>'label', ceda_private.committee_stage_of(a.status)),
          'detail', coalesce(entry.item->>'detail', ''),
          'at', coalesce(entry.item->>'at', to_char(a.updated_at at time zone 'Africa/Gaborone', 'YYYY-MM-DD HH24:MI'))
        ) as evt
        from public.innovation_applications a
        cross join lateral jsonb_array_elements(
          case
            when jsonb_array_length(coalesce(a.applicant_timeline, '[]'::jsonb)) > 0 then a.applicant_timeline
            else jsonb_build_array(jsonb_build_object(
              'label', ceda_private.committee_stage_of(a.status),
              'detail', 'Current lifecycle stage: ' || a.status,
              'at', to_char(a.updated_at at time zone 'Africa/Gaborone', 'YYYY-MM-DD HH24:MI')
            ))
          end
        ) as entry(item)
        where a.status <> 'Draft'
          and ceda_private.committee_in_sector(actor.id, a.sector_id)
        order by coalesce(entry.item->>'at', '') desc
        limit 80
      ) recent
    ), '[]'::jsonb)
  );
end $$;
revoke all on function ceda_private.committee_workspace() from public, anon;
grant execute on function ceda_private.committee_workspace() to authenticated;

create or replace function ceda_private.committee_case(p_case_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor public.profiles := ceda_private.require_committee();
  a public.innovation_applications;
  r ceda_private.assessment_rounds;
begin
  select * into a
  from public.innovation_applications
  where id = p_case_id
    and status <> 'Draft'
    and ceda_private.committee_in_sector(actor.id, sector_id);
  if not found then
    raise exception 'Application not accessible to committee observer' using errcode = '42501';
  end if;

  select * into r from ceda_private.assessment_rounds where case_id = a.id and state <> 'archived';

  return jsonb_build_object(
    'case', jsonb_build_object(
      'id', a.id,
      'reference', a.reference,
      'title', a.title,
      'applicant', a.applicant,
      'applicantType', a.applicant_type,
      'sector', a.sector,
      'sectorId', a.sector_id,
      'status', a.status,
      'stage', ceda_private.committee_stage_of(a.status),
      'summary', a.summary,
      'innovationStage', nullif(a.form_data->>'stage', ''),
      'district', nullif(a.form_data->>'district', ''),
      'botswanaBenefit', nullif(a.form_data->>'botswanaBenefit', ''),
      'submittedDate', case when a.submitted_at is not null then to_char(a.submitted_at at time zone 'Africa/Gaborone', 'YYYY-MM-DD HH24:MI') else a.submitted_date::text end,
      'updatedAt', to_char(a.updated_at at time zone 'Africa/Gaborone', 'YYYY-MM-DD HH24:MI'),
      'awardedAt', case when a.awarded_at is not null then to_char(a.awarded_at at time zone 'Africa/Gaborone', 'YYYY-MM-DD HH24:MI') else null end,
      'version', a.version,
      'readOnly', true
    ),
    'roundOverview', case when r.id is null then null else jsonb_build_object(
      'roundState', r.state,
      'held', coalesce(r.held, false),
      'createdAt', to_char(r.created_at at time zone 'Africa/Gaborone', 'YYYY-MM-DD HH24:MI'),
      'reviewCount', (select count(*)::int from ceda_private.assessment_members m where m.round_id = r.id and m.conflict = 'cleared' and m.submitted_at is not null),
      'memberCount', (select count(*)::int from ceda_private.assessment_members m where m.round_id = r.id and m.conflict <> 'recused')
    ) end,
    'outcomeData', case when a.status in ('Approved', 'Awarded', 'Rejected') then a.outcome_data else '{}'::jsonb end,
    'awardData', case when a.status = 'Awarded' then a.award_data else '{}'::jsonb end,
    'timeline', coalesce(a.applicant_timeline, '[]'::jsonb),
    'documents', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', d.id,
          'sectionKey', d.section_key,
          'docKind', d.doc_kind,
          'title', d.title,
          'category', d.category,
          'videoUrl', case when d.doc_kind = 'video_link' then d.video_url else null end,
          'createdAt', to_char(d.created_at at time zone 'Africa/Gaborone', 'YYYY-MM-DD HH24:MI')
        ) order by d.created_at desc
      )
      from public.application_documents d
      where d.application_id = a.id and d.upload_status <> 'Removed'
    ), '[]'::jsonb)
  );
end $$;
revoke all on function ceda_private.committee_case(uuid) from public, anon;
grant execute on function ceda_private.committee_case(uuid) to authenticated;

create or replace function public.committee_workspace()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select ceda_private.committee_workspace();
$$;
revoke all on function public.committee_workspace() from public, anon;
grant execute on function public.committee_workspace() to authenticated;

create or replace function public.committee_case(p_case_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select ceda_private.committee_case(p_case_id);
$$;
revoke all on function public.committee_case(uuid) from public, anon;
grant execute on function public.committee_case(uuid) to authenticated;

notify pgrst, 'reload schema';
