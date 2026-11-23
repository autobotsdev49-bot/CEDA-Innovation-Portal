-- Configurable evaluation criteria, weights, pass threshold, versioned rubric snapshots,
-- and weighted score calculations across Admin and Assessor workflows.

-- 1. Configurable criteria table and immutable versioned rubric snapshots
create table if not exists public.assessment_criteria (
  id uuid primary key default gen_random_uuid(),
  criterion_key text not null unique
    check (criterion_key ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' and length(criterion_key) between 2 and 80),
  label text not null check (length(btrim(label)) between 2 and 140),
  description text not null default '' check (length(description) <= 600),
  weight numeric(5,2) not null check (weight > 0 and weight <= 100),
  sort_order integer not null default 1 check (sort_order >= 1),
  active boolean not null default true,
  version integer not null default 1 check (version >= 1),
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists assessment_criteria_active_order_idx
  on public.assessment_criteria (active, sort_order, criterion_key);
create index if not exists assessment_criteria_updated_by_idx
  on public.assessment_criteria (updated_by);

alter table public.assessment_criteria enable row level security;
revoke all on public.assessment_criteria from public, anon, authenticated;
drop policy if exists assessment_criteria_direct_access_denied on public.assessment_criteria;
create policy assessment_criteria_direct_access_denied
  on public.assessment_criteria as restrictive for all to public using (false) with check (false);

create table if not exists public.assessment_rubric_versions (
  version integer primary key check (version >= 1),
  criteria jsonb not null check (jsonb_typeof(criteria) = 'array' and jsonb_array_length(criteria) >= 1),
  pass_threshold numeric(5,2) not null default 60.00 check (pass_threshold between 20 and 100),
  reason text not null check (length(btrim(reason)) between 5 and 500),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create index if not exists assessment_rubric_versions_created_by_idx
  on public.assessment_rubric_versions (created_by);

alter table public.assessment_rubric_versions enable row level security;
revoke all on public.assessment_rubric_versions from public, anon, authenticated;
drop policy if exists assessment_rubric_versions_direct_access_denied on public.assessment_rubric_versions;
create policy assessment_rubric_versions_direct_access_denied
  on public.assessment_rubric_versions as restrictive for all to public using (false) with check (false);

-- 2. Seed baseline v1 weighted criteria idempotently (total weight = 100.00%)
insert into public.assessment_criteria (criterion_key, label, description, weight, sort_order, active, version)
values
  (
    'strategic-alignment',
    'Strategic alignment',
    'Alignment with CEDA mandate, Botswana national priorities, and target sector needs.',
    20.00, 1, true, 1
  ),
  (
    'innovation-and-originality',
    'Innovation and originality',
    'Novelty of the solution, differentiation from existing alternatives, and creative approach.',
    20.00, 2, true, 1
  ),
  (
    'impact-potential',
    'Impact potential',
    'Measurable benefit to target beneficiaries, job creation, inclusion, and environmental outcomes.',
    20.00, 3, true, 1
  ),
  (
    'feasibility-and-viability',
    'Feasibility and viability',
    'Technical, operational, and commercial readiness supported by evidence at the current stage.',
    15.00, 4, true, 1
  ),
  (
    'scalability-and-sustainability',
    'Scalability and sustainability',
    'Capacity for sustainable growth, unit economics, and long-term market or community adoption.',
    15.00, 5, true, 1
  ),
  (
    'implementation-capacity-team-capability-and-governance',
    'Implementation capacity, team capability and governance',
    'Team capability, delivery roadmap, risk mitigation, IP protection, and governance readiness.',
    10.00, 6, true, 1
  )
on conflict (criterion_key) do nothing;

insert into public.assessment_rubric_versions (version, criteria, pass_threshold, reason)
select
  1,
  coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'key', c.criterion_key,
        'label', c.label,
        'description', c.description,
        'weight', c.weight,
        'sortOrder', c.sort_order
      ) order by c.sort_order, c.criterion_key
    )
    from public.assessment_criteria c
    where c.active
  ), '[]'::jsonb),
  60.00,
  'Initial weighted CEDA evaluation rubric (100% total)'
where not exists (select 1 from public.assessment_rubric_versions);

update public.portal_configurations
set payload = jsonb_set(
      payload,
      '{proposal}',
      to_jsonb('Up to 4 files per section (10 MB max) plus validated HTTPS video links; configurable weighted assessment criteria (1-5, total weight 100%).'::text)
    ),
    updated_at = now()
