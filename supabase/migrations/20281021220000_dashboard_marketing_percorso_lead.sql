-- Il percorso dei lead per commerciale (scheda Pipeline della dashboard marketing).
--
-- I lead ARRIVATI nel periodo e cosa è successo dopo, fino a oggi: quanti presi
-- in carico da una persona e in quanto tempo (mediana, ore), quanti in pipeline,
-- fino a quale fase del percorso, con appuntamento, preventivo, vinti, persi,
-- scartati, aperti, valore e giorni alla vendita. Per commerciale e in totale.
--
-- Scelte, provate sul database il 21/10/2026 (BeMade 30 giorni: 1.557 lead in
-- 255 ms; Il Bagno 90 giorni: 417 lead in 57 ms):
--   · il commerciale è chi ha in carico il lead, altrimenti chi ha l'opportunità,
--     altrimenti chi l'ha lavorato per primo: i lead assegnati sono pochissimi
--     (BeMade 21 su 3.388 in 90 giorni). Chi resta è «Non assegnati»;
--   · «preso in carico» = il primo intervento di una persona (nota, chiamata,
--     messaggio, cambio di fase): creazione e assegnazione automatiche no;
--   · il percorso sono le fasi normali prima di quella vinta (auto_status null o
--     'open': le aziende le hanno in tutti e due i modi).
--     Perse, scartate e quelle dopo la vendita sono USCITE, contate a parte: in
--     ordine di posizione «Non in target» veniva dopo «Trattativa» e ogni lead
--     scartato risultava arrivato in fondo. Una vendita ha fatto tutto il percorso;
--   · le fasi sono di UNA pipeline (quella scelta, o dove sono finiti più lead):
--     fasi di pipeline diverse non si sommano;
--   · vendita = preventivo firmato o opportunità vinta, come marketing_vendite_periodo.
--
-- Le stesse cifre per fonte («fonti»), con la spesa del periodo da campaign_costs.
--
-- Stessi controlli di get_marketing_dashboard_stats: permesso della dashboard,
-- «solo i propri», pipeline nascoste. Solo lettura.

set local lock_timeout = '3s';
set local statement_timeout = '60s';

create or replace function public.marketing_percorso_lead(
  p_company_id uuid,
  p_date_from timestamptz default null,
  p_date_to timestamptz default null,
  p_assigned_user_ids uuid[] default null,
  p_sources text[] default null,
  p_pipeline_id uuid default null
)
returns jsonb
language plpgsql
stable security definer
set search_path to 'public'
as $function$
declare
  v_da timestamptz := coalesce(p_date_from, now() - interval '30 days');
  v_a timestamptz := coalesce(p_date_to, now());
  v_nascoste uuid[];
  v_pipeline uuid := p_pipeline_id;
  v_pipeline_nome text;
  v_pipelines integer;
  v_risultato jsonb;
