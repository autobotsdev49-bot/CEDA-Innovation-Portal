-- Expand Email + Push notification triggers to cover Assessor panel assignments,
-- Assessor review/voting openings, Support Officer ticket/reply alerts, Admin urgent alerts,
-- and Innovator support-ticket receipt acknowledgements.

-- 1. Ensure notification_templates reflect Email + Push support across all roles
update public.notification_templates
set channel = 'In-app + Email + Push',
    updated_at = now()
where event_key in ('support_reply', 'support_ticket_queued', 'committee_stage_milestone')
  and channel not ilike '%Email%';

insert into public.notification_templates (event_key, title, kind, channel, audience, status, message)
values
  ('voting_opened', 'Panel voting open', 'Email template', 'In-app + Email + Push', 'Assessor', 'Enabled', 'Panel voting is now open for an assigned innovation submission. Sign in to cast your vote.'),
  ('support_innovator_reply', 'Innovator replied on support ticket', 'Email template', 'In-app + Email + Push', 'Support Officer', 'Enabled', 'An innovator replied on an open support ticket. Open the Support Desk queue to respond.'),
  ('support_ticket_received', 'Support request received', 'Email template', 'In-app + Email + Push', 'Innovator', 'Enabled', 'Your support request has been received by the CEDA Support Desk. An officer will respond shortly.'),
  ('admin_alert', 'Urgent follow-up alert', 'Email template', 'In-app + Email + Push', 'Administrator', 'Enabled', 'A high-priority delivery or bug follow-up item requires administrator review.'),
  ('award_conferred', 'CEDA Innovation Award conferred', 'Email template', 'In-app + Email + Push', 'Innovator', 'Enabled', 'Congratulations! Your innovation submission has been conferred a CEDA Innovation Award.')
on conflict (event_key) do nothing;

-- 2. Assessor panel assignment -> Email + Push
create or replace function ceda_private.enqueue_fcm_from_assessment_member()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  app_rec record;
  wants_email boolean;
  wants_push boolean;
  target_email text;
  channel_label text;
begin
  select a.id as case_id, a.reference, a.title
  into app_rec
  from ceda_private.assessment_rounds r
  join public.innovation_applications a on a.id = r.case_id
  where r.id = NEW.round_id;

  if app_rec.reference is null then
    return NEW;
  end if;

  wants_email := ceda_private.user_wants_alert(NEW.user_id, app_rec.reference, 'panel_assignment', 'email');
  wants_push := ceda_private.user_wants_alert(NEW.user_id, app_rec.reference, 'panel_assignment', 'push');

  channel_label := 'In-app'
    || case when wants_email then ' + Email' else '' end
    || case when wants_push then ' + Push' else '' end;

  if wants_email then
    select lower(email) into target_email
    from auth.users
    where id = NEW.user_id;
  end if;

  insert into public.notification_queue (
    idempotency_key,
    recipient_user_id,
    recipient_email,
    event_key,
    category,
    title,
    message,
    channel,
    audience,
    status,
    email_status,
    action_target,
    application_ref,
    target_hash,
    data_payload,
    provider,
    created_by
  )
  values (
    'asgn-' || NEW.round_id::text || '-' || NEW.user_id::text,
    NEW.user_id,
    target_email,
    'panel_assignment',
    'Assessment assignment',
    left(app_rec.reference || ' — Assessment assignment', 160),
    left('You have an assessment round assignment for ' || app_rec.reference || '. Sign in to complete conflict check and review.', 2000),
    channel_label,
    'Assessor',
    case when wants_push or wants_email then 'Queued' else 'Sent' end,
    case when wants_email and target_email is not null then 'Queued' else 'Skipped' end,
    'assessments',
    app_rec.reference,
    '#assessments',
    jsonb_build_object(
      'eventKey', 'panel_assignment',
      'caseId', app_rec.case_id::text,
      'roundId', NEW.round_id::text,
      'applicationRef', app_rec.reference,
      'targetHash', '#assessments',
      'audience', 'assessor'
    ),
    case when wants_email and wants_push then 'multi' when wants_email then 'email' else 'fcm' end,
    NEW.user_id
  )
  on conflict (idempotency_key) do nothing;

  return NEW;
end $$;

-- 3. Assessor review & voting round transitions -> Email + Push
create or replace function ceda_private.enqueue_fcm_from_assessment_round()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  app_rec record;
  member_rec record;
  evt_key text;
  evt_title text;
  evt_body text;
  wants_email boolean;
  wants_push boolean;
  channel_label text;
