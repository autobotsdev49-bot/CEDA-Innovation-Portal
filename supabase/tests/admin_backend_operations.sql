begin;
insert into auth.users(id,email,email_confirmed_at,is_anonymous,raw_user_meta_data) values
 ('c1000000-0000-4000-8000-000000000001','admin-ops-test@example.invalid',now(),false,'{"full_name":"Ops Admin"}'),
 ('c1000000-0000-4000-8000-000000000002','innovator-ops-test@example.invalid',now(),false,'{"full_name":"Ops Innovator"}');
update public.profiles set account_role='admin' where id='c1000000-0000-4000-8000-000000000001';
insert into auth.sessions(id,user_id) values
 ('c2000000-0000-4000-8000-000000000001','c1000000-0000-4000-8000-000000000001'),
 ('c2000000-0000-4000-8000-000000000002','c1000000-0000-4000-8000-000000000002');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"c1000000-0000-4000-8000-000000000002","session_id":"c2000000-0000-4000-8000-000000000002","is_anonymous":false,"aal":"aal2"}',true);
do $$
begin
  begin
    perform public.admin_audit_feed();
    raise exception 'Innovator read admin_audit_feed';
  exception when insufficient_privilege then null; end;
  begin
    perform public.admin_applications();
    raise exception 'Innovator read admin_applications';
  exception when insufficient_privilege then null; end;
  begin
    perform public.admin_content_list();
    raise exception 'Innovator read admin_content_list';
  exception when insufficient_privilege then null; end;
  begin
    perform public.admin_notifications_overview();
    raise exception 'Innovator read admin_notifications_overview';
  exception when insufficient_privilege then null; end;
  begin
    perform public.admin_matters_list();
    raise exception 'Innovator read admin_matters_list';
  exception when insufficient_privilege then null; end;
  begin
    perform public.admin_get_configurations();
    raise exception 'Innovator read admin_get_configurations';
  exception when insufficient_privilege then null; end;
end $$;

select set_config('request.jwt.claims','{"sub":"c1000000-0000-4000-8000-000000000001","session_id":"c2000000-0000-4000-8000-000000000001","is_anonymous":false,"aal":"aal2"}',true);
do $$
declare
  apps jsonb;
  contents jsonb;
  notifs jsonb;
  matters jsonb;
  configs jsonb;
  audits jsonb;
  rubric jsonb;
  sectors jsonb;
  weight_error_caught boolean := false;
begin
  sectors := public.admin_sectors();
  if jsonb_array_length(sectors) < 4 then raise exception 'Expected at least 4 sectors'; end if;

  apps := public.admin_applications();
  if jsonb_array_length(apps) < 6 then raise exception 'Expected at least 6 applications'; end if;

  apps := public.admin_revise_application('DEMO001', 'Community craft marketplace v2', 'Sample enterprise A', 'Creative Industries', 'Updated summary for craft makers.', 1, 'Corrected typo in title');
  apps := public.admin_intervene_application_status('DEMO003', 'In review', 1, true, 'Moved into review after intake check');

  contents := public.admin_save_content('FAQs', 'How are applications assessed?', 'Each submission is reviewed across configurable weighted criteria summing to 100% on a 1 to 5 scale.', 'Approved FAQ addition');
  if jsonb_array_length(contents) < 5 then raise exception 'Expected saved content item'; end if;

  notifs := public.admin_save_notification('Announcement', 'Portal maintenance window', 'Scheduled maintenance on Sunday at 22:00 Botswana time.', 'Approved maintenance notice');
  if jsonb_array_length(notifs->'inbox') < 4 then raise exception 'Expected queued announcement in inbox'; end if;

  matters := public.admin_update_matter('TKT002', 'Ops Admin', 'Investigating', 'Checking email provider logs');
  if jsonb_array_length(matters) < 6 then raise exception 'Expected 6 matters'; end if;

  configs := public.admin_save_configuration('optimus_guidance', '{"tone":"Warm and supportive","length":"Concise","instructions":"Keep answers brief.","handoff":"Escalate complex cases."}'::jsonb, 'Refined Optimus Prime tone');
  if (configs->'optimus_guidance'->>'version')::int < 2 then raise exception 'Expected configuration version increment'; end if;

  rubric := public.admin_assessment_criteria_get();
  if (rubric->>'version')::int < 1 or jsonb_array_length(rubric->'criteria') < 1 then
    raise exception 'Expected active assessment rubric';
  end if;

  begin
    perform public.admin_save_assessment_criteria('[
      {"label":"Strategic alignment","weight":60,"description":"Mandate","active":true},
      {"label":"Innovation","weight":30,"description":"Novelty","active":true}
    ]'::jsonb, 'Invalid weights check', 60);
  exception when raise_exception then
    weight_error_caught := true;
  end;
  if not weight_error_caught then raise exception 'Expected non-100%% criterion weights to fail'; end if;

  rubric := public.admin_save_assessment_criteria('[
    {"key":"strategic-alignment","label":"Strategic alignment","weight":40,"description":"Mandate fit","active":true},
    {"key":"innovation-and-originality","label":"Innovation and originality","weight":35,"description":"Original solution","active":true},
    {"key":"impact-potential","label":"Impact potential","weight":25,"description":"Job creation","active":true}
  ]'::jsonb, 'Reweighted strategic rubric for Q4 intake', 65);
  if (rubric->>'version')::int < 2 or (rubric->>'passThreshold')::numeric <> 65::numeric then
    raise exception 'Expected rubric version increment and updated pass threshold';
  end if;

  audits := public.admin_audit_feed('Ops Admin', 0);
  if jsonb_array_length(audits) < 5 then raise exception 'Expected all admin mutations to appear in audit feed'; end if;
end $$;

reset role;
rollback;
