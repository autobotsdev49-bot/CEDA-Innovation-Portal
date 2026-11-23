-- Extend assessment RPCs while keeping existing callers and in-progress rounds compatible.
alter table ceda_private.assessment_members add column overall_comment text not null default '';
alter table ceda_private.assessment_members add column draft_choice text
  check (draft_choice in ('approve','decline','request-information'));
create table ceda_private.assessment_step_reviews (
  round_id uuid not null,
  user_id uuid not null,
  step smallint not null check (step between 1 and 12),
  reviewed_at timestamptz not null default now(),
  primary key (round_id,user_id,step),
  foreign key (round_id,user_id) references ceda_private.assessment_members(round_id,user_id) on delete cascade
);
create table ceda_private.assessment_annotations (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references ceda_private.assessment_rounds(id) on delete cascade,
  user_id uuid not null references public.profiles(id),
  anchor text not null,
  parent_id uuid references ceda_private.assessment_annotations(id),
  body text not null,
  created_at timestamptz not null default now()
);
create index assessment_annotations_round_anchor on ceda_private.assessment_annotations(round_id,anchor,created_at);
create table ceda_private.assessment_discussion_reads (
  round_id uuid references ceda_private.assessment_rounds(id) on delete cascade,
  user_id uuid references public.profiles(id),
  last_message bigint not null,
  primary key(round_id,user_id)
);
revoke all on ceda_private.assessment_step_reviews, ceda_private.assessment_annotations, ceda_private.assessment_discussion_reads from public,anon,authenticated;

alter function public.assessor_case(uuid) set schema ceda_private;
alter function ceda_private.assessor_case(uuid) rename to assessor_case_base;
alter function public.assessor_workspace() set schema ceda_private;
alter function ceda_private.assessor_workspace() rename to assessor_workspace_base;
alter function public.assessor_action(uuid,uuid,text,jsonb) set schema ceda_private;
alter function ceda_private.assessor_action(uuid,uuid,text,jsonb) rename to assessor_action_base;
revoke all on function ceda_private.assessor_case_base(uuid), ceda_private.assessor_workspace_base(),
  ceda_private.assessor_action_base(uuid,uuid,text,jsonb) from public,anon,authenticated;

