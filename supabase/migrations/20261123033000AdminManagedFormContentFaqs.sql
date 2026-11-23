-- Admin-managed Application Form configuration, Accompanying Copies, Content uploads/deletions,
-- FAQs & Official Botswana Regulatory Authority Contacts directory.

-- 1. Extend portal_content for downloadable forms, accompanying copies & regulatory authority contacts
do $$
declare
  c record;
begin
  for c in
    select conname
    from pg_constraint
    where conrelid = 'public.portal_content'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%kind%'
  loop
    execute format('alter table public.portal_content drop constraint if exists %I', c.conname);
  end loop;
end $$;

alter table public.portal_content
  add constraint portal_content_kind_check
  check (kind in (
    'Public pages',
    'FAQs',
    'Announcements',
    'Partners',
    'Application form',
    'Accompanying copies',
    'Regulatory contacts'
  ));

alter table public.portal_content
  add column if not exists attachment_name text,
  add column if not exists attachment_mime text,
  add column if not exists attachment_size bigint,
  add column if not exists attachment_path text,
  add column if not exists external_url text,
  add column if not exists authority_code text,
  add column if not exists contact_details jsonb;

-- 2. Extend portal_configurations to support application_form_config
do $$
declare
  c record;
begin
  for c in
    select conname
    from pg_constraint
    where conrelid = 'public.portal_configurations'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%config_key%'
  loop
    execute format('alter table public.portal_configurations drop constraint if exists %I', c.conname);
  end loop;
end $$;

alter table public.portal_configurations
  add constraint portal_configurations_config_key_check
  check (config_key in (
    'optimus_guidance',
    'optimus_knowledge',
    'portal_policies',
    'application_form_config'
  ));

-- 3. Public-read / Admin-write storage bucket for portal forms, templates & accompanying guides
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'portal-documents',
  'portal-documents',
  true,
  10485760,
  array[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain',
    'text/csv',
    'image/png',
    'image/jpeg'
  ]
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create or replace function ceda_private.is_active_admin()
returns boolean
language sql
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    join auth.users u on u.id = p.id
    join auth.sessions s on s.user_id = p.id
    where p.id = auth.uid()
      and p.account_role = 'admin'
      and p.account_status = 'active'
      and u.email_confirmed_at is not null
      and not u.is_anonymous
      and (u.banned_until is null or u.banned_until < now())
      and s.id::text = (auth.jwt() ->> 'session_id')
      and (s.not_after is null or s.not_after > now())
  );
$$;

revoke all on function ceda_private.is_active_admin() from public, anon;
grant execute on function ceda_private.is_active_admin() to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects' and policyname = 'portal_documents_public_read'
  ) then
    create policy portal_documents_public_read on storage.objects
      for select to public
      using (bucket_id = 'portal-documents');
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects' and policyname = 'portal_documents_admin_insert'
  ) then
    create policy portal_documents_admin_insert on storage.objects
      for insert to authenticated
      with check (
        bucket_id = 'portal-documents'
        and ((select auth.jwt()) ->> 'is_anonymous') = 'false'
        and name not like '%..%'
        and ceda_private.is_active_admin()
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects' and policyname = 'portal_documents_admin_update'
  ) then
    create policy portal_documents_admin_update on storage.objects
      for update to authenticated
      using (
        bucket_id = 'portal-documents'
        and ((select auth.jwt()) ->> 'is_anonymous') = 'false'
        and ceda_private.is_active_admin()
      )
      with check (
        bucket_id = 'portal-documents'
        and ((select auth.jwt()) ->> 'is_anonymous') = 'false'
        and name not like '%..%'
        and ceda_private.is_active_admin()
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects' and policyname = 'portal_documents_admin_delete'
  ) then
    create policy portal_documents_admin_delete on storage.objects
      for delete to authenticated
      using (
        bucket_id = 'portal-documents'
        and ((select auth.jwt()) ->> 'is_anonymous') = 'false'
        and ceda_private.is_active_admin()
      );
  end if;
end $$;