begin
  if NEW.state is not distinct from OLD.state or NEW.state not in ('review', 'voting') then
    return NEW;
  end if;

  select a.id as case_id, a.reference
  into app_rec
  from public.innovation_applications a
  where a.id = NEW.case_id;

  if app_rec.reference is null then
    return NEW;
  end if;

  evt_key := case when NEW.state = 'voting' then 'voting_opened' else 'review_started' end;
  evt_title := case when NEW.state = 'voting'
    then app_rec.reference || ' — Voting open'
    else app_rec.reference || ' — Assessment review open'
  end;
  evt_body := case when NEW.state = 'voting'
    then 'Panel voting is now open for ' || app_rec.reference || '. Open your Assessor workspace to cast your vote.'
    else 'Assessment review has started for ' || app_rec.reference || '. Open your Assessor workspace to begin scoring.'
  end;

  for member_rec in
    select m.user_id, lower(u.email) as email
    from ceda_private.assessment_members m
    join auth.users u on u.id = m.user_id
    where m.round_id = NEW.id
      and m.conflict <> 'recused'
  loop
    wants_email := ceda_private.user_wants_alert(member_rec.user_id, app_rec.reference, evt_key, 'email');
    wants_push := ceda_private.user_wants_alert(member_rec.user_id, app_rec.reference, evt_key, 'push');
    channel_label := 'In-app'
      || case when wants_email then ' + Email' else '' end
      || case when wants_push then ' + Push' else '' end;

    insert into public.notification_queue (
      idempotency_key,
      recipient_user_id,
      recipient_email,
      event_key,
      category,
      title,
      message,
      channel,
      audience,
      status,
      email_status,
      action_target,
      application_ref,
      target_hash,
      data_payload,
      provider,
      created_by
    )
    values (
      'rnd-' || NEW.id::text || '-' || NEW.state || '-' || member_rec.user_id::text,
      member_rec.user_id,
      case when wants_email then member_rec.email else null end,
      evt_key,
      'Assessment round',
      left(evt_title, 160),
      left(evt_body, 2000),
      channel_label,
      'Assessor',
      case when wants_push or wants_email then 'Queued' else 'Sent' end,
      case when wants_email and member_rec.email is not null then 'Queued' else 'Skipped' end,
      'assessments',
      app_rec.reference,
      '#assessments',
      jsonb_build_object(
        'eventKey', evt_key,
        'caseId', app_rec.case_id::text,
        'roundId', NEW.id::text,
        'applicationRef', app_rec.reference,
        'targetHash', '#assessments',
        'audience', 'assessor'
      ),
      case when wants_email and wants_push then 'multi' when wants_email then 'email' else 'fcm' end,
      member_rec.user_id
    )
    on conflict (idempotency_key) do nothing;
  end loop;

  return NEW;
end $$;

-- 4. Support Officer new ticket / reply, Admin urgent alerts, and Innovator support receipt -> Email + Push
create or replace function ceda_private.enqueue_fcm_from_admin_matter()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  last_msg jsonb;
  old_len integer := 0;
  new_len integer := 0;
  target_officer_id uuid := null;
  target_officer_email text := null;
  innovator_email text := null;
  target_audience text := 'Support Officer';
