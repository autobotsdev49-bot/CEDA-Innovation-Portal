-- Replace evidence metadata in one transaction. If validation or insertion fails,
-- the removal rolls back and the original document remains available.
create or replace function ceda_private.innovator_replace_document(
  p_replace_doc_id uuid, p_app_id uuid, p_section_key text, p_doc_kind text,
  p_title text, p_category text, p_description text, p_file_name text,
  p_mime_type text, p_file_size bigint, p_storage_path text,
  p_video_url text default null, p_password_protected boolean default false
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare result jsonb;
begin
  if not exists (
    select 1 from public.application_documents d
    where d.id = p_replace_doc_id and d.application_id = p_app_id
      and d.section_key = p_section_key and d.upload_status = 'Saved'
      and d.owner_id = ceda_private.require_innovator()
  ) then
    raise exception 'Original evidence item not found in this section';
  end if;
  perform ceda_private.innovator_remove_document(p_replace_doc_id);
  result := ceda_private.innovator_add_document(
    p_app_id,p_section_key,p_doc_kind,p_title,p_category,p_description,
    p_file_name,p_mime_type,p_file_size,p_storage_path,p_video_url,p_password_protected
  );
  return result;
end; $$;
create or replace function public.innovator_replace_document(
  p_replace_doc_id uuid, p_app_id uuid, p_section_key text, p_doc_kind text,
  p_title text, p_category text, p_description text, p_file_name text,
  p_mime_type text, p_file_size bigint, p_storage_path text,
  p_video_url text default null, p_password_protected boolean default false
) returns jsonb language sql security invoker set search_path = '' as $$
  select ceda_private.innovator_replace_document(p_replace_doc_id,p_app_id,p_section_key,p_doc_kind,p_title,p_category,p_description,p_file_name,p_mime_type,p_file_size,p_storage_path,p_video_url,p_password_protected)
$$;
revoke all on function ceda_private.innovator_replace_document(uuid,uuid,text,text,text,text,text,text,text,bigint,text,text,boolean) from public, anon;
grant execute on function ceda_private.innovator_replace_document(uuid,uuid,text,text,text,text,text,text,text,bigint,text,text,boolean) to authenticated;
revoke all on function public.innovator_replace_document(uuid,uuid,text,text,text,text,text,text,text,bigint,text,text,boolean) from public, anon;
grant execute on function public.innovator_replace_document(uuid,uuid,text,text,text,text,text,text,text,bigint,text,text,boolean) to authenticated;
