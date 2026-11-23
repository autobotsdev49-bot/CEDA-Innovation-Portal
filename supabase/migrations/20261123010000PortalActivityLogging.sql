-- Comprehensive portal activity logging across all authenticated roles (login, portal actions, logout)
-- and enriched admin_audit_feed with user email, role, and event category.

create or replace function ceda_private.record_portal_activity(
  p_action text,
  p_target text default 'Portal workspace',
  p_detail text default ''
)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  parsed_detail jsonb;
begin
  if uid is null then
    return false;
  end if;
  if p_action is null or length(btrim(p_action)) < 2 then
    return false;
  end if;
  begin
    parsed_detail := coalesce(nullif(btrim(p_detail), '')::jsonb, '{}'::jsonb);
  exception when others then
    parsed_detail := jsonb_build_object('reason', left(coalesce(p_detail, ''), 480));
  end;

  insert into public.admin_audit(actor_id, action, target, detail)
  values (
    uid,
    left(btrim(p_action), 100),
    left(coalesce(nullif(btrim(p_target), ''), 'Portal workspace'), 120),
    parsed_detail
  );
  return true;
end $$;

revoke all on function ceda_private.record_portal_activity(text, text, text) from public, anon;
grant execute on function ceda_private.record_portal_activity(text, text, text) to authenticated;

create or replace function public.record_portal_activity(
  p_action text,
  p_target text default 'Portal workspace',
  p_detail text default ''
)
returns boolean language sql security invoker set search_path = ''
as $$ select ceda_private.record_portal_activity(p_action, p_target, p_detail) $$;

revoke all on function public.record_portal_activity(text, text, text) from public, anon;
grant execute on function public.record_portal_activity(text, text, text) to authenticated;

create or replace function ceda_private.admin_audit_feed(search_text text default '', page_number integer default 0)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare result jsonb;
begin
  perform ceda_private.require_admin();
  if page_number < 0 or page_number > 10000 or length(search_text) > 100 then
    raise exception 'Invalid audit search';
  end if;
  select coalesce(jsonb_agg(row_data order by row_data->>'created_at' desc, (row_data->>'id')::bigint desc), '[]'::jsonb)
    into result from (
    select jsonb_build_object(
      'id', a.id,
      'created_at', a.created_at,
      'actor', coalesce(nullif(btrim(p.full_name), ''), nullif(btrim(a.detail->>'actor_name'), ''), 'Unknown account'),
      'actor_email', coalesce(nullif(btrim(p.email), ''), nullif(btrim(a.detail->>'actor_email'), ''), ''),
      'role', case coalesce(p.account_role::text, a.detail->>'actor_role', '')
        when 'admin' then 'Administrator'
        when 'Administrator' then 'Administrator'
        when 'assessor' then 'Assessor'
        when 'Assessor' then 'Assessor'
        when 'support' then 'Support Officer'
        when 'Support Officer' then 'Support Officer'
        when 'innovator' then 'Innovator'
        when 'Innovator' then 'Innovator'
        else 'Portal User'
      end,
      'category', coalesce(
        nullif(btrim(a.detail->>'category'), ''),
        case
          when a.action ilike '%login%' or a.action ilike '%signin%' then 'Login'
          when a.action ilike '%logout%' or a.action ilike '%signout%' then 'Logout'
          else 'Activity'
        end
      ),
      'title', coalesce(nullif(btrim(a.detail->>'title'), ''), a.action),
      'action', a.action,
      'target', a.target,
      'reason', left(coalesce(
        nullif(btrim(a.detail->>'reason'), ''),
        nullif(btrim(a.detail->>'title'), ''),
        nullif(btrim(a.detail->>'proposal'), ''),
        a.action
      ), 500)
    ) as row_data
    from public.admin_audit a left join public.profiles p on p.id = a.actor_id
    where btrim(search_text) = ''
      or a.action ilike '%' || search_text || '%'
      or a.target ilike '%' || search_text || '%'
      or coalesce(p.full_name, a.detail->>'actor_name', '') ilike '%' || search_text || '%'
      or coalesce(p.email, a.detail->>'actor_email', '') ilike '%' || search_text || '%'
      or coalesce(a.detail->>'title', '') ilike '%' || search_text || '%'
      or coalesce(a.detail->>'reason', '') ilike '%' || search_text || '%'
    order by a.created_at desc, a.id desc limit 25 offset page_number * 25
  ) page;
  return result;
end $$;
