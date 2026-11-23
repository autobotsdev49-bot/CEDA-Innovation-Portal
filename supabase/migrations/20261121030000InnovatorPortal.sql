-- Innovator Web Portal schema, private storage bucket, O(log n) indexes, and owner-scoped RPCs.

-- 1. Unique application reference sequence
create sequence if not exists ceda_private.application_ref_seq start with 100 increment by 1;
revoke all on sequence ceda_private.application_ref_seq from public, anon, authenticated;

-- 2. Extend public.profiles with safe personal, company and accessibility/notification preferences
alter table public.profiles
  add column if not exists phone text not null default '',
  add column if not exists district text not null default '',
  add column if not exists expertise text not null default '',
  add column if not exists company_name text not null default '',
  add column if not exists company_reg_number text not null default '',
  add column if not exists company_sector text not null default '',
  add column if not exists company_role text not null default '',
  add column if not exists preferences jsonb not null default '{"emailNotifications":true,"inAppNotifications":true,"statusAlerts":true,"clarificationAlerts":true,"receiptEmails":true,"textSize":"standard","highContrast":false,"reducedMotion":false}'::jsonb;

-- 3. Extend public.innovation_applications for the full Innovator draft-to-outcome lifecycle
alter table public.innovation_applications
  drop constraint if exists innovation_applications_status_check;

alter table public.innovation_applications
  add column if not exists owner_id uuid references auth.users(id) on delete cascade,
  add column if not exists applicant_type text not null default 'Individual',
  add column if not exists sector_id uuid references public.sectors(id),
  add column if not exists current_step integer not null default 1,
  add column if not exists form_data jsonb not null default '{}'::jsonb,
  add column if not exists idempotency_key text,
  add column if not exists submitted_at timestamptz,
  add column if not exists receipt_code text,
  add column if not exists requested_changes jsonb not null default '[]'::jsonb,
  add column if not exists outcome_data jsonb not null default '{}'::jsonb,
  add column if not exists applicant_timeline jsonb not null default '[]'::jsonb,
  add column if not exists withdrawn_reason text;

alter table public.innovation_applications
  drop constraint if exists innovation_applications_applicant_type_check,
  drop constraint if exists innovation_applications_current_step_check;

alter table public.innovation_applications
  add constraint innovation_applications_status_check
    check (status in ('Draft','Submitted','In review','Changes requested','Approved','Rejected','Withdrawn')),
  add constraint innovation_applications_applicant_type_check
    check (applicant_type in ('Individual','Registered company')),
  add constraint innovation_applications_current_step_check
    check (current_step between 1 and 12);

create unique index if not exists innovation_applications_idempotency_idx
  on public.innovation_applications (idempotency_key) where idempotency_key is not null;
create index if not exists innovation_applications_owner_updated_idx
  on public.innovation_applications (owner_id, updated_at desc) where owner_id is not null;
create index if not exists innovation_applications_owner_status_idx
  on public.innovation_applications (owner_id, status) where owner_id is not null;
create index if not exists innovation_applications_sector_id_idx
  on public.innovation_applications (sector_id) where sector_id is not null;

-- 4. Private Storage bucket & strict owner-folder policies for supporting evidence
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'innovation-evidence',
  'innovation-evidence',
  false,
  10485760,
  array[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'image/jpeg',
    'image/png'
  ]
)
on conflict (id) do update
set public = false,
    file_size_limit = 10485760,
    allowed_mime_types = excluded.allowed_mime_types;

create policy innovation_evidence_owner_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'innovation-evidence'
    and ((select auth.jwt())->>'is_anonymous') = 'false'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

create policy innovation_evidence_owner_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'innovation-evidence'
    and ((select auth.jwt())->>'is_anonymous') = 'false'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

create policy innovation_evidence_owner_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'innovation-evidence'
    and ((select auth.jwt())->>'is_anonymous') = 'false'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

create policy innovation_evidence_owner_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'innovation-evidence'
    and ((select auth.jwt())->>'is_anonymous') = 'false'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

-- 5. Supporting evidence & video links table (4-file cap per section enforced server-side)
create table if not exists public.application_documents (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.innovation_applications(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  section_key text not null check (section_key in ('applicant','problem','impact','feasibility','supplementary','clarification')),
  doc_kind text not null check (doc_kind in ('file','video_link','supplemental')),
  title text not null check (length(btrim(title)) between 1 and 160),
  category text not null default 'Supporting document' check (length(btrim(category)) between 1 and 80),
  description text not null default '' check (length(description) <= 500),
  file_name text not null check (length(btrim(file_name)) between 1 and 255),
  mime_type text not null default '',
  file_size bigint not null default 0 check (file_size >= 0 and file_size <= 10485760),
  storage_path text,
  video_url text,
  password_protected boolean not null default false,
  version integer not null default 1 check (version >= 1),
  upload_status text not null default 'Saved' check (upload_status in ('Saved','Replaced','Quarantined','Removed')),
  created_at timestamptz not null default now()
);
create index if not exists application_documents_app_section_idx
  on public.application_documents (application_id, section_key, created_at desc);
create index if not exists application_documents_owner_created_idx
  on public.application_documents (owner_id, created_at desc);
alter table public.application_documents enable row level security;
revoke all on public.application_documents from public, anon, authenticated;
create policy application_documents_direct_access_denied on public.application_documents
  as restrictive for all to public using(false) with check(false);

-- 6. Application & support messages table
create table if not exists public.portal_messages (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  application_id uuid references public.innovation_applications(id) on delete cascade,
  application_ref text,
  thread_type text not null default 'application' check (thread_type in ('application','support','clarification')),
  subject text not null check (length(btrim(subject)) between 2 and 200),
  sender_id uuid references auth.users(id),
  sender_name text not null check (length(btrim(sender_name)) between 1 and 120),
  sender_role text not null check (sender_role in ('innovator','support','assessor','admin','system')),
  body text not null check (length(btrim(body)) between 1 and 4000),
  attachment_name text,
  attachment_path text,
  is_read_by_innovator boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists portal_messages_owner_created_idx
  on public.portal_messages (owner_id, created_at asc);
create index if not exists portal_messages_app_created_idx
  on public.portal_messages (application_id, created_at asc) where application_id is not null;
create index if not exists portal_messages_sender_id_idx
  on public.portal_messages (sender_id) where sender_id is not null;
alter table public.portal_messages enable row level security;
revoke all on public.portal_messages from public, anon, authenticated;
create policy portal_messages_direct_access_denied on public.portal_messages
  as restrictive for all to public using(false) with check(false);

-- 7. In-app notifications for Innovators
create table if not exists public.innovator_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('submission','status','clarification','message','support','outcome','system')),
  title text not null check (length(btrim(title)) between 2 and 200),
  message text not null check (length(btrim(message)) between 2 and 1000),
  application_ref text,
  target_hash text not null default '#overview',
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists innovator_notifications_user_read_idx
  on public.innovator_notifications (user_id, is_read, created_at desc);
alter table public.innovator_notifications enable row level security;
revoke all on public.innovator_notifications from public, anon, authenticated;
create policy innovator_notifications_direct_access_denied on public.innovator_notifications
  as restrictive for all to public using(false) with check(false);

-- 8. Optimus Prime controlled interactions & ratings
create table if not exists public.optimus_interactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  topic text not null default 'general',
  question text not null check (length(btrim(question)) between 2 and 1000),
  answer text not null check (length(btrim(answer)) between 2 and 4000),
  source_article text,
  escalated boolean not null default false,
  rating text check (rating in ('helpful','not_helpful')),
  created_at timestamptz not null default now()
);
create index if not exists optimus_interactions_user_created_idx
  on public.optimus_interactions (user_id, created_at desc);