-- 4. Seed default application_form_config
insert into public.portal_configurations (config_key, payload, version, reason)
values (
  'application_form_config',
  jsonb_build_object(
    'formTitle', 'CEDA Innovation Portal — Official Submission Form',
    'formVersion', '2026.1',
    'introGuidance', 'Complete all required sections and upload relevant accompanying copies matched to your innovation stage.',
    'maxEvidenceFileMb', 15,
    'maxVideoUrlNote', 'Share product demos or pitch videos as HTTPS links (YouTube, Vimeo, or cloud drive preview links).',
    'steps', jsonb_build_array(
      jsonb_build_object('stepNumber', 1, 'key', 'applicant', 'title', 'Applicant & organisation', 'description', 'Applicant identity, Botswana district and company details when applicable.', 'enabled', true, 'mandatoryFields', jsonb_build_array('applicantType')),
      jsonb_build_object('stepNumber', 2, 'key', 'overview', 'title', 'Innovation overview', 'description', 'Title, primary sector, innovation stage and executive summary.', 'enabled', true, 'mandatoryFields', jsonb_build_array('title', 'primarySector', 'innovationStage', 'summary')),
      jsonb_build_object('stepNumber', 3, 'key', 'problem', 'title', 'Problem & need', 'description', 'Clear problem statement, target beneficiaries and market evidence in Botswana.', 'enabled', true, 'mandatoryFields', jsonb_build_array('problem')),
      jsonb_build_object('stepNumber', 4, 'key', 'solution', 'title', 'Proposed solution', 'description', 'Solution description, innovation novelty and differentiation.', 'enabled', true, 'mandatoryFields', jsonb_build_array('solution')),
      jsonb_build_object('stepNumber', 5, 'key', 'implementation', 'title', 'Implementation readiness', 'description', 'Delivery approach, execution plan and rollout milestones.', 'enabled', true, 'mandatoryFields', jsonb_build_array('implementationApproach')),
      jsonb_build_object('stepNumber', 6, 'key', 'commercial', 'title', 'Market & sustainability', 'description', 'Revenue model, pricing, unit economics and long-term viability.', 'enabled', true, 'mandatoryFields', jsonb_build_array()),
      jsonb_build_object('stepNumber', 7, 'key', 'regulatory', 'title', 'IP & regulatory compliance', 'description', 'IP ownership status and approvals needed from Botswana regulatory authorities.', 'enabled', true, 'mandatoryFields', jsonb_build_array()),
      jsonb_build_object('stepNumber', 8, 'key', 'impact', 'title', 'Impact & jobs', 'description', 'Projected employment creation, citizen empowerment and socioeconomic impact.', 'enabled', true, 'mandatoryFields', jsonb_build_array()),
      jsonb_build_object('stepNumber', 9, 'key', 'financials', 'title', 'Financial request & funding', 'description', 'Funding amount sought, use of funds and financial readiness.', 'enabled', true, 'mandatoryFields', jsonb_build_array()),
      jsonb_build_object('stepNumber', 10, 'key', 'risks', 'title', 'Risks & mitigation', 'description', 'Key operational, technical, financial and regulatory risks and mitigations.', 'enabled', true, 'mandatoryFields', jsonb_build_array()),
      jsonb_build_object('stepNumber', 11, 'key', 'evidence', 'title', 'Accompanying copies & verification', 'description', 'Upload applicant verification records and supporting copies matching your stage.', 'enabled', true, 'mandatoryFields', jsonb_build_array()),
      jsonb_build_object('stepNumber', 12, 'key', 'review', 'title', 'Review & declarations', 'description', 'Confirm authorship permission, accuracy and privacy notices before submission.', 'enabled', true, 'mandatoryFields', jsonb_build_array('permissionToSubmit', 'accuracyConfirmed', 'privacyConfirmed'))
    ),
    'requiredDocuments', jsonb_build_array(
      jsonb_build_object('id', 'doc_identity', 'label', 'Omang / National ID or Passport copy', 'category', 'Applicant verification', 'required', true, 'appliesTo', 'All applicants', 'maxSizeMb', 5, 'acceptedFormats', 'PDF, JPG, PNG', 'guidance', 'Clear readable copy of the lead applicant''s Omang or passport.'),
      jsonb_build_object('id', 'doc_cipa', 'label', 'CIPA Company Extract / Certificate of Incorporation', 'category', 'Registered entity copies', 'required', false, 'appliesTo', 'Registered companies', 'maxSizeMb', 10, 'acceptedFormats', 'PDF, DOCX', 'guidance', 'Mandatory when applying as a Registered company; include shareholder and director extract.'),
      jsonb_build_object('id', 'doc_burs', 'label', 'BURS Tax Clearance Certificate', 'category', 'Compliance copies', 'required', false, 'appliesTo', 'Registered companies / Growth stage', 'maxSizeMb', 5, 'acceptedFormats', 'PDF', 'guidance', 'Active BURS tax clearance or TIN registration confirmation where applicable.'),
      jsonb_build_object('id', 'doc_pitch', 'label', 'Pitch Deck / Technical Concept Brief', 'category', 'Technical & commercial evidence', 'required', true, 'appliesTo', 'All stages', 'maxSizeMb', 15, 'acceptedFormats', 'PDF, PPTX, DOCX', 'guidance', 'Concise deck or brief outlining problem, solution, traction and budget.'),
      jsonb_build_object('id', 'doc_financials', 'label', 'Financial Projections / Cost Breakdown', 'category', 'Financial evidence', 'required', false, 'appliesTo', 'MVP / Pilot / Growth', 'maxSizeMb', 10, 'acceptedFormats', 'XLSX, PDF, CSV', 'guidance', 'Itemised use of funds and 12–36 month revenue/expense forecast.'),
      jsonb_build_object('id', 'doc_regulatory', 'label', 'Sector Regulatory Clearance or Standards Evidence', 'category', 'Regulatory copies', 'required', false, 'appliesTo', 'Regulated sectors', 'maxSizeMb', 10, 'acceptedFormats', 'PDF, DOCX', 'guidance', 'BOBS test report, BOCRA type approval, BOMRA dossier, BERA permit, or BoB/NBFIRA correspondence where relevant.')
    ),
    'customFields', jsonb_build_array()
  ),
  1,
  'Baseline CEDA Innovation application form structure and accompanying copies checklist'
)
on conflict (config_key) do nothing;

