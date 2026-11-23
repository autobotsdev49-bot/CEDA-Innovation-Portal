-- Reconcile Innovator evidence caps/validation and wire full Innovator <-> Admin communication across DB, Storage, Web, and Mobile.

-- 1. System Design Indexes (O(log n) lookups for Admin & Innovator queues)
create index if not exists idx_innovation_applications_status_submitted
  on public.innovation_applications (status, submitted_date desc, reference asc);

create index if not exists idx_portal_messages_app_created
  on public.portal_messages (application_id, created_at asc);

create index if not exists idx_application_documents_app_status
  on public.application_documents (application_id, upload_status, created_at desc);

create index if not exists idx_admin_matters_owner_reported
  on public.admin_matters (owner_id, reported_at desc);

-- 2. Reconcile Innovator document limits (12 applicant / 8 supplementary / 4 per other section)
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
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := ceda_private.require_innovator();
  app_row public.innovation_applications;
  existing_count integer;
  section_limit integer;
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

  section_limit := case p_section_key
    when 'applicant' then 12
    when 'supplementary' then 8
    else 4
  end;

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
    if existing_count >= section_limit then
      raise exception 'Maximum % supporting files allowed for this section', section_limit;
    end if;
  elsif p_doc_kind = 'supplemental' then
    if app_row.status <> 'Changes requested' then
      raise exception 'Supplemental evidence can only be uploaded when CEDA requests additional information';
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
      and doc_kind = 'supplemental' and upload_status = 'Saved';
    if existing_count >= section_limit then
      raise exception 'Maximum % supplemental files allowed for this section', section_limit;
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

create or replace function ceda_private.verify_innovation_document_answers()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  linked_section text;
  linked_source text;
  linked_doc text;
  pair record;
begin
  if new.status = 'Draft' then
    return new;
  end if;

  for pair in
    select * from (values
      ('problemSource', 'problemDocument', 'problem', 'Problem statement'),
      ('solutionSource', 'solutionDocument', 'problem', 'Proposed solution'),
      ('implementationSource', 'implementationDocument', 'feasibility', 'Implementation plan')
    ) as t(source_key, doc_key, section_key, label)
  loop
    linked_source := lower(coalesce(new.form_data ->> pair.source_key, 'write'));
    if linked_source = 'document' then
      linked_doc := btrim(coalesce(new.form_data ->> pair.doc_key, ''));
      if linked_doc !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
        raise exception 'Select a saved supporting file in % for %', pair.section_key, pair.label;
      end if;
      select d.section_key into linked_section
      from public.application_documents d
      where d.id = linked_doc::uuid
        and d.application_id = new.id
        and d.upload_status <> 'Removed';
      if linked_section is distinct from pair.section_key then
        raise exception 'Selected supporting file must belong to the % section', pair.section_key;
      end if;
    end if;
  end loop;

  return new;
end $$;

create or replace trigger check_innovation_document_answers
  before insert or update of status, form_data on public.innovation_applications
  for each row
  execute function ceda_private.verify_innovation_document_answers();

-- 3. Protected Admin read access for non-Draft private evidence in storage.objects
create or replace function ceda_private.admin_can_view_evidence(object_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null
    and exists (
      select 1
      from public.profiles p
      join auth.users u on u.id = p.id
      where p.id = auth.uid()
        and p.account_role = 'admin'
        and p.account_status = 'active'
        and u.email_confirmed_at is not null
        and not u.is_anonymous
        and (u.banned_until is null or u.banned_until < now())
    )
    and exists (
      select 1
      from auth.sessions s
      where s.user_id = auth.uid()
        and s.id::text = (auth.jwt() ->> 'session_id')
        and (s.not_after is null or s.not_after > now())
    )
    and (
      exists (
        select 1
        from public.application_documents d
        join public.innovation_applications a on a.id = d.application_id
        where d.storage_path = object_name
          and d.upload_status <> 'Removed'
          and a.status <> 'Draft'
      )
      or exists (
        select 1
        from public.portal_messages m
        left join public.innovation_applications a on a.id = m.application_id
        where m.attachment_path = object_name
          and (a.id is null or a.status <> 'Draft')
      )
    );
$$;

revoke all on function ceda_private.admin_can_view_evidence(text) from public, anon;
grant execute on function ceda_private.admin_can_view_evidence(text) to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects' and policyname = 'innovation_evidence_admin_select'
  ) then
    create policy innovation_evidence_admin_select on storage.objects
      for select to authenticated
      using (
        bucket_id = 'innovation-evidence'
        and ((select auth.jwt()) ->> 'is_anonymous') = 'false'
        and ceda_private.admin_can_view_evidence(name)
      );
  end if;
