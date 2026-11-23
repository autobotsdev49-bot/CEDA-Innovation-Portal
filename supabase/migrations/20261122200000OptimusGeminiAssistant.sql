-- Upgrade Optimus Prime with Gemini context/recording RPCs, controlled portal knowledge,
-- smart automatic human-support escalation, and DB-side Circuit Breaker fallback.

alter table public.optimus_interactions
  add column if not exists escalation_reason text,
  add column if not exists ai_provider text default 'controlled-fallback',
  add column if not exists interaction_id text;

create index if not exists idx_optimus_interactions_user_created
  on public.optimus_interactions (user_id, created_at desc);

create index if not exists idx_admin_matters_owner_reported
  on public.admin_matters (owner_id, reported_at desc);

-- Enrich untouched default Optimus configuration entries for Admin governance
insert into public.portal_configurations (config_key, payload, version, reason)
values (
  'optimus_guidance',
  jsonb_build_object(
    'tone', 'Warm, encouraging, clear, and personal — like an attentive CEDA personal assistant',
    'length', 'Balanced',
    'instructions', 'Ground every reply in approved CEDA Innovation Portal guidance and the applicant''s non-confidential context. Give clear step-by-step next actions, never reveal internal assessor scores or names, and never guarantee approval or loan amounts.',
    'handoff', 'Automatically escalate to a human CEDA Support Officer whenever an applicant faces a technical blocker, locked-application edit request, deadline extension need, outcome dispute/appeal, loan/legal question, or policy exception — even if they do not explicitly ask for a human.'
  ),
  1,
  'Initial Gemini personal assistant configuration'
)
on conflict (config_key) do update
  set payload = excluded.payload,
      updated_at = now()
  where public.portal_configurations.version = 1;

insert into public.portal_configurations (config_key, payload, version, reason)
values (
  'optimus_knowledge',
  jsonb_build_object(
    'source', 'https://www.ceda.co.bw/',
    'notes', 'CEDA Innovation Portal supports Individual Batswana citizen innovators (Omang, 18+) and Botswana-registered companies (CIPA). Applications cover 12 structured steps adapting to 6 stages (Idea, R&D, Prototype, Pilot, Operational, Scaling). Supporting evidence limits: 12 files in Applicant & eligibility, 8 in Supplementary evidence, 4 per other section (10 MB max each; PDF, DOCX, PPTX, XLSX, JPG, PNG; HTTPS video links only). Official CEDA support: Toll-Free 0800 600 253, +267 317 0895, feedback@ceda.co.bw.',
    'questions', E'Who is eligible to apply as an Individual or Registered company?\nHow do the 12 wizard steps and 6 adaptive stages work?\nWhat supporting evidence formats, file limits, and HTTPS video links are accepted?\nWhat do Draft, Submitted, In review, and Changes requested mean?\nHow do I respond to a clarification request or withdraw an application?'
  ),
  1,
  'Initial controlled CEDA Innovation Portal knowledge manual'
)
on conflict (config_key) do update
  set payload = excluded.payload,
      updated_at = now()
  where public.portal_configurations.version = 1;

-- Shared support-request serializer (masks support officer full name to first name only)
create or replace function ceda_private.optimus_project_support_requests(p_actor uuid)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'id', m.reference,
        'title', m.title,
        'kind', m.kind,
        'priority', m.priority,
        'state', m.state,
        'owner', case
          when m.owner_name = 'Unassigned' then 'CEDA Support Desk'
          else coalesce(nullif(split_part(btrim(m.owner_name), ' ', 1), ''), 'CEDA Support')
        end,
        'applicationRef', m.application_ref,
        'detail', m.detail,
        'steps', m.steps,
        'thread', coalesce((
          select jsonb_agg(
            case
              when (t.elem->>'role') in ('support', 'admin', 'system')
                and nullif(btrim(coalesce(t.elem->>'sender', '')), '') is not null
                then jsonb_set(t.elem, '{sender}', to_jsonb(split_part(btrim(t.elem->>'sender'), ' ', 1)))
              else t.elem
            end
            order by t.ord
          )
          from jsonb_array_elements(coalesce(m.thread_messages, '[]'::jsonb)) with ordinality as t(elem, ord)
        ), '[]'::jsonb),
        'reportedAt', to_char(m.reported_at at time zone 'Africa/Gaborone', 'YYYY-MM-DD HH24:MI')
      ) order by m.reported_at desc
    )
    from public.admin_matters m
    where m.owner_id = p_actor
  ), '[]'::jsonb);