alter table public.optimus_interactions enable row level security;
revoke all on public.optimus_interactions from public, anon, authenticated;
create policy optimus_interactions_direct_access_denied on public.optimus_interactions
  as restrictive for all to public using(false) with check(false);

-- 9. Link admin_matters to reporting users for live Support & Help replies
alter table public.admin_matters
  add column if not exists owner_id uuid references auth.users(id) on delete set null,
  add column if not exists thread_messages jsonb not null default '[]'::jsonb;
create index if not exists admin_matters_owner_idx
  on public.admin_matters (owner_id, reported_at desc) where owner_id is not null;

-- 10. Strict active Innovator authorization guard
create or replace function ceda_private.require_innovator()
returns uuid language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid();
begin
  if actor is null or not exists (
    select 1 from public.profiles p join auth.users u on u.id = p.id
    where p.id = actor and p.account_role = 'innovator' and p.account_status = 'active'
      and u.email_confirmed_at is not null and not u.is_anonymous
      and (u.banned_until is null or u.banned_until < now())
  ) or not exists (
    select 1 from auth.sessions s where s.user_id = actor
      and s.id::text = (auth.jwt()->>'session_id')
      and (s.not_after is null or s.not_after > now())
  ) then
    raise exception 'Innovator access required' using errcode = '42501';
  end if;
  return actor;
end $$;
revoke all on function ceda_private.require_innovator() from public, anon, authenticated;

-- 11. Safe projection helper for applicant-facing application JSON (never leaks exclusions or internal staff notes)
create or replace function ceda_private.project_innovator_application(a public.innovation_applications)
returns jsonb language sql stable security definer set search_path = '' as $$
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
    'outcomeData', case when a.status in ('Approved','Rejected') then a.outcome_data else '{}'::jsonb end,
    'timeline', a.applicant_timeline,
    'receiptCode', a.receipt_code,
    'withdrawnReason', a.withdrawn_reason,
    'submittedDate', case when a.submitted_at is not null then to_char(a.submitted_at at time zone 'Africa/Gaborone', 'YYYY-MM-DD HH24:MI') else null end,
    'createdAt', to_char(a.created_at at time zone 'Africa/Gaborone', 'YYYY-MM-DD HH24:MI'),
    'updatedAt', to_char(a.updated_at at time zone 'Africa/Gaborone', 'YYYY-MM-DD HH24:MI')
  );
$$;
revoke all on function ceda_private.project_innovator_application(public.innovation_applications) from public, anon, authenticated;

-- 12. Update Admin RPCs to keep unsubmitted Innovator drafts private and notify applicants on Admin interventions
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
        count(*) filter (where a.status <> 'Draft')::int as total_count,
        count(*) filter (where a.status = 'Approved')::int as approved_count,
        count(*) filter (where a.status = 'In review')::int as review_count,
        count(*) filter (where a.status = 'Rejected')::int as rejected_count
      from public.innovation_applications a
      group by lower(a.sector)
    ) c on c.sector_key = lower(s.name)
  ), '[]'::jsonb);
end $$;

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
    where a.status <> 'Draft'
  ), '[]'::jsonb);
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
  safe_label text;
  safe_event jsonb;
  next_outcome jsonb;
begin
  if not coalesce(confirmed, false) then
    raise exception 'Confirm this administrator status intervention';
  end if;
  if app_ref is null or new_status is null or new_status not in ('Submitted','In review','Changes requested','Approved','Rejected')
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
  new_entry := jsonb_build_object(
    'type', 'Admin status intervention',
    'actor', actor_name,
    'reason', btrim(reason),
    'at', to_char(now() at time zone 'Africa/Gaborone', 'YYYY-MM-DD HH24:MI'),
    'before', jsonb_build_object('status', current_row.status),
    'after', jsonb_build_object('status', new_status)
  );
  safe_label := case new_status
    when 'In review' then 'Review started'
    when 'Changes requested' then 'Additional information requested'
    when 'Approved' then 'Outcome available'
    when 'Rejected' then 'Outcome available'
    else 'Application received'
  end;
  safe_event := jsonb_build_object(
    'label', safe_label,
    'detail', case
      when new_status = 'In review' then 'Your submission is now under assessment.'
      when new_status = 'Changes requested' then 'CEDA requested additional information on your submission.'
      when new_status in ('Approved','Rejected') then 'An authorized outcome has been released.'
      else 'Application status updated.'
    end,
    'at', to_char(now() at time zone 'Africa/Gaborone', 'YYYY-MM-DD HH24:MI')
  );
  next_outcome := current_row.outcome_data;
  if new_status in ('Approved','Rejected') then
    next_outcome := jsonb_build_object(
      'status', new_status,
      'releasedAt', to_char(now() at time zone 'Africa/Gaborone', 'YYYY-MM-DD HH24:MI'),
      'feedback', case
        when new_status = 'Approved' then 'Your innovation received a positive assessment outcome. Note that assessment approval is not an automatic financing offer.'
        else 'Your innovation was not approved in this assessment cycle. Review the recommended next steps or contact support for clarification.'
      end,
      'nextSteps', case
        when new_status = 'Approved' then 'Keep your outcome letter and monitor portal messages for any follow-up CEDA programme invitations.'
        else 'Address the noted areas of feasibility and evidence before preparing a revised proposal.'
      end,
      'letterRef', 'OUT-' || current_row.reference,
      'appealAllowed', true
    );
  end if;

  update public.innovation_applications
  set status = new_status,
      version = current_row.version + 1,
      history = current_row.history || jsonb_build_array(new_entry),
      applicant_timeline = current_row.applicant_timeline || jsonb_build_array(safe_event),
      outcome_data = next_outcome,
      updated_at = now()
  where id = current_row.id;

  if current_row.owner_id is not null then
    insert into public.innovator_notifications(user_id, kind, title, message, application_ref, target_hash)
    values (
      current_row.owner_id,
      case when new_status in ('Approved','Rejected') then 'outcome' when new_status = 'Changes requested' then 'clarification' else 'status' end,
      current_row.reference || ' — ' || safe_label,
      safe_event->>'detail',
      current_row.reference,
      '#applications'
    );
  end if;

  insert into public.admin_audit(actor_id, action, target, detail)
  values (actor, 'application.status.intervened', current_row.reference, jsonb_build_object('before_status', current_row.status, 'after_status', new_status, 'version', current_row.version + 1, 'reason', btrim(reason)));

  return ceda_private.admin_applications();
end $$;

-- 13. Innovator Workspace Bootstrap RPC
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
          'senderName', m.sender_name,
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