end $$;

-- 4. Rich Admin Application Visibility (excludes private unsubmitted Drafts)
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
        'summary', a.summary,
        'version', a.version,
        'reassessmentRequired', a.reassessment_required,
        'hasOwner', (a.owner_id is not null),
        'original', a.original_snapshot,
        'formData', a.form_data,
        'requestedChanges', a.requested_changes,
        'outcomeData', a.outcome_data,
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

-- 5. Sync form_data & notify Innovator on Admin submission correction
create or replace function ceda_private.admin_revise_application(
  app_ref text,
  new_title text,
  new_applicant text,
  new_sector text,
  new_summary text,
  expected_version integer,
  reason text
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
  before_snap jsonb;
  after_snap jsonb;
  new_entry jsonb;
  next_form_data jsonb;
  next_original jsonb;
  matched_sector_id uuid;
  now_bw text := to_char(now() at time zone 'Africa/Gaborone', 'YYYY-MM-DD HH24:MI');
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
  if current_row.status = 'Draft' then raise exception 'Cannot revise an unsubmitted draft'; end if;
  if expected_version is not null and current_row.version <> expected_version then
    raise exception 'Application has been updated by another session. Refresh and try again.';
  end if;

  select coalesce(p.full_name, 'Administrator') into actor_name from public.profiles p where p.id = actor;
  select s.id into matched_sector_id from public.sectors s where lower(s.name) = lower(btrim(new_sector)) limit 1;

  before_snap := jsonb_build_object(
    'title', current_row.title,
    'applicant', current_row.applicant,
    'sector', current_row.sector,
    'summary', current_row.summary
  );
  after_snap := jsonb_build_object(
    'title', btrim(new_title),
    'applicant', btrim(new_applicant),
    'sector', btrim(new_sector),
    'summary', btrim(new_summary)
  );
  next_original := case
    when current_row.original_snapshot = '{}'::jsonb then coalesce(current_row.form_data, '{}'::jsonb) || before_snap
    else current_row.original_snapshot
  end;
  next_form_data := coalesce(current_row.form_data, '{}'::jsonb) || jsonb_strip_nulls(jsonb_build_object(
    'title', btrim(new_title),
    'summary', btrim(new_summary),
    'primarySector', btrim(new_sector),
    'companyName', case when current_row.applicant_type = 'Registered company' then btrim(new_applicant) else null end,
    'fullName', case when current_row.applicant_type = 'Individual' then btrim(new_applicant) else null end
  ));

  new_entry := jsonb_build_object(
    'type', 'Admin submission correction',
    'actor', actor_name,
    'reason', btrim(reason),
    'at', now_bw,
    'before', before_snap,
    'after', after_snap
  );

  update public.innovation_applications
  set title = btrim(new_title),
      applicant = btrim(new_applicant),
      sector = btrim(new_sector),
      sector_id = coalesce(matched_sector_id, current_row.sector_id),
      summary = btrim(new_summary),
      form_data = next_form_data,
      version = current_row.version + 1,
      reassessment_required = true,
      original_snapshot = next_original,
      history = current_row.history || jsonb_build_array(new_entry),
      applicant_timeline = current_row.applicant_timeline || jsonb_build_array(
        jsonb_build_object(
          'label', 'Application record corrected',
          'detail', 'CEDA recorded a technical correction on "' || btrim(new_title) || '". Original submitted details remain preserved.',
          'at', now_bw
        )
      ),
      updated_at = now()
  where id = current_row.id;

  if current_row.owner_id is not null then
    insert into public.innovator_notifications(user_id, kind, title, message, application_ref, target_hash)
    values (
      current_row.owner_id,
      'status',
      current_row.reference || ' — Application details updated',
      'CEDA updated application metadata (' || left(btrim(reason), 160) || '). Your original submitted snapshot remains preserved.',
      current_row.reference,
      '#applications'
    );

    insert into public.notification_queue(idempotency_key, category, title, message, channel, audience, status, action_target, created_by)
    values (
      'rev-' || current_row.reference || '-v' || (current_row.version + 1)::text,
      'Application correction',
      'Application revised: ' || current_row.reference,
      'Administrator updated application details. Note: ' || left(btrim(reason), 240),
      'In-app',
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
    'application.revised',
    current_row.reference,
    jsonb_build_object('before', before_snap, 'after', after_snap, 'version', current_row.version + 1, 'reason', btrim(reason))
  );

  return ceda_private.admin_applications();
end $$;

-- 6. Status Intervention (extended companion RPC + backward-compatible 5-arg wrapper)
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

  sec_key := lower(coalesce(nullif(btrim(p_section_key), ''), 'general'));
  if sec_key not in ('applicant','problem','impact','feasibility','supplementary','clarification','general') then
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
    when 'Approved' then 'Outcome available'
    when 'Rejected' then 'Outcome available'
    else 'Application received'
  end;

  safe_event := jsonb_build_object(
    'label', safe_label,
    'detail', case
      when new_status = 'In review' then 'Your submission is now under assessment.'
      when new_status = 'Changes requested' then 'CEDA requested additional information (' || sec_label || ').'
      when new_status in ('Approved','Rejected') then 'An authorized outcome has been released.'
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
  if new_status in ('Approved','Rejected') then
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
  end if;

  update public.innovation_applications
  set status = new_status,
      version = current_row.version + 1,
      history = current_row.history || jsonb_build_array(new_entry),
      applicant_timeline = current_row.applicant_timeline || jsonb_build_array(safe_event),
      requested_changes = next_requested,
      outcome_data = next_outcome,
      updated_at = now()
  where id = current_row.id;

  if current_row.owner_id is not null then
    insert into public.innovator_notifications(user_id, kind, title, message, application_ref, target_hash)
    values (
      current_row.owner_id,
      case when new_status in ('Approved','Rejected') then 'outcome' when new_status = 'Changes requested' then 'clarification' else 'status' end,
      current_row.reference || ' — ' || safe_label,
      case when new_status = 'Changes requested' then clean_feedback else safe_event->>'detail' end,
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
    elsif new_status in ('Approved','Rejected') then
      insert into public.portal_messages(
        owner_id, application_id, application_ref, thread_type, subject,
        sender_id, sender_name, sender_role, body, is_read_by_innovator
      )
      values (
        current_row.owner_id, current_row.id, current_row.reference, 'application',
        current_row.reference || ' — Outcome released (' || new_status || ')',
        actor, actor_name, 'admin',
        next_outcome->>'feedback',
        false
      );
    end if;

    insert into public.notification_queue(idempotency_key, category, title, message, channel, audience, status, action_target, created_by)
    values (
      'st-' || current_row.reference || '-v' || (current_row.version + 1)::text,
      case when new_status in ('Approved','Rejected') then 'Outcome released' when new_status = 'Changes requested' then 'Clarification requested' else 'Status update' end,
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

revoke all on function ceda_private.admin_intervene_application_status_ext(text,text,integer,boolean,text,text,text,text) from public, anon;
grant execute on function ceda_private.admin_intervene_application_status_ext(text,text,integer,boolean,text,text,text,text) to authenticated;

create or replace function public.admin_intervene_application_status_ext(
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
language sql
security invoker
set search_path = ''
as $$ select ceda_private.admin_intervene_application_status_ext(app_ref, new_status, expected_version, confirmed, reason, p_section_key, p_deadline, p_outcome_feedback) $$;

revoke all on function public.admin_intervene_application_status_ext(text,text,integer,boolean,text,text,text,text) from public, anon;
grant execute on function public.admin_intervene_application_status_ext(text,text,integer,boolean,text,text,text,text) to authenticated;

create or replace function ceda_private.admin_intervene_application_status(
  app_ref text,
  new_status text,
  expected_version integer,
  confirmed boolean,
  reason text
)
returns jsonb
language sql
security definer
set search_path = ''
as $$ select ceda_private.admin_intervene_application_status_ext(app_ref, new_status, expected_version, confirmed, reason, 'general', null, null) $$;

-- 7. Direct Admin message reply on Innovator application thread
create or replace function ceda_private.admin_reply_application_message(
  app_ref text,
  reply_body text,
  thread_kind text default 'application'
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
  clean_kind text;
begin
  if app_ref is null or reply_body is null or length(btrim(reply_body)) not between 2 and 4000 then
    raise exception 'Enter a reply between 2 and 4000 characters';
  end if;
  clean_kind := lower(coalesce(nullif(btrim(thread_kind), ''), 'application'));
  if clean_kind not in ('application','clarification') then
    clean_kind := 'application';
  end if;

  select * into current_row from public.innovation_applications where reference = btrim(app_ref) for update;
  if not found then raise exception 'Application not found'; end if;
  if current_row.status = 'Draft' then raise exception 'Cannot message an unsubmitted draft'; end if;
  if current_row.owner_id is null then
    raise exception 'This sample application is not linked to a registered innovator account';
  end if;

  select coalesce(p.full_name, 'CEDA Administrator') into actor_name from public.profiles p where p.id = actor;

  insert into public.portal_messages(
    owner_id, application_id, application_ref, thread_type, subject,
    sender_id, sender_name, sender_role, body, is_read_by_innovator
  )
  values (
    current_row.owner_id,
    current_row.id,
    current_row.reference,
    clean_kind,
    current_row.reference || ' — CEDA Update',
    actor,
    actor_name,
    'admin',
    btrim(reply_body),
    false
  );

  insert into public.innovator_notifications(user_id, kind, title, message, application_ref, target_hash)
  values (
    current_row.owner_id,
    'message',
    current_row.reference || ' — New message from CEDA',
    left(btrim(reply_body), 180),
    current_row.reference,
    '#messages'
  );

  insert into public.admin_audit(actor_id, action, target, detail)
  values (
    actor,
    'application.message.sent',
    current_row.reference,
    jsonb_build_object('thread', clean_kind, 'reason', left(btrim(reply_body), 200))
  );

  return ceda_private.admin_applications();
end $$;

revoke all on function ceda_private.admin_reply_application_message(text,text,text) from public, anon;
grant execute on function ceda_private.admin_reply_application_message(text,text,text) to authenticated;

create or replace function public.admin_reply_application_message(
  app_ref text,
  reply_body text,
  thread_kind text default 'application'
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$ select ceda_private.admin_reply_application_message(app_ref, reply_body, thread_kind) $$;

revoke all on function public.admin_reply_application_message(text,text,text) from public, anon;
grant execute on function public.admin_reply_application_message(text,text,text) to authenticated;

-- 8. Support Matters / Tickets: Admin sees Innovator threads & replies reach Innovator directly
create or replace function ceda_private.admin_matters_list()
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
        'id', m.reference,
        'title', m.title,
        'kind', m.kind,
        'reporter', m.reporter,
        'priority', m.priority,
        'state', m.state,
        'owner', m.owner_name,
        'hasOwner', (m.owner_id is not null),
        'reported', to_char(m.reported_at at time zone 'Africa/Gaborone', 'YYYY-MM-DD HH24:MI'),
        'updatedAt', to_char(m.updated_at at time zone 'Africa/Gaborone', 'YYYY-MM-DD HH24:MI'),
        'application', m.application_ref,
        'detail', m.detail,
        'steps', m.steps,
        'thread', m.thread_messages,
        'history', m.history
      ) order by m.reported_at desc, m.reference asc
    )
    from public.admin_matters m
  ), '[]'::jsonb);
end $$;

create or replace function ceda_private.admin_update_matter_with_reply(
  matter_ref text,
  new_owner text,
  new_state text,
  reason text,
  reply_message text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := ceda_private.require_admin();
  actor_name text;
  current_matter public.admin_matters;
  action_note text;
  history_entry jsonb;
  next_thread jsonb;
  clean_reply text := nullif(btrim(coalesce(reply_message, '')), '');
  now_bw text := to_char(now() at time zone 'Africa/Gaborone', 'YYYY-MM-DD HH24:MI');
  linked_app_id uuid;
begin
  if matter_ref is null or new_owner is null or length(btrim(new_owner)) not between 2 and 120
    or new_state is null or new_state not in ('Open','Investigating','Waiting','Resolved')
    or reason is null or length(btrim(reason)) not between 5 and 500 then
    raise exception 'Provide valid owner, status and reason (5-500 characters)';
  end if;
  if clean_reply is not null and length(clean_reply) not between 2 and 2000 then
    raise exception 'Reply message must be between 2 and 2000 characters';
  end if;

  select * into current_matter from public.admin_matters where reference = btrim(matter_ref) for update;
  if not found then raise exception 'Matter not found'; end if;

  select coalesce(p.full_name, 'Administrator') into actor_name from public.profiles p where p.id = actor;
  action_note := format('Owner: %s to %s; status: %s to %s. %s', current_matter.owner_name, btrim(new_owner), current_matter.state, new_state, btrim(reason));
  history_entry := jsonb_build_object(
    'actor', actor_name,
    'action', action_note,
    'at', now_bw
  );

  next_thread := coalesce(current_matter.thread_messages, '[]'::jsonb);
  if clean_reply is not null then
    next_thread := next_thread || jsonb_build_array(
      jsonb_build_object('sender', actor_name, 'role', 'admin', 'body', clean_reply, 'at', now_bw)
    );
  elsif new_state <> current_matter.state then
    next_thread := next_thread || jsonb_build_array(
      jsonb_build_object('sender', actor_name, 'role', 'system', 'body', 'Support ticket status updated to ' || new_state || ' (Assigned to ' || btrim(new_owner) || ').', 'at', now_bw)
    );
  end if;

  update public.admin_matters
  set owner_name = btrim(new_owner),
      state = new_state,
      thread_messages = next_thread,
      history = current_matter.history || jsonb_build_array(history_entry),
      updated_at = now()
  where id = current_matter.id;

  if current_matter.owner_id is not null and (clean_reply is not null or new_state <> current_matter.state) then
    if current_matter.application_ref is not null then
      select id into linked_app_id from public.innovation_applications
      where reference = current_matter.application_ref and owner_id = current_matter.owner_id limit 1;
    end if;

    insert into public.innovator_notifications(user_id, kind, title, message, application_ref, target_hash)
    values (
      current_matter.owner_id,
      'support',
      current_matter.reference || ' — Support ticket updated (' || new_state || ')',
      coalesce(left(clean_reply, 180), 'Assigned to ' || btrim(new_owner) || '. Status: ' || new_state || '.'),
      current_matter.application_ref,
      case when current_matter.title = 'Human support follow-up from Optimus Prime' then '#optimus' else '#support' end
    );

    if clean_reply is not null then
      insert into public.portal_messages(
        owner_id, application_id, application_ref, thread_type, subject,
        sender_id, sender_name, sender_role, body, is_read_by_innovator
      )
      values (
        current_matter.owner_id,
        linked_app_id,
        current_matter.application_ref,
        'support',
        current_matter.reference || ' — ' || current_matter.title,
        actor,
        actor_name,
        'admin',
        clean_reply,
        false
      );
    end if;
  end if;

  insert into public.admin_audit(actor_id, action, target, detail)
  values (
    actor,
    'matter.updated',
    current_matter.reference,
    jsonb_build_object(
      'before_owner', current_matter.owner_name,
      'after_owner', btrim(new_owner),
      'before_state', current_matter.state,
      'after_state', new_state,
      'replied', (clean_reply is not null),
      'reason', btrim(reason)
    )
  );

  return ceda_private.admin_matters_list();
end $$;

revoke all on function ceda_private.admin_update_matter_with_reply(text,text,text,text,text) from public, anon;
grant execute on function ceda_private.admin_update_matter_with_reply(text,text,text,text,text) to authenticated;

create or replace function public.admin_update_matter_with_reply(
  matter_ref text,
  new_owner text,
  new_state text,
  reason text,
  reply_message text default null
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$ select ceda_private.admin_update_matter_with_reply(matter_ref, new_owner, new_state, reason, reply_message) $$;

revoke all on function public.admin_update_matter_with_reply(text,text,text,text,text) from public, anon;
grant execute on function public.admin_update_matter_with_reply(text,text,text,text,text) to authenticated;

create or replace function ceda_private.admin_update_matter(
  matter_ref text,
  new_owner text,
  new_state text,
  reason text
)
returns jsonb
language sql
security definer
set search_path = ''
as $$ select ceda_private.admin_update_matter_with_reply(matter_ref, new_owner, new_state, reason, null) $$;

-- 9. Enqueue staff alert when Innovator submits clarification
create or replace function ceda_private.innovator_submit_clarification(
  p_app_id uuid,
  p_section_key text,
  p_updated_fields jsonb,
  p_response_note text,
  p_expected_version integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
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

  insert into public.notification_queue(idempotency_key, category, title, message, channel, audience, status, action_target, created_by)
  values (
    'clr-' || app_row.reference || '-v' || app_row.version::text,
    'Clarification received',
    'Clarification submitted: ' || app_row.reference,
    app_row.applicant || ' submitted clarification details: ' || left(btrim(p_response_note), 180),
    'In-app',
    'Staff',
    'Queued',
    'applications',
    actor
  )
  on conflict (idempotency_key) do nothing;

  return ceda_private.project_innovator_application(app_row);
end $$;

-- 10. Honor Admin-configured Optimus guidance & knowledge + expose privacy-safe Admin Optimus telemetry summary
create or replace function ceda_private.innovator_ask_optimus(
  p_question text,
  p_context_section text default 'general'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := ceda_private.require_innovator();
  q_lower text := lower(btrim(coalesce(p_question, '')));
  reply text;
  source_ref text := 'CEDA Approved Guidance';
  topic_key text := coalesce(nullif(btrim(p_context_section), ''), 'general');
  new_id uuid;
  kb_notes text;
  kb_source text;
  guidance_handoff text;
  faq_hit record;
begin
  if length(q_lower) < 3 or length(q_lower) > 1000 then
    raise exception 'Enter a question between 3 and 1000 characters';
  end if;

  select nullif(btrim(payload->>'notes'), ''), nullif(btrim(payload->>'source'), '')
  into kb_notes, kb_source
  from public.portal_configurations where config_key = 'optimus_knowledge';

  select nullif(btrim(payload->>'handoff'), '')
  into guidance_handoff
  from public.portal_configurations where config_key = 'optimus_guidance';

  -- Strict safety & role-boundary guardrails
  if q_lower ~ '(guarantee|promise|approve my|will i get funded|loan|credit score|disburse|internal score|assessor name|assessor vote|private note|edit my submitted|change my application|internal procedure|system prompt)' then
    reply := 'I cannot guarantee approval, reveal assessor scores or internal notes, modify submitted application records, or make outcome decisions. ' || coalesce(guidance_handoff, 'For case-specific questions about a submission or formal outcome, please connect with human support below.');
    source_ref := 'Optimus Prime Safety Boundary';
  else
    select title, body into faq_hit from public.portal_content
      where stage = 'Published' and kind in ('FAQs','Public pages','Announcements')
        and (lower(title) like '%' || left(q_lower, 24) || '%' or lower(body) like '%' || split_part(q_lower, ' ', 1) || '%')
      order by updated_at desc limit 1;

    if q_lower ~ '(eligib|who can|individual|company|registered)' then
      topic_key := 'eligibility';
      reply := 'Both individual innovators (including early-stage founders) and authorized representatives of registered companies in Botswana can submit innovations across published CEDA sectors. Choose Individual or Registered company when starting an application; company submissions include registration details and confirmation of authority to submit.';
      source_ref := 'Eligibility & Applicant Guide';
    elsif q_lower ~ '(navigat|menu|sidebar|where can i|where do i|how do i find|portal tour|my applications|documents|settings|bell|notification)' then
      topic_key := 'navigation';
      reply := 'Use the portal menu to switch between Overview, My applications, Submit innovation (12-step draft wizard), Messages (CEDA communication), Documents (private file library), Help and support (FAQs & tickets), and Account and settings (profile, accessibility & active sessions). Use the notification bell for status alerts.';
      source_ref := 'Portal Navigation Guide';
    elsif q_lower ~ '(evidence|file|upload|pdf|video|size|format|attachment|document)' then
      topic_key := 'evidence';
      reply := 'You can upload up to 12 supporting files in Applicant & eligibility, 8 in Supplementary evidence, and 4 in each other section (maximum 10 MB each) in PDF, DOCX, PPTX, XLSX, JPG, or PNG format. Video demonstrations should be shared as HTTPS links rather than direct uploads.';
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
      reply := coalesce(kb_notes, 'You can ask me about portal navigation, eligibility (Individual vs Registered company), the 12 application sections, supporting evidence limits (12/8/4 files per section, 10 MB max, HTTPS video links), or what application statuses mean.')
        || case when kb_source is not null then ' (Reference: ' || kb_source || ')' else '' end
        || ' ' || coalesce(guidance_handoff, 'If you need help with a specific case, request human support to open a ticket with a CEDA Support Officer.');
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

create or replace function ceda_private.admin_optimus_overview()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform ceda_private.require_admin();
  return jsonb_build_object(
    'totalInteractions', (select count(*)::int from public.optimus_interactions),
    'escalatedCount', (select count(*)::int from public.optimus_interactions where escalated),
    'helpfulCount', (select count(*)::int from public.optimus_interactions where rating = 'helpful'),
    'unhelpfulCount', (select count(*)::int from public.optimus_interactions where rating = 'unhelpful'),
    'topics', coalesce((
      select jsonb_agg(jsonb_build_object('topic', t.topic, 'count', t.cnt) order by t.cnt desc, t.topic asc)
      from (
        select topic, count(*)::int as cnt
        from public.optimus_interactions
        group by topic
        limit 8
      ) t
    ), '[]'::jsonb)
  );
end $$;

revoke all on function ceda_private.admin_optimus_overview() from public, anon;
grant execute on function ceda_private.admin_optimus_overview() to authenticated;

create or replace function public.admin_optimus_overview()
returns jsonb
language sql
security invoker
set search_path = ''
as $$ select ceda_private.admin_optimus_overview() $$;

revoke all on function public.admin_optimus_overview() from public, anon;
grant execute on function public.admin_optimus_overview() to authenticated;