create function public.assessor_case(p_case_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  actor public.profiles := ceda_private.require_assessor();
  result jsonb := ceda_private.assessor_case_base(p_case_id);
  round_key uuid := (result->'case'->>'roundId')::uuid;
begin
  if round_key is null or result->'application'->>'summary' is null then return result; end if;
  return result || jsonb_build_object(
    'documents', coalesce((
      select jsonb_agg(e.doc || jsonb_build_object('category',d.category,'docKind',d.doc_kind) order by e.ordinality)
      from jsonb_array_elements(result->'documents') with ordinality e(doc,ordinality)
      left join public.application_documents d on d.id::text = e.doc->>'id'
    ),'[]'),
    'overallComment',coalesce((select overall_comment from ceda_private.assessment_members where round_id=round_key and user_id=actor.id),''),
    'draftChoice',(select draft_choice from ceda_private.assessment_members where round_id=round_key and user_id=actor.id),
    'reviewedSteps', coalesce((
      select jsonb_agg(step order by step) from ceda_private.assessment_step_reviews
      where round_id=round_key and user_id=actor.id
    ),'[]'),
    'annotations', coalesce((
      select jsonb_agg(jsonb_build_object('id',n.id,'anchor',n.anchor,'parentId',n.parent_id,
        'name',p.full_name,'body',n.body,'at',n.created_at) order by n.created_at,n.id)
      from ceda_private.assessment_annotations n join public.profiles p on p.id=n.user_id
      where n.round_id=round_key
    ),'[]'),
    'discussion', coalesce((
      select jsonb_agg(jsonb_build_object('name',p.full_name,'body',d.body,'at',d.created_at,'mine',d.user_id=actor.id) order by d.id)
      from ceda_private.assessment_discussion d join public.profiles p on p.id=d.user_id where d.round_id=round_key
    ),'[]'),
    'scoreStats', (
      select jsonb_build_object('count',count(*),'mean',round(avg(score),2),
        'median',round((percentile_cont(0.5) within group (order by score))::numeric,2))
      from (
        select avg((rating->>'rating')::numeric) as score
        from ceda_private.assessment_members m cross join lateral jsonb_array_elements(m.scores) rating
        where m.round_id=round_key and m.conflict='cleared' and m.submitted_at is not null
        group by m.user_id
      ) scores
      where (result->'case'->>'canManage')::boolean
        or ((result->'case'->>'submitted')::boolean and result->'case'->>'roundState' in ('closed','released','awaiting-information'))
    ),
    'decision', case when (result->'case'->>'canManage')::boolean then ceda_private.assessment_tally(round_key)
      || jsonb_build_object('eligibleReviewers', (
        select count(*) from ceda_private.assessment_members m
        where m.round_id=round_key and m.conflict='cleared'
      ))
      else result->'decision' end
  );
end;
$$;

create function public.assessor_workspace()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  actor public.profiles := ceda_private.require_assessor();
  result jsonb := ceda_private.assessor_workspace_base();
begin
  return jsonb_set(result,'{cases}',coalesce((
    select jsonb_agg(c.item || jsonb_build_object('reviewedCount', (
      select count(*) from ceda_private.assessment_step_reviews p where p.round_id=r.id and p.user_id=actor.id
    )) || case when c.item->>'status' <> 'Withdrawn' and (c.item->>'conflict'='cleared' or
      ((c.item->>'canManage')::boolean and not (c.item->>'assigned')::boolean)) then jsonb_build_object(
        'unreadCount',(select count(*) from ceda_private.assessment_discussion d
          where d.round_id=r.id and d.user_id<>actor.id and d.id>coalesce(seen.last_message,0)),
        'lastMessage',last_msg.body,'lastMessageAt',last_msg.created_at
      ) else '{}'::jsonb end order by c.ordinality)
    from jsonb_array_elements(result->'cases') with ordinality c(item,ordinality)
    left join ceda_private.assessment_rounds r on r.id=(c.item->>'roundId')::uuid
    left join ceda_private.assessment_discussion_reads seen on seen.round_id=r.id and seen.user_id=actor.id
    left join lateral (select d.body,d.created_at from ceda_private.assessment_discussion d where d.round_id=r.id order by d.id desc limit 1) last_msg on true
  ),'[]'));
end;
$$;

create function public.assessor_action(p_case_id uuid,p_round_id uuid,p_action text,p_data jsonb)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  actor public.profiles := ceda_private.require_assessor();
  detail jsonb;
  r ceda_private.assessment_rounds;
  member ceda_private.assessment_members;
  anchor_key text := p_data->>'anchor';
  message text := btrim(coalesce(p_data->>'body',''));
  parent_key uuid;
  choice text := p_data->>'choice';
  step_number smallint;
begin
  -- Same case lock as the original state machine, including when submitting a recommendation.
  perform 1 from public.innovation_applications where id=p_case_id for update;
  if p_action not in ('review-step','annotate','read-discussion')
    and not (p_action in ('submit','save') and p_data ? 'choice') then
    return ceda_private.assessor_action_base(p_case_id,p_round_id,p_action,p_data);
  end if;
  detail := public.assessor_case(p_case_id);
  select * into r from ceda_private.assessment_rounds where id=p_round_id and case_id=p_case_id and state<>'archived';
  if not found or detail->'case'->>'roundId' is distinct from p_round_id::text
    or detail->'application'->>'summary' is null then
    raise exception 'Assessment access denied' using errcode='42501';
  end if;
  select * into member from ceda_private.assessment_members where round_id=r.id and user_id=actor.id;
  if p_action='read-discussion' then
    insert into ceda_private.assessment_discussion_reads(round_id,user_id,last_message)
    select r.id,actor.id,coalesce(max(id),0) from ceda_private.assessment_discussion where round_id=r.id
    on conflict(round_id,user_id) do update set last_message=excluded.last_message;
  elsif p_action='annotate' then
    if r.held or r.state not in ('review','voting') or length(message) not between 1 and 4000
      or not coalesce((anchor_key ~ '^field:[A-Za-z][A-Za-z0-9]*$'
        and (anchor_key in ('field:title','field:summary') or detail->'application'->'formData' ? substring(anchor_key from 7)))
        or (anchor_key ~ '^document:[0-9a-f-]{36}$' and exists (
          select 1 from jsonb_array_elements(detail->'documents') doc where doc->>'id'=substring(anchor_key from 10)
        )),false) then
      raise exception 'Choose an available answer or document and enter a comment';
    end if;
    parent_key := nullif(p_data->>'parentId','')::uuid;
    if parent_key is not null and not exists (
      select 1 from ceda_private.assessment_annotations where id=parent_key and round_id=r.id and anchor=anchor_key
    ) then raise exception 'Comment to reply to was not found'; end if;
    insert into ceda_private.assessment_annotations(round_id,user_id,anchor,parent_id,body)
    values(r.id,actor.id,anchor_key,parent_key,message);
  else
    if member.conflict is distinct from 'cleared' or member.submitted_at is not null
      or r.state<>'review' or r.held or r.deadline<=now()
      or (detail->'case'->>'status') not in ('Submitted','In review') then
      raise exception 'An open review and a cleared assignment are required';
    end if;
    if p_action='review-step' then
      step_number := (p_data->>'step')::smallint;
      insert into ceda_private.assessment_step_reviews(round_id,user_id,step) values(r.id,actor.id,step_number)
      on conflict do nothing;
    else
      if (p_action='submit' or coalesce(choice,'')<>'')
        and coalesce(choice,'') not in ('approve','decline','request-information') then raise exception 'Select your recommendation'; end if;
      if p_action='submit' and (select count(*) from ceda_private.assessment_step_reviews where round_id=r.id and user_id=actor.id) <> 12 then
        raise exception 'Mark all twelve application steps reviewed before submitting';
      end if;
      perform ceda_private.assessor_action_base(p_case_id,p_round_id,p_action,p_data);
      update ceda_private.assessment_members set ballot=case when p_action='submit' then choice else ballot end,
        draft_choice=case when p_action='save' then nullif(choice,'') end,
        overall_comment=left(btrim(coalesce(p_data->>'overallComment','')),4000)
      where round_id=r.id and user_id=actor.id;
    end if;
  end if;
  return public.assessor_case(p_case_id);
end;
$$;

revoke all on function public.assessor_workspace(),public.assessor_case(uuid),public.assessor_action(uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.assessor_workspace(),public.assessor_case(uuid),public.assessor_action(uuid,uuid,text,jsonb) to authenticated;
notify pgrst,'reload schema';