where config_key = 'portal_policies'
  and payload->>'proposal' = 'Up to 4 files per section (10 MB max) plus validated HTTPS video links; 6 unweighted assessment criteria (1-5).';

-- 3. Pin rubric version, snapshot, and pass threshold on assessment_rounds
alter table ceda_private.assessment_rounds
  add column if not exists rubric_version integer references public.assessment_rubric_versions(version),
  add column if not exists rubric_snapshot jsonb not null default '[]'::jsonb,
  add column if not exists pass_threshold numeric(5,2) not null default 60.00;

update ceda_private.assessment_rounds r
set rubric_version = v.version,
    rubric_snapshot = v.criteria,
    pass_threshold = v.pass_threshold
from (
  select version, criteria, pass_threshold
  from public.assessment_rubric_versions
  order by version asc
  limit 1
) v
where r.rubric_version is null
   or jsonb_typeof(r.rubric_snapshot) <> 'array'
   or jsonb_array_length(r.rubric_snapshot) = 0;

alter table ceda_private.assessment_rounds
  alter column rubric_version set default 1,
  alter column rubric_version set not null;

-- 4. Private rubric & weighted scoring helper functions
create or replace function ceda_private.active_rubric_info()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with latest_version as (
    select v.version, v.pass_threshold, v.reason, v.created_at
    from public.assessment_rubric_versions v
    order by v.version desc
    limit 1
  ),
  active_rows as (
    select
      c.id,
      c.criterion_key,
      c.label,
      c.description,
      c.weight,
      c.sort_order
    from public.assessment_criteria c
    where c.active
    order by c.sort_order, c.criterion_key
  )
  select jsonb_build_object(
    'version', coalesce((select version from latest_version), 1),
    'passThreshold', coalesce((select pass_threshold from latest_version), 60.00),
    'reason', coalesce((select reason from latest_version), 'Initial weighted CEDA evaluation rubric'),
    'updatedAt', to_char(coalesce((select created_at from latest_version), now()) at time zone 'Africa/Gaborone', 'YYYY-MM-DD HH24:MI'),
    'criteria', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', a.id,
          'key', a.criterion_key,
          'label', a.label,
          'description', a.description,
          'weight', a.weight,
          'sortOrder', a.sort_order
        ) order by a.sort_order, a.criterion_key
      )
      from active_rows a
    ), '[]'::jsonb)
  );
$$;

create or replace function ceda_private.round_rubric_snapshot(p_round ceda_private.assessment_rounds)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when p_round.id is not null
      and jsonb_typeof(p_round.rubric_snapshot) = 'array'
      and jsonb_array_length(p_round.rubric_snapshot) > 0
      then p_round.rubric_snapshot
    else (ceda_private.active_rubric_info())->'criteria'
  end;
$$;

create or replace function ceda_private.member_weighted_scores(p_scores jsonb, p_rubric jsonb)
returns jsonb
language sql
stable
set search_path = ''
as $$
  with rubric_items as (
    select
      r.elem->>'key' as criterion_key,
      coalesce((r.elem->>'weight')::numeric, 0) as weight
    from jsonb_array_elements(coalesce(p_rubric, '[]'::jsonb)) as r(elem)
  ),
  score_items as (
    select
      s.elem->>'criterion' as criterion_key,
      case
        when s.elem->>'rating' ~ '^[1-5]$' then (s.elem->>'rating')::numeric
        else null
      end as rating
    from jsonb_array_elements(coalesce(p_scores, '[]'::jsonb)) as s(elem)
  ),
  joined as (
    select
      ri.criterion_key,
      case when ri.weight > 0 then ri.weight else 1::numeric end as weight,
      si.rating
    from rubric_items ri
    left join score_items si on si.criterion_key = ri.criterion_key
  ),
  agg as (
    select
      count(*) as total_criteria,
      count(*) filter (where rating is not null) as scored_count,
      coalesce(sum(weight), 0) as total_weight,
      coalesce(sum(weight) filter (where rating is not null), 0) as scored_weight,
      sum(rating * weight) filter (where rating is not null) as weighted_sum,
      avg(rating) filter (where rating is not null) as unweighted_avg
    from joined
  )
  select jsonb_build_object(
    'totalCriteria', total_criteria,
    'scoredCount', scored_count,
    'scoredWeight', round(scored_weight, 2),
    'totalWeight', round(total_weight, 2),
    'weightedScore', case
      when scored_weight > 0 then round(weighted_sum / scored_weight, 2)
      else null
    end,
    'weightedTotal', case
      when scored_weight > 0 then round((weighted_sum / scored_weight) * 20.0, 1)
      else null
    end,
    'unweightedMean', case
      when scored_count > 0 then round(unweighted_avg, 2)
      else null
    end
  )
  from agg;
