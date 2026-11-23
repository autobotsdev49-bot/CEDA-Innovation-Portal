-- Keep the application library distinct from personal assignments.
-- Assessors may discover submitted applications in their permitted sectors;
-- opening evidence and performing review actions remains assignment controlled.
create or replace function public.assessor_workspace()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare actor public.profiles := ceda_private.require_assessor();
begin
  return jsonb_build_object(
    'profile', jsonb_build_object('name',actor.full_name,'lead',actor.lead_assessor),
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
      where a.status<>'Draft' and ceda_private.assessment_in_sector(actor.id,a.sector_id)
    ),'[]'::jsonb),
    'staff', case when actor.lead_assessor then coalesce((
      select jsonb_agg(jsonb_build_object('id',people.id,'name',people.full_name,'sectors',people.sectors) order by people.full_name)
      from (
        select s.user_id id,p.full_name,array_agg(s.sector_id) sectors
        from public.staff_sectors s join public.profiles p on p.id=s.user_id
        where ceda_private.assessment_in_sector(actor.id,s.sector_id)
          and ceda_private.assessment_candidate(p.id,s.sector_id)
        group by s.user_id,p.full_name
      ) people
    ),'[]'::jsonb) else '[]'::jsonb end
  );
end;
$$;

revoke all on function public.assessor_workspace() from public,anon;
grant execute on function public.assessor_workspace() to authenticated;
