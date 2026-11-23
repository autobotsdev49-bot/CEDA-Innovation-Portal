create table ceda_private.assessment_rounds (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.innovation_applications(id) on delete cascade,
  state text not null default 'setup' check (state in ('setup','review','voting','closed','awaiting-information','released','archived')),
  deadline timestamptz not null,
  voting_deadline timestamptz,
  quorum integer not null check (quorum > 0),
  held boolean not null default false,
  feedback text not null default '',
  application_version integer not null,
  snapshot jsonb not null,
  evidence jsonb not null,
  created_at timestamptz not null default now()
);
create unique index assessment_current_round on ceda_private.assessment_rounds(case_id) where state <> 'archived';

create table ceda_private.assessment_members (
  round_id uuid references ceda_private.assessment_rounds(id) on delete cascade,
  user_id uuid references public.profiles(id),
  conflict text not null default 'pending' check (conflict in ('pending','cleared','recused')),
  scores jsonb not null default '[]',
  submitted_at timestamptz,
  ballot text check (ballot in ('approve','decline','request-information')),
  primary key (round_id, user_id)
);
create index assessment_members_user on ceda_private.assessment_members(user_id, round_id);

create table ceda_private.assessment_discussion (
  id bigint generated always as identity primary key,
  round_id uuid not null references ceda_private.assessment_rounds(id) on delete cascade,
  user_id uuid not null references public.profiles(id),
  body text not null,
  created_at timestamptz not null default now()
);

-- Provision release separately from the lead flag and from panel membership.
create table ceda_private.assessment_release_permissions (
  user_id uuid references public.profiles(id) on delete cascade,
  sector_id uuid references public.sectors(id) on delete cascade,
  primary key (user_id, sector_id)
);
revoke all on ceda_private.assessment_rounds, ceda_private.assessment_members,
  ceda_private.assessment_discussion, ceda_private.assessment_release_permissions from public, anon, authenticated;

create function ceda_private.require_assessor()
returns public.profiles language plpgsql stable security definer set search_path = '' as $$
declare actor public.profiles;
begin
  select p.* into actor from public.profiles p
  join auth.users u on u.id = p.id
  join auth.sessions s on s.user_id = p.id and s.id::text = auth.jwt()->>'session_id'
  where p.id = auth.uid() and p.account_role = 'assessor' and p.account_status = 'active'
    and u.email_confirmed_at is not null and not u.is_anonymous
    and (u.banned_until is null or u.banned_until < now())
    and (s.not_after is null or s.not_after > now());
  if not found then raise exception 'Assessor access required' using errcode = '42501'; end if;
  return actor;
end;
$$;

create function ceda_private.assessment_in_sector(p_user uuid, p_sector uuid)
returns boolean language sql stable set search_path = '' as $$
  select exists (select 1 from public.staff_sectors where user_id = p_user and sector_id = p_sector)
$$;

create function ceda_private.assessment_candidate(p_user uuid, p_sector uuid)
returns boolean language sql stable set search_path = '' as $$
  select exists (
    select 1 from public.profiles p join auth.users u on u.id = p.id
    where p.id = p_user and p.account_role = 'assessor' and p.account_status = 'active'
      and u.email_confirmed_at is not null and not u.is_anonymous
      and (u.banned_until is null or u.banned_until < now())
      and ceda_private.assessment_in_sector(p.id, p_sector)
  )
$$;

create function ceda_private.assessment_recused(p_user uuid, p_case uuid)
returns boolean language sql stable set search_path = '' as $$
  select exists (
    select 1 from ceda_private.assessment_members m
    join ceda_private.assessment_rounds r on r.id = m.round_id
    where m.user_id = p_user and r.case_id = p_case and m.conflict = 'recused'
  )
$$;

create function ceda_private.assessment_documents(p_case uuid)
returns jsonb language sql stable set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id',d.id,'title',d.title,'storagePath',d.storage_path,
    'videoUrl',d.video_url,'fileName',d.file_name,'mimeType',d.mime_type,'sectionKey',d.section_key,
    'version',d.version) order by d.created_at), '[]')
  from public.application_documents d where d.application_id = p_case and d.upload_status = 'Saved'
$$;

