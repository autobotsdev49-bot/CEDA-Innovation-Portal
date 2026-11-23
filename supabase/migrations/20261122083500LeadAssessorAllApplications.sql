-- Lead Assessors oversee and assign assessors to all submitted applications across every industry.
-- Staff sector assignments represent an assessor's strongest judgement specialty rather than a visibility wall.

create or replace function ceda_private.assessment_in_sector(p_user uuid, p_sector uuid)
returns boolean language sql stable set search_path = '' as $$
  select exists (
    select 1 from public.profiles p
    where p.id = p_user and p.account_role = 'assessor' and p.account_status = 'active' and p.lead_assessor
  )
  or exists (
    select 1 from public.staff_sectors where user_id = p_user and sector_id = p_sector
  )
  or exists (
    select 1 from ceda_private.assessment_members m
    join ceda_private.assessment_rounds r on r.id = m.round_id
    join public.innovation_applications a on a.id = r.case_id
    where m.user_id = p_user and a.sector_id is not distinct from p_sector
  )
$$;

create or replace function ceda_private.assessment_candidate(p_user uuid, p_sector uuid)
returns boolean language sql stable set search_path = '' as $$
  select exists (
    select 1 from public.profiles p join auth.users u on u.id = p.id
    where p.id = p_user and p.account_role = 'assessor' and p.account_status = 'active'
      and u.email_confirmed_at is not null and not u.is_anonymous
      and (u.banned_until is null or u.banned_until < now())
  )
$$;

create or replace function ceda_private.assessment_summary(
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
    'canManage', actor.lead_assessor and not ceda_private.assessment_recused(actor.id, a.id),
    'canRelease', actor.lead_assessor and m.user_id is null and not ceda_private.assessment_recused(actor.id, a.id)
      and exists (
        select 1 from ceda_private.assessment_release_permissions g where g.user_id = actor.id and g.sector_id = a.sector_id
      ),
    'memberCount', (select count(*) from ceda_private.assessment_members where round_id = r.id and conflict <> 'recused'),
    'reviewCount', (select count(*) from ceda_private.assessment_members where round_id = r.id and conflict = 'cleared' and submitted_at is not null)
  )
  from (select 1) anchor
  left join ceda_private.assessment_members m on m.round_id = r.id and m.user_id = actor.id
$$;

create or replace function public.assessor_workspace()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare actor public.profiles := ceda_private.require_assessor();
begin
  return jsonb_build_object(
    'profile', jsonb_build_object(
      'name', actor.full_name,
      'lead', actor.lead_assessor,
      'sectors', coalesce((
        select jsonb_agg(s.name order by s.name)
        from public.staff_sectors ss
        join public.sectors s on s.id = ss.sector_id
        where ss.user_id = actor.id and s.status <> 'archived'
      ), '[]'::jsonb)
    ),
    'cases', coalesce((
      select jsonb_agg(
        ceda_private.assessment_summary(a,r,actor)
        || jsonb_build_object('reviewedCount',(
          select count(*) from ceda_private.assessment_step_reviews p
          where p.round_id=r.id and p.user_id=actor.id
        ))
        || case when a.status <> 'Withdrawn' and (
          exists(select 1 from ceda_private.assessment_members member where member.round_id=r.id and member.user_id=actor.id and member.conflict='cleared')
          or actor.lead_assessor
        ) then jsonb_build_object(
          'unreadCount',(select count(*) from ceda_private.assessment_discussion d
            where d.round_id=r.id and d.user_id<>actor.id and d.id>coalesce(seen.last_message,0)),
          'lastMessage',last_msg.body,
          'lastMessageAt',last_msg.created_at
        ) else '{}'::jsonb end
        order by a.submitted_at desc nulls last,a.reference
      )
      from public.innovation_applications a
      left join ceda_private.assessment_rounds r on r.case_id=a.id and r.state<>'archived'
      left join ceda_private.assessment_discussion_reads seen on seen.round_id=r.id and seen.user_id=actor.id
      left join lateral (
        select d.body,d.created_at from ceda_private.assessment_discussion d
        where d.round_id=r.id order by d.id desc limit 1
      ) last_msg on true
      where a.status<>'Draft'
        and (
          actor.lead_assessor
          or exists (
            select 1 from ceda_private.assessment_members m
            join ceda_private.assessment_rounds enrolled on enrolled.id = m.round_id
            where enrolled.case_id = a.id and m.user_id = actor.id
          )
          or exists (
            select 1 from public.staff_sectors ss
            where ss.user_id = actor.id and ss.sector_id = a.sector_id
          )
        )
    ),'[]'::jsonb),
    'staff', case when actor.lead_assessor then coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', people.id,
          'name', people.full_name,
          'sectors', people.sectors,
          'sectorNames', people.sector_names,
          'lead', people.lead_assessor
        ) order by people.full_name
      )
      from (
        select p.id, p.full_name, p.lead_assessor,
          coalesce(array_agg(s.sector_id) filter (where s.sector_id is not null), '{}') as sectors,
          coalesce(array_agg(sec.name order by sec.name) filter (where sec.name is not null), '{}') as sector_names
        from public.profiles p
        left join public.staff_sectors s on s.user_id = p.id
        left join public.sectors sec on sec.id = s.sector_id and sec.status <> 'archived'
        where ceda_private.assessment_candidate(p.id, null)
        group by p.id, p.full_name, p.lead_assessor
      ) people
    ),'[]'::jsonb) else '[]'::jsonb end
  );
end;
$$;

create or replace function ceda_private.assessor_case_base(p_case_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  actor public.profiles := ceda_private.require_assessor();
  a public.innovation_applications;
  r ceda_private.assessment_rounds;
  m ceda_private.assessment_members;
  can_read boolean;
begin
  select * into a from public.innovation_applications where id = p_case_id and status <> 'Draft';
  if not found then
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

create or replace function ceda_private.assessment_evidence_allowed(p_name text)
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

notify pgrst, 'reload schema';