-- 5. Seed official Botswana Regulatory Authority contacts, Application Form guides,
--    Accompanying Copies guides & Portal Content FAQs idempotently
insert into public.portal_content (
  kind, title, summary, body, audience, stage, version,
  authority_code, contact_details, external_url, updated_at
)
select v.kind, v.title, v.summary, v.body, v.audience, 'Published', 1,
       v.authority_code, v.contact_details, v.external_url, now()
from (
  values
    (
      'Regulatory contacts',
      'CIPA — Companies and Intellectual Property Authority',
      'Company registration, business names, patents, trademarks, industrial designs and copyright.',
      'Companies and Intellectual Property Authority (CIPA) registers companies and business names and administers intellectual property rights (patents, utility models, trademarks, industrial designs and copyright) in Botswana. Phone: +267 367 3700 / Call Centre +267 367 3797 / WhatsApp +267 7326 3804. Email: info@cipa.co.bw. Address: Plot 54358, Prime Plaza, CBD, Gaborone (P.O. Box 102, Gaborone).',
      'Public website & Innovators',
      'CIPA',
      jsonb_build_object(
        'authorityCode', 'CIPA',
        'fullName', 'Companies and Intellectual Property Authority',
        'phone', '+267 367 3700 / +267 367 3797',
        'whatsapp', '+267 7326 3804',
        'email', 'info@cipa.co.bw',
        'website', 'https://www.cipa.co.bw',
        'address', 'Plot 54358, Prime Plaza, CBD, Gaborone (P.O. Box 102, Gaborone)',
        'scope', 'Company registration, business names, patents, trademarks, industrial designs & copyright'
      ),
      'https://www.cipa.co.bw'
    ),
    (
      'Regulatory contacts',
      'BURS — Botswana Unified Revenue Service',
      'Taxpayer TIN registration, VAT, PAYE and Tax Clearance Certificates.',
      'Botswana Unified Revenue Service (BURS) administers tax registration, customs and tax clearance certificates required for commercial contracting and CEDA enterprise financing. Call Centre: 17649 / +267 363 8000 / +267 363 9000. Email: callcenter@burs.org.bw. Address: Plot 54379, CBD, Gaborone (Private Bag 0013, Gaborone).',
      'Public website & Innovators',
      'BURS',
      jsonb_build_object(
        'authorityCode', 'BURS',
        'fullName', 'Botswana Unified Revenue Service',
        'phone', '17649 / +267 363 8000',
        'email', 'callcenter@burs.org.bw',
        'website', 'https://www.burs.org.bw',
        'address', 'Plot 54379, CBD, Gaborone (Private Bag 0013, Gaborone)',
        'scope', 'Taxpayer TIN registration, VAT, PAYE & Tax Clearance Certificates'
      ),
      'https://www.burs.org.bw'
    ),
    (
      'Regulatory contacts',
      'BOBS — Botswana Bureau of Standards',
      'Product standards, quality certification, conformity assessment and laboratory testing.',
      'Botswana Bureau of Standards (BOBS) provides national standards specifications, testing services and product certification for agri-processing, manufacturing and consumer products. Phone: +267 390 3200 / Toll-Free 0800 600 941. Email: enquiries@bobstandards.bw. Address: Plot 55745, Block 8, Airport Road, Gaborone (Private Bag BO 48, Gaborone).',
      'Public website & Innovators',
      'BOBS',
      jsonb_build_object(
        'authorityCode', 'BOBS',
        'fullName', 'Botswana Bureau of Standards',
        'phone', '+267 390 3200 / Toll-Free 0800 600 941',
        'email', 'enquiries@bobstandards.bw',
        'website', 'https://www.bobstandards.bw',
        'address', 'Plot 55745, Block 8, Airport Road, Gaborone (Private Bag BO 48, Gaborone)',
        'scope', 'Product standards, quality marks, conformity assessment & laboratory testing'
      ),
      'https://www.bobstandards.bw'
    ),
    (
      'Regulatory contacts',
      'BOCRA — Botswana Communications Regulatory Authority',
      'ICT licensing, telecommunications, type approval of radio devices and broadcasting.',
      'Botswana Communications Regulatory Authority (BOCRA) regulates telecommunications, internet service providers, radio frequency spectrum, communications equipment type approval and broadcasting/postal services. Phone: +267 395 7755. Email: info@bocra.org.bw. Address: Plot 50671, Independence Avenue, Gaborone (Private Bag 00495, Gaborone).',
      'Public website & Innovators',
      'BOCRA',
      jsonb_build_object(
        'authorityCode', 'BOCRA',
        'fullName', 'Botswana Communications Regulatory Authority',
        'phone', '+267 395 7755',
        'email', 'info@bocra.org.bw',
        'website', 'https://www.bocra.org.bw',
        'address', 'Plot 50671, Independence Avenue, Gaborone (Private Bag 00495, Gaborone)',
        'scope', 'ICT licensing, telecoms, radio frequency spectrum & equipment type approval'
      ),
      'https://www.bocra.org.bw'
    ),
    (
      'Regulatory contacts',
      'Bank of Botswana (BoB)',
      'Banking licensing, payment systems oversight and payment-service fintech compliance.',
      'Bank of Botswana oversees commercial banking licences, electronic payment systems, mobile money and payment-service fintech regulation under the National Clearance and Settlement Systems Act. Phone: +267 360 6000. Email: info@bob.bw. Address: 17938 Khama Crescent, Gaborone (Private Bag 154, Gaborone).',
      'Public website & Innovators',
      'BOB',
      jsonb_build_object(
        'authorityCode', 'BOB',
        'fullName', 'Bank of Botswana',
        'phone', '+267 360 6000',
        'email', 'info@bob.bw',
        'website', 'https://www.bankofbotswana.bw',
        'address', '17938 Khama Crescent, Gaborone (Private Bag 154, Gaborone)',
        'scope', 'Banking licensing, payment systems oversight & payment fintech regulation'
      ),
      'https://www.bankofbotswana.bw'
    ),
    (
      'Regulatory contacts',
      'NBFIRA — Non-Bank Financial Institutions Regulatory Authority',
      'Microlending, insurance, capital markets, pensions and non-bank fintech oversight.',
      'Non-Bank Financial Institutions Regulatory Authority (NBFIRA) licenses and supervises microlenders, insurers, insurtechs, asset managers and capital-market platforms in Botswana. Phone: +267 310 2595 / +267 368 6100. Email: info@nbfira.org.bw. Address: 3rd Floor, Exponential Building, Plot 54351, New CBD, Gaborone (Private Bag 00314, Gaborone).',
      'Public website & Innovators',
      'NBFIRA',
      jsonb_build_object(
        'authorityCode', 'NBFIRA',
        'fullName', 'Non-Bank Financial Institutions Regulatory Authority',
        'phone', '+267 310 2595 / +267 368 6100',
        'email', 'info@nbfira.org.bw',
        'website', 'https://www.nbfira.org.bw',
        'address', '3rd Floor, Exponential Building, Plot 54351, New CBD, Gaborone (Private Bag 00314, Gaborone)',
        'scope', 'Microlending, insurance, capital markets & non-bank financial services'
      ),
      'https://www.nbfira.org.bw'
    ),
    (
      'Regulatory contacts',
      'BERA — Botswana Energy Regulatory Authority',
      'Renewable energy, solar micro-grids, electricity generation and petroleum licensing.',
      'Botswana Energy Regulatory Authority (BERA) regulates electricity supply, off-grid solar generation, biofuels, natural gas and petroleum distribution licences across Botswana. Phone: +267 316 1064 / Toll-Free 0800 00 2372. Email: info@bera.co.bw. Address: Plot 75782, Building 2, Pinnacle Park, Setlhoa, Block 10, Gaborone.',
      'Public website & Innovators',
      'BERA',
      jsonb_build_object(
        'authorityCode', 'BERA',
        'fullName', 'Botswana Energy Regulatory Authority',
        'phone', '+267 316 1064 / Toll-Free 0800 00 2372',
        'email', 'info@bera.co.bw',
        'website', 'https://www.bera.co.bw',
        'address', 'Plot 75782, Building 2, Pinnacle Park, Setlhoa, Block 10, Gaborone',
        'scope', 'Electricity generation, solar energy, biofuels & petroleum licensing'
      ),
      'https://www.bera.co.bw'
    ),
    (
      'Regulatory contacts',
      'BOMRA — Botswana Medicines Regulatory Authority',
      'Medicines, diagnostics, medical devices and health-product safety registration.',
      'Botswana Medicines Regulatory Authority (BOMRA) regulates pharmaceuticals, vaccines, medical devices, diagnostics and complementary health products for market authorisation and clinical safety. Phone: +267 373 1720 / +267 318 6254. Email: info@bomra.org.bw. Address: Plot 112, Gaborone International Finance Park, Gaborone.',
      'Public website & Innovators',
      'BOMRA',
      jsonb_build_object(
        'authorityCode', 'BOMRA',
        'fullName', 'Botswana Medicines Regulatory Authority',
        'phone', '+267 373 1720 / +267 318 6254',
        'email', 'info@bomra.org.bw',
        'website', 'https://www.bomra.org.bw',
        'address', 'Plot 112, Gaborone International Finance Park, Gaborone',
        'scope', 'Medicines, medical devices, diagnostics & health-product regulation'
      ),
      'https://www.bomra.org.bw'
    ),
    (
      'Application form',
      'CEDA Innovation Portal Submission Form Guide (12-Step Structure)',
      'Structured offline preparation worksheet and official section guide covering all 12 submission steps.',
      'Use this guide to prepare your responses offline before submitting online. Sections cover: (1) Applicant & organisation, (2) Innovation overview & executive summary, (3) Problem & need, (4) Proposed solution, (5) Implementation readiness, (6) Market & sustainability, (7) IP & regulatory compliance, (8) Impact & jobs, (9) Financial request & funding, (10) Risks & mitigation, (11) Accompanying copies & verification, and (12) Declarations. Administrators may attach downloadable templates directly to this item.',
      'Public website & Innovators',
      null,
      null,
      null
    ),
    (
      'Accompanying copies',
      'Mandatory & Stage-Matched Accompanying Copies Checklist',
      'List of required applicant verification records, company registration copies and regulatory clearances.',
      'Every submission requires a readable copy of the applicant''s Omang / National ID or Passport and a Pitch Deck or Technical Concept Brief. Registered companies must additionally provide CIPA registration extracts and BURS tax clearance or TIN records where applicable. Growth and regulated innovations should attach financial projections and relevant BOBS, BOCRA, BoB, NBFIRA, BERA or BOMRA approvals.',
      'Public website & Innovators',
      null,
      null,
      null
    ),
    (
      'FAQs',
      'Which regulatory authority contacts apply to my innovation?',
      'Key Botswana regulators across company registration, tax, standards, ICT, finance, energy and health.',
      'Every business begins with CIPA (company registration and IP protection) and BURS (tax registration). Regulated sectors also require sector oversight: BOBS for product standards and testing, BOCRA for ICT and telecoms hardware, Bank of Botswana or NBFIRA for financial services and fintech, BERA for energy and solar projects, and BOMRA for medical devices or medicines. Full verified contact details are published in the Regulatory Authority Directory.',
      'Public website & Innovators',
      null,
      null,
      null
    ),
    (
      'FAQs',
      'What accompanying copies must be uploaded with the application form?',
      'Omang/Passport ID, CIPA extract for companies, concept brief and stage-matched supporting files.',
      'All applicants upload identity verification (Omang or Passport) plus an overview pitch deck or concept brief. Registered companies add CIPA company registration documents and applicable BURS tax documentation. Prototype, MVP/Pilot and Growth applicants include financial projections, pilot traction metrics or regulatory clearances in Step 11. Administrators keep downloadable checklists and templates up to date in the portal.',
      'Public website & Innovators',
      null,
      null,
      null
    )
) as v(kind, title, summary, body, audience, authority_code, contact_details, external_url)
where not exists (
  select 1 from public.portal_content existing
  where existing.kind = v.kind
    and (
      (v.authority_code is not null and existing.authority_code = v.authority_code)
      or lower(existing.title) = lower(v.title)
    )
);