create function ceda_private.assessment_summary(
  a public.innovation_applications, r ceda_private.assessment_rounds, actor public.profiles
) returns jsonb language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'id', a.id, 'reference', a.reference, 'title', a.title, 'sector', a.sector, 'sectorId', a.sector_id,
    'status', a.status, 'roundId', r.id, 'roundState', r.state,
    'deadline', case when r.state = 'voting' then r.voting_deadline else r.deadline end,
    'assigned', m.user_id is not null, 'conflict', m.conflict, 'submitted', m.submitted_at is not null,
    'hasVoted', m.ballot is not null,
    'hold', coalesce(r.held,false),
    'hasHistory', exists (
      select 1 from ceda_private.assessment_rounds previous
      left join ceda_private.assessment_members member on member.round_id = previous.id and member.user_id = actor.id
      where previous.case_id = a.id and previous.state = 'archived'
        and (member.conflict = 'cleared' or (actor.lead_assessor and member.user_id is null))
    ),
    'canManage', actor.lead_assessor and not ceda_private.assessment_recused(actor.id, a.id)
      and ceda_private.assessment_in_sector(actor.id, a.sector_id),
    'canRelease', actor.lead_assessor and m.user_id is null and not ceda_private.assessment_recused(actor.id, a.id)
      and ceda_private.assessment_in_sector(actor.id, a.sector_id) and exists (
      select 1 from ceda_private.assessment_release_permissions g where g.user_id = actor.id and g.sector_id = a.sector_id
    ),
    'memberCount', (select count(*) from ceda_private.assessment_members where round_id = r.id and conflict <> 'recused'),
    'reviewCount', (select count(*) from ceda_private.assessment_members where round_id = r.id and conflict = 'cleared' and submitted_at is not null)
  )
  from (select 1) anchor
  left join ceda_private.assessment_members m on m.round_id = r.id and m.user_id = actor.id
$$;

create function public.assessor_workspace()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare actor public.profiles := ceda_private.require_assessor();
begin
  return jsonb_build_object(
    'profile', jsonb_build_object('name', actor.full_name, 'lead', actor.lead_assessor),
    'cases', coalesce((
      select jsonb_agg(ceda_private.assessment_summary(a,r,actor) order by a.submitted_at desc nulls last, a.reference)
      from public.innovation_applications a
      left join ceda_private.assessment_rounds r on r.case_id = a.id and r.state <> 'archived'
      where a.status <> 'Draft' and ceda_private.assessment_in_sector(actor.id, a.sector_id)
        and (actor.lead_assessor or exists (
          select 1 from ceda_private.assessment_members m
          join ceda_private.assessment_rounds enrolled on enrolled.id = m.round_id
          where enrolled.case_id = a.id and m.user_id = actor.id
        ))
    ), '[]'),
    'staff', case when actor.lead_assessor then coalesce((
      select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.full_name, 'sectors', p.sectors) order by p.full_name)
      from (
        select s.user_id as id, p.full_name, array_agg(s.sector_id) as sectors
        from public.staff_sectors s join public.profiles p on p.id = s.user_id
        where ceda_private.assessment_in_sector(actor.id, s.sector_id) and ceda_private.assessment_candidate(p.id, s.sector_id)
        group by s.user_id, p.full_name
      ) p
    ), '[]') else '[]'::jsonb end
  );
end;
$$;

create function ceda_private.assessment_tally(p_round uuid)
returns jsonb language sql stable set search_path = '' as $$
  with counts as (
    select count(*) filter (where ballot = 'approve') as approved,
      count(*) filter (where ballot = 'decline') as declined,
      count(*) filter (where ballot = 'request-information') as information,
      count(ballot) as valid
    from ceda_private.assessment_members
    where round_id = p_round and conflict = 'cleared' and submitted_at is not null
  )
  select jsonb_build_object('quorum', r.quorum, 'validBallots', c.valid, 'hold', r.held, 'feedback', r.feedback,
    'totals', jsonb_build_object('approve', c.approved, 'decline', c.declined, 'request-information', c.information),
    'recommendation', case when c.valid >= r.quorum then
      case when c.approved * 2 > c.valid then 'approve' when c.declined * 2 > c.valid then 'decline'
        when c.information * 2 > c.valid then 'request-information' end
    end)
  from ceda_private.assessment_rounds r cross join counts c where r.id = p_round
$$;

