-- Exercise the Assessor workflow without keeping test users, cases or decisions.
begin;
insert into auth.users(id, email, email_confirmed_at, is_anonymous, raw_user_meta_data)
values
 ('a2200000-0000-4000-8000-000000000001','assessment-chair@example.invalid',now(),false,'{"full_name":"Test Chair"}'),
 ('a2200000-0000-4000-8000-000000000002','assessment-reviewer@example.invalid',now(),false,'{"full_name":"Test Reviewer"}'),
 ('a2200000-0000-4000-8000-000000000003','assessment-outsider@example.invalid',now(),false,'{"full_name":"Test Outsider"}'),
 ('a2200000-0000-4000-8000-000000000004','assessment-applicant@example.invalid',now(),false,'{"full_name":"Test Applicant"}');
update public.profiles set account_role = 'assessor', lead_assessor = (id = 'a2200000-0000-4000-8000-000000000001')
where id in ('a2200000-0000-4000-8000-000000000001','a2200000-0000-4000-8000-000000000002','a2200000-0000-4000-8000-000000000003');
insert into auth.sessions(id,user_id)
select replace(id::text,'a2200000','a2210000')::uuid,id from auth.users where email like 'assessment-%@example.invalid';
insert into public.sectors (id,name,status) values
  ('a2220000-0000-4000-8000-000000000001','Assessment test sector','published'),
  ('a2220000-0000-4000-8000-000000000002','Second test sector','published');
insert into public.staff_sectors(user_id,sector_id)
select id,'a2220000-0000-4000-8000-000000000001' from public.profiles
where id in ('a2200000-0000-4000-8000-000000000001','a2200000-0000-4000-8000-000000000002','a2200000-0000-4000-8000-000000000003');
insert into public.innovation_applications (id,reference,title,applicant,sector,sector_id,status,summary,owner_id)
values
  ('a2230000-0000-4000-8000-000000000001','ASSESSMENT-TEST','Test case','Test Applicant','Assessment test sector',
    'a2220000-0000-4000-8000-000000000001','Submitted','Confidential submission summary','a2200000-0000-4000-8000-000000000004'),
  ('a2230000-0000-4000-8000-000000000002','ASSESSMENT-CROSS','Cross sector case','Cross Applicant','Second test sector',
    'a2220000-0000-4000-8000-000000000002','Submitted','Cross-sector summary','a2200000-0000-4000-8000-000000000004');
insert into public.application_documents (application_id,owner_id,section_key,doc_kind,title,file_name,mime_type,file_size,storage_path)
values ('a2230000-0000-4000-8000-000000000001','a2200000-0000-4000-8000-000000000004','problem','file',
  'Test evidence','test.pdf','application/pdf',512,'a2200000-0000-4000-8000-000000000004/assessment-test.pdf');
insert into ceda_private.assessment_release_permissions values ('a2200000-0000-4000-8000-000000000001','a2220000-0000-4000-8000-000000000001');

set local role authenticated;
do $$
declare
  case_id uuid := 'a2230000-0000-4000-8000-000000000001';
  cross_case_id uuid := 'a2230000-0000-4000-8000-000000000002';
  chair text := '{"sub":"a2200000-0000-4000-8000-000000000001","session_id":"a2210000-0000-4000-8000-000000000001","aal":"aal2","is_anonymous":false}';
  reviewer text := '{"sub":"a2200000-0000-4000-8000-000000000002","session_id":"a2210000-0000-4000-8000-000000000002","aal":"aal1","is_anonymous":false}';
  outsider text := '{"sub":"a2200000-0000-4000-8000-000000000003","session_id":"a2210000-0000-4000-8000-000000000003","aal":"aal1","is_anonymous":false}';
  evidence_path text := 'a2200000-0000-4000-8000-000000000004/assessment-test.pdf';
  result jsonb;
  round_id uuid;
  cross_round_id uuid;
  scores jsonb;
  blocked boolean := false;
  annotation_id uuid;
