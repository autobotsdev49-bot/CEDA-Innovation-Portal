-- Keep innovation_applications.sector_id synchronized with primarySector/sector across draft saves, submission, and existing applicant submissions.
update public.innovation_applications a
set sector_id = s.id,
    sector = s.name
from public.sectors s
where a.owner_id is not null
  and s.status <> 'archived'
  and lower(btrim(s.name)) = lower(btrim(coalesce(nullif(a.form_data->>'primarySector', ''), a.sector)))
  and (a.sector_id is distinct from s.id or a.sector is distinct from s.name);

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
  matched_sector record;
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
  select s.id, s.name into matched_sector
  from public.sectors s
  where lower(btrim(s.name)) = lower(btrim(next_sector))
    and s.status <> 'archived'
  limit 1;
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
      sector = coalesce(matched_sector.name, next_sector),
      sector_id = coalesce(matched_sector.id, app_row.sector_id),
      applicant = next_applicant,
      version = app_row.version + 1,
      updated_at = now()
  where id = app_row.id
  returning * into app_row;

  return ceda_private.project_innovator_application(app_row);
end $$;

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
  next_sector text;
  matched_sector record;
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
  next_sector := coalesce(nullif(left(btrim(coalesce(merged->>'primarySector', '')), 100), ''), app_row.sector);
  select s.id, s.name into matched_sector
  from public.sectors s
  where lower(btrim(s.name)) = lower(btrim(next_sector))
    and s.status <> 'archived'
  limit 1;
  next_applicant := case when next_type = 'Registered company' then left(btrim(merged->>'companyName'), 200)
    else coalesce(nullif(left(btrim(coalesce(merged->>'fullName', '')), 200), ''), app_row.applicant) end;
  receipt_str := 'RCPT-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
  now_bw := to_char(now() at time zone 'Africa/Gaborone', 'YYYY-MM-DD HH24:MI');

  update public.innovation_applications
  set status = 'Submitted',
      applicant_type = next_type,
      title = next_title,
      summary = next_summary,
      sector = coalesce(matched_sector.name, next_sector),
      sector_id = coalesce(matched_sector.id, app_row.sector_id),
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
