-- The submission RPC already checks short narrative answers. This trigger
-- additionally verifies document-backed answers against saved private files.
create or replace function ceda_private.verify_innovation_document_answers()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  answer_key text;
  document_key text;
  expected_section text;
begin
  if new.status <> 'Submitted' or old.status <> 'Draft' then
    return new;
  end if;

  if (coalesce(new.form_data->>'alternativeContactName', '') <> ''
      or coalesce(new.form_data->>'alternativeContactPhone', '') <> ''
      or coalesce(new.form_data->>'alternativeContactRelationship', '') <> '')
     and (length(btrim(coalesce(new.form_data->>'alternativeContactName', ''))) < 2
          or length(btrim(coalesce(new.form_data->>'alternativeContactPhone', ''))) < 6
          or coalesce(new.form_data->>'alternativeContactConsent', '') <> 'true') then
    raise exception 'Complete the alternative contact and confirm their agreement, or leave it blank';
  end if;

  foreach answer_key in array array['problem', 'solution', 'implementation'] loop
    document_key := answer_key || 'Document';
    expected_section := case when answer_key = 'implementation' then 'feasibility' else 'problem' end;

    if new.form_data->>(answer_key || 'Source') = 'document' and not exists (
      select 1 from public.application_documents d
      where d.application_id = new.id
        and d.owner_id = new.owner_id
        and d.section_key = expected_section
        and d.doc_kind = 'file'
        and d.upload_status = 'Saved'
        and d.id::text = new.form_data->>document_key
    ) then
      raise exception 'Select an uploaded document for your % answer before submitting', answer_key;
    end if;
  end loop;
  return new;
end;
$$;

drop trigger if exists verify_innovation_document_answers on public.innovation_applications;
create trigger verify_innovation_document_answers
before update of status on public.innovation_applications
for each row execute function ceda_private.verify_innovation_document_answers();
