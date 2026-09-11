-- Reportistica → Venditori sulla definizione unica (20280915410001).
--
-- Stesse firme e stesse colonne di prima: la pagina non cambia, cambiano i
-- numeri, che adesso sono giusti e uguali a quelli di Sales OS.
--   · vinte e perse per won_at / lost_at, non per l'ultima modifica;
--   · «Opportunità totali» = create NEL PERIODO (prima: tutte quelle mai create
--     fino alla fine del periodo, per cui «vinte/totali» e «App → Opportunità»
--     mescolavano due periodi e potevano superare il 100%);
--   · «Tasso conversione» = quante delle create nel periodo sono state vinte;
--   · aperte e pipeline senza le scartate; cancellate mai contate;
--   · appuntamenti dal calendario marketing con l'esito vero: Show-Up =
--     effettuati ÷ (effettuati + no-show); un confermato non aggiornato non è
--     più un no-show;
--   · App → Opportunità / App → Chiusura = appuntamenti effettuati collegati a
--     un'opportunità / a un'opportunità vinta (mai più di 100%);
--   · in classifica chi ha lavorato nel periodo o ha opportunità aperte, non
--     chiunque sia mai stato assegnatario di un appuntamento;
--   · mesi del trend in italiano, datati sull'ora italiana.
--
-- SECURITY INVOKER (prima DEFINER): valgono le regole di visibilità. Chi vede
-- solo i propri lead vede solo i propri numeri, e non più fatturato, pipeline
-- ed email dei colleghi (13 persone in 3 aziende lo potevano fare).

set local lock_timeout = '3s';
set local statement_timeout = '60s';

create or replace function public.get_vendor_kpi_per_agent(
  p_company_id uuid,
  p_data_inizio date,
  p_data_fine date,
  p_agent_id uuid default null
)
returns table(
  agent_id uuid, nome_agente text, email_agente text,
  opp_totali bigint, opp_vinte bigint, opp_perse bigint, opp_aperte bigint,
  tasso_chiusura numeric, tasso_conversione numeric,
  fatturato_generato numeric, importo_medio_chiusura numeric, pipeline_valore numeric, fatturato_perso numeric,
  appuntamenti_fissati bigint, appuntamenti_effettuati bigint, appuntamenti_no_show bigint,
  tasso_show_up numeric, tasso_app_to_opp numeric, tasso_app_to_close numeric,
  avg_giorni_chiusura numeric, avg_giorni_chiusura_perse numeric, min_giorni_chiusura numeric, max_giorni_chiusura numeric,
  nuovi_contatti bigint
)
language plpgsql
stable
security invoker
set search_path to 'public'
as $function$
begin
  perform public.assert_company_access(p_company_id);
  return query
  with o as (
    select v.venditore,
           count(*) filter (where v.creata) as create_n,
           count(*) filter (where v.creata and v.stato = 'won') as create_vinte,
           count(*) filter (where v.vinta) as vinte,
           count(*) filter (where v.persa) as perse,
           count(*) filter (where v.aperta) as aperte,
           sum(v.valore) filter (where v.vinta) as fatturato,
           avg(v.valore) filter (where v.vinta) as ticket,
           sum(v.valore) filter (where v.aperta) as pipeline,
           sum(v.valore) filter (where v.persa) as perso,
           avg(v.giorni_ciclo) filter (where v.vinta) as ciclo,
           avg(v.giorni_ciclo) filter (where v.persa) as ciclo_perse,
           min(v.giorni_ciclo) filter (where v.vinta) as ciclo_min,
           max(v.giorni_ciclo) filter (where v.vinta) as ciclo_max
      from public.vendite_opportunita(p_company_id, p_data_inizio, p_data_fine, p_agent_id) v
     where v.venditore is not null
     group by v.venditore
  ),
  a as (
    select x.venditore,
           count(*) as fissati,
           count(*) filter (where x.effettuato) as effettuati,
           count(*) filter (where x.no_show) as no_show,
           count(*) filter (where x.effettuato and x.con_opportunita) as con_opp,
           count(*) filter (where x.effettuato and x.con_vendita) as con_vendita
      from public.vendite_appuntamenti(p_company_id, p_data_inizio, p_data_fine, p_agent_id) x
     where x.venditore is not null
     group by x.venditore
  ),
  c as (
    select mc.assigned_to as venditore, count(*) as nuovi
      from public.marketing_contacts mc
     where mc.company_id = p_company_id
       and mc.deleted_at is null
       and mc.assigned_to is not null
       and (p_agent_id is null or mc.assigned_to = p_agent_id)
       and mc.created_at >= (p_data_inizio::timestamp at time zone 'Europe/Rome')
       and mc.created_at < ((p_data_fine + 1)::timestamp at time zone 'Europe/Rome')
     group by mc.assigned_to
  ),
  ag as (
    select o.venditore from o where o.create_n + o.vinte + o.perse + o.aperte > 0
    union
    select a.venditore from a
    union
    select c.venditore from c
  )
  select ag.venditore,
         coalesce(nullif(btrim(concat_ws(' ', p.first_name, p.last_name)), ''), p.email, ag.venditore::text)::text,
         p.email::text,
         coalesce(o.create_n, 0)::bigint,
         coalesce(o.vinte, 0)::bigint,
         coalesce(o.perse, 0)::bigint,
         coalesce(o.aperte, 0)::bigint,
         round(100.0 * o.vinte / nullif(o.vinte + o.perse, 0), 1),
         round(100.0 * o.create_vinte / nullif(o.create_n, 0), 1),
         coalesce(o.fatturato, 0),
         round(coalesce(o.ticket, 0), 2),
         coalesce(o.pipeline, 0),
         coalesce(o.perso, 0),
         coalesce(a.fissati, 0)::bigint,
         coalesce(a.effettuati, 0)::bigint,
         coalesce(a.no_show, 0)::bigint,
         round(100.0 * a.effettuati / nullif(a.effettuati + a.no_show, 0), 1),
         round(100.0 * a.con_opp / nullif(a.effettuati, 0), 1),
         round(100.0 * a.con_vendita / nullif(a.effettuati, 0), 1),
         coalesce(round(o.ciclo, 1), 0),
         coalesce(round(o.ciclo_perse, 1), 0),
         coalesce(o.ciclo_min, 0),
         coalesce(o.ciclo_max, 0),
         coalesce(c.nuovi, 0)::bigint
    from ag
    left join public.profiles p on p.id = ag.venditore
    left join o on o.venditore = ag.venditore
    left join a on a.venditore = ag.venditore
    left join c on c.venditore = ag.venditore
   order by coalesce(o.fatturato, 0) desc, 2;