create function public.assessor_case(p_case_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  actor public.profiles := ceda_private.require_assessor();
  a public.innovation_applications;
  r ceda_private.assessment_rounds;
  m ceda_private.assessment_members;
  can_read boolean;
begin
  select * into a from public.innovation_applications where id = p_case_id and status <> 'Draft';
  if not found or not ceda_private.assessment_in_sector(actor.id, a.sector_id) then
    raise exception 'Case access denied' using errcode = '42501';
  end if;
  select * into r from ceda_private.assessment_rounds where case_id = a.id and state <> 'archived';
  select * into m from ceda_private.assessment_members where round_id = r.id and user_id = actor.id;
  if not actor.lead_assessor and m.user_id is null and not exists (
    select 1 from ceda_private.assessment_members archived_member
    join ceda_private.assessment_rounds archived_round on archived_round.id = archived_member.round_id
    where archived_round.case_id = a.id and archived_round.state = 'archived' and archived_member.user_id = actor.id
  ) then raise exception 'Case access denied' using errcode = '42501'; end if;
  can_read := a.status <> 'Withdrawn' and not ceda_private.assessment_recused(actor.id, a.id) and
    (case when m.user_id is null then actor.lead_assessor else m.conflict = 'cleared' end);
  return jsonb_build_object(
    'case', ceda_private.assessment_summary(a,r,actor),
    'application', jsonb_build_object(
      'summary', case when can_read and actor.lead_assessor and r.state = 'awaiting-information' then a.summary
        when can_read then coalesce(r.snapshot->>'summary', a.summary) end,
      'formData', case when can_read and actor.lead_assessor and r.state = 'awaiting-information' then a.form_data
        when can_read then coalesce(r.snapshot->'formData', a.form_data) else '{}'::jsonb end),
    'documents', case
      when can_read and actor.lead_assessor and (r.id is null or r.state in ('setup','awaiting-information')) then ceda_private.assessment_documents(a.id)
      when can_read then coalesce(r.evidence, '[]') else '[]'::jsonb end,
    'scores', case when can_read then coalesce(m.scores, '[]') else '[]'::jsonb end,
    'panel', case when can_read or actor.lead_assessor then coalesce((
      select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.full_name, 'conflict', member.conflict,
        'submitted', member.submitted_at is not null, 'scores',
        case when can_read and member.submitted_at is not null
          and (actor.lead_assessor or m.submitted_at is not null) then member.scores else '[]'::jsonb end)
        order by p.full_name)
      from ceda_private.assessment_members member join public.profiles p on p.id = member.user_id
      where member.round_id = r.id and (actor.lead_assessor or member.conflict <> 'recused')
    ), '[]') else '[]'::jsonb end,
    'discussion', case when can_read then coalesce((
      select jsonb_agg(jsonb_build_object('name', p.full_name, 'body', d.body, 'at', d.created_at) order by d.id)
      from ceda_private.assessment_discussion d join public.profiles p on p.id = d.user_id where d.round_id = r.id
    ), '[]') else '[]'::jsonb end,
    'ballot', m.ballot,
    'history', coalesce((
      select jsonb_agg(jsonb_build_object('id', previous.id, 'date', previous.created_at,
        'recommendation', ceda_private.assessment_tally(previous.id)->>'recommendation',
        'scores', coalesce(previous_member.scores, '[]'::jsonb)) order by previous.created_at desc)
      from ceda_private.assessment_rounds previous
      left join ceda_private.assessment_members previous_member on previous_member.round_id = previous.id and previous_member.user_id = actor.id
      where previous.case_id = a.id and previous.state = 'archived'
        and (previous_member.conflict = 'cleared' or (actor.lead_assessor and previous_member.user_id is null))
    ), '[]'),
    'decision', case
      when can_read and r.state in ('closed','awaiting-information','released') then
        case when actor.lead_assessor or r.state = 'released' then ceda_private.assessment_tally(r.id)
          else ceda_private.assessment_tally(r.id) || jsonb_build_object('feedback',null) end
      when actor.lead_assessor and r.id is not null then jsonb_build_object('quorum', r.quorum, 'hold', r.held, 'feedback', r.feedback)
      else null end
  );
end;
$$;

