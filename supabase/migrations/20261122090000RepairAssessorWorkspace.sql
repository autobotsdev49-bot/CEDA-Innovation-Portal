-- Repair installations where the guided assessment migration was recorded but
-- the discussion read cursor was not provisioned. Preserve existing cursors.
create table if not exists ceda_private.assessment_discussion_reads (
  round_id uuid references ceda_private.assessment_rounds(id) on delete cascade,
  user_id uuid references public.profiles(id),
  last_message bigint not null,
  primary key (round_id, user_id)
);
revoke all on ceda_private.assessment_discussion_reads from public, anon, authenticated;

-- A submitted application may precede sector mapping. The lead must still
-- receive it in intake and be able to assign its assessment panel.
create or replace function ceda_private.assessment_in_sector(p_user uuid, p_sector uuid)
returns boolean language sql stable set search_path = '' as $$
  select exists (
    select 1 from public.profiles p
    where p.id = p_user and p.account_role = 'assessor'
      and p.account_status = 'active' and p.lead_assessor
  ) or exists (
    select 1 from public.staff_sectors
    where user_id = p_user and sector_id = p_sector
  ) or exists (
    select 1 from ceda_private.assessment_members m
    join ceda_private.assessment_rounds r on r.id = m.round_id
    join public.innovation_applications a on a.id = r.case_id
    where m.user_id = p_user and a.sector_id is not distinct from p_sector
  )
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
            join ceda_private.assessment_rounds enrolled on enrolled.id=m.round_id
            where enrolled.case_id=a.id and m.user_id=actor.id
          )
          or exists (
            select 1 from public.staff_sectors ss
            where ss.user_id=actor.id and ss.sector_id=a.sector_id
          )
        )
    ),'[]'::jsonb),
    'staff', case when actor.lead_assessor then coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',people.id,'name',people.full_name,'sectors',people.sectors,
        'sectorNames',people.sector_names,'lead',people.lead_assessor
      ) order by people.full_name)
      from (
        select p.id,p.full_name,p.lead_assessor,
          coalesce(array_agg(s.sector_id) filter (where s.sector_id is not null),'{}') sectors,
          coalesce(array_agg(sec.name order by sec.name) filter (where sec.name is not null),'{}') sector_names
        from public.profiles p
        left join public.staff_sectors s on s.user_id=p.id
        left join public.sectors sec on sec.id=s.sector_id and sec.status<>'archived'
        where ceda_private.assessment_candidate(p.id,null)
        group by p.id,p.full_name,p.lead_assessor
      ) people
    ),'[]'::jsonb) else '[]'::jsonb end
  );
end;
$$;

notify pgrst, 'reload schema';