$$;

-- Shared Optimus interaction serializer (20 latest turns)
create or replace function ceda_private.optimus_project_history(p_actor uuid)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'id', o.id,
        'topic', o.topic,
        'question', o.question,
        'answer', o.answer,
        'sourceArticle', o.source_article,
        'escalated', o.escalated,
        'escalationReason', o.escalation_reason,
        'aiProvider', o.ai_provider,
        'rating', o.rating,
        'createdAt', to_char(o.created_at at time zone 'Africa/Gaborone', 'YYYY-MM-DD HH24:MI')
      ) order by o.created_at desc
    )
    from (
      select * from public.optimus_interactions
      where user_id = p_actor
      order by created_at desc
      limit 20
    ) o
  ), '[]'::jsonb);
$$;

-- Gather strict, non-confidential portal + applicant context for Gemini Inference
create or replace function ceda_private.innovator_optimus_context()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := ceda_private.require_innovator();
  prof record;
  cfg_guidance jsonb := '{}'::jsonb;
  cfg_knowledge jsonb := '{}'::jsonb;
  cfg_policies jsonb := '{}'::jsonb;
  questions_text text := '';
begin
  select p.id, p.full_name, coalesce(nullif(btrim(p.company_name), ''), '') as company_name
  into prof
  from public.profiles p
  where p.id = actor;

  select coalesce(payload, '{}'::jsonb) into cfg_guidance
  from public.portal_configurations where config_key = 'optimus_guidance';

  select coalesce(payload, '{}'::jsonb) into cfg_knowledge
  from public.portal_configurations where config_key = 'optimus_knowledge';

  select coalesce(payload, '{}'::jsonb) into cfg_policies
  from public.portal_configurations where config_key = 'portal_policies';

  questions_text := coalesce(cfg_knowledge->>'questions', '');

  return jsonb_build_object(
    'user', jsonb_build_object(
      'id', actor,
      'fullName', coalesce(prof.full_name, 'Innovator'),
      'applicantType', case when length(coalesce(prof.company_name, '')) > 0 then 'Registered company' else 'Individual' end
    ),
    'applications', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', a.id,
          'reference', a.reference,
          'title', a.title,
          'sector', a.sector,
          'stage', coalesce(nullif(btrim(a.form_data->>'stage'), ''), 'Idea'),
          'applicantType', a.applicant_type,
          'status', a.status,
          'submittedAt', case when a.submitted_at is not null then to_char(a.submitted_at at time zone 'Africa/Gaborone', 'YYYY-MM-DD HH24:MI') else null end,
          'updatedAt', to_char(a.updated_at at time zone 'Africa/Gaborone', 'YYYY-MM-DD HH24:MI'),
          'clarificationDueAt', coalesce(nullif(btrim(a.requested_changes->>'deadline'), ''), nullif(btrim(a.requested_changes->>'dueAt'), '')),
          'clarificationNote', coalesce(nullif(btrim(a.requested_changes->>'reason'), ''), nullif(btrim(a.requested_changes->>'notes'), ''))
        ) order by a.updated_at desc
      )
      from (
        select * from public.innovation_applications
        where owner_id = actor
        order by updated_at desc
        limit 10
      ) a
    ), '[]'::jsonb),
    'sectors', coalesce((
      select jsonb_agg(s.name order by s.name)
      from public.sectors s
      where s.status = 'published'
    ), '[]'::jsonb),
    'faqs', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'question', c.title,
          'answer', c.body,
          'category', c.kind
        ) order by c.updated_at desc
      )
      from (
        select * from public.portal_content
        where stage = 'Published' and kind in ('FAQs', 'Public pages', 'Announcements')
        order by updated_at desc
        limit 16
      ) c
    ), '[]'::jsonb),
    'guidance', jsonb_build_object(
      'tone', coalesce(cfg_guidance->>'tone', 'Warm, clear and professional'),
      'length', coalesce(cfg_guidance->>'length', 'Balanced'),
      'instructions', coalesce(cfg_guidance->>'instructions', 'Use plain language, cite approved CEDA guidance and explain the next step clearly.'),
      'handoff', coalesce(cfg_guidance->>'handoff', 'Escalate immediately to human support whenever a request is beyond AI reach.')
    ),
    'knowledge', jsonb_build_object(
      'source', coalesce(cfg_knowledge->>'source', 'https://www.ceda.co.bw/'),
      'notes', coalesce(cfg_knowledge->>'notes', ''),
      'questions', coalesce((
        select jsonb_agg(btrim(line))
        from unnest(string_to_array(replace(questions_text, E'\r\n', E'\n'), E'\n')) as line
        where length(btrim(line)) > 0
      ), '[]'::jsonb)
    ),
    'policies', jsonb_build_object(
      'area', coalesce(cfg_policies->>'area', 'General'),
      'proposal', coalesce(cfg_policies->>'proposal', '')
    ),
    'recentHistory', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'question', o.question,
          'answer', o.answer,
          'topic', o.topic,
          'sourceArticle', o.source_article,
          'escalated', o.escalated,
          'createdAt', to_char(o.created_at at time zone 'Africa/Gaborone', 'YYYY-MM-DD HH24:MI')
        ) order by o.created_at desc
      )
      from (
        select * from public.optimus_interactions
        where user_id = actor
        order by created_at desc
        limit 6
      ) o
    ), '[]'::jsonb),
    'openSupportTickets', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', m.id,
          'reference', m.reference,
          'title', m.title,
          'status', m.state,
          'priority', m.priority,
          'category', m.kind,
          'updatedAt', to_char(m.updated_at at time zone 'Africa/Gaborone', 'YYYY-MM-DD HH24:MI')
        ) order by m.reported_at desc
      )
      from public.admin_matters m
      where m.owner_id = actor and m.state <> 'Resolved'
    ), '[]'::jsonb)
  );