create function public.assessor_action(p_case_id uuid, p_round_id uuid, p_action text, p_data jsonb)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  actor public.profiles := ceda_private.require_assessor();
  a public.innovation_applications;
  r ceda_private.assessment_rounds;
  m ceda_private.assessment_members;
  can_manage boolean;
  note text := btrim(coalesce(p_data->>'reason', p_data->>'feedback', p_data->>'body', ''));
  deadline_at timestamptz;
  panel_ids uuid[];
  quorum_size integer;
  input_scores jsonb := coalesce(p_data->'scores', '[]');
  validated_scores jsonb := '[]';
  score jsonb;
  criteria text[] := array[
    'strategic-alignment','innovation-and-originality','impact-potential','feasibility-and-viability',
    'scalability-and-sustainability','implementation-capacity-team-capability-and-governance'
  ];
  seen text[] := '{}';
  criterion text;
  recommendation text;
  next_status text;
  event_label text;
  public_note text;
  now_bw text := to_char(now() at time zone 'Africa/Gaborone', 'YYYY-MM-DD HH24:MI');
begin
  -- Serialize workflow changes and compare the caller's round to the current round.
  select * into a from public.innovation_applications where id = p_case_id for update;
  if not found or not ceda_private.assessment_in_sector(actor.id, a.sector_id) then
    raise exception 'Case access denied' using errcode = '42501';
  end if;
  if a.status not in ('Submitted','In review','Changes requested') then raise exception 'This application is closed for assessment'; end if;
  select * into r from ceda_private.assessment_rounds where case_id = a.id and state <> 'archived';
  can_manage := actor.lead_assessor;
  select * into m from ceda_private.assessment_members where round_id = r.id and user_id = actor.id;
  if not can_manage and m.user_id is null then raise exception 'Case access denied' using errcode = '42501'; end if;
  if r.id is distinct from p_round_id then raise exception 'The assessment round changed. Refresh and try again.'; end if;
  if r.held and p_action <> 'resume' then raise exception 'This round is on hold'; end if;
  if r.state = 'released' then raise exception 'The outcome has already been released'; end if;
  if p_action not in ('declare','save','submit','comment','vote') and not can_manage then
    raise exception 'Lead Assessor access required' using errcode = '42501';
  end if;
  if p_action not in ('configure','start','reassess','hold','resume')
    and r.application_version is distinct from a.version then
    raise exception 'The application version changed. Reopen assessment with an updated round.';
  end if;
  if ceda_private.assessment_recused(actor.id, a.id) then
    raise exception 'A recused panel member cannot participate';
  end if;

  case p_action
  when 'configure' then
    if a.status = 'Changes requested' or (r.id is not null and r.state <> 'setup') then
      raise exception 'Panels can be configured before review starts';
    end if;
    select array_agg(distinct value::uuid) into panel_ids from jsonb_array_elements_text(p_data->'members');
    deadline_at := (p_data->>'deadline')::timestamptz;
    quorum_size := (p_data->>'quorum')::integer;
    if coalesce(cardinality(panel_ids),0) < 1 or quorum_size is null
      or quorum_size not between 1 and cardinality(panel_ids) or deadline_at is null or deadline_at <= now()
      or exists (select 1 from unnest(panel_ids) candidate where not ceda_private.assessment_candidate(candidate, a.sector_id)
        or ceda_private.assessment_recused(candidate, a.id)) then
      raise exception 'Select eligible assessors, a valid quorum and a future deadline';
    end if;
    if r.id is null then
      insert into ceda_private.assessment_rounds(case_id,deadline,quorum,application_version,snapshot,evidence)
      values (a.id,deadline_at,quorum_size,a.version,'{}','[]') returning * into r;
    else
      update ceda_private.assessment_rounds set deadline = deadline_at, quorum = quorum_size, application_version = a.version where id = r.id;
      delete from ceda_private.assessment_members where round_id = r.id and not (user_id = any(panel_ids)) and conflict <> 'recused';
      if exists (select 1 from ceda_private.assessment_members where round_id = r.id and conflict = 'recused' and user_id = any(panel_ids)) then
        raise exception 'Choose a replacement for recused assessors';
      end if;
    end if;
    insert into ceda_private.assessment_members(round_id,user_id)
    select r.id, candidate from unnest(panel_ids) candidate on conflict do nothing;
  when 'declare' then
    if m.user_id is null or r.state not in ('setup','review')
      or (m.conflict <> 'pending' and p_data->>'conflict' is distinct from 'recused') then
      raise exception 'Conflict declaration unavailable';
    end if;
    if p_data->>'conflict' = 'recused' and length(note) not between 5 and 1000 then
      raise exception 'Enter a reason for recusal';
    end if;
    if coalesce(p_data->>'conflict','') not in ('cleared','recused') then raise exception 'Choose a conflict declaration'; end if;
    update ceda_private.assessment_members set conflict = p_data->>'conflict' where round_id = r.id and user_id = actor.id;
  when 'start' then
    if r.state is distinct from 'setup' or a.status = 'Changes requested' or r.deadline <= now()
      or (select count(*) from ceda_private.assessment_members where round_id = r.id and conflict <> 'recused') < r.quorum then
      raise exception 'Configure a valid panel and deadline before starting review';
    end if;
    next_status := 'In review'; event_label := 'Review started';
    public_note := 'Your submission is now under assessment.';
    update ceda_private.assessment_rounds set state = 'review', application_version = a.version + 1,
      snapshot = jsonb_build_object('summary',a.summary,'formData',a.form_data),
      evidence = ceda_private.assessment_documents(a.id) where id = r.id;
  when 'save', 'submit' then
    if m.conflict is distinct from 'cleared' or m.submitted_at is not null or r.state is distinct from 'review' or r.deadline <= now() then
      raise exception 'An open review and a cleared assignment are required';
    end if;
    if jsonb_typeof(input_scores) <> 'array' then raise exception 'Invalid assessment scores'; end if;
    if jsonb_array_length(input_scores) > cardinality(criteria) then raise exception 'Invalid assessment scores'; end if;
    for score in select value from jsonb_array_elements(input_scores) loop
      criterion := score->>'criterion';
      if criterion is null or not (criterion = any(criteria)) or criterion = any(seen)
        or (score->>'rating' is not null and (jsonb_typeof(score->'rating') <> 'number' or score->>'rating' !~ '^[1-5]$'))
        or (score->>'rationale' is not null and jsonb_typeof(score->'rationale') <> 'string')
        or length(coalesce(score->>'rationale','')) > 4000
        or (p_action = 'submit' and (score->>'rating' is null or length(btrim(coalesce(score->>'rationale',''))) = 0)) then
        raise exception 'Each score requires one rubric criterion and a rating from 1 to 5. Submitting also requires a rationale.';
      end if;
      seen := array_append(seen, criterion);
      validated_scores := validated_scores || jsonb_build_array(jsonb_build_object(
        'criterion',criterion,'rating',score->'rating','rationale',btrim(coalesce(score->>'rationale',''))));
    end loop;
    if p_action = 'submit' and cardinality(seen) <> cardinality(criteria) then raise exception 'Complete all six criteria'; end if;
    update ceda_private.assessment_members
    set scores = validated_scores, submitted_at = case when p_action = 'submit' then now() end
    where round_id = r.id and user_id = actor.id;
  when 'comment' then
    if r.state not in ('review','voting') or r.id is null or length(note) not between 1 and 4000
      or (m.conflict is distinct from 'cleared' and (not can_manage or m.user_id is not null)) then
      raise exception 'Discussion is available to eligible panel members during review and voting';
    end if;
    insert into ceda_private.assessment_discussion(round_id,user_id,body) values (r.id,actor.id,note);
  when 'open-vote' then
    if r.state is distinct from 'review' or
      (select count(*) from ceda_private.assessment_members where round_id = r.id and conflict = 'cleared' and submitted_at is not null) < r.quorum then
      raise exception 'Enough cleared members must submit reviews before voting opens';
    end if;
    deadline_at := coalesce(nullif(p_data->>'deadline','')::timestamptz, now() + interval '1 day');
    if deadline_at <= now() then raise exception 'Choose a future voting deadline'; end if;
    update ceda_private.assessment_rounds set state = 'voting', voting_deadline = deadline_at where id = r.id;
  when 'vote' then
    if r.state is distinct from 'voting' or m.conflict is distinct from 'cleared'
      or m.submitted_at is null or m.ballot is not null or r.voting_deadline <= now()
      or coalesce(p_data->>'choice','') not in ('approve','decline','request-information') then
      raise exception 'A submitted review and an unused ballot are required';
    end if;
    update ceda_private.assessment_members set ballot = p_data->>'choice' where round_id = r.id and user_id = actor.id;
  when 'close-vote' then
    if r.state is distinct from 'voting' then raise exception 'Voting is not open'; end if;
    if r.voting_deadline > now() and exists (
      select 1 from ceda_private.assessment_members where round_id = r.id and conflict = 'cleared' and submitted_at is not null and ballot is null
    ) then
      raise exception 'Wait for eligible ballots before closing voting';
    end if;
    update ceda_private.assessment_rounds set state = 'closed' where id = r.id;
  when 'hold', 'resume' then
    if r.id is null or length(note) not between 5 and 1000
      or (p_action = 'resume' and not r.held) then raise exception 'Provide a reason for this action'; end if;
    update ceda_private.assessment_rounds set held = (p_action = 'hold') where id = r.id;
  when 'decision', 'request-information', 'release' then
    if r.state is distinct from 'closed' then raise exception 'Close voting first'; end if;
    recommendation := ceda_private.assessment_tally(r.id)->>'recommendation';
    if p_action = 'request-information' then
      if recommendation is distinct from 'request-information' or length(note) not between 5 and 4000 then
        raise exception 'A matching panel majority and an applicant message are required';
      end if;
      deadline_at := nullif(p_data->>'deadline','')::timestamptz;
      if deadline_at <= now() then raise exception 'Choose a future response deadline'; end if;
      next_status := 'Changes requested'; event_label := 'Additional information requested'; public_note := note;
      update ceda_private.assessment_rounds set state = 'awaiting-information', feedback = note, application_version = a.version + 1 where id = r.id;
    elsif recommendation in ('approve','decline') then
      if p_action = 'decision' then
        if length(note) not between 5 and 4000 then raise exception 'Enter applicant-facing feedback'; end if;
        update ceda_private.assessment_rounds set feedback = note where id = r.id;
      else
        if m.user_id is not null or coalesce(auth.jwt()->>'aal','') <> 'aal2'
          or not exists (select 1 from ceda_private.assessment_release_permissions where user_id = actor.id and sector_id = a.sector_id)
          or length(r.feedback) < 5 then
          raise exception 'Release requires an independent authorized Lead Assessor, verified MFA and saved feedback' using errcode = '42501';
        end if;
        next_status := case recommendation when 'approve' then 'Approved' else 'Rejected' end;
        event_label := 'Outcome available'; public_note := 'An authorized outcome has been released.';
        update ceda_private.assessment_rounds set state = 'released', application_version = a.version + 1 where id = r.id;
      end if;
    else
      raise exception 'The panel has no valid majority for a final decision';
    end if;
  when 'reassess' then
    if r.id is null or r.state not in ('review','closed','awaiting-information') or a.status = 'Changes requested'
      or length(note) not between 5 and 1000 then raise exception 'A completed information response or a reasoned reassessment is required'; end if;
    update ceda_private.assessment_rounds set state = 'archived' where id = r.id;
  else raise exception 'Unknown assessment action';
  end case;

  if next_status is not null then
    update public.innovation_applications set status = next_status, version = a.version + 1, updated_at = now(),
      history = a.history || jsonb_build_array(jsonb_build_object('type',event_label,'actor',actor.full_name,
        'at',now_bw,'before',jsonb_build_object('status',a.status),'after',jsonb_build_object('status',next_status))),
      applicant_timeline = a.applicant_timeline || jsonb_build_array(jsonb_build_object('label',event_label,'detail',public_note,'at',now_bw)),
      requested_changes = case when next_status = 'Changes requested' then a.requested_changes || jsonb_build_array(jsonb_strip_nulls(
        jsonb_build_object('id',gen_random_uuid(),'sectionKey','supplementary','sectionLabel','Supporting evidence',
          'feedback',note,'status','Open','deadline',deadline_at,'requestedAt',now_bw))) else a.requested_changes end,
      outcome_data = case when next_status in ('Approved','Rejected') then jsonb_build_object('status',next_status,
        'releasedAt',now_bw,'feedback',r.feedback,'letterRef','OUT-' || a.reference,
        'nextSteps',case when next_status = 'Approved' then 'Keep your outcome letter and monitor portal messages for next steps.'
          else 'Review the assessment feedback and contact CEDA if you need clarification.' end) else a.outcome_data end
    where id = a.id;
    if a.owner_id is not null then
      insert into public.innovator_notifications(user_id,kind,title,message,application_ref,target_hash)
      values (a.owner_id,case next_status when 'Changes requested' then 'clarification' when 'In review' then 'status' else 'outcome' end,
        event_label,public_note,a.reference,'#applications');
    end if;
  end if;
  if p_action not in ('save','comment') then
    insert into public.admin_audit(actor_id,action,target,detail)
    values (actor.id,'assessment.' || p_action,a.reference,jsonb_strip_nulls(jsonb_build_object('round',r.id,
      'reason',case when p_action in ('declare','hold','resume','reassess') then nullif(note,'') end)));
  end if;
  return public.assessor_case(a.id);