-- 6. Upgrade admin_content_list & admin_save_content (preserving backwards compatibility)
create or replace function ceda_private.admin_content_list()
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
        'id', c.id,
        'title', c.title,
        'summary', c.summary,
        'body', c.body,
        'kind', c.kind,
        'audience', c.audience,
        'stage', c.stage,
        'version', c.version,
        'updated', to_char(c.updated_at at time zone 'Africa/Gaborone', 'YYYY-MM-DD HH24:MI'),
        'attachmentName', c.attachment_name,
        'attachmentMime', c.attachment_mime,
        'attachmentSize', c.attachment_size,
        'attachmentPath', c.attachment_path,
        'externalUrl', c.external_url,
        'authorityCode', c.authority_code,
        'contactDetails', c.contact_details
      )
      order by c.updated_at desc, c.title asc
    )
    from public.portal_content c
  ), '[]'::jsonb);
end $$;

revoke all on function ceda_private.admin_content_list() from public, anon, authenticated;
grant execute on function ceda_private.admin_content_list() to authenticated;

drop function if exists public.admin_content_list();
create or replace function public.admin_content_list()
returns jsonb
language sql
security definer
set search_path = ''
as $$ select ceda_private.admin_content_list() $$;

revoke all on function public.admin_content_list() from public, anon;
grant execute on function public.admin_content_list() to authenticated;

