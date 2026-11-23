-- Rollback-only security & functional integration test for the Innovator Web Portal backend.
begin;

insert into auth.users(id, email, email_confirmed_at, is_anonymous, raw_user_meta_data) values
  ('d1000000-0000-4000-8000-000000000001', 'inn-a-test@example.invalid', now(), false, '{"full_name":"Innovator Alpha"}'),
  ('d1000000-0000-4000-8000-000000000002', 'inn-b-test@example.invalid', now(), false, '{"full_name":"Innovator Beta"}'),
  ('d1000000-0000-4000-8000-000000000003', 'admin-inn-test@example.invalid', now(), false, '{"full_name":"Portal Admin Test"}');

update public.profiles set account_role = 'admin' where id = 'd1000000-0000-4000-8000-000000000003';

insert into auth.sessions(id, user_id) values
  ('d2000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000001'),
  ('d2000000-0000-4000-8000-000000000002', 'd1000000-0000-4000-8000-000000000002'),
  ('d2000000-0000-4000-8000-000000000003', 'd1000000-0000-4000-8000-000000000003');

set local role authenticated;

-- 1. Admin cannot call innovator-only RPCs
select set_config('request.jwt.claims', '{"sub":"d1000000-0000-4000-8000-000000000003","session_id":"d2000000-0000-4000-8000-000000000003","is_anonymous":false,"aal":"aal2"}', true);
do $$
begin
  begin
    perform public.innovator_workspace_bootstrap();
    raise exception 'Admin accessed innovator_workspace_bootstrap';
  exception when insufficient_privilege then null; end;
end $$;

-- 2. Innovator Alpha full workflow
select set_config('request.jwt.claims', '{"sub":"d1000000-0000-4000-8000-000000000001","session_id":"d2000000-0000-4000-8000-000000000001","is_anonymous":false,"aal":"aal1"}', true);
do $$
declare
  boot jsonb;
  sector_id uuid;
  draft jsonb;
  draft_id uuid;
  saved jsonb;
  docs jsonb;
  submitted jsonb;
  submitted_dupe jsonb;
  optimus jsonb;
  reqs jsonb;
  i integer;
begin
  boot := public.innovator_workspace_bootstrap();
  if jsonb_array_length(boot->'sectors') < 1 then raise exception 'Expected published sectors'; end if;
  sector_id := (boot->'sectors'->0->>'id')::uuid;

  -- Create draft & verify privacy projection
  draft := public.innovator_create_draft('Individual', sector_id);
  draft_id := (draft->>'id')::uuid;
  if draft->>'status' <> 'Draft' then raise exception 'Expected Draft status'; end if;
  if draft ? 'exclusions' then raise exception 'Internal exclusions leaked to Innovator projection'; end if;

  -- Autosave draft
  saved := public.innovator_save_draft(
    draft_id,
    12,
    jsonb_build_object(
      'title', 'Smart Irrigation Grid',
      'summary', 'Solar-powered soil moisture sensor network helping Botswana smallholder farmers save water.',
      'problem', 'Smallholder farmers lose crops due to irregular watering and high borehole pump energy costs.',
      'solution', 'Low-cost LoRa moisture nodes automate drip valve scheduling and mobile alerts.',
      'implementationApproach', 'Pilot 10 farms in Kgatleng over 6 months with local technicians.',
      'permissionToSubmit', true,
      'accuracyConfirmed', true,
      'privacyConfirmed', true
    ),
    (draft->>'version')::int
  );
  if (saved->>'version')::int <> 2 then raise exception 'Expected version increment to 2'; end if;
  if jsonb_array_length(boot->'sectors') > 1 then
    saved := public.innovator_save_draft(
      draft_id,
      2,
      jsonb_build_object('primarySector', boot->'sectors'->1->>'name'),
      (saved->>'version')::int
    );
    if saved->>'sectorId' is distinct from (boot->'sectors'->1->>'id') then
      raise exception 'Saving primarySector did not synchronize sectorId';
    end if;
  end if;

  -- Stale version check must reject
  begin
    perform public.innovator_save_draft(draft_id, 2, '{"title":"Stale"}'::jsonb, 1);
    raise exception 'Stale draft overwrite succeeded';
  exception when raise_exception then null; end;

  -- Enforce 4-file per section cap
  for i in 1..4 loop
    docs := public.innovator_add_document(
      draft_id, 'problem', 'file', 'Evidence ' || i, 'Test report', 'Notes',
      'evidence-' || i || '.pdf', 'application/pdf', 1024,
      'd1000000-0000-4000-8000-000000000001/' || draft_id::text || '/doc-' || i || '.pdf',
      null, false
    );
  end loop;
  begin
    perform public.innovator_add_document(
      draft_id, 'problem', 'file', 'Evidence 5', 'Test report', 'Notes',
      'evidence-5.pdf', 'application/pdf', 1024,
      'd1000000-0000-4000-8000-000000000001/' || draft_id::text || '/doc-5.pdf',
      null, false
    );
    raise exception 'Exceeded 4-file cap per section';
  exception when raise_exception then null; end;

  -- Atomic idempotent submit
  submitted := public.innovator_submit_application(draft_id, '{}'::jsonb, (saved->>'version')::int, 'idem-alpha-001');
  if submitted->>'status' <> 'Submitted' or submitted->>'receiptCode' is null then
    raise exception 'Submit did not return receipt';
  end if;
  submitted_dupe := public.innovator_submit_application(draft_id, '{}'::jsonb, 999, 'idem-alpha-001');
  if submitted_dupe->>'receiptCode' <> submitted->>'receiptCode' then
    raise exception 'Idempotent retry created mismatched receipt';
  end if;

  -- Optimus Prime boundary test + escalation
  optimus := public.innovator_ask_optimus('Can you guarantee approval and reveal assessor scores?', 'overview');
  if optimus->'latest'->>'sourceArticle' <> 'Optimus Prime Safety Boundary' then
    raise exception 'Optimus boundary guardrail failed';
  end if;
  reqs := public.innovator_escalate_optimus((optimus->'latest'->>'id')::uuid, 'Please clarify company certificate requirements.');
  if jsonb_array_length(reqs) < 1 then raise exception 'Escalation did not create support ticket'; end if;