begin
  perform public.assert_company_access(p_company_id);
  if not public.puo_vedere_metrica(p_company_id, 'marketing') then
    raise exception 'Non hai il permesso di vedere la dashboard marketing' using errcode = '42501';
  end if;
  if public.solo_assegnati_attivo() then
    p_assigned_user_ids := array[auth.uid()];
  end if;
  v_nascoste := coalesce(public.pipeline_nascoste(), '{}'::uuid[]);

  -- La pipeline delle fasi: quella scelta, altrimenti quella dove sono finiti
  -- più lead del periodo (fasi di pipeline diverse non si sommano).
  select count(*) into v_pipelines
    from marketing_pipelines p
   where p.company_id = p_company_id and not (p.id = any (v_nascoste));
  if v_pipeline is null then
    select o.pipeline_id into v_pipeline
      from marketing_opportunities o
      join marketing_contacts mc on mc.id = o.contact_id
     where o.company_id = p_company_id and o.deleted_at is null and o.pipeline_id is not null
       and not (o.pipeline_id = any (v_nascoste))
       and mc.deleted_at is null and mc.created_at >= v_da and mc.created_at <= v_a
     group by o.pipeline_id order by count(*) desc limit 1;
  end if;
  select p.name into v_pipeline_nome from marketing_pipelines p where p.id = v_pipeline;

  with arrivi as (
    -- i lead arrivati nel periodo; cosa è successo dopo, fino a oggi
    select mc.id, mc.created_at, mc.assigned_to, coalesce(nullif(btrim(mc.source), ''), 'Non specificata') as fonte
      from marketing_contacts mc
     where mc.company_id = p_company_id and mc.deleted_at is null
       and mc.created_at >= v_da and mc.created_at <= v_a
       and (p_sources is null or mc.source = any (p_sources))
  ), opp as (
    -- la prima opportunità del lead (nelle pipeline che si possono vedere)
    select distinct on (o.contact_id) o.contact_id, o.id, o.assigned_to, o.status, o.value,
           o.won_at, o.lost_at, o.stage_id, o.pipeline_id
      from marketing_opportunities o
      join arrivi l on l.id = o.contact_id
     where o.company_id = p_company_id and o.deleted_at is null
       and (o.pipeline_id is null or not (o.pipeline_id = any (v_nascoste)))
       and (p_pipeline_id is null or o.pipeline_id = p_pipeline_id)
     order by o.contact_id, o.created_at
  ), tocchi as (
    -- il primo intervento di una persona: nota, chiamata, messaggio, cambio di
    -- fase. Non contano la creazione e l'assegnazione automatiche.
    select t.contact_id, t.quando, t.chi
      from (
        select a.contact_id, a.created_at as quando, a.created_by as chi
          from marketing_contact_activities a
          join arrivi l on l.id = a.contact_id
         where a.company_id = p_company_id and a.created_by is not null
           and a.activity_type not in ('contact_created', 'opportunity_created', 'contact_assigned',
                                       'opportunity_assigned', 'opportunity_deleted', 'lead_form_submission')
        union all
        select cl.contact_id, cl.started_at, cl.user_id
          from call_logs cl
          join arrivi l on l.id = cl.contact_id
         where cl.company_id = p_company_id
      ) t
  ), primo_tocco as (
    select distinct on (contact_id) contact_id, quando, chi
      from tocchi order by contact_id, quando
  ), firmati as (
    select q.contact_id, min(coalesce(q.signed_at, q.created_at)) as firmato_il,
           sum(coalesce(q.total - q.vat_amount, q.subtotal, q.total, 0)) as valore
      from quotes q join arrivi l on l.id = q.contact_id
     where q.company_id = p_company_id and q.deleted_at is null and q.status in ('accettata', 'convertita')
     group by q.contact_id
  ), tutte_fasi as (
    select s.id, s.name, s.position, s.auto_status
      from marketing_pipeline_stages s
     where s.pipeline_id = v_pipeline
  ), fasi as (
    -- il percorso: le fasi normali prima di quella «vinta». Perse, scartate e
    -- quelle dopo la vendita (recensione, standby…) sono uscite, non passi:
    -- in ordine di posizione «Non in target» verrebbe dopo «Trattativa».
    select f.id, f.name, f.position
      from tutte_fasi f
     where coalesce(f.auto_status, 'open') = 'open'
       and f.position < coalesce((select min(w.position) from tutte_fasi w where w.auto_status = 'won'), 2147483647)
  ), uscite as (
    select f.id, f.name, f.position, f.auto_status
      from tutte_fasi f
     where f.id not in (select id from fasi) and coalesce(f.auto_status, '') <> 'won'
  ), max_fase as (
    select coalesce(max(position), 0) as pos from fasi
  ), raggiunta as (
    -- la fase del percorso più avanti toccata (storico + fase attuale)
    select o.contact_id,
           greatest(
             coalesce((select max(f.position) from marketing_opportunity_stage_history h
                        join fasi f on f.id = h.stage_id where h.opportunity_id = o.id), -1),
             coalesce((select f.position from fasi f where f.id = o.stage_id), -1)
           ) as pos
      from opp o where o.pipeline_id = v_pipeline
  ), riga as (
    select l.id, l.fonte,
           -- un'assegnazione a un utente che non esiste più (cancellato) non conta
           coalesce((select pr.id from profiles pr where pr.id = l.assigned_to),
                    (select pr.id from profiles pr where pr.id = o.assigned_to),
                    pt.chi) as venditore,
           pt.quando is not null as preso,
           extract(epoch from (pt.quando - l.created_at)) / 3600.0 as ore_presa,
           o.id is not null as in_pipeline,
           exists (select 1 from appointments ap where ap.company_id = p_company_id and ap.contact_id = l.id
                     and ap.calendar_id is not null and not coalesce(ap.is_blocked_slot, false)
                     and coalesce(ap.status, '') not in ('annullato', 'riprogrammato')) as appuntamento,
           exists (select 1 from quotes q where q.company_id = p_company_id and q.contact_id = l.id
                     and q.deleted_at is null and coalesce(q.status, 'bozza') <> 'bozza') as preventivo,
           (f.contact_id is not null or o.status = 'won') as vinto,
           (f.contact_id is null and o.status = 'lost') as perso,
           (f.contact_id is null and o.status = 'abandoned') as scartato,
           (f.contact_id is null and o.status = 'open') as aperto,
           case when f.contact_id is not null then f.valore when o.status = 'won' then coalesce(o.value, 0) else 0 end as valore_vinto,
           extract(epoch from (least(f.firmato_il, case when o.status = 'won' then o.won_at end) - l.created_at)) / 86400.0 as giorni_vendita,
           -- una vendita ha fatto tutto il percorso; -1 = non ha toccato il percorso
           case when f.contact_id is not null or o.status = 'won' then (select pos from max_fase)
                else nullif(r.pos, -1) end as pos
      from arrivi l
      left join opp o on o.contact_id = l.id
      left join primo_tocco pt on pt.contact_id = l.id
      left join firmati f on f.contact_id = l.id
      left join raggiunta r on r.contact_id = l.id
  ), scelte as (
    select * from riga
     where p_assigned_user_ids is null or venditore = any (p_assigned_user_ids)
  ), per_venditore as (
    select s.venditore,
           count(*) as arrivati,
           count(*) filter (where s.preso) as presi,
           round(percentile_cont(0.5) within group (order by s.ore_presa) filter (where s.preso and s.ore_presa >= 0)::numeric, 1) as ore_presa_mediana,
           count(*) filter (where s.in_pipeline) as in_pipeline,
           count(*) filter (where s.appuntamento) as appuntamenti,
           count(*) filter (where s.preventivo) as preventivi,
           count(*) filter (where s.vinto) as vinti,
           count(*) filter (where s.perso) as persi,
           count(*) filter (where s.scartato) as scartati,
           count(*) filter (where s.aperto) as aperti,
           coalesce(sum(s.valore_vinto), 0) as valore_vinto,
           round(avg(s.giorni_vendita) filter (where s.vinto and s.giorni_vendita >= 0)::numeric, 1) as giorni_vendita,
           (select coalesce(jsonb_object_agg(f.id, (select count(*) from scelte s2
                      where s2.venditore is not distinct from s.venditore and s2.pos >= f.position)), '{}'::jsonb)
              from fasi f) as fasi
      from scelte s
     group by s.venditore
  ), per_fonte as (
    select s.fonte,
           count(*) as arrivati,
           count(*) filter (where s.preso) as presi,
           round(percentile_cont(0.5) within group (order by s.ore_presa) filter (where s.preso and s.ore_presa >= 0)::numeric, 1) as ore_presa_mediana,
           count(*) filter (where s.appuntamento) as appuntamenti,
           count(*) filter (where s.vinto) as vinti,
           count(*) filter (where s.perso) as persi,
           count(*) filter (where s.scartato) as scartati,
           count(*) filter (where s.aperto) as aperti,
           coalesce(sum(s.valore_vinto), 0) as valore_vinto,
           round(avg(s.giorni_vendita) filter (where s.vinto and s.giorni_vendita >= 0)::numeric, 1) as giorni_vendita
      from scelte s
     group by s.fonte
  ), spesa_fonte as (
    -- la spesa è della fonte, non della persona: con il filtro sul commerciale
    -- non si può dividere, e non la si mostra
    select coalesce(nullif(btrim(cc.source), ''), 'Non specificata') as fonte, sum(cc.spend_amount) as spesa
      from campaign_costs cc
     where cc.company_id = p_company_id and p_assigned_user_ids is null
       and cc.date between (v_da at time zone 'Europe/Rome')::date and (v_a at time zone 'Europe/Rome')::date
       and (p_sources is null or cc.source = any (p_sources))
     group by 1
  ), giorni_fase as (
    -- quanto resta un'opportunità in una fase: dall'ingresso all'ingresso
    -- successivo (o alla chiusura, o a oggi se è ancora lì)
    select x.stage_id, avg(x.giorni) as giorni
      from (
        select h.stage_id,
               extract(epoch from (coalesce(
                 lead(h.entered_at) over (partition by h.opportunity_id order by h.entered_at),
                 case when o.status = 'won' then o.won_at when o.status = 'lost' then o.lost_at end,
                 now()) - h.entered_at)) / 86400.0 as giorni
          from marketing_opportunity_stage_history h
          join opp o on o.id = h.opportunity_id
          join scelte s on s.id = o.contact_id
         where o.pipeline_id = v_pipeline
      ) x
     group by x.stage_id
  )
  select jsonb_build_object(
    'pipeline', case when v_pipeline is null then null else jsonb_build_object('id', v_pipeline, 'name', v_pipeline_nome) end,
    'pipelines', v_pipelines,
    'fasi', coalesce((
      select jsonb_agg(jsonb_build_object(
               'stage_id', f.id, 'name', f.name, 'position', f.position,
               'raggiunte', (select count(*) from scelte s where s.pos >= f.position),
               'ferme_qui', (select count(*) from scelte s join opp o on o.contact_id = s.id
                              where o.stage_id = f.id and o.status = 'open'),
               'giorni_medi', (select round(g.giorni::numeric, 1) from giorni_fase g where g.stage_id = f.id)
             ) order by f.position)
        from fasi f), '[]'::jsonb),
    -- dove sono finiti i lead che sono usciti dal percorso, oggi
    'uscite', coalesce((
      select jsonb_agg(jsonb_build_object('stage_id', u.id, 'name', u.name, 'tipo', coalesce(u.auto_status, 'altro'), 'lead', u.n)
             order by u.n desc)
        from (select u.id, u.name, u.auto_status,
                     (select count(*) from scelte s join opp o on o.contact_id = s.id where o.stage_id = u.id) as n
                from uscite u) u
       where u.n > 0), '[]'::jsonb),
    -- le stesse cifre per fonte, con la spesa del periodo (CPL, costo per
    -- vendita e ROI li calcola la pagina)
    'fonti', coalesce((
      select jsonb_agg(to_jsonb(pf) || jsonb_build_object('spesa', sf.spesa)
             order by pf.vinti desc, pf.arrivati desc)
        from per_fonte pf left join spesa_fonte sf on sf.fonte = pf.fonte), '[]'::jsonb),
    'commerciali', coalesce((
      select jsonb_agg(to_jsonb(pv) || jsonb_build_object(
               'user_id', pv.venditore,
               'name', case when pv.venditore is null then 'Non assegnati'
                            else coalesce(nullif(btrim(concat_ws(' ', p.first_name, p.last_name)), ''), 'Senza nome') end)
             order by pv.venditore is null, pv.arrivati desc)
        from per_venditore pv left join profiles p on p.id = pv.venditore), '[]'::jsonb),
    'totale', (
      select jsonb_build_object(
               'arrivati', count(*),
               'presi', count(*) filter (where preso),
               'ore_presa_mediana', round(percentile_cont(0.5) within group (order by ore_presa) filter (where preso and ore_presa >= 0)::numeric, 1),
               'in_pipeline', count(*) filter (where in_pipeline),
               'appuntamenti', count(*) filter (where appuntamento),
               'preventivi', count(*) filter (where preventivo),
               'vinti', count(*) filter (where vinto),
               'persi', count(*) filter (where perso),
               'scartati', count(*) filter (where scartato),
               'aperti', count(*) filter (where aperto),
               'valore_vinto', coalesce(sum(valore_vinto), 0),
               'giorni_vendita', round(avg(giorni_vendita) filter (where vinto and giorni_vendita >= 0)::numeric, 1))
        from scelte)
  ) into v_risultato;

  return v_risultato;
end;
$function$;

revoke all on function public.marketing_percorso_lead(uuid, timestamptz, timestamptz, uuid[], text[], uuid) from public, anon;
grant execute on function public.marketing_percorso_lead(uuid, timestamptz, timestamptz, uuid[], text[], uuid) to authenticated, service_role;