begin
  if TG_OP = 'INSERT' then
    if NEW.owner_id is not null and NEW.kind in ('Bug', 'Support', 'Feedback') then
      insert into public.notification_queue (
        idempotency_key,
        recipient_user_id,
        event_key,
        category,
        title,
        message,
        channel,
        audience,
        status,
        email_status,
        action_target,
        application_ref,
        target_hash,
        data_payload,
        provider,
        created_by
      )
      values (
        'sup-new-' || NEW.id::text,
        null,
        'support_ticket_queued',
        'Support queue',
        left(NEW.reference || ' — New ' || lower(NEW.kind) || ' request (' || NEW.priority || ')', 160),
        left('Support ticket ' || NEW.reference || ' is waiting in the CEDA Support Desk queue.', 2000),
        'In-app + Email + Push',
        'Support Officer',
        'Queued',
        'Queued',
        'queue',
        NEW.application_ref,
        '#queue',
        jsonb_strip_nulls(jsonb_build_object(
          'eventKey', 'support_ticket_queued',
          'ticketRef', NEW.reference,
          'priority', NEW.priority,
          'applicationRef', NEW.application_ref,
          'targetHash', '#queue',
          'audience', 'support'
        )),
        'multi',
        NEW.owner_id
      )
      on conflict (idempotency_key) do nothing;

      -- Send receipt acknowledgement email to the innovator who opened the support request
      if ceda_private.user_wants_alert(NEW.owner_id, NEW.application_ref, 'support', 'email') then
        select lower(email) into innovator_email
        from auth.users
        where id = NEW.owner_id;

        if innovator_email is not null then
          insert into public.notification_queue (
            idempotency_key,
            recipient_user_id,
            recipient_email,
            event_key,
            category,
            title,
            message,
            channel,
            audience,
            status,
            email_status,
            action_target,
            application_ref,
            target_hash,
            data_payload,
            provider,
            created_by
          )
          values (
            'sup-ack-' || NEW.id::text,
            NEW.owner_id,
            innovator_email,
            'support_ticket_received',
            'Support receipt',
            left(NEW.reference || ' — Support request received', 160),
            left('Your ' || lower(NEW.kind) || ' request (' || NEW.reference || ') has been received by the CEDA Support Desk. A support officer will review and reply shortly.', 2000),
            'In-app + Email',
            'Innovator',
            'Queued',
            'Queued',
            'support',
            NEW.application_ref,
            '#support',
            jsonb_strip_nulls(jsonb_build_object(
              'eventKey', 'support_ticket_received',
              'ticketRef', NEW.reference,
              'applicationRef', NEW.application_ref,
              'targetHash', '#support',
              'audience', 'innovator'
            )),
            'email',
            NEW.owner_id
          )
          on conflict (idempotency_key) do nothing;
        end if;
      end if;
    end if;

    if NEW.kind = 'Delivery' or (NEW.kind = 'Bug' and NEW.priority = 'High') then
      insert into public.notification_queue (
        idempotency_key,
        recipient_user_id,
        event_key,
        category,
        title,
        message,
        channel,
        audience,
        status,
        email_status,
        action_target,
        application_ref,
        target_hash,
        data_payload,
        provider
      )
      values (
        'adm-matter-' || NEW.id::text,
        null,
        'admin_alert',
        'Follow-up alert',
        left(NEW.reference || ' — ' || NEW.kind || ' alert (' || NEW.priority || ')', 160),
        left('Administrator follow-up item ' || NEW.reference || ' requires review in Follow-ups.', 2000),
        'In-app + Email + Push',
        'Administrator',
        'Queued',
        'Queued',
        'followup',
        NEW.application_ref,
        '#followup',
        jsonb_strip_nulls(jsonb_build_object(
          'eventKey', 'admin_alert',
          'matterRef', NEW.reference,
          'priority', NEW.priority,
          'targetHash', '#followup',
          'audience', 'admin'
        )),
        'multi'
      )
      on conflict (idempotency_key) do nothing;
    end if;
    return NEW;
  end if;

  if TG_OP = 'UPDATE' then
    old_len := coalesce(jsonb_array_length(OLD.thread_messages), 0);
    new_len := coalesce(jsonb_array_length(NEW.thread_messages), 0);
    if new_len > old_len then
      last_msg := NEW.thread_messages -> (new_len - 1);
      if coalesce(last_msg->>'role', '') = 'innovator' then
        if nullif(btrim(coalesce(NEW.owner_name, '')), '') is not null and NEW.owner_name <> 'Unassigned' then
          select p.id, lower(u.email) into target_officer_id, target_officer_email
          from public.profiles p
          join auth.users u on u.id = p.id
          where lower(btrim(p.full_name)) = lower(btrim(NEW.owner_name))
            and p.account_role = 'support'
            and p.account_status = 'active'
          limit 1;
        end if;

        insert into public.notification_queue (
          idempotency_key,
          recipient_user_id,
          recipient_email,
          event_key,
          category,
          title,
          message,
          channel,
          audience,
          status,
          email_status,
          action_target,
          application_ref,
          target_hash,
          data_payload,
          provider
        )
        values (
          'sup-reply-' || NEW.id::text || '-' || new_len::text,
          target_officer_id,
          target_officer_email,
          'support_innovator_reply',
          'Support reply',
          left(NEW.reference || ' — Innovator replied', 160),
          left('An innovator replied on support ticket ' || NEW.reference || '. Open Support Desk to respond.', 2000),
          'In-app + Email + Push',
          target_audience,
          'Queued',
          'Queued',
          'queue',
          NEW.application_ref,
          '#queue',
          jsonb_strip_nulls(jsonb_build_object(
            'eventKey', 'support_innovator_reply',
            'ticketRef', NEW.reference,
            'applicationRef', NEW.application_ref,
            'targetHash', '#queue',
            'audience', 'support'
          )),
          'multi'
        )
        on conflict (idempotency_key) do nothing;
      end if;
    end if;
  end if;

  return NEW;
end $$;
