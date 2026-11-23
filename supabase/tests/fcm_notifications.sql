begin;

do $$
declare
  inn_uid uuid;
  inn_sess uuid;
  as_uid uuid;
  as_sess uuid;
  adm_uid uuid;
  adm_sess uuid;
  dev jsonb;
  prefs jsonb;
  test_res jsonb;
  q_id uuid;
  leased jsonb;
  leased_item jsonb;
  active_count integer;
begin
  select p.id, s.id
  into inn_uid, inn_sess
  from public.profiles p
  join auth.users u on u.id = p.id
  join auth.sessions s on s.user_id = p.id
  where p.account_role = 'innovator'
    and p.account_status = 'active'
    and u.email_confirmed_at is not null
    and (s.not_after is null or s.not_after > now())
  limit 1;

  select p.id, s.id
  into as_uid, as_sess
  from public.profiles p
  join auth.users u on u.id = p.id
  join auth.sessions s on s.user_id = p.id
  where p.account_role = 'assessor'
    and p.account_status = 'active'
    and u.email_confirmed_at is not null
    and (s.not_after is null or s.not_after > now())
  limit 1;

  select p.id, s.id
  into adm_uid, adm_sess
  from public.profiles p
  join auth.users u on u.id = p.id
  join auth.sessions s on s.user_id = p.id
  where p.account_role = 'admin'
    and p.account_status = 'active'
    and u.email_confirmed_at is not null
    and (s.not_after is null or s.not_after > now())
  limit 1;

  if inn_uid is null or as_uid is null or adm_uid is null then
    raise exception 'Missing verified active fixture profiles/sessions across roles';
  end if;

  -- 1. Register token as innovator, then transfer ownership to assessor on conflict
  perform set_config('request.jwt.claims', jsonb_build_object('sub', inn_uid::text, 'role', 'authenticated', 'session_id', inn_sess::text)::text, true);
  dev := public.register_notification_device('fcm_test_token_1234567890_abcdef', 'android', 'Pixel Test', 'granted');
  if coalesce(dev->>'appRole', '') <> 'innovator' or coalesce((dev->>'isActive')::boolean, false) is distinct from true then
    raise exception 'Expected active innovator device registration, got %', dev;
  end if;

  perform set_config('request.jwt.claims', jsonb_build_object('sub', as_uid::text, 'role', 'authenticated', 'session_id', as_sess::text)::text, true);
  dev := public.register_notification_device('fcm_test_token_1234567890_abcdef', 'android', 'Assessor Phone', 'granted');
  if coalesce(dev->>'appRole', '') <> 'assessor' then
    raise exception 'Expected device ownership transfer to assessor, got %', dev;
  end if;

  select count(*) into active_count
  from public.notification_devices
  where fcm_token = 'fcm_test_token_1234567890_abcdef' and user_id = as_uid and is_active = true;
  if active_count <> 1 then
    raise exception 'Expected exactly 1 active device row owned by assessor, got %', active_count;
  end if;

  -- 2. Sign-out deactivation & preference toggle filtering
  perform set_config('request.jwt.claims', jsonb_build_object('sub', inn_uid::text, 'role', 'authenticated', 'session_id', inn_sess::text)::text, true);
  dev := public.register_notification_device('fcm_inn_token_1234567890_abcdef', 'android', 'Innovator Phone', 'granted');
  prefs := public.update_push_preferences(false, true, true, true);
  if coalesce((prefs->>'pushNotifications')::boolean, true) <> false then
    raise exception 'Expected pushNotifications=false, got %', prefs;
  end if;

  insert into public.innovator_notifications (user_id, kind, title, message, application_ref, target_hash)
  values (inn_uid, 'clarification', 'Test clarification push', 'Please upload revised CIPA certificate.', 'CEDA-TEST-01', '#applications');

  select id into q_id
  from public.notification_queue
  where recipient_user_id = inn_uid and application_ref = 'CEDA-TEST-01'
  order by created_at desc
  limit 1;

  if q_id is null then
    raise exception 'Trigger did not enqueue notification_queue row for innovator notification';
  end if;

  -- Opted out -> lease returns 0 eligible devices for q_id
  leased := public.fcm_lease_queue_batch(5, 'sql-test', q_id);
  leased_item := leased->0;
  if jsonb_array_length(coalesce(leased_item->'devices', '[]'::jsonb)) <> 0 then
    raise exception 'Expected opted-out innovator device to be excluded, got %', leased_item;
  end if;

  -- Re-enable pushNotifications -> retry & lease includes innovator device
  perform public.update_push_preferences(true, true, true, true);
  leased := public.fcm_lease_queue_batch(5, 'sql-test', q_id);
  leased_item := leased->0;
  if jsonb_array_length(coalesce(leased_item->'devices', '[]'::jsonb)) <> 1 then
    raise exception 'Expected 1 eligible innovator device after opt-in, got %', leased_item;
  end if;

  -- 3. Complete with unregistered token -> auto-deactivates device
  perform public.fcm_complete_queue_item(
    q_id,
    'Failed',
    null,
    'UNREGISTERED',
    now(),
    jsonb_build_array(jsonb_build_object(
      'deviceId', leased_item->'devices'->0->>'deviceId',
      'userId', inn_uid::text,
      'status', 'unregistered',
      'errorCode', 'UNREGISTERED',
      'errorMessage', 'Requested entity was not found.'
    ))
  );

  select count(*) into active_count
  from public.notification_devices
  where fcm_token = 'fcm_inn_token_1234567890_abcdef' and is_active = false and revoked_at is not null;
  if active_count <> 1 then
    raise exception 'Expected UNREGISTERED feedback to deactivate device';
  end if;

  -- 4. Admin overview, targeted save, test push, and retry RPCs
  perform set_config('request.jwt.claims', jsonb_build_object('sub', adm_uid::text, 'role', 'authenticated', 'session_id', adm_sess::text)::text, true);
  test_res := public.admin_send_test_push('Admin test push', 'Testing FCM delivery route.');
  if (test_res->>'queueId') is null or ((test_res->'overview'->'fcmSummary'->>'activeDevices')::int < 1) then
    raise exception 'Expected admin_send_test_push to queue item and report fcmSummary, got %', test_res;
  end if;

  perform public.admin_retry_notification(q_id);
  perform public.admin_save_notification_with_target('Announcement', 'Assessor calibration briefing', 'Please review assigned innovation dossiers before Friday 16:00.', 'Verify targeted audience announcement', 'Assessor', 'In-app + Push');

  -- 5. Confirm authenticated role cannot directly query service tables or invoke service_role RPCs
  set local role authenticated;
  begin
    perform public.fcm_lease_queue_batch(5, 'bad-caller', null);
    raise exception 'Expected insufficient_privilege on fcm_lease_queue_batch';
  exception when insufficient_privilege then
    null;
  end;

  begin
    perform * from public.notification_devices limit 1;
    raise exception 'Expected insufficient_privilege on direct notification_devices select';
  exception when insufficient_privilege then
    null;
  end;
  reset role;
end $$;

rollback;