$$;

create or replace function ceda_private.round_score_stats(p_round ceda_private.assessment_rounds)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with rubric_items as (
    select
      r.elem->>'key' as criterion_key,
      coalesce(nullif(btrim(r.elem->>'label'), ''), r.elem->>'key') as label,
      coalesce((r.elem->>'weight')::numeric, 0) as weight,
      coalesce((r.elem->>'sortOrder')::integer, r.ordinality::integer) as sort_order
    from jsonb_array_elements(ceda_private.round_rubric_snapshot(p_round)) with ordinality as r(elem, ordinality)
  ),
  submitted_members as (
    select m.user_id, m.scores
    from ceda_private.assessment_members m
    where m.round_id = p_round.id
      and m.conflict = 'cleared'
      and m.submitted_at is not null
  ),
  member_entries as (
    select
      sm.user_id,
      ri.criterion_key,
      ri.label,
      ri.weight,
      ri.sort_order,
      (s.elem->>'rating')::numeric as rating
    from submitted_members sm
    cross join lateral jsonb_array_elements(sm.scores) as s(elem)
    join rubric_items ri on ri.criterion_key = s.elem->>'criterion'
    where s.elem->>'rating' ~ '^[1-5]$'
  ),
  per_member as (
    select
      user_id,
      sum(rating * weight) / nullif(sum(weight), 0) as weighted_5,
      (sum(rating * weight) / nullif(sum(weight), 0)) * 20.0 as weighted_pct,
      avg(rating) as unweighted_5
    from member_entries
    group by user_id
  ),
  summary as (
    select
      count(*)::integer as review_count,
      round(avg(weighted_5), 2) as mean_5,
      round((percentile_cont(0.5) within group (order by weighted_5))::numeric, 2) as median_5,
      round(avg(weighted_pct), 1) as weighted_total_mean,
      round((percentile_cont(0.5) within group (order by weighted_pct))::numeric, 1) as weighted_total_median,
      round(avg(unweighted_5), 2) as unweighted_mean
    from per_member
  ),
  breakdown as (
    select
      ri.criterion_key,
      ri.label,
      ri.weight,
      ri.sort_order,
      count(me.rating)::integer as rating_count,
      round(avg(me.rating), 2) as avg_rating,
      round((avg(me.rating) / 5.0) * ri.weight, 2) as weighted_contribution
    from rubric_items ri
    left join member_entries me on me.criterion_key = ri.criterion_key
    group by ri.criterion_key, ri.label, ri.weight, ri.sort_order
  )
  select jsonb_build_object(
    'count', s.review_count,
    'mean', s.mean_5,
    'median', s.median_5,
    'weightedTotalMean', s.weighted_total_mean,
    'weightedTotalMedian', s.weighted_total_median,
    'unweightedMean', s.unweighted_mean,
    'passThreshold', coalesce(p_round.pass_threshold, 60.00),
    'meetsThreshold', case
      when s.review_count > 0 and s.weighted_total_mean is not null
        then s.weighted_total_mean >= coalesce(p_round.pass_threshold, 60.00)
      else null
    end,
    'criterionBreakdown', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'criterion', b.criterion_key,
          'label', b.label,
          'weight', b.weight,
          'avgRating', b.avg_rating,
          'weightedContribution', b.weighted_contribution,
          'count', b.rating_count
        ) order by b.sort_order, b.criterion_key
      )
      from breakdown b
    ), '[]'::jsonb)
  )
  from summary s;
$$;