end $$;

create or replace function public.innovator_optimus_context()
returns jsonb
language sql
set search_path = ''
as $$ select ceda_private.innovator_optimus_context() $$;

-- Persist one Optimus turn and seamlessly create or append to a live Support ticket when auto-escalated
create or replace function ceda_private.innovator_record_optimus_turn(
  p_question text,
  p_answer text,
  p_topic text default 'general',
  p_source_article text default 'CEDA Approved Guidance',
  p_auto_escalate boolean default false,
  p_escalation_reason text default null,
  p_escalation_category text default 'support',
  p_escalation_priority text default 'Normal',
  p_related_app_ref text default null,
  p_ai_provider text default 'controlled-fallback',
  p_interaction_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := ceda_private.require_innovator();
  clean_question text := left(btrim(coalesce(p_question, '')), 1000);
  clean_answer text := left(btrim(coalesce(p_answer, '')), 4000);
  clean_topic text := coalesce(nullif(btrim(coalesce(p_topic, '')), ''), 'general');
  clean_source text := coalesce(nullif(btrim(coalesce(p_source_article, '')), ''), 'CEDA Approved Guidance');
  clean_reason text := nullif(btrim(coalesce(p_escalation_reason, '')), '');
  clean_priority text := case when p_escalation_priority = 'High' then 'High' else 'Normal' end;
  ticket_kind text := case when p_escalation_category = 'bug' then 'Bug' else 'Support' end;
  reporter_name text;
  linked_app_id uuid;
  clean_app_ref text;
  new_interaction_id uuid;
  existing_ticket record;
  new_ref text;
  ticket_ref text := null;
  now_bw text := to_char(now() at time zone 'Africa/Gaborone', 'YYYY-MM-DD HH24:MI');
  ticket_detail text;
begin
  if length(clean_question) < 2 then
    raise exception 'Enter a question between 2 and 1000 characters';
  end if;
  if length(clean_answer) < 2 then
    clean_answer := 'I have reviewed your question and routed it for accurate assistance.';
  end if;

  if p_related_app_ref is not null and length(btrim(p_related_app_ref)) > 0 then
    select a.id, a.reference
    into linked_app_id, clean_app_ref
    from public.innovation_applications a
    where a.owner_id = actor and upper(a.reference) = upper(btrim(p_related_app_ref))
    limit 1;
  end if;

  insert into public.optimus_interactions (
    user_id, topic, question, answer, source_article, escalated, escalation_reason, ai_provider, interaction_id
  )
  values (
    actor,
    clean_topic,
    clean_question,
    clean_answer,
    clean_source,
    coalesce(p_auto_escalate, false),
    clean_reason,
    coalesce(nullif(btrim(coalesce(p_ai_provider, '')), ''), 'controlled-fallback'),
    nullif(btrim(coalesce(p_interaction_id, '')), '')
  )
  returning id into new_interaction_id;

  if coalesce(p_auto_escalate, false) then
    select full_name into reporter_name from public.profiles where id = actor;
    reporter_name := coalesce(nullif(btrim(reporter_name), ''), 'Innovator');

    select * into existing_ticket
    from public.admin_matters m
    where m.owner_id = actor
      and m.state <> 'Resolved'
      and (m.steps = 'Escalated from Optimus Prime' or m.title ilike '%Optimus Prime%')
    order by m.reported_at desc
    limit 1;

    ticket_detail := left(
      btrim(
        coalesce(clean_reason, 'Auto-escalated by Optimus Prime (beyond automated AI scope).')
        || E'\n\nInnovator message: ' || clean_question
      ),
      2000
    );
    if length(ticket_detail) < 5 then
      ticket_detail := 'Auto-escalated by Optimus Prime.';
    end if;

    if existing_ticket.id is not null then
      ticket_ref := existing_ticket.reference;
      update public.admin_matters
      set thread_messages = coalesce(thread_messages, '[]'::jsonb) || jsonb_build_array(
            jsonb_build_object(
              'sender', reporter_name,
              'role', 'innovator',
              'body', clean_question,
              'at', now_bw
            ),
            jsonb_build_object(
              'sender', 'Optimus Prime',
              'role', 'system',
              'body', coalesce(clean_reason, 'Follow-up auto-routed for CEDA Support Officer attention.'),
              'at', now_bw
            )
          ),
          priority = case when clean_priority = 'High' then 'High' else priority end,
          application_ref = coalesce(application_ref, clean_app_ref),
          updated_at = now()
      where id = existing_ticket.id;

      insert into public.portal_messages (
        owner_id, application_id, application_ref, thread_type, subject,
        sender_id, sender_name, sender_role, body, is_read_by_innovator
      )
      values (
        actor,
        linked_app_id,
        clean_app_ref,
        'support',
        ticket_ref || ' — Optimus Prime Follow-Up',
        actor,
        reporter_name,
        'innovator',
        clean_question,
        true
      );
    else
      new_ref := (case when ticket_kind = 'Bug' then 'BUG-' else 'TKT-' end)
        || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
      ticket_ref := new_ref;

      insert into public.admin_matters (
        reference, title, kind, reporter, owner_id, priority, state, owner_name,
        application_ref, detail, steps, thread_messages
      )
      values (
        new_ref,
        'Human support follow-up from Optimus Prime',
        ticket_kind,
        reporter_name,
        actor,
        clean_priority,
        'Open',
        'Unassigned',
        clean_app_ref,
        ticket_detail,
        'Escalated from Optimus Prime',
        jsonb_build_array(
          jsonb_build_object(
            'sender', reporter_name,
            'role', 'innovator',
            'body', clean_question,
            'at', now_bw
          ),
          jsonb_build_object(
            'sender', 'Optimus Prime',
            'role', 'system',
            'body', coalesce(clean_reason, 'Automatically routed to a CEDA Support Officer.'),
            'at', now_bw
          )
        )
      );

      insert into public.portal_messages (
        owner_id, application_id, application_ref, thread_type, subject,
        sender_id, sender_name, sender_role, body, is_read_by_innovator
      )
      values (
        actor,
        linked_app_id,
        clean_app_ref,
        'support',
        new_ref || ' — Human support follow-up from Optimus Prime',
        actor,
        reporter_name,
        'innovator',
        ticket_detail,
        true
      );

      insert into public.innovator_notifications (
        user_id, kind, title, message, application_ref, target_hash
      )
      values (
        actor,
        'support',
        new_ref || ' queued for a CEDA Support Officer',
        coalesce(clean_reason, 'Optimus Prime routed your conversation directly to CEDA Support.'),
        clean_app_ref,
        '#support'
      );
    end if;
  end if;

  return jsonb_build_object(
    'latest', (
      select jsonb_build_object(
        'id', o.id,
        'topic', o.topic,
        'question', o.question,
        'answer', o.answer,
        'sourceArticle', o.source_article,
        'escalated', o.escalated,
        'escalationReason', o.escalation_reason,
        'aiProvider', o.ai_provider,
        'rating', o.rating,
        'createdAt', to_char(o.created_at at time zone 'Africa/Gaborone', 'YYYY-MM-DD HH24:MI')
      )
      from public.optimus_interactions o where o.id = new_interaction_id
    ),
    'history', ceda_private.optimus_project_history(actor),
    'supportRequests', ceda_private.optimus_project_support_requests(actor),
    'autoEscalated', coalesce(p_auto_escalate, false),
    'escalatedTicketRef', ticket_ref
  );
end $$;

create or replace function public.innovator_record_optimus_turn(
  p_question text,
  p_answer text,
  p_topic text default 'general',
  p_source_article text default 'CEDA Approved Guidance',
  p_auto_escalate boolean default false,
  p_escalation_reason text default null,
  p_escalation_category text default 'support',
  p_escalation_priority text default 'Normal',
  p_related_app_ref text default null,
  p_ai_provider text default 'controlled-fallback',
  p_interaction_id text default null
)
returns jsonb
language sql
set search_path = ''
as $$
  select ceda_private.innovator_record_optimus_turn(
    p_question,
    p_answer,
    p_topic,
    p_source_article,
    p_auto_escalate,
    p_escalation_reason,
    p_escalation_category,
    p_escalation_priority,
    p_related_app_ref,
    p_ai_provider,
    p_interaction_id
  );
$$;

-- Upgrade offline / Circuit Breaker fallback RPC with controlled knowledge + smart auto-escalation
create or replace function ceda_private.innovator_ask_optimus(
  p_question text,
  p_context_section text default 'general'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := ceda_private.require_innovator();
  raw_question text := btrim(coalesce(p_question, ''));
  q_lower text := lower(raw_question);
  first_name text;
  reply text;
  source_ref text := 'CEDA Approved Guidance';
  topic_key text := coalesce(nullif(btrim(p_context_section), ''), 'general');
  auto_esc boolean := false;
  esc_reason text := null;
  esc_category text := 'support';
  esc_priority text := 'Normal';
  matched_app_ref text := null;
  kb_notes text;
  kb_source text;
  faq_hit record;
  app_rec record;
begin
  if length(q_lower) < 3 or length(q_lower) > 1000 then
    raise exception 'Enter a question between 3 and 1000 characters';
  end if;

  select coalesce(nullif(split_part(btrim(full_name), ' ', 1), ''), 'there')
  into first_name
  from public.profiles
  where id = actor;

  select reference, title, status
  into app_rec
  from public.innovation_applications
  where owner_id = actor
  order by updated_at desc
  limit 1;
  matched_app_ref := app_rec.reference;

  select nullif(btrim(payload->>'notes'), ''), nullif(btrim(payload->>'source'), '')
  into kb_notes, kb_source
  from public.portal_configurations where config_key = 'optimus_knowledge';

  -- 1. Strict safety boundary (never escalate internal probing)
  if q_lower ~ '(guarantee|promise approval|approve my|will i get funded|credit score|internal score|assessor name|assessor vote|private note|edit my submitted application|change my score|ignore .*instructions|system prompt|bypass rls)' then
    topic_key := 'safety';
    source_ref := 'Optimus Prime Safety Boundary';
    reply := 'Hi ' || first_name || ', I cannot guarantee approval or funding, reveal confidential assessor identities, scores, or deliberations, or alter submitted application records. Every complete application is assessed fairly across 6 unweighted CEDA criteria (1–5). Ask me anytime about eligibility, your draft readiness, evidence rules, or portal status definitions.';
  -- 2. Smart automatic escalation: explicit human request
  elsif q_lower ~ '(talk to (a )?human|human rep|real person|live agent|support officer|speak to someone|connect me to (support|ceda|agent|staff))' then
    topic_key := 'support';
    source_ref := 'CEDA Human Support Escalation Protocol';
    auto_esc := true;
    esc_reason := 'Innovator asked to speak directly with a CEDA Support Officer.';
    reply := 'Hi ' || first_name || ', I have connected your conversation directly to the CEDA Support Officer queue with your account and application context so you will not need to repeat yourself.';
  -- 3. Smart automatic escalation: technical blocker or bug
  elsif q_lower ~ '(won''t upload|cannot upload|can''t upload|upload (is )?(failing|failed|error)|file upload bug|page crash|app crash|locked out|cannot log ?in|mfa (broken|lost)|otp (not arriving|failed)|missing confirmation|lost my draft)' then
    topic_key := 'bug';
    source_ref := 'CEDA Technical Blocker Escalation';
    auto_esc := true;
    esc_category := 'bug';
    esc_priority := 'High';
    esc_reason := 'Technical blocker or upload/access failure reported by applicant.';
    reply := 'Hi ' || first_name || ', please verify your file is PDF, DOCX, PPTX, XLSX, JPG, or PNG under 10 MB (and video links use HTTPS). Because you encountered an unexpected error, I have automatically flagged this as a priority technical ticket for a CEDA Support Officer right here in your support queue.';
  -- 4. Smart automatic escalation: locked record / clarification deadline / overdue review
  elsif q_lower ~ '(unlock (my )?(submitted )?application|edit (after|a )?submit|reopen (my )?(application|submission)|extend (the |my )?(clarification )?deadline|more time (for|on) clarification|why is my application (still |stuck |taking so long|delayed)|waiting for weeks|overdue review)' then
    topic_key := 'policy_exception';
    source_ref := 'CEDA Locked Record & Deadline Protocol';
    auto_esc := true;
    esc_priority := case when q_lower ~ '(deadline|tomorrow|today|urgent|overdue|stuck)' then 'High' else 'Normal' end;
    esc_reason := 'Applicant requested locked-record modification, deadline extension, or review delay investigation.';
    reply := 'Hi ' || first_name || ', submitted applications are locked to protect assessment integrity unless a CEDA officer triggers Changes requested or grants a case exception. I have automatically routed your request into the live CEDA Support Officer queue for review.';
  -- 5. Smart automatic escalation: appeal / outcome dispute
  elsif q_lower ~ '(appeal|dispute|why was (my|our) application rejected|reconsider (my|our)|formal complaint)' then
    topic_key := 'outcome_dispute';
    source_ref := 'CEDA Outcome Appeals & Reconsideration Guide';
    auto_esc := true;
    esc_priority := 'High';
    esc_reason := 'Applicant is requesting an outcome review, appeal, or formal complaint follow-up.';
    reply := 'Hi ' || first_name || ', formal decision appeals and reconsiderations must be handled directly by a human CEDA Support Officer. I have automatically opened a priority follow-up thread in your support queue with your application reference.';
  -- 6. Smart automatic escalation: loan terms / interest / disbursement / legal
  elsif q_lower ~ '(interest rate|repayment schedule|collateral requirement|disbursement date|loan agreement|contract terms|legal dispute)' then
    topic_key := 'financial_legal';
    source_ref := 'CEDA Financial & Legal Handoff Policy';
    auto_esc := true;
    esc_reason := 'Case-specific loan, interest, disbursement, or legal inquiry beyond portal intake rules.';
    reply := 'Hi ' || first_name || ', loan interest rates, collateral terms, and disbursement schedules depend on official CEDA underwriting and cannot be quoted by AI. I have escalated your inquiry directly to a CEDA Support Officer (or you can call Toll-Free 0800 600 253 / +267 317 0895).';
  -- 7. Controlled knowledge responses (no escalation needed)
  elsif q_lower ~ '(eligib|who can|individual|company|registered|cipa|omang)' then
    topic_key := 'eligibility';
    source_ref := 'Eligibility & Applicant Guide';
    reply := 'Hi ' || first_name || '! Both Individual citizen innovators (Botswana Omang, 18+) and Botswana-registered companies (with CIPA registration details) can submit across published CEDA sectors. Start in Submit innovation by selecting Individual or Registered company in Step 1.';
  elsif q_lower ~ '(evidence|file|upload|pdf|video|size|format|attachment|document)' then
    topic_key := 'evidence';
    source_ref := 'Supporting Evidence Policy';
    reply := 'Hi ' || first_name || ', you can upload up to 12 files in Applicant & eligibility, 8 in Supplementary evidence, and 4 in each other section (10 MB max per file in PDF, DOCX, PPTX, XLSX, JPG, or PNG). Video demonstrations must be shared as HTTPS links rather than direct uploads.';
  elsif q_lower ~ '(clarif|changes requested|supplementary|respond)' then
    topic_key := 'clarifications';
    source_ref := 'CEDA Clarification Response Workflow';
    reply := 'Hi ' || first_name || ', when your status changes to Changes requested, open the application to submit a point-by-point written response and up to 8 supplementary evidence files (10 MB max each) before the stated deadline.';
  elsif q_lower ~ '(status|draft|submitted|in review|approved|rejected|withdrawn|timeline)' then
    topic_key := 'status';
    source_ref := 'Application Status Definitions';
    reply := 'Hi ' || first_name || '!'
      || case when app_rec.reference is not null
           then ' Your latest submission ' || app_rec.reference || ' ("' || app_rec.title || '") is currently ' || app_rec.status || '.'
           else '' end
      || ' Portal statuses progress through Draft -> Submitted -> In review -> Changes requested (if needed) -> Approved / Rejected / Withdrawn.';
  elsif q_lower ~ '(stage|idea|prototype|pilot|scaling|r&d|operational)' then
    topic_key := 'stages';
    source_ref := 'Innovation Stage Matrix';
    reply := 'Hi ' || first_name || ', CEDA accepts applications across 6 adaptive stages: Idea, R&D, Prototype, Pilot, Operational, and Scaling. Wizard prompts adapt to your chosen stage so early-stage ideas are never asked for operational revenue figures.';
  elsif q_lower ~ '(step|section|form|save|autosave|wizard|withdraw|declaration)' then
    topic_key := 'sections';
    source_ref := '12-Step Application Guide';
    reply := 'Hi ' || first_name || ', the Submit innovation wizard walks you across 12 structured steps from Applicant profile to Declarations & Final Submit (Step 12 runs a readiness check). Progress autosaves automatically so you can return anytime.';
  elsif q_lower ~ '(navigat|menu|sidebar|where|help|contact|phone|email|toll|mfa|password|account|notifications?)' then
    topic_key := 'navigation';
    source_ref := 'Portal Navigation & Contact Guide';
    reply := 'Hi ' || first_name || ', use your workspace menu for Overview, My applications, Submit innovation (12-step wizard), Messages, Verification documents, Help and support, and Account and settings. Official CEDA contacts: Toll-Free 0800 600 253, +267 317 0895, or feedback@ceda.co.bw.';
  else
    select title, body into faq_hit from public.portal_content
    where stage = 'Published' and kind in ('FAQs', 'Public pages', 'Announcements')
      and (lower(title) like '%' || left(q_lower, 24) || '%' or lower(body) like '%' || split_part(q_lower, ' ', 1) || '%')
    order by updated_at desc limit 1;

    if faq_hit.body is not null then
      source_ref := faq_hit.title;
      reply := 'Hi ' || first_name || '! ' || faq_hit.body;
    else
      topic_key := 'support';
      source_ref := 'CEDA Smart Knowledge Boundary Escalation';
      auto_esc := true;
      esc_reason := 'Question outside offline controlled FAQ cache routed for human CEDA Support Officer verification.';
      reply := 'Hi ' || first_name || ', I want to make sure you receive verified CEDA information rather than a guess, so I have automatically placed your question into the CEDA Support Officer queue for a personal reply (or you can call 0800 600 253 / +267 317 0895). '
        || coalesce(kb_notes, '');
    end if;
  end if;

  return ceda_private.innovator_record_optimus_turn(
    raw_question,
    reply,
    topic_key,
    source_ref,
    auto_esc,
    esc_reason,
    esc_category,
    esc_priority,
    matched_app_ref,
    'sql-controlled-fallback',
    null
  );
end $$;