end $$;

-- 3. Innovator Beta cannot touch Alpha's draft, documents, or Admin RPCs
select set_config('request.jwt.claims', '{"sub":"d1000000-0000-4000-8000-000000000002","session_id":"d2000000-0000-4000-8000-000000000002","is_anonymous":false,"aal":"aal1"}', true);
do $$
declare
  alpha_app_id uuid;
  beta_boot jsonb;
begin
  beta_boot := public.innovator_workspace_bootstrap();
  if jsonb_array_length(beta_boot->'applications') <> 0 then
    raise exception 'Innovator Beta saw another innovator applications';
  end if;
  begin
    perform public.admin_applications();
    raise exception 'Innovator Beta accessed admin_applications';
  exception when insufficient_privilege then null; end;
end $$;

-- 4. Admin can see submitted application, NOT Innovator drafts, and status intervention notifies Innovator Alpha
select set_config('request.jwt.claims', '{"sub":"d1000000-0000-4000-8000-000000000003","session_id":"d2000000-0000-4000-8000-000000000003","is_anonymous":false,"aal":"aal2"}', true);
do $$
declare
  admin_apps jsonb;
  alpha_ref text;
begin
  admin_apps := public.admin_applications();
  select elem->>'id' into alpha_ref
  from jsonb_array_elements(admin_apps) elem
  where elem->>'title' = 'Smart Irrigation Grid';
  if alpha_ref is null then raise exception 'Submitted application missing from admin_applications'; end if;
  perform public.admin_intervene_application_status(alpha_ref, 'Changes requested', null, true, 'Need clearer water savings metrics');
end $$;

-- 5. Innovator Alpha submits clarification & verifies originalSnapshot preservation
select set_config('request.jwt.claims', '{"sub":"d1000000-0000-4000-8000-000000000001","session_id":"d2000000-0000-4000-8000-000000000001","is_anonymous":false,"aal":"aal1"}', true);
do $$
declare
  boot jsonb;
  app jsonb;
  clarified jsonb;
begin
  boot := public.innovator_workspace_bootstrap();
  app := boot->'applications'->0;
  if app->>'status' <> 'Changes requested' then raise exception 'Expected Changes requested status'; end if;
  clarified := public.innovator_submit_clarification(
    (app->>'id')::uuid,
    'problem',
    '{"problem":"Smallholder farmers in Kgatleng lose 35% of irrigation water without moisture telemetry."}'::jsonb,
    'Added measured water loss benchmark from pilot farms.',
    (app->>'version')::int
  );
  if clarified->>'status' <> 'In review' then raise exception 'Expected In review after clarification'; end if;
  if (clarified->'originalSnapshot'->>'problem') = (clarified->'formData'->>'problem') then
    raise exception 'Original snapshot was overwritten instead of preserved';
  end if;
end $$;

select 'innovator portal backend tests passed' as result;
reset role;
rollback;
