-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.

create or replace function public.bulk_tag_opportunities(p_ids uuid[], p_tags text[], p_mode text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company uuid;
  v_tags text[];
  v_count integer;
begin
  v_company := public.get_effective_company_id();
  if v_company is null then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  if p_ids is null or array_length(p_ids, 1) is null then
    return 0;
  end if;

  -- normalizza i tag: trim, no vuoti, distinti
  v_tags := (
    select coalesce(array_agg(distinct trim(v)), '{}'::text[])
    from unnest(coalesce(p_tags, '{}'::text[])) as u(v)
    where nullif(trim(v), '') is not null
  );

  if array_length(v_tags, 1) is null then
    return 0; -- nessun tag valido
  end if;

  if p_mode = 'add' then
    update marketing_opportunities o
      set tags = (
            select array_agg(distinct e order by e)
            from unnest(coalesce(o.tags, '{}'::text[]) || v_tags) as x(e)
          ),
          updated_at = now()
    where o.company_id = v_company
      and o.id = any(p_ids);
  elsif p_mode = 'remove' then
    update marketing_opportunities o
      set tags = (
            select coalesce(array_agg(e), '{}'::text[])
            from unnest(coalesce(o.tags, '{}'::text[])) as x(e)
            where e <> all(v_tags)
          ),
          updated_at = now()
    where o.company_id = v_company
      and o.id = any(p_ids);
  else
    raise exception 'invalid mode: %', p_mode;
  end if;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

grant execute on function public.bulk_tag_opportunities(uuid[], text[], text) to authenticated;