-- 5. Admin RPCs for reading and updating configurable criteria & weights
create or replace function ceda_private.admin_assessment_criteria_get()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  active_info jsonb;
begin
  perform ceda_private.require_admin();
  active_info := ceda_private.active_rubric_info();
  return jsonb_build_object(
    'version', (active_info->>'version')::integer,
    'passThreshold', (active_info->>'passThreshold')::numeric,
    'updatedAt', active_info->>'updatedAt',
    'reason', active_info->>'reason',
    'criteria', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', c.id,
          'key', c.criterion_key,
          'label', c.label,
          'description', c.description,
          'weight', c.weight,
          'sortOrder', c.sort_order,
          'active', c.active,
          'version', c.version,
          'updatedAt', to_char(c.updated_at at time zone 'Africa/Gaborone', 'YYYY-MM-DD HH24:MI')
        ) order by c.active desc, c.sort_order asc, c.criterion_key asc
      )
      from public.assessment_criteria c
    ), '[]'::jsonb),
    'history', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'version', v.version,
          'passThreshold', v.pass_threshold,
          'reason', v.reason,
          'createdAt', to_char(v.created_at at time zone 'Africa/Gaborone', 'YYYY-MM-DD HH24:MI'),
          'criteriaCount', jsonb_array_length(v.criteria),
          'criteria', v.criteria
        ) order by v.version desc
      )
      from (
        select * from public.assessment_rubric_versions order by version desc limit 15
      ) v
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function ceda_private.admin_save_assessment_criteria(
  p_criteria jsonb,
  p_reason text,
  p_pass_threshold numeric default 60.00
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := ceda_private.require_admin();
  clean_reason text := btrim(coalesce(p_reason, ''));
  clean_threshold numeric(5,2);
  elem record;
  raw_key text;
  clean_key text;
  clean_label text;
  clean_desc text;
  clean_weight numeric(5,2);
  item_active boolean;
  item_order integer := 0;
  active_order integer := 0;
  active_count integer := 0;
  active_weight_sum numeric(8,2) := 0.00;
  seen_keys text[] := '{}';
  active_keys text[] := '{}';
  next_version integer;
  prev_rubric jsonb;
  active_snapshot jsonb;
  parsed_items jsonb := '[]'::jsonb;
begin
  if length(clean_reason) not between 5 and 500 then
    raise exception 'Provide an audit reason between 5 and 500 characters';
  end if;
  if p_pass_threshold is null or not (p_pass_threshold between 20 and 100) then
    raise exception 'Pass benchmark must be between 20%% and 100%%';
  end if;
  clean_threshold := round(p_pass_threshold::numeric, 2);

  if p_criteria is null or jsonb_typeof(p_criteria) <> 'array'
    or jsonb_array_length(p_criteria) not between 1 and 25 then
    raise exception 'Provide between 1 and 25 criteria items';
  end if;

  -- Serialize rubric version creation
  lock table public.assessment_rubric_versions in share row exclusive mode;

  prev_rubric := ceda_private.active_rubric_info();
  next_version := coalesce((select max(version) from public.assessment_rubric_versions), 0) + 1;

  for elem in
    select value as item, ordinality as idx
    from jsonb_array_elements(p_criteria) with ordinality
  loop
    if jsonb_typeof(elem.item) <> 'object' then
      raise exception 'Each criterion entry must be an object';
    end if;

    clean_label := btrim(coalesce(elem.item->>'label', ''));
    if length(clean_label) not between 2 and 140 or clean_label ~ '[[:cntrl:]<>]' then
      raise exception 'Each criterion requires a valid label (2-140 characters)';
    end if;

    clean_desc := left(btrim(coalesce(elem.item->>'description', '')), 600);
    if clean_desc ~ '[[:cntrl:]]' then
      clean_desc := regexp_replace(clean_desc, '[[:cntrl:]]+', ' ', 'g');
    end if;

    item_active := coalesce((elem.item->>'active')::boolean, true);

    if (elem.item->>'weight') is null or btrim(elem.item->>'weight') = '' then
      raise exception 'Provide a positive percentage weight for "%"', clean_label;
    end if;
    begin
      clean_weight := round((elem.item->>'weight')::numeric, 2);
    exception when others then
      raise exception 'Invalid numeric weight for "%"', clean_label;
    end;
    if clean_weight is null or not (clean_weight between 0.01 and 100.00) then
      raise exception '%', format('Weight for "%s" must be greater than 0%% and at most 100%%', clean_label);
    end if;

    raw_key := btrim(coalesce(elem.item->>'key', ''));
    if raw_key <> '' then
      clean_key := btrim(regexp_replace(lower(raw_key), '[^a-z0-9]+', '-', 'g'), '-');
    else
      clean_key := btrim(regexp_replace(lower(clean_label), '[^a-z0-9]+', '-', 'g'), '-');
      clean_key := btrim(left(clean_key, 72), '-');
      if length(clean_key) < 2 then
        clean_key := 'criterion-' || elem.idx::text;
      end if;
      if clean_key = any(seen_keys) then
        clean_key := btrim(left(clean_key, 65), '-') || '-' || elem.idx::text;
      end if;
    end if;

    if length(clean_key) not between 2 and 80 or clean_key !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' then
      raise exception 'Invalid criterion key "%"', clean_key;
    end if;
    if clean_key = any(seen_keys) then
      raise exception 'Duplicate criterion key "%" in rubric', clean_key;
    end if;
    seen_keys := array_append(seen_keys, clean_key);

    item_order := item_order + 1;
    if item_active then
      active_order := active_order + 1;
      active_count := active_count + 1;
      active_weight_sum := active_weight_sum + clean_weight;
      active_keys := array_append(active_keys, clean_key);
    end if;

    parsed_items := parsed_items || jsonb_build_array(jsonb_build_object(
      'key', clean_key,
      'label', clean_label,
      'description', clean_desc,
      'weight', clean_weight,
      'sortOrder', case when item_active then active_order else item_order end,
      'active', item_active
    ));
  end loop;

  if active_count not between 1 and 15 then
    raise exception 'Include between 1 and 15 active criteria in the evaluation rubric';
  end if;
  if active_weight_sum <> 100.00 then
    raise exception '%', format('Active criterion weights must total 100%% (currently %s%%)', active_weight_sum);
  end if;

  -- Deactivate any omitted existing criteria so historical keys remain intact
  update public.assessment_criteria
  set active = false,
      version = next_version,
      updated_by = actor,
      updated_at = now()
  where not (criterion_key = any(active_keys));

  insert into public.assessment_criteria (
    criterion_key, label, description, weight, sort_order, active, version, updated_by, updated_at
  )
  select
    p.item->>'key',
    p.item->>'label',
    p.item->>'description',
    (p.item->>'weight')::numeric(5,2),
    (p.item->>'sortOrder')::integer,
    (p.item->>'active')::boolean,
    next_version,
    actor,
    now()
  from jsonb_array_elements(parsed_items) as p(item)
  on conflict (criterion_key) do update
  set label = excluded.label,
      description = excluded.description,
      weight = excluded.weight,
      sort_order = excluded.sort_order,
      active = excluded.active,
      version = excluded.version,
      updated_by = excluded.updated_by,
      updated_at = excluded.updated_at;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'key', c.criterion_key,
      'label', c.label,
      'description', c.description,
      'weight', c.weight,
      'sortOrder', c.sort_order
    ) order by c.sort_order, c.criterion_key
  ), '[]'::jsonb)
  into active_snapshot
  from public.assessment_criteria c
  where c.active;

  insert into public.assessment_rubric_versions (version, criteria, pass_threshold, reason, created_by)
  values (next_version, active_snapshot, clean_threshold, clean_reason, actor);

  insert into public.admin_audit (actor_id, action, target, detail)
  values (
    actor,
    'rubric.saved',
    'rubric-v' || next_version::text,
    jsonb_build_object(
      'before', prev_rubric->'criteria',
      'after', active_snapshot,
      'version', next_version,
      'passThreshold', clean_threshold,
      'reason', clean_reason
    )
  );

  return ceda_private.admin_assessment_criteria_get();