end;
$function$;

create or replace function public.get_vendor_funnel_stages(
  p_company_id uuid,
  p_data_inizio date,
  p_data_fine date,
  p_agent_id uuid default null
)
returns table(stage text, count_opp bigint, valore_totale numeric, pct_del_totale numeric)
language plpgsql
stable
security invoker
set search_path to 'public'
as $function$
begin
  perform public.assert_company_access(p_company_id);
  return query
  with f as (
    select coalesce(s.name, 'Senza fase') as nome,
           min(s.position) as posizione,
           count(*) as n,
           sum(v.valore) as valore
      from public.vendite_opportunita(p_company_id, p_data_inizio, p_data_fine, p_agent_id) v
      left join public.marketing_pipeline_stages s on s.id = v.stage_id
     where v.creata
       and v.venditore is not null
       and coalesce(s.show_in_reports, true)
     group by coalesce(s.name, 'Senza fase')
  )
  -- In ordine di fase (prima: per valore, e il funnel veniva disegnato a caso).
  select f.nome::text, f.n::bigint, f.valore, round(100.0 * f.n / nullif(sum(f.n) over (), 0), 1)
    from f
   order by f.posizione nulls last, f.nome;
end;
$function$;

create or replace function public.get_vendor_trend_mensile(
  p_company_id uuid,
  p_anno integer default null,
  p_agent_id uuid default null
)
returns table(
  mese integer, mese_label text,
  opp_vinte bigint, opp_perse bigint, fatturato numeric,
  appuntamenti_fissati bigint, appuntamenti_effettuati bigint,
  tasso_chiusura numeric, tasso_show_up numeric, nuovi_contatti bigint
)
language plpgsql
stable
security invoker
set search_path to 'public'
as $function$
declare
  v_anno integer := coalesce(p_anno, extract(year from (now() at time zone 'Europe/Rome'))::integer);
  v_da date := make_date(v_anno, 1, 1);
  v_a date := make_date(v_anno, 12, 31);
begin
  perform public.assert_company_access(p_company_id);
  return query
  with chiuse as (
    select extract(month from (coalesce(v.vinta_il, v.persa_il) at time zone 'Europe/Rome'))::integer as m,
           v.vinta, v.persa, v.valore
      from public.vendite_opportunita(p_company_id, v_da, v_a, p_agent_id) v
     where v.venditore is not null
       and (v.vinta or v.persa)
  ),
  om as (
    select ch.m,
           count(*) filter (where ch.vinta) as vinte,
           count(*) filter (where ch.persa) as perse,
           sum(ch.valore) filter (where ch.vinta) as fatt
      from chiuse ch
     group by ch.m
  ),
  am as (
    select extract(month from x.data)::integer as m,
           count(*) as fissati,
           count(*) filter (where x.effettuato) as effettuati,
           count(*) filter (where x.no_show) as no_show
      from public.vendite_appuntamenti(p_company_id, v_da, v_a, p_agent_id) x
     where x.venditore is not null
     group by 1
  ),
  cm as (
    select extract(month from (mc.created_at at time zone 'Europe/Rome'))::integer as m,
           count(*) as nuovi
      from public.marketing_contacts mc
     where mc.company_id = p_company_id
       and mc.deleted_at is null
       and mc.assigned_to is not null
       and (p_agent_id is null or mc.assigned_to = p_agent_id)
       and mc.created_at >= (v_da::timestamp at time zone 'Europe/Rome')
       and mc.created_at < ((v_a + 1)::timestamp at time zone 'Europe/Rome')
     group by 1
  )
  select g.m::integer,
         (array['Gen','Feb','Mar','Apr','Mag','Giu','Lug','Ago','Set','Ott','Nov','Dic'])[g.m]::text,
         coalesce(om.vinte, 0)::bigint,
         coalesce(om.perse, 0)::bigint,
         coalesce(om.fatt, 0),
         coalesce(am.fissati, 0)::bigint,
         coalesce(am.effettuati, 0)::bigint,
         round(100.0 * om.vinte / nullif(om.vinte + om.perse, 0), 1),
         round(100.0 * am.effettuati / nullif(am.effettuati + am.no_show, 0), 1),
         coalesce(cm.nuovi, 0)::bigint
    from generate_series(1, 12) as g(m)
    left join om on om.m = g.m
    left join am on am.m = g.m
    left join cm on cm.m = g.m
   order by g.m;
end;
$function$;