-- 14. Create Draft RPC (with Smart Defaults from profile)
create or replace function ceda_private.innovator_create_draft(
  p_applicant_type text,
  p_sector_id uuid
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := ceda_private.require_innovator();
  prof record;
  sec record;
  seq_num bigint;
  app_ref text;
  initial_form jsonb;
  created_row public.innovation_applications;
begin
  if p_applicant_type is null or p_applicant_type not in ('Individual','Registered company') then
    raise exception 'Select Individual or Registered company';
  end if;
  select id, name into sec from public.sectors where id = p_sector_id and status = 'published';
  if not found then
    raise exception 'Select an active published innovation sector';
  end if;
  select p.full_name, u.email, p.phone, p.district, p.expertise,
         p.company_name, p.company_reg_number, p.company_sector, p.company_role
  into prof
  from public.profiles p join auth.users u on u.id = p.id
  where p.id = actor;

  seq_num := nextval('ceda_private.application_ref_seq');
  app_ref := 'CEDA-INN-2026-' || lpad(seq_num::text, 5, '0');

  initial_form := jsonb_build_object(
    'applicantType', p_applicant_type,
    'fullName', coalesce(prof.full_name, ''),
    'email', coalesce(prof.email, ''),
    'phone', coalesce(prof.phone, ''),
    'district', coalesce(nullif(prof.district, ''), 'Gaborone'),
    'expertise', coalesce(prof.expertise, ''),
    'hasCollaborators', 'No',
    'collaborators', '[]'::jsonb,
    'companyName', coalesce(prof.company_name, ''),
    'companyRegNumber', coalesce(prof.company_reg_number, ''),
    'companySector', coalesce(prof.company_sector, sec.name),
    'representativeRole', coalesce(prof.company_role, ''),
    'companyAuthority', false,
    'title', '',
    'summary', '',
    'primarySector', sec.name,
    'secondarySectors', '[]'::jsonb,
    'innovationType', '[]'::jsonb,
    'technologyMethod', '',
    'problem', '',
    'problemUsers', '[]'::jsonb,
    'problemUrgency', '',
    'solution', '',
    'hasAlternatives', 'Unsure',
    'alternativesDetail', '',
    'testedWithUsers', 'No',
    'testingLessons', '',
    'beneficiaries', '[]'::jsonb,
    'botswanaBenefit', '',
    'deploymentFootprint', 'National (Botswana)',
    'empowermentFocus', 'Yes',
    'empowermentNotes', ''
  ) || jsonb_build_object(
    'environmentalImpact', 'Neutral',
    'environmentalNotes', '',
    'marketDemand', '',
    'createsJobs', 'Unsure',
    'jobsYear1', '',
    'jobsYear3', '',
    'jobsYear5', '',
    'jobsAssumptions', '',
    'stage', 'Prototype',
    'stageEvidenceNotes', '',
    'stageMilestoneNext', '',
    'implementationApproach', '',
    'milestone1Year', '',
    'milestone3Year', '',
    'milestone5Year', '',
    'risksAndMitigations', '',
    'teamExperience', coalesce(prof.expertise, ''),
    'resourcesNeeded', '',
    'partnerships', '',
    'supportRequestedSummary', '',
    'hasBusinessPlan', 'No',
    'hasFinancialProjections', 'No',
    'financialAssumptions', '',
    'selfDeveloped', 'Yes',
    'otherContributors', 'No',
    'permissionToSubmit', true,
    'sharedPublicly', 'No',
    'sharedPubliclyNotes', '',
    'existingAgreements', 'No',
    'accuracyConfirmed', false,
    'privacyConfirmed', false
  );

  insert into public.innovation_applications (
    owner_id, reference, title, applicant, applicant_type, sector, sector_id,
    status, summary, current_step, form_data, applicant_timeline
  )
  values (
    actor,
    app_ref,
    'Untitled innovation draft',
    case when p_applicant_type = 'Registered company' and length(btrim(coalesce(prof.company_name, ''))) > 0
      then btrim(prof.company_name) else coalesce(prof.full_name, 'Innovator') end,
    p_applicant_type,
    sec.name,
    sec.id,
    'Draft',
    'Draft in progress.',
    1,
    initial_form,
    jsonb_build_array(jsonb_build_object(
      'label', 'Draft created',
      'detail', 'Private draft started for ' || sec.name || '.',
      'at', to_char(now() at time zone 'Africa/Gaborone', 'YYYY-MM-DD HH24:MI')
    ))
  )
  returning * into created_row;

  return ceda_private.project_innovator_application(created_row);
end $$;

-- 15. Autosave / Save Draft RPC with optimistic locking
create or replace function ceda_private.innovator_save_draft(
  p_app_id uuid,
  p_current_step integer,
  p_form_data jsonb,
  p_expected_version integer
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := ceda_private.require_innovator();
  app_row public.innovation_applications;
  merged jsonb;
  next_title text;
  next_summary text;
  next_applicant text;
  next_type text;
  next_sector text;
begin
  if p_app_id is null or p_current_step is null or p_current_step not between 1 and 12
    or p_form_data is null or jsonb_typeof(p_form_data) <> 'object' then
    raise exception 'Invalid draft data';
  end if;
  select * into app_row from public.innovation_applications
  where id = p_app_id and owner_id = actor for update;
  if not found then
    raise exception 'Application draft not found';
  end if;
  if app_row.status <> 'Draft' then
    raise exception 'Submitted applications are read-only and cannot be edited as a draft';
  end if;
  if p_expected_version is not null and app_row.version <> p_expected_version then
    raise exception 'This draft was saved in another tab. Reload before making further edits.';
  end if;

  merged := app_row.form_data || p_form_data;
  next_type := case when coalesce(merged->>'applicantType', app_row.applicant_type) in ('Individual','Registered company')
    then coalesce(merged->>'applicantType', app_row.applicant_type) else app_row.applicant_type end;
  next_title := coalesce(nullif(left(btrim(coalesce(merged->>'title', '')), 200), ''), app_row.title);
  next_summary := coalesce(nullif(left(btrim(coalesce(merged->>'summary', '')), 5000), ''), app_row.summary);
  next_sector := coalesce(nullif(left(btrim(coalesce(merged->>'primarySector', '')), 100), ''), app_row.sector);
  next_applicant := case
    when next_type = 'Registered company' and length(btrim(coalesce(merged->>'companyName', ''))) >= 2
      then left(btrim(merged->>'companyName'), 200)
    else coalesce(nullif(left(btrim(coalesce(merged->>'fullName', '')), 200), ''), app_row.applicant)
  end;

  update public.innovation_applications
  set current_step = p_current_step,
      form_data = merged,
      applicant_type = next_type,
      title = next_title,
      summary = next_summary,
      sector = next_sector,
      applicant = next_applicant,
      version = app_row.version + 1,
      updated_at = now()
  where id = app_row.id
  returning * into app_row;

  return ceda_private.project_innovator_application(app_row);
end $$;

-- 16. Add & Remove Supporting Documents / Video Links RPCs
create or replace function ceda_private.innovator_add_document(
  p_app_id uuid,
  p_section_key text,
  p_doc_kind text,
  p_title text,
  p_category text,
  p_description text,
  p_file_name text,
  p_mime_type text,
  p_file_size bigint,
  p_storage_path text default null,
  p_video_url text default null,
  p_password_protected boolean default false
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := ceda_private.require_innovator();
  app_row public.innovation_applications;
  existing_count integer;
begin
  if p_app_id is null or p_section_key not in ('applicant','problem','impact','feasibility','supplementary','clarification')
    or p_doc_kind not in ('file','video_link','supplemental')
    or p_title is null or length(btrim(p_title)) not between 1 and 160
    or p_file_name is null or length(btrim(p_file_name)) not between 1 and 255 then
    raise exception 'Invalid document metadata';
  end if;

  select * into app_row from public.innovation_applications
  where id = p_app_id and owner_id = actor for update;
  if not found then raise exception 'Application not found'; end if;

  if p_doc_kind = 'file' then
    if app_row.status <> 'Draft' then
      raise exception 'Original submission documents can only be added while the application is a Draft';
    end if;
    if p_storage_path is null or left(p_storage_path, length(actor::text) + 1) <> actor::text || '/' then
      raise exception 'Invalid private storage path';
    end if;
    if p_file_size is null or p_file_size < 1 or p_file_size > 10485760 then
      raise exception 'File size must be between 1 byte and 10 MB';
    end if;
    select count(*) into existing_count
    from public.application_documents
    where application_id = app_row.id and section_key = p_section_key
      and doc_kind = 'file' and upload_status = 'Saved';
    if existing_count >= 4 then
      raise exception 'Maximum 4 supporting files allowed for this section';
    end if;
  elsif p_doc_kind = 'supplemental' then
    if app_row.status <> 'Changes requested' then
      raise exception 'Supplemental evidence can only be uploaded when CEDA requests additional information';
    end if;
    if p_storage_path is null or left(p_storage_path, length(actor::text) + 1) <> actor::text || '/' then
      raise exception 'Invalid private storage path';
    end if;
  elsif p_doc_kind = 'video_link' then
    if app_row.status not in ('Draft','Changes requested') then
      raise exception 'Video links can only be added to editable drafts or requested clarifications';
    end if;
    if p_video_url is null or p_video_url !~* '^https://[^[:space:]]+$' then
      raise exception 'Video demonstration links must start with https://';
    end if;
  end if;

  insert into public.application_documents (
    application_id, owner_id, section_key, doc_kind, title, category, description,
    file_name, mime_type, file_size, storage_path, video_url, password_protected
  )
  values (
    app_row.id, actor, p_section_key, p_doc_kind, btrim(p_title),
    coalesce(nullif(btrim(p_category), ''), 'Supporting document'),
    coalesce(left(btrim(p_description), 500), ''),
    btrim(p_file_name),
    coalesce(p_mime_type, ''),
    coalesce(p_file_size, 0),
    p_storage_path,
    p_video_url,
    coalesce(p_password_protected, false)
  );

  return coalesce((
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
  ), '[]'::jsonb);
end $$;

create or replace function ceda_private.innovator_remove_document(p_doc_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := ceda_private.require_innovator();
  doc_row public.application_documents;
  app_status text;
begin
  select * into doc_row from public.application_documents
  where id = p_doc_id and owner_id = actor for update;
  if not found then raise exception 'Document not found'; end if;
  select status into app_status from public.innovation_applications where id = doc_row.application_id;
  if app_status <> 'Draft' then
    raise exception 'Submitted documents are preserved as part of the official application record';
  end if;
  update public.application_documents set upload_status = 'Removed' where id = doc_row.id;

  return coalesce((
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
  ), '[]'::jsonb);
end $$;

-- 17. Atomic Idempotent Submission & Receipt RPC
create or replace function ceda_private.innovator_submit_application(
  p_app_id uuid,
  p_form_data jsonb,
  p_expected_version integer,
  p_idempotency_key text
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := ceda_private.require_innovator();
  app_row public.innovation_applications;
  merged jsonb;
  receipt_str text;
  now_bw text;
  next_title text;
  next_summary text;
  next_applicant text;
  next_type text;
begin
  if p_idempotency_key is null or length(btrim(p_idempotency_key)) < 8 then
    raise exception 'Submission idempotency key required';
  end if;

  -- Idempotency check: return already-submitted record cleanly without creating duplicates
  select * into app_row from public.innovation_applications
  where idempotency_key = btrim(p_idempotency_key) and owner_id = actor;
  if found then
    return ceda_private.project_innovator_application(app_row);
  end if;

  select * into app_row from public.innovation_applications
  where id = p_app_id and owner_id = actor for update;
  if not found then raise exception 'Application not found'; end if;
  if app_row.status <> 'Draft' then
    raise exception 'This application has already been submitted';
  end if;
  if p_expected_version is not null and app_row.version <> p_expected_version then
    raise exception 'This draft changed in another tab. Refresh before submitting.';
  end if;

  merged := app_row.form_data || coalesce(p_form_data, '{}'::jsonb);
  if length(btrim(coalesce(merged->>'title', ''))) < 3
    or length(btrim(coalesce(merged->>'summary', ''))) < 20
    or length(btrim(coalesce(merged->>'problem', ''))) < 20
    or length(btrim(coalesce(merged->>'solution', ''))) < 20
    or length(btrim(coalesce(merged->>'implementationApproach', ''))) < 10 then
    raise exception 'Complete the required innovation overview, problem, solution and implementation sections before submitting';
  end if;
  if coalesce((merged->>'permissionToSubmit')::boolean, false) is not true
    or coalesce((merged->>'accuracyConfirmed')::boolean, false) is not true
    or coalesce((merged->>'privacyConfirmed')::boolean, false) is not true then
    raise exception 'Confirm authorship permission, accuracy and privacy consent declarations before submitting';
  end if;

  next_type := case when coalesce(merged->>'applicantType', app_row.applicant_type) in ('Individual','Registered company')
    then coalesce(merged->>'applicantType', app_row.applicant_type) else app_row.applicant_type end;
  if next_type = 'Registered company' and (length(btrim(coalesce(merged->>'companyName', ''))) < 2 or coalesce((merged->>'companyAuthority')::boolean, false) is not true) then
    raise exception 'Provide the registered company name and confirm authority to submit';
  end if;

  next_title := left(btrim(merged->>'title'), 200);
  next_summary := left(btrim(merged->>'summary'), 5000);
  next_applicant := case when next_type = 'Registered company' then left(btrim(merged->>'companyName'), 200)
    else coalesce(nullif(left(btrim(coalesce(merged->>'fullName', '')), 200), ''), app_row.applicant) end;
  receipt_str := 'RCPT-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
  now_bw := to_char(now() at time zone 'Africa/Gaborone', 'YYYY-MM-DD HH24:MI');

  update public.innovation_applications
  set status = 'Submitted',
      applicant_type = next_type,
      title = next_title,
      summary = next_summary,
      applicant = next_applicant,
      form_data = merged,
      original_snapshot = merged,
      current_step = 12,
      version = app_row.version + 1,
      idempotency_key = btrim(p_idempotency_key),
      receipt_code = receipt_str,
      submitted_at = now(),
      submitted_date = (now() at time zone 'Africa/Gaborone')::date,
      applicant_timeline = app_row.applicant_timeline || jsonb_build_array(
        jsonb_build_object('label', 'Application submitted', 'detail', 'Submitted by ' || next_applicant || ' (Receipt ' || receipt_str || ').', 'at', now_bw),
        jsonb_build_object('label', 'Application received', 'detail', 'Submission locked and queued for CEDA assessment intake.', 'at', now_bw)
      ),
      updated_at = now()
  where id = app_row.id
  returning * into app_row;

  insert into public.innovator_notifications(user_id, kind, title, message, application_ref, target_hash)
  values (
    actor,
    'submission',
    app_row.reference || ' submission received',
    'Your innovation "' || next_title || '" has been received. Receipt code: ' || receipt_str || '.',
    app_row.reference,
    '#applications'
  );

  insert into public.notification_queue(idempotency_key, category, title, message, channel, audience, status, action_target, created_by)
  values (
    'sub-' || app_row.reference,
    'Submission receipt',
    'Submission received: ' || app_row.reference,
    'Innovation "' || next_title || '" was received with receipt ' || receipt_str || '.',
    'In-app + Email',
    'Innovator',
    'Queued',
    'applications',
    actor
  )
  on conflict (idempotency_key) do nothing;

  insert into public.portal_messages(owner_id, application_id, application_ref, thread_type, subject, sender_name, sender_role, body, is_read_by_innovator)
  values (
    actor,
    app_row.id,
    app_row.reference,
    'application',
    app_row.reference || ' — Submission receipt & updates',
    'CEDA Innovation Portal',
    'system',
    'Thank you for submitting "' || next_title || '". Your submission reference is ' || app_row.reference || ' (Receipt ' || receipt_str || '). Use this thread for any CEDA assessment updates or clarification requests.',
    false
  );

  return ceda_private.project_innovator_application(app_row);
end $$;

-- 18. Withdraw Application RPC (only permitted before final decision)
create or replace function ceda_private.innovator_withdraw_application(
  p_app_id uuid,
  p_reason text
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := ceda_private.require_innovator();
  app_row public.innovation_applications;
  now_bw text := to_char(now() at time zone 'Africa/Gaborone', 'YYYY-MM-DD HH24:MI');
begin
  if p_reason is null or length(btrim(p_reason)) not between 5 and 500 then
    raise exception 'Provide a brief reason (5-500 characters) to withdraw';
  end if;
  select * into app_row from public.innovation_applications
  where id = p_app_id and owner_id = actor for update;
  if not found then raise exception 'Application not found'; end if;
  if app_row.status not in ('Draft','Submitted','Changes requested') then
    raise exception 'Applications currently under final assessment or already completed cannot be withdrawn directly';
  end if;

  update public.innovation_applications
  set status = 'Withdrawn',
      withdrawn_reason = btrim(p_reason),
      version = app_row.version + 1,
      applicant_timeline = app_row.applicant_timeline || jsonb_build_array(
        jsonb_build_object('label', 'Application withdrawn', 'detail', 'Withdrawn by applicant.', 'at', now_bw)
      ),
      updated_at = now()
  where id = app_row.id
  returning * into app_row;

  insert into public.innovator_notifications(user_id, kind, title, message, application_ref, target_hash)
  values (actor, 'status', app_row.reference || ' withdrawn', 'Your application "' || app_row.title || '" has been withdrawn.', app_row.reference, '#applications');

  return ceda_private.project_innovator_application(app_row);
end $$;

-- 19. Submit Requested Changes / Clarification RPC (preserves original_snapshot)
create or replace function ceda_private.innovator_submit_clarification(
  p_app_id uuid,
  p_section_key text,
  p_updated_fields jsonb,
  p_response_note text,
  p_expected_version integer
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := ceda_private.require_innovator();
  app_row public.innovation_applications;
  now_bw text := to_char(now() at time zone 'Africa/Gaborone', 'YYYY-MM-DD HH24:MI');
  merged jsonb;
  resolved_reqs jsonb;
begin
  if p_response_note is null or length(btrim(p_response_note)) not between 10 and 2000 then
    raise exception 'Enter a clarification response of at least 10 characters';
  end if;
  select * into app_row from public.innovation_applications
  where id = p_app_id and owner_id = actor for update;
  if not found then raise exception 'Application not found'; end if;
  if app_row.status <> 'Changes requested' then
    raise exception 'Clarification edits are enabled only when CEDA requests changes';
  end if;
  if p_expected_version is not null and app_row.version <> p_expected_version then
    raise exception 'Application changed in another tab. Refresh before submitting your clarification.';
  end if;

  merged := app_row.form_data || coalesce(p_updated_fields, '{}'::jsonb);
  resolved_reqs := coalesce((
    select jsonb_agg(
      case when (item->>'status') is distinct from 'Resolved'
        then item || jsonb_build_object('status', 'Resolved', 'resolvedAt', now_bw)
        else item end
    )
    from jsonb_array_elements(app_row.requested_changes) item
  ), '[]'::jsonb);

  update public.innovation_applications
  set status = 'In review',
      form_data = merged,
      title = coalesce(nullif(left(btrim(coalesce(merged->>'title', '')), 200), ''), app_row.title),
      summary = coalesce(nullif(left(btrim(coalesce(merged->>'summary', '')), 5000), ''), app_row.summary),
      requested_changes = resolved_reqs,
      version = app_row.version + 1,
      history = app_row.history || jsonb_build_array(jsonb_build_object(
        'type', 'Applicant clarification response',
        'actor', app_row.applicant,
        'reason', btrim(p_response_note),
        'section', coalesce(p_section_key, 'general'),
        'at', now_bw
      )),
      applicant_timeline = app_row.applicant_timeline || jsonb_build_array(
        jsonb_build_object('label', 'Additional information submitted', 'detail', 'Revised response submitted for review.', 'at', now_bw)
      ),
      updated_at = now()
  where id = app_row.id
  returning * into app_row;

  insert into public.portal_messages(owner_id, application_id, application_ref, thread_type, subject, sender_id, sender_name, sender_role, body, is_read_by_innovator)
  values (actor, app_row.id, app_row.reference, 'clarification', app_row.reference || ' — Clarification submitted', actor, app_row.applicant, 'innovator', btrim(p_response_note), true);

  insert into public.innovator_notifications(user_id, kind, title, message, application_ref, target_hash)
  values (actor, 'clarification', app_row.reference || ' clarification received', 'Your additional information was recorded and review has resumed.', app_row.reference, '#applications');

  return ceda_private.project_innovator_application(app_row);
end $$;

-- 20. Messages & Notifications RPCs
create or replace function ceda_private.innovator_send_message(
  p_application_id uuid,
  p_thread_type text,
  p_subject text,
  p_body text,
  p_attachment_name text default null,
  p_attachment_path text default null
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := ceda_private.require_innovator();
  sender_display text;
  app_ref text;
begin
  if p_thread_type not in ('application','support','clarification')
    or p_subject is null or length(btrim(p_subject)) not between 2 and 200
    or p_body is null or length(btrim(p_body)) not between 1 and 4000 then
    raise exception 'Enter a valid subject and message';
  end if;
  if p_application_id is not null then
    select reference into app_ref from public.innovation_applications where id = p_application_id and owner_id = actor;
    if not found then raise exception 'Application not found'; end if;
  end if;
  if p_attachment_path is not null and left(p_attachment_path, length(actor::text) + 1) <> actor::text || '/' then
    raise exception 'Invalid attachment path';
  end if;
  select full_name into sender_display from public.profiles where id = actor;

  insert into public.portal_messages (
    owner_id, application_id, application_ref, thread_type, subject,
    sender_id, sender_name, sender_role, body, attachment_name, attachment_path, is_read_by_innovator
  )
  values (
    actor, p_application_id, app_ref, p_thread_type, btrim(p_subject),
    actor, coalesce(sender_display, 'Innovator'), 'innovator', btrim(p_body),
    p_attachment_name, p_attachment_path, true
  );

  return coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'id', m.id,
        'applicationId', m.application_id,
        'applicationRef', m.application_ref,
        'threadType', m.thread_type,
        'subject', m.subject,
        'senderName', m.sender_name,
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
  ), '[]'::jsonb);
end $$;

create or replace function ceda_private.innovator_mark_thread_read(
  p_application_id uuid default null,
  p_thread_type text default null
)
returns void language plpgsql security definer set search_path = '' as $$
declare actor uuid := ceda_private.require_innovator();
begin
  update public.portal_messages
  set is_read_by_innovator = true
  where owner_id = actor
    and is_read_by_innovator = false
    and (p_application_id is null or application_id = p_application_id)
    and (p_thread_type is null or thread_type = p_thread_type);
end $$;

create or replace function ceda_private.innovator_mark_notifications_read(p_notification_id uuid default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare actor uuid := ceda_private.require_innovator();
begin
  update public.innovator_notifications
  set is_read = true
  where user_id = actor and (p_notification_id is null or id = p_notification_id);

  return coalesce((
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
  ), '[]'::jsonb);
end $$;

-- 21. Help & Support Request + Reply RPCs (shared into admin_matters for staff visibility)
create or replace function ceda_private.innovator_create_support_request(
  p_kind text,
  p_title text,
  p_detail text,
  p_application_ref text default null,
  p_steps text default 'Not supplied'
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := ceda_private.require_innovator();
  reporter_name text;
  ref_prefix text;
  new_ref text;
  now_bw text := to_char(now() at time zone 'Africa/Gaborone', 'YYYY-MM-DD HH24:MI');
  linked_app_id uuid;
begin
  if p_kind not in ('Bug','Support','Feedback')
    or p_title is null or length(btrim(p_title)) not between 3 and 200
    or p_detail is null or length(btrim(p_detail)) not between 10 and 2000 then
    raise exception 'Provide a valid category, subject and description (at least 10 characters)';
  end if;
  if p_application_ref is not null and length(btrim(p_application_ref)) > 0 then
    select id into linked_app_id from public.innovation_applications
    where reference = btrim(p_application_ref) and owner_id = actor;
  end if;

  select full_name into reporter_name from public.profiles where id = actor;
  ref_prefix := case p_kind when 'Bug' then 'BUG-' when 'Feedback' then 'FB-' else 'TKT-' end;
  new_ref := ref_prefix || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));

  insert into public.admin_matters (
    reference, title, kind, reporter, owner_id, priority, state, owner_name,
    application_ref, detail, steps, thread_messages
  )
  values (
    new_ref,
    btrim(p_title),
    p_kind,
    coalesce(reporter_name, 'Innovator'),
    actor,
    case when p_kind = 'Bug' then 'High' else 'Normal' end,
    'Open',
    'Unassigned',
    nullif(btrim(coalesce(p_application_ref, '')), ''),
    btrim(p_detail),
    coalesce(nullif(btrim(p_steps), ''), 'Not supplied'),
    jsonb_build_array(jsonb_build_object('sender', coalesce(reporter_name, 'Innovator'), 'role', 'innovator', 'body', btrim(p_detail), 'at', now_bw))
  );

  insert into public.portal_messages (
    owner_id, application_id, application_ref, thread_type, subject, sender_id, sender_name, sender_role, body, is_read_by_innovator
  )
  values (
    actor, linked_app_id, nullif(btrim(coalesce(p_application_ref, '')), ''), 'support',
    new_ref || ' — ' || btrim(p_title), actor, coalesce(reporter_name, 'Innovator'), 'innovator', btrim(p_detail), true
  );

  insert into public.innovator_notifications (user_id, kind, title, message, application_ref, target_hash)
  values (
    actor, 'support', new_ref || ' support request logged',
    'We received "' || btrim(p_title) || '". Track updates in Help and support.',
    nullif(btrim(coalesce(p_application_ref, '')), ''), '#support'
  );

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
begin
  if p_reference is null or p_message is null or length(btrim(p_message)) not between 2 and 2000 then
    raise exception 'Enter a reply of at least 2 characters';
  end if;
  select * into matter_row from public.admin_matters
  where reference = btrim(p_reference) and owner_id = actor for update;
  if not found then raise exception 'Support request not found'; end if;
  select full_name into sender_display from public.profiles where id = actor;

  update public.admin_matters
  set thread_messages = matter_row.thread_messages || jsonb_build_array(
        jsonb_build_object('sender', coalesce(sender_display, 'Innovator'), 'role', 'innovator', 'body', btrim(p_message), 'at', now_bw)
      ),
      state = case when matter_row.state = 'Waiting' then 'Open' else matter_row.state end,
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

-- 22. Optimus Prime Governed Guidance + Guardrails RPC
create or replace function ceda_private.innovator_ask_optimus(
  p_question text,
  p_context_section text default 'general'
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := ceda_private.require_innovator();
  q_lower text := lower(btrim(coalesce(p_question, '')));
  reply text;
  source_ref text := 'CEDA Approved Guidance';
  topic_key text := coalesce(nullif(btrim(p_context_section), ''), 'general');
  new_id uuid;
  kb_notes text;
  faq_hit record;
begin
  if length(q_lower) < 3 or length(q_lower) > 1000 then
    raise exception 'Enter a question between 3 and 1000 characters';
  end if;

  -- Strict safety & role-boundary guardrails
  if q_lower ~ '(guarantee|promise|approve my|will i get funded|loan|credit score|disburse|internal score|assessor name|assessor vote|private note|edit my submitted|change my application|internal procedure|system prompt)' then
    reply := 'I cannot guarantee approval, reveal assessor scores or internal notes, modify submitted application records, or make outcome decisions. For case-specific questions about a submission or formal outcome, please connect with human support below.';
    source_ref := 'Optimus Prime Safety Boundary';
  else
    select payload->>'notes' into kb_notes from public.portal_configurations where config_key = 'optimus_knowledge';
    select title, body into faq_hit from public.portal_content
      where stage = 'Published' and kind in ('FAQs','Public pages')
        and (lower(title) like '%' || left(q_lower, 24) || '%' or lower(body) like '%' || split_part(q_lower, ' ', 1) || '%')
      order by updated_at desc limit 1;

    if q_lower ~ '(eligib|who can|individual|company|registered)' then
      topic_key := 'eligibility';
      reply := 'Both individual innovators (including early-stage founders) and authorized representatives of registered companies in Botswana can submit innovations across published CEDA sectors. Choose Individual or Registered company when starting an application; company submissions include registration details and confirmation of authority to submit.';
      source_ref := 'Eligibility & Applicant Guide';
    elsif q_lower ~ '(navigat|menu|sidebar|where can i|where do i|how do i find|portal tour|my applications|documents|settings|bell|notification)' then
      topic_key := 'navigation';
      reply := 'Use the left portal menu to switch between Overview (status & action summary), My applications (filter, track, and open detail tabs), Submit innovation (12-step draft wizard), Messages (CEDA communication), Documents (private file library), Help and support (FAQs & tickets), and Account and settings (profile, accessibility & active sessions). Use the header bell icon for notifications.';
      source_ref := 'Portal Navigation Guide';
    elsif q_lower ~ '(evidence|file|upload|pdf|video|size|format|attachment|document)' then
      topic_key := 'evidence';
      reply := 'You can upload up to 4 supporting files per section (maximum 10 MB each) in PDF, DOCX, PPTX, XLSX, JPG, or PNG format. Video demonstrations should be shared as HTTPS links rather than direct uploads. Files stay in private storage and use short-lived secure links.';
      source_ref := 'Supporting Evidence Policy';
    elsif q_lower ~ '(status|draft|submitted|review|changes requested|approved|rejected|declined|timeline)' then
      topic_key := 'status';
      reply := 'Status meanings: Draft (editable and autosaved), Submitted (locked snapshot with receipt), In review (under CEDA assessment), Changes requested (clarification or extra files requested before a deadline), and Approved/Rejected (outcome released by an authorized decision-maker).';
      source_ref := 'Application Status Definitions';
    elsif q_lower ~ '(stage|idea|prototype|pilot|scaling|r&d|operational)' then
      topic_key := 'stages';
      reply := 'Innovations are accepted at any stage—Idea, R&D, Prototype, Pilot, Operational, or Scaling. Conditional questions adapt to your selected stage so early ideas are never asked for operational revenue figures.';
      source_ref := 'Innovation Stage Matrix';
    elsif q_lower ~ '(step|section|form|save|autosave|scalab|feasib|impact|declaration|withdraw)' then
      topic_key := 'sections';
      reply := 'The application wizard guides you through 12 clear steps from Applicant information to Declaration and review. Progress saves automatically in your private draft so you can leave and return anytime before clicking final Submit.';
      source_ref := '12-Step Application Guide';
    elsif faq_hit.body is not null then
      reply := faq_hit.body;
      source_ref := faq_hit.title;
    else
      reply := coalesce(nullif(kb_notes, ''), 'You can ask me about eligibility (Individual vs Registered company), the 12 application sections, supporting evidence limits (4 files per section, 10 MB max, HTTPS video links), or what application statuses mean.') || ' If you need help with a specific case, use "Request human support" to open a ticket with a CEDA Support Officer.';
      source_ref := 'Approved Portal Knowledge';
    end if;
  end if;

  insert into public.optimus_interactions (user_id, topic, question, answer, source_article)
  values (actor, topic_key, btrim(p_question), reply, source_ref)
  returning id into new_id;

  return jsonb_build_object(
    'latest', (
      select jsonb_build_object(
        'id', o.id, 'topic', o.topic, 'question', o.question, 'answer', o.answer,
        'sourceArticle', o.source_article, 'escalated', o.escalated, 'rating', o.rating,
        'createdAt', to_char(o.created_at at time zone 'Africa/Gaborone', 'YYYY-MM-DD HH24:MI')
      )
      from public.optimus_interactions o where o.id = new_id
    ),
    'history', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', o.id, 'topic', o.topic, 'question', o.question, 'answer', o.answer,
          'sourceArticle', o.source_article, 'escalated', o.escalated, 'rating', o.rating,
          'createdAt', to_char(o.created_at at time zone 'Africa/Gaborone', 'YYYY-MM-DD HH24:MI')
        ) order by o.created_at desc
      )
      from (select * from public.optimus_interactions where user_id = actor order by created_at desc limit 20) o
    ), '[]'::jsonb)
  );
end $$;

create or replace function ceda_private.innovator_rate_optimus(
  p_interaction_id uuid,
  p_rating text
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare actor uuid := ceda_private.require_innovator();
begin
  if p_rating not in ('helpful','not_helpful') then
    raise exception 'Invalid rating';
  end if;
  update public.optimus_interactions
  set rating = p_rating
  where id = p_interaction_id and user_id = actor;
  return coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'id', o.id, 'topic', o.topic, 'question', o.question, 'answer', o.answer,
        'sourceArticle', o.source_article, 'escalated', o.escalated, 'rating', o.rating,
        'createdAt', to_char(o.created_at at time zone 'Africa/Gaborone', 'YYYY-MM-DD HH24:MI')
      ) order by o.created_at desc
    )
    from (select * from public.optimus_interactions where user_id = actor order by created_at desc limit 20) o
  ), '[]'::jsonb);