end;
$$;

create or replace function public.admin_assessment_criteria_get()
returns jsonb
language sql
security invoker
set search_path = ''
as $$ select ceda_private.admin_assessment_criteria_get() $$;

create or replace function public.admin_save_assessment_criteria(
  p_criteria jsonb,
  p_reason text,
  p_pass_threshold numeric default 60.00
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$ select ceda_private.admin_save_assessment_criteria(p_criteria, p_reason, p_pass_threshold) $$;

revoke all on function
  ceda_private.active_rubric_info(),
  ceda_private.round_rubric_snapshot(ceda_private.assessment_rounds),
  ceda_private.member_weighted_scores(jsonb, jsonb),
  ceda_private.round_score_stats(ceda_private.assessment_rounds)
from public, anon, authenticated;

revoke all on function
  ceda_private.admin_assessment_criteria_get(),
  ceda_private.admin_save_assessment_criteria(jsonb, text, numeric),
  public.admin_assessment_criteria_get(),
  public.admin_save_assessment_criteria(jsonb, text, numeric)
from public, anon;

grant execute on function
  ceda_private.admin_assessment_criteria_get(),
  ceda_private.admin_save_assessment_criteria(jsonb, text, numeric),
  public.admin_assessment_criteria_get(),
  public.admin_save_assessment_criteria(jsonb, text, numeric)
to authenticated;

-- 6. Update Assessor workspace, case, and action RPCs to use dynamic rubric & weighted scores
create or replace function ceda_private.assessor_workspace_impl()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
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
    'rubric', ceda_private.active_rubric_info(),
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

create or replace function public.assessor_workspace()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$ select ceda_private.assessor_workspace_impl() $$;

create or replace function ceda_private.assessor_case_base(p_case_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor public.profiles := ceda_private.require_assessor();
  a public.innovation_applications;
  r ceda_private.assessment_rounds;
  m ceda_private.assessment_members;
  can_read boolean;
  active_rubric jsonb := ceda_private.active_rubric_info();
  effective_rubric jsonb;
  effective_version integer;
  effective_threshold numeric(5,2);
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

  effective_rubric := ceda_private.round_rubric_snapshot(r);
  effective_version := coalesce(r.rubric_version, (active_rubric->>'version')::integer);
  effective_threshold := coalesce(r.pass_threshold, (active_rubric->>'passThreshold')::numeric);

  return jsonb_build_object(
    'case', ceda_private.assessment_summary(a,r,actor),
    'rubricVersion', effective_version,
    'passThreshold', effective_threshold,
    'rubric', effective_rubric,
    'application', jsonb_build_object(
      'summary', case when can_read and actor.lead_assessor and r.state = 'awaiting-information' then a.summary
        when can_read then coalesce(r.snapshot->>'summary', a.summary) end,
      'formData', case when can_read and actor.lead_assessor and r.state = 'awaiting-information' then a.form_data
        when can_read then coalesce(r.snapshot->'formData', a.form_data) else '{}'::jsonb end),
    'documents', case
      when can_read and actor.lead_assessor and (r.id is null or r.state in ('setup','awaiting-information')) then ceda_private.assessment_documents(a.id)
      when can_read then coalesce(r.evidence, '[]') else '[]'::jsonb end,
    'scores', case when can_read then coalesce(m.scores, '[]') else '[]'::jsonb end,
    'myScoreSummary', case when can_read and m.user_id is not null
      then ceda_private.member_weighted_scores(coalesce(m.scores, '[]'::jsonb), effective_rubric)
      else null end,
    'panel', case when can_read or actor.lead_assessor then coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', p.id,
          'name', p.full_name,
          'conflict', member.conflict,
          'submitted', member.submitted_at is not null,
          'scores', case when can_read and member.submitted_at is not null
            and (actor.lead_assessor or m.submitted_at is not null) then member.scores else '[]'::jsonb end
        ) || case when can_read and member.submitted_at is not null
          and (actor.lead_assessor or m.submitted_at is not null)
          then ceda_private.member_weighted_scores(member.scores, effective_rubric)
          else '{}'::jsonb end
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
      select jsonb_agg(
        jsonb_build_object(
          'id', previous.id,
          'date', previous.created_at,
          'rubricVersion', previous.rubric_version,
          'passThreshold', previous.pass_threshold,
          'rubric', ceda_private.round_rubric_snapshot(previous),
          'recommendation', ceda_private.assessment_tally(previous.id)->>'recommendation',
          'scores', coalesce(previous_member.scores, '[]'::jsonb)
        ) || case when previous_member.user_id is not null
          then ceda_private.member_weighted_scores(coalesce(previous_member.scores, '[]'::jsonb), ceda_private.round_rubric_snapshot(previous))
          else '{}'::jsonb end
        order by previous.created_at desc)
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

create or replace function ceda_private.assessor_case_impl(p_case_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor public.profiles := ceda_private.require_assessor();
  result jsonb := ceda_private.assessor_case_base(p_case_id);
  round_key uuid := (result->'case'->>'roundId')::uuid;
  r ceda_private.assessment_rounds;
begin
  if round_key is null or result->'application'->>'summary' is null then return result; end if;
  select * into r from ceda_private.assessment_rounds where id = round_key;
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
    'scoreStats', case
      when (result->'case'->>'canManage')::boolean
        or ((result->'case'->>'submitted')::boolean and result->'case'->>'roundState' in ('closed','released','awaiting-information'))
      then ceda_private.round_score_stats(r)
      else null
    end,
    'decision', case when (result->'case'->>'canManage')::boolean then ceda_private.assessment_tally(round_key)
      || jsonb_build_object('eligibleReviewers', (
        select count(*) from ceda_private.assessment_members m
        where m.round_id=round_key and m.conflict='cleared'
      ))
      else result->'decision' end
  );
end;
$$;

create or replace function public.assessor_case(p_case_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$ select ceda_private.assessor_case_impl(p_case_id) $$;

create or replace function ceda_private.assessor_action_base(p_case_id uuid, p_round_id uuid, p_action text, p_data jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
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
  active_rubric jsonb;
  effective_rubric jsonb;
  criteria text[];
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
    active_rubric := ceda_private.active_rubric_info();
    if r.id is null then
      insert into ceda_private.assessment_rounds(
        case_id, deadline, quorum, application_version, snapshot, evidence,
        rubric_version, rubric_snapshot, pass_threshold
      )
      values (
        a.id, deadline_at, quorum_size, a.version, '{}', '[]',
        (active_rubric->>'version')::integer, active_rubric->'criteria', (active_rubric->>'passThreshold')::numeric
      ) returning * into r;
    else
      update ceda_private.assessment_rounds
      set deadline = deadline_at,
          quorum = quorum_size,
          application_version = a.version,
          rubric_version = (active_rubric->>'version')::integer,
          rubric_snapshot = active_rubric->'criteria',
          pass_threshold = (active_rubric->>'passThreshold')::numeric
      where id = r.id;
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
    if jsonb_typeof(r.rubric_snapshot) <> 'array' or jsonb_array_length(r.rubric_snapshot) = 0 then
      active_rubric := ceda_private.active_rubric_info();
      update ceda_private.assessment_rounds
      set state = 'review',
          application_version = a.version + 1,
          snapshot = jsonb_build_object('summary',a.summary,'formData',a.form_data),
          evidence = ceda_private.assessment_documents(a.id),
          rubric_version = (active_rubric->>'version')::integer,
          rubric_snapshot = active_rubric->'criteria',
          pass_threshold = (active_rubric->>'passThreshold')::numeric
      where id = r.id;
    else
      update ceda_private.assessment_rounds
      set state = 'review',
          application_version = a.version + 1,
          snapshot = jsonb_build_object('summary',a.summary,'formData',a.form_data),
          evidence = ceda_private.assessment_documents(a.id)
      where id = r.id;
    end if;
  when 'save', 'submit' then
    if m.conflict is distinct from 'cleared' or m.submitted_at is not null or r.state is distinct from 'review' or r.deadline <= now() then
      raise exception 'An open review and a cleared assignment are required';
    end if;
    effective_rubric := ceda_private.round_rubric_snapshot(r);
    select coalesce(array_agg(elem->>'key' order by coalesce((elem->>'sortOrder')::integer, ordinality::integer)), '{}')
    into criteria
    from jsonb_array_elements(effective_rubric) with ordinality as t(elem, ordinality);
    if coalesce(cardinality(criteria), 0) < 1 then
      raise exception 'No evaluation criteria are configured for this round';
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
    if p_action = 'submit' and cardinality(seen) <> cardinality(criteria) then
      raise exception 'Complete all % rubric criteria', cardinality(criteria);
    end if;
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

create or replace function ceda_private.assessor_action_impl(p_case_id uuid, p_round_id uuid, p_action text, p_data jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
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

create or replace function public.assessor_action(p_case_id uuid, p_round_id uuid, p_action text, p_data jsonb)
returns jsonb
language sql
volatile
security invoker
set search_path = ''
as $$ select ceda_private.assessor_action_impl(p_case_id, p_round_id, p_action, p_data) $$;

revoke all on function
  ceda_private.assessor_workspace_impl(),
  ceda_private.assessor_case_impl(uuid),
  ceda_private.assessor_action_impl(uuid, uuid, text, jsonb),
  public.assessor_workspace(),
  public.assessor_case(uuid),
  public.assessor_action(uuid, uuid, text, jsonb)
from public, anon;

grant execute on function
  ceda_private.assessor_workspace_impl(),
  ceda_private.assessor_case_impl(uuid),
  ceda_private.assessor_action_impl(uuid, uuid, text, jsonb),
  public.assessor_workspace(),
  public.assessor_case(uuid),
  public.assessor_action(uuid, uuid, text, jsonb)
to authenticated;

notify pgrst, 'reload schema';