end;
$$;

create function ceda_private.assessment_evidence_allowed(p_name text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.innovation_applications a
    left join ceda_private.assessment_rounds r on r.case_id = a.id and r.state <> 'archived'
    join public.profiles p on p.id = auth.uid()
    join auth.users u on u.id = p.id
    join auth.sessions s on s.user_id = p.id and s.id::text = auth.jwt()->>'session_id'
    left join ceda_private.assessment_members m on m.round_id = r.id and m.user_id = p.id
    where a.status not in ('Draft','Withdrawn')
      and p.account_role = 'assessor' and p.account_status = 'active'
      and u.email_confirmed_at is not null and not u.is_anonymous
      and (u.banned_until is null or u.banned_until < now())
      and (s.not_after is null or s.not_after > now())
      and ceda_private.assessment_in_sector(p.id, a.sector_id)
      and not ceda_private.assessment_recused(p.id, a.id)
      and (m.conflict = 'cleared' or (m.user_id is null and p.lead_assessor))
      and (
        r.evidence @> jsonb_build_array(jsonb_build_object('storagePath',p_name))
        or (p.lead_assessor and (r.id is null or r.state in ('setup','awaiting-information')) and exists (
          select 1 from public.application_documents d where d.application_id = a.id
            and d.storage_path = p_name and d.upload_status = 'Saved'
        ))
      )
  )