end $$;

create or replace function ceda_private.innovator_escalate_optimus(
  p_interaction_id uuid default null,
  p_summary text default 'Requested human support from Optimus Prime'
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := ceda_private.require_innovator();
  q_text text := '';
begin
  if p_interaction_id is not null then
    update public.optimus_interactions set escalated = true where id = p_interaction_id and user_id = actor
    returning question into q_text;
  end if;
  return ceda_private.innovator_create_support_request(
    'Support',
    'Human support follow-up from Optimus Prime',
    coalesce(nullif(btrim(p_summary), ''), 'Requested human support.') || case when length(coalesce(q_text, '')) > 0 then E'\n\nOriginal question: ' || q_text else '' end,
    null,
    'Escalated from Optimus Prime'
  );
end $$;

-- 23. Innovator Profile, Company & Accessibility/Notification Preferences Update RPC
create or replace function ceda_private.innovator_update_profile(
  p_full_name text,
  p_phone text,
  p_district text,
  p_expertise text,
  p_company_name text,
  p_company_reg_number text,
  p_company_sector text,
  p_company_role text,
  p_preferences jsonb
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := ceda_private.require_innovator();
  prof record;
begin
  if p_full_name is null or length(btrim(p_full_name)) not between 1 and 120 or p_full_name ~ '[[:cntrl:]<>]' then
    raise exception 'Enter a valid full legal name (1-120 characters)';
  end if;
  update public.profiles
  set full_name = btrim(p_full_name),
      phone = left(btrim(coalesce(p_phone, '')), 40),
      district = left(btrim(coalesce(p_district, '')), 80),
      expertise = left(btrim(coalesce(p_expertise, '')), 160),
      company_name = left(btrim(coalesce(p_company_name, '')), 160),
      company_reg_number = left(btrim(coalesce(p_company_reg_number, '')), 80),
      company_sector = left(btrim(coalesce(p_company_sector, '')), 100),
      company_role = left(btrim(coalesce(p_company_role, '')), 100),
      preferences = case when p_preferences is not null and jsonb_typeof(p_preferences) = 'object'
        then preferences || p_preferences else preferences end,
      updated_at = now()
  where id = actor;

  select p.id, p.full_name, u.email, p.phone, p.district, p.expertise,
         p.company_name, p.company_reg_number, p.company_sector, p.company_role, p.preferences
  into prof
  from public.profiles p join auth.users u on u.id = p.id
  where p.id = actor;

  return jsonb_build_object(
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
  );
end $$;

-- 24. Grant authenticated callers execute on public security invoker RPC wrappers
revoke all on function
  ceda_private.innovator_workspace_bootstrap(),
  ceda_private.innovator_create_draft(text,uuid),
  ceda_private.innovator_save_draft(uuid,integer,jsonb,integer),
  ceda_private.innovator_add_document(uuid,text,text,text,text,text,text,text,bigint,text,text,boolean),
  ceda_private.innovator_remove_document(uuid),
  ceda_private.innovator_submit_application(uuid,jsonb,integer,text),
  ceda_private.innovator_withdraw_application(uuid,text),
  ceda_private.innovator_submit_clarification(uuid,text,jsonb,text,integer),
  ceda_private.innovator_send_message(uuid,text,text,text,text,text),
  ceda_private.innovator_mark_thread_read(uuid,text),
  ceda_private.innovator_mark_notifications_read(uuid),
  ceda_private.innovator_create_support_request(text,text,text,text,text),
  ceda_private.innovator_reply_support_request(text,text),
  ceda_private.innovator_ask_optimus(text,text),
  ceda_private.innovator_rate_optimus(uuid,text),
  ceda_private.innovator_escalate_optimus(uuid,text),
  ceda_private.innovator_update_profile(text,text,text,text,text,text,text,text,jsonb)
from public, anon;

grant execute on function
  ceda_private.innovator_workspace_bootstrap(),
  ceda_private.innovator_create_draft(text,uuid),
  ceda_private.innovator_save_draft(uuid,integer,jsonb,integer),
  ceda_private.innovator_add_document(uuid,text,text,text,text,text,text,text,bigint,text,text,boolean),
  ceda_private.innovator_remove_document(uuid),
  ceda_private.innovator_submit_application(uuid,jsonb,integer,text),
  ceda_private.innovator_withdraw_application(uuid,text),
  ceda_private.innovator_submit_clarification(uuid,text,jsonb,text,integer),
  ceda_private.innovator_send_message(uuid,text,text,text,text,text),
  ceda_private.innovator_mark_thread_read(uuid,text),
  ceda_private.innovator_mark_notifications_read(uuid),
  ceda_private.innovator_create_support_request(text,text,text,text,text),
  ceda_private.innovator_reply_support_request(text,text),
  ceda_private.innovator_ask_optimus(text,text),
  ceda_private.innovator_rate_optimus(uuid,text),
  ceda_private.innovator_escalate_optimus(uuid,text),
  ceda_private.innovator_update_profile(text,text,text,text,text,text,text,text,jsonb)
to authenticated;

create or replace function public.innovator_workspace_bootstrap()
returns jsonb language sql security invoker set search_path = ''
as $$ select ceda_private.innovator_workspace_bootstrap() $$;

create or replace function public.innovator_create_draft(p_applicant_type text, p_sector_id uuid)
returns jsonb language sql security invoker set search_path = ''
as $$ select ceda_private.innovator_create_draft(p_applicant_type, p_sector_id) $$;

create or replace function public.innovator_save_draft(p_app_id uuid, p_current_step integer, p_form_data jsonb, p_expected_version integer)
returns jsonb language sql security invoker set search_path = ''
as $$ select ceda_private.innovator_save_draft(p_app_id, p_current_step, p_form_data, p_expected_version) $$;

create or replace function public.innovator_add_document(
  p_app_id uuid, p_section_key text, p_doc_kind text, p_title text, p_category text, p_description text,
  p_file_name text, p_mime_type text, p_file_size bigint, p_storage_path text default null,
  p_video_url text default null, p_password_protected boolean default false
)
returns jsonb language sql security invoker set search_path = ''
as $$ select ceda_private.innovator_add_document(p_app_id, p_section_key, p_doc_kind, p_title, p_category, p_description, p_file_name, p_mime_type, p_file_size, p_storage_path, p_video_url, p_password_protected) $$;

create or replace function public.innovator_remove_document(p_doc_id uuid)
returns jsonb language sql security invoker set search_path = ''
as $$ select ceda_private.innovator_remove_document(p_doc_id) $$;

create or replace function public.innovator_submit_application(p_app_id uuid, p_form_data jsonb, p_expected_version integer, p_idempotency_key text)
returns jsonb language sql security invoker set search_path = ''
as $$ select ceda_private.innovator_submit_application(p_app_id, p_form_data, p_expected_version, p_idempotency_key) $$;

create or replace function public.innovator_withdraw_application(p_app_id uuid, p_reason text)
returns jsonb language sql security invoker set search_path = ''
as $$ select ceda_private.innovator_withdraw_application(p_app_id, p_reason) $$;

create or replace function public.innovator_submit_clarification(p_app_id uuid, p_section_key text, p_updated_fields jsonb, p_response_note text, p_expected_version integer)
returns jsonb language sql security invoker set search_path = ''
as $$ select ceda_private.innovator_submit_clarification(p_app_id, p_section_key, p_updated_fields, p_response_note, p_expected_version) $$;

create or replace function public.innovator_send_message(p_application_id uuid, p_thread_type text, p_subject text, p_body text, p_attachment_name text default null, p_attachment_path text default null)
returns jsonb language sql security invoker set search_path = ''
as $$ select ceda_private.innovator_send_message(p_application_id, p_thread_type, p_subject, p_body, p_attachment_name, p_attachment_path) $$;

create or replace function public.innovator_mark_thread_read(p_application_id uuid default null, p_thread_type text default null)
returns void language sql security invoker set search_path = ''
as $$ select ceda_private.innovator_mark_thread_read(p_application_id, p_thread_type) $$;

create or replace function public.innovator_mark_notifications_read(p_notification_id uuid default null)
returns jsonb language sql security invoker set search_path = ''
as $$ select ceda_private.innovator_mark_notifications_read(p_notification_id) $$;

create or replace function public.innovator_create_support_request(p_kind text, p_title text, p_detail text, p_application_ref text default null, p_steps text default 'Not supplied')
returns jsonb language sql security invoker set search_path = ''
as $$ select ceda_private.innovator_create_support_request(p_kind, p_title, p_detail, p_application_ref, p_steps) $$;

create or replace function public.innovator_reply_support_request(p_reference text, p_message text)
returns jsonb language sql security invoker set search_path = ''
as $$ select ceda_private.innovator_reply_support_request(p_reference, p_message) $$;

create or replace function public.innovator_ask_optimus(p_question text, p_context_section text default 'general')
returns jsonb language sql security invoker set search_path = ''
as $$ select ceda_private.innovator_ask_optimus(p_question, p_context_section) $$;

create or replace function public.innovator_rate_optimus(p_interaction_id uuid, p_rating text)
returns jsonb language sql security invoker set search_path = ''
as $$ select ceda_private.innovator_rate_optimus(p_interaction_id, p_rating) $$;

create or replace function public.innovator_escalate_optimus(p_interaction_id uuid default null, p_summary text default 'Requested human support from Optimus Prime')
returns jsonb language sql security invoker set search_path = ''
as $$ select ceda_private.innovator_escalate_optimus(p_interaction_id, p_summary) $$;

create or replace function public.innovator_update_profile(
  p_full_name text, p_phone text, p_district text, p_expertise text,
  p_company_name text, p_company_reg_number text, p_company_sector text,
  p_company_role text, p_preferences jsonb
)
returns jsonb language sql security invoker set search_path = ''
as $$ select ceda_private.innovator_update_profile(p_full_name, p_phone, p_district, p_expertise, p_company_name, p_company_reg_number, p_company_sector, p_company_role, p_preferences) $$;

revoke all on function
  public.innovator_workspace_bootstrap(),
  public.innovator_create_draft(text,uuid),
  public.innovator_save_draft(uuid,integer,jsonb,integer),
  public.innovator_add_document(uuid,text,text,text,text,text,text,text,bigint,text,text,boolean),
  public.innovator_remove_document(uuid),
  public.innovator_submit_application(uuid,jsonb,integer,text),
  public.innovator_withdraw_application(uuid,text),
  public.innovator_submit_clarification(uuid,text,jsonb,text,integer),
  public.innovator_send_message(uuid,text,text,text,text,text),
  public.innovator_mark_thread_read(uuid,text),
  public.innovator_mark_notifications_read(uuid),
  public.innovator_create_support_request(text,text,text,text,text),
  public.innovator_reply_support_request(text,text),
  public.innovator_ask_optimus(text,text),
  public.innovator_rate_optimus(uuid,text),
  public.innovator_escalate_optimus(uuid,text),
  public.innovator_update_profile(text,text,text,text,text,text,text,text,jsonb)
from public, anon;

grant execute on function
  public.innovator_workspace_bootstrap(),
  public.innovator_create_draft(text,uuid),
  public.innovator_save_draft(uuid,integer,jsonb,integer),
  public.innovator_add_document(uuid,text,text,text,text,text,text,text,bigint,text,text,boolean),
  public.innovator_remove_document(uuid),
  public.innovator_submit_application(uuid,jsonb,integer,text),
  public.innovator_withdraw_application(uuid,text),
  public.innovator_submit_clarification(uuid,text,jsonb,text,integer),
  public.innovator_send_message(uuid,text,text,text,text,text),
  public.innovator_mark_thread_read(uuid,text),
  public.innovator_mark_notifications_read(uuid),
  public.innovator_create_support_request(text,text,text,text,text),
  public.innovator_reply_support_request(text,text),
  public.innovator_ask_optimus(text,text),
  public.innovator_rate_optimus(uuid,text),
  public.innovator_escalate_optimus(uuid,text),
  public.innovator_update_profile(text,text,text,text,text,text,text,text,jsonb)
to authenticated;