drop function if exists public.admin_save_content(text, text, text, text, uuid, text);
drop function if exists ceda_private.admin_save_content(text, text, text, text, uuid, text);

create or replace function ceda_private.admin_save_content(
  content_kind text,
  content_title text,
  content_body text,
  reason text,
  content_id uuid default null,
  content_stage text default 'Published',
  attachment_name text default null,
  attachment_mime text default null,
  attachment_size bigint default null,
  attachment_path text default null,
  external_url text default null,
  authority_code text default null,
  contact_details jsonb default null,
  content_audience text default null,
  clear_attachment boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := ceda_private.require_admin();
  clean_kind text := btrim(coalesce(content_kind, ''));
  clean_title text := left(btrim(coalesce(content_title, '')), 160);
  clean_body text := left(btrim(coalesce(content_body, '')), 5000);
  clean_reason text := left(btrim(coalesce(reason, '')), 500);
  clean_stage text := coalesce(nullif(btrim(coalesce(content_stage, '')), ''), 'Published');
  clean_audience text := nullif(left(btrim(coalesce(content_audience, '')), 120), '');
  clean_att_name text := nullif(left(btrim(coalesce(attachment_name, '')), 180), '');
  clean_att_mime text := nullif(left(btrim(coalesce(attachment_mime, '')), 120), '');
  clean_att_path text := nullif(left(btrim(coalesce(attachment_path, '')), 300), '');
  clean_url text := nullif(left(btrim(coalesce(external_url, '')), 500), '');
  clean_auth text := nullif(upper(left(btrim(coalesce(authority_code, '')), 32)), '');
  clean_summary text;
  action_label text;
begin
  if clean_kind not in (
    'Public pages',
    'FAQs',
    'Announcements',
    'Partners',
    'Application form',
    'Accompanying copies',
    'Regulatory contacts'
  ) then
    raise exception 'Unsupported content type';
  end if;

  if clean_stage not in ('Draft', 'Awaiting review', 'Published', 'Archived', 'Published preview', 'Tab draft') then
    raise exception 'Unsupported publishing stage';
  end if;

  if length(clean_title) < 2 then
    raise exception 'Title must be at least 2 characters';
  end if;

  if length(clean_body) < 10 then
    raise exception 'Content body must be at least 10 characters';
  end if;

  if length(clean_reason) < 5 then
    raise exception 'Source or approval note must be at least 5 characters';
  end if;

  if clean_att_path is not null then
    if clean_att_path like '%..%' or clean_att_path ~ '^/' then
      raise exception 'Invalid attachment path';
    end if;
    if attachment_size is not null and (attachment_size < 0 or attachment_size > 10485760) then
      raise exception 'Attachment exceeds the 10 MB portal limit';
    end if;
  end if;

  if clean_url is not null and clean_url !~* '^https?://' then
    raise exception 'External URL must begin with http:// or https://';
  end if;

  if contact_details is not null and jsonb_typeof(contact_details) <> 'object' then
    raise exception 'Regulatory contact details must be a JSON object';
  end if;

  if clean_audience is null then
    clean_audience := case
      when clean_kind in ('FAQs', 'Application form', 'Accompanying copies', 'Regulatory contacts')
        then 'Public website & Innovators'
      when clean_kind = 'Partners'
        then 'Partners & ecosystem'
      else 'Public website'
    end;
  end if;

  clean_summary := left(regexp_replace(clean_body, '\s+', ' ', 'g'), 180);

  if content_id is not null and exists (select 1 from public.portal_content where id = content_id) then
    update public.portal_content
    set kind = clean_kind,
        title = clean_title,
        summary = clean_summary,
        body = clean_body,
        audience = clean_audience,
        stage = clean_stage,
        version = coalesce(version, 1) + 1,
        updated_by = actor,
        updated_at = now(),
        attachment_name = case when coalesce(clear_attachment, false) then null else coalesce(clean_att_name, attachment_name) end,
        attachment_mime = case when coalesce(clear_attachment, false) then null else coalesce(clean_att_mime, attachment_mime) end,
        attachment_size = case when coalesce(clear_attachment, false) then null else coalesce(attachment_size, attachment_size) end,
        attachment_path = case when coalesce(clear_attachment, false) then null else coalesce(clean_att_path, attachment_path) end,
        external_url = clean_url,
        authority_code = clean_auth,
        contact_details = coalesce(contact_details, public.portal_content.contact_details)
    where id = content_id;
    action_label := 'content.updated';
  else
    insert into public.portal_content (
      kind, title, summary, body, audience, stage, version, updated_by, updated_at,
      attachment_name, attachment_mime, attachment_size, attachment_path,
      external_url, authority_code, contact_details
    )
    values (
      clean_kind, clean_title, clean_summary, clean_body, clean_audience, clean_stage, 1, actor, now(),
      case when coalesce(clear_attachment, false) then null else clean_att_name end,
      case when coalesce(clear_attachment, false) then null else clean_att_mime end,
      case when coalesce(clear_attachment, false) then null else attachment_size end,
      case when coalesce(clear_attachment, false) then null else clean_att_path end,
      clean_url, clean_auth, contact_details
    );
    action_label := 'content.created';
  end if;

  insert into public.admin_audit(actor_id, action, target, detail)
  values (actor, action_label, clean_kind || ': ' || clean_title, clean_reason || ' [' || clean_stage || ']');

  return ceda_private.admin_content_list();
end $$;

revoke all on function ceda_private.admin_save_content(
  text, text, text, text, uuid, text, text, text, bigint, text, text, text, jsonb, text, boolean
) from public, anon, authenticated;

grant execute on function ceda_private.admin_save_content(
  text, text, text, text, uuid, text, text, text, bigint, text, text, text, jsonb, text, boolean
) to authenticated;

create or replace function public.admin_save_content(
  content_kind text,
  content_title text,
  content_body text,
  reason text,
  content_id uuid default null,
  content_stage text default 'Published',
  attachment_name text default null,
  attachment_mime text default null,
  attachment_size bigint default null,
  attachment_path text default null,
  external_url text default null,
  authority_code text default null,
  contact_details jsonb default null,
  content_audience text default null,
  clear_attachment boolean default false
)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select ceda_private.admin_save_content(
    content_kind, content_title, content_body, reason, content_id, content_stage,
    attachment_name, attachment_mime, attachment_size, attachment_path,
    external_url, authority_code, contact_details, content_audience, clear_attachment
  );
$$;

revoke all on function public.admin_save_content(
  text, text, text, text, uuid, text, text, text, bigint, text, text, text, jsonb, text, boolean
) from public, anon;

grant execute on function public.admin_save_content(
  text, text, text, text, uuid, text, text, text, bigint, text, text, text, jsonb, text, boolean
) to authenticated;

-- 7. Hard-delete content RPC (with mandatory audit reason)
create or replace function ceda_private.admin_delete_content(
  content_id uuid,
  reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := ceda_private.require_admin();
  clean_reason text := left(btrim(coalesce(reason, '')), 500);
  target_row public.portal_content;
begin
  if content_id is null then
    raise exception 'Content item id is required';
  end if;
  if length(clean_reason) < 5 then
    raise exception 'Provide an audit deletion reason of at least 5 characters';
  end if;

  select * into target_row
  from public.portal_content
  where id = content_id
  for update;

  if not found then
    raise exception 'Content item not found';
  end if;

  delete from public.portal_content where id = content_id;

  insert into public.admin_audit(actor_id, action, target, detail)
  values (
    actor,
    'content.deleted',
    target_row.kind || ': ' || target_row.title,
    clean_reason
  );

  return ceda_private.admin_content_list();
end $$;

revoke all on function ceda_private.admin_delete_content(uuid, text) from public, anon, authenticated;
grant execute on function ceda_private.admin_delete_content(uuid, text) to authenticated;

create or replace function public.admin_delete_content(
  content_id uuid,
  reason text
)
returns jsonb
language sql
security definer
set search_path = ''
as $$ select ceda_private.admin_delete_content(content_id, reason) $$;

revoke all on function public.admin_delete_content(uuid, text) from public, anon;
grant execute on function public.admin_delete_content(uuid, text) to authenticated;

-- 8. Allow saving application_form_config via admin_save_configuration
create or replace function ceda_private.admin_save_configuration(
  target_key text,
  new_payload jsonb,
  reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := ceda_private.require_admin();
  clean_key text := btrim(coalesce(target_key, ''));
  clean_reason text := left(btrim(coalesce(reason, '')), 500);
  prev_payload jsonb;
begin
  if clean_key not in ('optimus_guidance', 'optimus_knowledge', 'portal_policies', 'application_form_config') then
    raise exception 'Unsupported configuration key';
  end if;
  if new_payload is null or jsonb_typeof(new_payload) <> 'object' then
    raise exception 'Configuration payload must be a JSON object';
  end if;
  if length(clean_reason) < 5 then
    raise exception 'Provide a configuration update reason of at least 5 characters';
  end if;

  select payload into prev_payload
  from public.portal_configurations
  where config_key = clean_key
  for update;

  insert into public.portal_configurations(config_key, payload, version, reason, updated_by, updated_at)
  values (clean_key, new_payload, 1, clean_reason, actor, now())
  on conflict (config_key) do update
  set payload = excluded.payload,
      version = public.portal_configurations.version + 1,
      reason = excluded.reason,
      updated_by = actor,
      updated_at = now();

  insert into public.admin_audit(actor_id, action, target, detail)
  values (actor, 'config.updated', clean_key, clean_reason);

  return ceda_private.admin_get_configurations();
end $$;

-- 9. Public read-only catalog for published FAQs, Regulatory Contacts, Application Forms & Accompanying Copies
create or replace function public.public_portal_catalog()
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'faqs', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', c.id,
          'title', c.title,
          'summary', c.summary,
          'body', c.body,
          'kind', c.kind,
          'updated', to_char(c.updated_at at time zone 'Africa/Gaborone', 'YYYY-MM-DD')
        )
        order by c.updated_at desc, c.title asc
      )
      from public.portal_content c
      where c.stage in ('Published', 'Published preview')
        and c.kind = 'FAQs'
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
          'externalUrl', coalesce(c.external_url, c.contact_details->>'website'),
          'updated', to_char(c.updated_at at time zone 'Africa/Gaborone', 'YYYY-MM-DD')
        )
        order by c.title asc
      )
      from public.portal_content c
      where c.stage in ('Published', 'Published preview')
        and c.kind = 'Regulatory contacts'
    ), '[]'::jsonb),
    'applicationForms', coalesce((
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
    'announcements', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', c.id,
          'title', c.title,
          'summary', c.summary,
          'body', c.body,
          'updated', to_char(c.updated_at at time zone 'Africa/Gaborone', 'YYYY-MM-DD')
        )
        order by c.updated_at desc
      )
      from public.portal_content c
      where c.stage in ('Published', 'Published preview')
        and c.kind = 'Announcements'
    ), '[]'::jsonb),
    'applicationFormConfig', coalesce(
      (select payload from public.portal_configurations where config_key = 'application_form_config'),
      '{}'::jsonb
    )
  );
