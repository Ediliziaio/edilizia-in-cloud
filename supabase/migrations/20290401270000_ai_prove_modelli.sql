-- «Prove modelli» del pannello AI: il traffico vero del router, compito per compito (15/11/2026)
--
-- La pagina leggeva solo ai_test_runs, le prove dell'azienda demo: ferme a ottobre, senza un voto,
-- con sei funzioni scritte a mano. Tutto il traffico vero passa da ai_router_usage_log, che sa
-- anche cache, passaggi alla riserva ed errori. admin_ai_prove_modelli(giorni) lo riassume per
-- compito e per modello, accanto alla catena configurata in ai_router_config, più le chiamate
-- dirette ai provider (ai_model_usage_log) e gli allarmi del credito ancora aperti.
-- Solo per il super admin.

create or replace function public.admin_ai_prove_modelli(p_giorni integer default 30)
returns jsonb
language plpgsql stable security definer set search_path to 'public' as $$
declare
  v_dal timestamptz;
  v jsonb;
begin
  if not public.is_super_admin(auth.uid()) then
    raise exception 'Solo il super admin vede le prove dei modelli' using errcode = '42501';
  end if;
  v_dal := now() - make_interval(days => greatest(1, least(coalesce(p_giorni, 30), 365)));

  with log as (
    select l.task_key, l.model_used as modello, l.status = 'success' as ok, coalesce(l.used_primary, true) as primario,
           coalesce(l.cost_usd, 0) as costo, l.duration_ms, coalesce(l.prompt_tokens, 0) as tin,
           coalesce(l.completion_tokens, 0) as tout, coalesce(l.cached_tokens, 0) as tcache,
           l.created_at, l.error_message, l.company_id
      from public.ai_router_usage_log l
     where l.created_at >= v_dal
  ), per_modello as (
    select task_key, modello,
           count(*) as chiamate,
           count(*) filter (where ok) as riuscite,
           count(*) filter (where not ok) as errori,
           count(*) filter (where ok and not primario) as da_riserva,
           round(sum(costo)::numeric, 4) as costo,
           round((sum(costo) / nullif(count(*) filter (where ok), 0))::numeric, 5) as costo_medio,
           percentile_disc(0.5) within group (order by duration_ms) filter (where ok and duration_ms > 0) as p50_ms,
           percentile_disc(0.95) within group (order by duration_ms) filter (where ok and duration_ms > 0) as p95_ms,
           round(100.0 * sum(tcache) / nullif(sum(tin), 0), 1) as cache_pct,
           round(avg(tin) filter (where ok)) as token_in,
           round(avg(tout) filter (where ok)) as token_out,
           count(distinct company_id) as aziende,
           max(created_at) as ultima,
           (array_agg(left(error_message, 300) order by created_at desc) filter (where not ok))[1] as ultimo_errore
      from log group by task_key, modello
  ), compiti as (
    select coalesce(c.task_key, m.task_key) as task_key,
           c.task_label, c.category, c.enabled, c.primary_model,
           case when jsonb_typeof(c.fallback_models) = 'array' then c.fallback_models else '[]'::jsonb end as riserve,
           c.task_key is not null as configurato
      from public.ai_router_config c
      full join (select distinct task_key from per_modello) m on m.task_key = c.task_key
  )
  select jsonb_build_object(
    'dal', v_dal,
    'giorni', greatest(1, least(coalesce(p_giorni, 30), 365)),
    'totali', (select jsonb_build_object(
        'chiamate', count(*), 'errori', count(*) filter (where not ok),
        'da_riserva', count(*) filter (where ok and not primario),
        'costo', round(sum(costo)::numeric, 2),
        'cache_pct', round(100.0 * sum(tcache) / nullif(sum(tin), 0), 1)) from log),
    'compiti', coalesce((
      select jsonb_agg(jsonb_build_object(
          'task_key', k.task_key, 'etichetta', k.task_label, 'categoria', k.category,
          'configurato', k.configurato, 'abilitato', coalesce(k.enabled, true),
          'principale', k.primary_model, 'riserve', k.riserve,
          'chiamate', coalesce((select sum(chiamate) from per_modello p where p.task_key = k.task_key), 0),
          'costo', coalesce((select sum(costo) from per_modello p where p.task_key = k.task_key), 0),
          'modelli', coalesce((
            select jsonb_agg(to_jsonb(p) - 'task_key' || jsonb_build_object('ruolo',
                     case when p.modello = k.primary_model then 'principale'
                          when k.riserve ? p.modello then 'riserva'
                          else 'fuori_catena' end)
                   order by p.costo desc, p.chiamate desc)
              from per_modello p where p.task_key = k.task_key), '[]'::jsonb)
        ) order by coalesce((select sum(costo) from per_modello p where p.task_key = k.task_key), 0) desc,
                   coalesce((select sum(chiamate) from per_modello p where p.task_key = k.task_key), 0) desc,
                   k.task_key)
        from compiti k), '[]'::jsonb),
    'diretti', coalesce((
      select jsonb_agg(d order by d.costo desc) from (
        select coalesce(provider_used, 'n/d') as provider, coalesce(model_used, model_requested) as modello,
               count(*) as chiamate, count(*) filter (where not ok) as errori,
               round(sum(coalesce(cost_usd, 0))::numeric, 4) as costo, max(ts) as ultima
          from public.ai_model_usage_log where ts >= v_dal
         group by 1, 2) d), '[]'::jsonb),
    'allarmi_aperti', coalesce((
      select jsonb_agg(jsonb_build_object('provider', provider, 'motivo', motivo, 'aperto_il', aperto_il,
                                          'conteggio', conteggio, 'dettaglio', left(ultimo_dettaglio::text, 300))
                       order by aperto_il desc)
        from public.ai_allarmi where chiuso_il is null), '[]'::jsonb)
  ) into v;
  return v;
end;
$$;
revoke all on function public.admin_ai_prove_modelli(integer) from public, anon;
grant execute on function public.admin_ai_prove_modelli(integer) to authenticated, service_role;
