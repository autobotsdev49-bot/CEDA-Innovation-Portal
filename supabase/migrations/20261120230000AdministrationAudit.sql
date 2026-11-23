-- Read-only privileged audit explorer; never expose raw detail JSON to the browser.
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
      'id', a.id, 'created_at', a.created_at, 'actor', coalesce(p.full_name, 'Unknown account'),
      'action', a.action, 'target', a.target, 'reason', left(coalesce(a.detail->>'reason',''), 500)
    ) as row_data
    from public.admin_audit a left join public.profiles p on p.id=a.actor_id
    where btrim(search_text)='' or a.action ilike '%' || search_text || '%'
      or a.target ilike '%' || search_text || '%'
      or coalesce(p.full_name,'') ilike '%' || search_text || '%'
    order by a.created_at desc, a.id desc limit 25 offset page_number * 25
  ) page;
  return result;
end $$;

revoke all on function ceda_private.admin_audit_feed(text,integer) from public, anon;
grant execute on function ceda_private.admin_audit_feed(text,integer) to authenticated;
create or replace function public.admin_audit_feed(search_text text default '', page_number integer default 0)
returns jsonb language sql security invoker set search_path = ''
as $$ select ceda_private.admin_audit_feed(search_text,page_number) $$;
revoke all on function public.admin_audit_feed(text,integer) from public, anon;
grant execute on function public.admin_audit_feed(text,integer) to authenticated;
