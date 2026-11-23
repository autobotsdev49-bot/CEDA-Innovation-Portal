-- Extend the applicant and finance evidence capacity without changing file size, owner checks, or private storage policy.
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
    if existing_count >= (case p_section_key when 'applicant' then 12 when 'supplementary' then 8 else 4 end) then
      raise exception 'Maximum supporting files reached for this section';
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
end; $$;