begin
  perform set_config('request.jwt.claims',outsider,true);
  begin
    perform public.assessor_case(case_id);
    raise exception 'Unassigned assessor was able to open the case';
  exception when insufficient_privilege then null; end;
  begin
    perform public.assessor_case(cross_case_id);
    raise exception 'Unassigned assessor was able to open a cross-sector case';
  exception when insufficient_privilege then null; end;

  perform set_config('request.jwt.claims',chair,true);
  result := public.assessor_workspace();
  if not exists (select 1 from jsonb_array_elements_text(result->'profile'->'sectors') s where s = 'Assessment test sector') then
    raise exception 'Lead Assessor specialty sectors missing from workspace profile';
  end if;
  if not exists (select 1 from jsonb_array_elements(result->'cases') item where item->>'id' = cross_case_id::text and (item->>'canManage')::boolean) then
    raise exception 'Lead Assessor could not see or manage cross-sector application';
  end if;
  result := public.assessor_action(cross_case_id,null,'configure',jsonb_build_object(
    'members',jsonb_build_array('a2200000-0000-4000-8000-000000000002'),
    'deadline',now() + interval '1 day',
    'quorum',1));
  cross_round_id := (result->'case'->>'roundId')::uuid;
  if cross_round_id is null then raise exception 'Cross-sector panel configuration did not create a round'; end if;
  perform set_config('request.jwt.claims',reviewer,true);
  result := public.assessor_case(cross_case_id);
  if result->'case'->>'reference' is distinct from 'ASSESSMENT-CROSS' then
    raise exception 'Assigned assessor could not open cross-sector case';
  end if;
  perform set_config('request.jwt.claims',outsider,true);
  begin
    perform public.assessor_case(cross_case_id);
    raise exception 'Unassigned assessor opened configured cross-sector case';
  exception when insufficient_privilege then null; end;

  perform set_config('request.jwt.claims',chair,true);
  result := public.assessor_action(case_id,null,'configure', jsonb_build_object(
    'members',jsonb_build_array('a2200000-0000-4000-8000-000000000002'),'quorum',1,'deadline',now()+interval '1 day'));
  round_id := (result->'case'->>'roundId')::uuid;
  perform public.assessor_action(case_id,round_id,'start','{}');

  perform set_config('request.jwt.claims',reviewer,true);
  if public.assessor_case(case_id)->'application'->>'summary' is not null then raise exception 'Evidence access preceded conflict clearance'; end if;
  if ceda_private.assessment_evidence_allowed(evidence_path) then raise exception 'Storage access preceded conflict clearance'; end if;
  perform public.assessor_action(case_id,round_id,'declare','{"conflict":"cleared"}');
  if not ceda_private.assessment_evidence_allowed(evidence_path) then raise exception 'Cleared member could not access pinned evidence'; end if;
  result := public.assessor_action(case_id,round_id,'save','{"scores":[{"criterion":"strategic-alignment","rating":null,"rationale":"Draft"}],"choice":"approve","overallComment":"Private draft note"}');
  if result->>'draftChoice' is distinct from 'approve' or result->>'overallComment' is distinct from 'Private draft note' then
    raise exception 'The draft recommendation or overall comment was lost';
  end if;
  result := public.assessor_action(case_id,round_id,'annotate',jsonb_build_object(
    'anchor','document:' || (result->'documents'->0->>'id'),'body','Check the supporting figures.'));
  annotation_id := (result->'annotations'->0->>'id')::uuid;
  perform public.assessor_action(case_id,round_id,'comment','{"body":"The review is in progress."}');

  perform set_config('request.jwt.claims',chair,true);
  if public.assessor_case(case_id)->'panel'->0->'scores' <> '[]'::jsonb then raise exception 'Draft review leaked to lead'; end if;
  result := public.assessor_workspace();
  if not exists (select 1 from jsonb_array_elements(result->'cases') item
      where item->>'id'=case_id::text and (item->>'unreadCount')::int=1) then raise exception 'New discussion was not counted'; end if;
  result := public.assessor_action(case_id,round_id,'read-discussion','{}');
  result := public.assessor_action(case_id,round_id,'annotate',jsonb_build_object(
    'anchor', result->'annotations'->0->>'anchor', 'parentId',annotation_id,'body','Figures checked.'));
  if jsonb_array_length(result->'annotations') <> 2 then raise exception 'Annotation thread did not include the reply'; end if;
  result := public.assessor_workspace();
  if not exists (select 1 from jsonb_array_elements(result->'cases') item
      where item->>'id'=case_id::text and (item->>'unreadCount')::int=0) then raise exception 'Read receipt did not clear unread count'; end if;
  perform set_config('request.jwt.claims',reviewer,true);
  select jsonb_agg(jsonb_build_object('criterion',criterion,'rating',4,'rationale','An assessed reason')) into scores
  from unnest(array['strategic-alignment','innovation-and-originality','impact-potential','feasibility-and-viability',
    'scalability-and-sustainability','implementation-capacity-team-capability-and-governance']) criterion;
  begin
    perform public.assessor_action(case_id,round_id,'submit',jsonb_build_object('scores',scores,'choice','approve'));
  exception when raise_exception then blocked := true; end;
  if not blocked then raise exception 'A guided review was submitted before all steps were reviewed'; end if;
  for step_index in 1..12 loop
    perform public.assessor_action(case_id,round_id,'review-step',jsonb_build_object('step',step_index));
  end loop;
  result := public.assessor_action(case_id,round_id,'submit',jsonb_build_object('scores',scores,'choice','approve','overallComment','Final review.'));
  if result->>'ballot' is distinct from 'approve' or jsonb_array_length(result->'reviewedSteps') <> 12 then
    raise exception 'Final ballot or guided progress was not recorded';
  end if;

  perform set_config('request.jwt.claims',chair,true);
  result := public.assessor_case(case_id);
  if (result->'scoreStats'->>'mean')::numeric is distinct from 4::numeric or
     (result->'scoreStats'->>'median')::numeric is distinct from 4::numeric or
     (result->'scoreStats'->>'weightedTotalMean')::numeric is distinct from 80::numeric or
     (result->'scoreStats'->>'meetsThreshold')::boolean is distinct from true then raise exception 'Score statistics were incorrect'; end if;
  if jsonb_array_length(result->'rubric') <> 6 then raise exception 'Expected pinned rubric snapshot'; end if;

  -- Verify rubric changes do not mutate an already-started assessment round
  reset role;
  update public.assessment_criteria set weight = 100.00 where criterion_key = 'strategic-alignment';
  update public.assessment_criteria set active = false where criterion_key <> 'strategic-alignment';
  set local role authenticated;
  perform set_config('request.jwt.claims',chair,true);
  result := public.assessor_case(case_id);
  if jsonb_array_length(result->'rubric') <> 6 then raise exception 'Started round rubric was not pinned against live changes'; end if;

  perform public.assessor_action(case_id,round_id,'open-vote','{}');
  perform set_config('request.jwt.claims',reviewer,true);
  blocked := false;
  begin
    perform public.assessor_action(case_id,round_id,'vote','{"choice":"decline"}');
  exception when raise_exception then blocked := true; end;
  if not blocked then raise exception 'A submitted ballot was overwritten'; end if;
  perform set_config('request.jwt.claims',chair,true);
  perform public.assessor_action(case_id,round_id,'close-vote','{}');
  perform public.assessor_action(case_id,round_id,'decision','{"feedback":"Assessment approved with evidence."}');
  perform set_config('request.jwt.claims',replace(chair,'"aal2"','"aal1"'),true);
  begin
    perform public.assessor_action(case_id,round_id,'release','{}');
    raise exception 'Release did not require MFA';
  exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claims',chair,true);
  result := public.assessor_action(case_id,round_id,'release','{}');
  if result->'case'->>'status' is distinct from 'Approved' then raise exception 'Expected an approved outcome'; end if;
end;
$$;

reset role;
do $$
begin
  if not exists (select 1 from public.innovator_notifications where application_ref = 'ASSESSMENT-TEST' and kind = 'outcome') then
    raise exception 'Release did not add an Innovator notification';
  end if;
end;
$$;
rollback;