$$;
create policy innovation_evidence_assessor_select on storage.objects for select to authenticated
  using (bucket_id = 'innovation-evidence' and ceda_private.assessment_evidence_allowed(name));

create function ceda_private.assessment_evidence_pinned(p_name text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from ceda_private.assessment_rounds r
    where r.evidence @> jsonb_build_array(jsonb_build_object('storagePath',p_name))
  )
$$;
create index assessment_evidence_lookup on ceda_private.assessment_rounds using gin(evidence jsonb_path_ops);
create policy innovation_evidence_keep_pinned on storage.objects as restrictive for delete to authenticated
  using (bucket_id <> 'innovation-evidence' or not ceda_private.assessment_evidence_pinned(name));
create policy innovation_evidence_no_overwrite_pinned on storage.objects as restrictive for update to authenticated
  using (bucket_id <> 'innovation-evidence' or not ceda_private.assessment_evidence_pinned(name))
  with check (bucket_id <> 'innovation-evidence' or not ceda_private.assessment_evidence_pinned(name));

revoke all on function public.assessor_workspace(), public.assessor_case(uuid), public.assessor_action(uuid,uuid,text,jsonb),
  ceda_private.assessment_evidence_allowed(text), ceda_private.assessment_evidence_pinned(text) from public, anon, authenticated;
grant execute on function public.assessor_workspace(), public.assessor_case(uuid), public.assessor_action(uuid,uuid,text,jsonb),
  ceda_private.assessment_evidence_allowed(text), ceda_private.assessment_evidence_pinned(text) to authenticated;
revoke all on function ceda_private.require_assessor(), ceda_private.assessment_in_sector(uuid,uuid),
  ceda_private.assessment_candidate(uuid,uuid), ceda_private.assessment_tally(uuid),
  ceda_private.assessment_recused(uuid,uuid), ceda_private.assessment_documents(uuid),
  ceda_private.assessment_summary(public.innovation_applications,ceda_private.assessment_rounds,public.profiles)
  from public, anon, authenticated;