$$;

revoke all on function public.public_portal_catalog() from public;
grant execute on function public.public_portal_catalog() to anon, authenticated;

-- 10. Upgrade innovator_workspace_bootstrap to expose applicationFormConfig, portalDocuments & regulatoryContacts
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

-- 11. Enforce Admin-configured required custom fields during submission
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
  form_cfg jsonb;
  custom_field jsonb;
  custom_val text;
begin
  if p_idempotency_key is null or length(btrim(p_idempotency_key)) < 8 then
    raise exception 'Submission idempotency key required';
  end if;

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

  -- Enforce any active required custom fields configured by Administrators
  select payload into form_cfg from public.portal_configurations where config_key = 'application_form_config';
  if form_cfg is not null and jsonb_typeof(form_cfg->'customFields') = 'array' then
    for custom_field in select value from jsonb_array_elements(form_cfg->'customFields') loop
      if coalesce((custom_field->>'enabled')::boolean, true)
         and coalesce((custom_field->>'required')::boolean, false) then
        custom_val := btrim(coalesce(merged->'customResponses'->>(custom_field->>'key'), ''));
        if length(custom_val) = 0 then
          raise exception 'Complete the required form field: %', coalesce(custom_field->>'label', custom_field->>'key');
        end if;
      end if;
    end loop;
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
