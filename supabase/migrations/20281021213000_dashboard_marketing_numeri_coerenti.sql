-- Dashboard marketing: numeri che tornano con Sales OS, e solo a chi può vederli.
--
-- Analisi del 21/10/2026 sulla Demo 2 (periodo: questo mese):
--   · fatturato 0 € mentre Sales OS diceva 447.571 € firmati: la dashboard
--     contava solo le opportunità vinte, ma in tutto il database nessuno dei 234
--     preventivi firmati è collegato a un'opportunità. Le vendite vere stanno nei
--     preventivi;
--   · pipeline pesata 465.240 € qui, 548.375 € in Sales OS: qui un peso inventato
--     dalla posizione della fase, là la probabilità dell'opportunità;
--   · l'imbuto contava le opportunità CREATE nel periodo (6), la pipeline tutte
--     quelle aperte (65): due numeri accanto che non si potevano confrontare;
--   · «opportunità ferme» con una regola sua (7 giorni dall'ultima modifica) e non
--     quella di Sales OS (soglia della fase, ultima attività vera);
--   · «appuntamenti senza esito» da sempre (881), non del periodo;
--   · la funzione controllava solo l'azienda: un venditore senza il permesso della
--     dashboard leggeva via API fatturato e tabella dei colleghi, e le pipeline
--     nascoste (staff_permissions.pipeline_visibili) entravano nei totali.
--
-- Regole, le stesse di vendite_preventivi / vendite_opportunita (20280915410001):
--   · una VENDITA è un preventivo firmato (accettata/convertita), per data di
--     firma e imponibile; oppure un'opportunità vinta (per won_at) quando dello
--     stesso contatto non c'è già un preventivo firmato nel periodo: così niente
--     viene contato due volte. Le vendite le dà marketing_vendite_periodo(), che
--     usano KPI, andamento, commerciali, fonti e il grafico dei 12 mesi;
--   · tasso di chiusura = opportunità vinte ÷ (vinte + perse), solo opportunità;
--   · pipeline, pesata e imbuto = le opportunità aperte OGGI, pesate con la loro
--     probabilità (50 se manca);
--   · chi vede solo i propri lead vede solo i propri numeri; le pipeline nascoste
--     non entrano mai.
--
-- Non si scrive nessun dato. Chiudere in automatico l'opportunità alla firma è
-- stato scartato: non ci sono preventivi collegati da chiudere, e una vinta
-- manda la conversione a Meta e Google (enqueue_*_opportunity_won_event).
--
-- Stessa firma di get_marketing_dashboard_stats e stessi campi, più alcuni nuovi
-- (revenue_quotes, quotes_signed, opps_won, appointments_pending; per
-- commerciale contracts_lost e close_rate). marketing_trend_12m prende i filtri
-- della pagina: la vecchia firma (solo azienda) viene tolta.

set local lock_timeout = '3s';
set local statement_timeout = '60s';

-- Le vendite di un periodo, una riga per vendita.
create or replace function public.marketing_vendite_periodo(
  p_company uuid,
  p_da timestamptz,
  p_a timestamptz,
  p_utenti uuid[] default null,
  p_fonti text[] default null,
  p_pipeline uuid default null,
  p_nascoste uuid[] default '{}'::uuid[]
)
returns table(tipo text, venditore uuid, contact_id uuid, fonte text, quando timestamptz, valore numeric)
language sql
stable
set search_path to 'public'
as $function$
  with firmati as (
    select q.id,
           coalesce(q.salesperson_id, q.assigned_to, q.created_by) as venditore,
           q.contact_id,
           mc.source as fonte,
           coalesce(q.signed_at, q.created_at) as quando,
           coalesce(q.total - q.vat_amount, q.subtotal, q.total, 0)::numeric as valore,
           o.pipeline_id
      from public.quotes q
      left join public.marketing_contacts mc on mc.id = q.contact_id
      left join public.marketing_opportunities o on o.id = q.opportunity_id
     where q.company_id = p_company
       and q.deleted_at is null
       and q.status in ('accettata', 'convertita')
       and coalesce(q.signed_at, q.created_at) >= p_da
       and coalesce(q.signed_at, q.created_at) <= p_a
  ), preventivi as (
    select f.* from firmati f
     where (p_utenti is null or f.venditore = any (p_utenti))
       and (p_fonti is null or f.fonte = any (p_fonti))
       and (f.pipeline_id is null or not (f.pipeline_id = any (p_nascoste)))
       and (p_pipeline is null
            or f.pipeline_id = p_pipeline
            or (f.pipeline_id is null and exists (
                  select 1 from public.marketing_opportunities po
                   where po.company_id = p_company and po.deleted_at is null
                     and po.pipeline_id = p_pipeline and po.contact_id = f.contact_id)))
  )
  select 'preventivo'::text, p.venditore, p.contact_id, p.fonte, p.quando, p.valore
    from preventivi p
  union all
  select 'opportunita'::text, mo.assigned_to, mo.contact_id, mo.source, mo.won_at, coalesce(mo.value, 0)::numeric
    from public.marketing_opportunities mo
   where mo.company_id = p_company
     and mo.deleted_at is null
     and mo.status = 'won'
     and mo.won_at >= p_da and mo.won_at <= p_a
     and (p_utenti is null or mo.assigned_to = any (p_utenti))
     and (p_fonti is null or mo.source = any (p_fonti))
     and (p_pipeline is null or mo.pipeline_id = p_pipeline)
     and not (mo.pipeline_id is not null and mo.pipeline_id = any (p_nascoste))
     -- già contata col suo preventivo firmato (di qualunque venditore o fonte)
     and not exists (select 1 from firmati f
                      where f.contact_id is not null and f.contact_id = mo.contact_id)
$function$;

revoke all on function public.marketing_vendite_periodo(uuid, timestamptz, timestamptz, uuid[], text[], uuid, uuid[]) from public, anon, authenticated;
grant execute on function public.marketing_vendite_periodo(uuid, timestamptz, timestamptz, uuid[], text[], uuid, uuid[]) to service_role;

CREATE OR REPLACE FUNCTION public.get_marketing_dashboard_stats(p_company_id uuid, p_date_from timestamp with time zone DEFAULT NULL::timestamp with time zone, p_date_to timestamp with time zone DEFAULT NULL::timestamp with time zone, p_assigned_user_ids uuid[] DEFAULT NULL::uuid[], p_sources text[] DEFAULT NULL::text[], p_pipeline_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  result jsonb;
  v_date_from timestamptz := COALESCE(p_date_from, now() - interval '30 days');
  v_date_to timestamptz := COALESCE(p_date_to, now());
  v_period_length interval := v_date_to - v_date_from;
  v_prev_from timestamptz := v_date_from - v_period_length;
  v_prev_to timestamptz := v_date_from;
  v_giorno_da date := (v_date_from AT TIME ZONE 'Europe/Rome')::date;
  v_giorno_a date := (v_date_to AT TIME ZONE 'Europe/Rome')::date;
  v_prev_giorno_da date := (v_prev_from AT TIME ZONE 'Europe/Rome')::date;
  v_prev_giorno_a date := ((v_prev_to - interval '1 microsecond') AT TIME ZONE 'Europe/Rome')::date;
  v_oggi date := (now() AT TIME ZONE 'Europe/Rome')::date;
  v_nascoste uuid[];
  -- Current KPIs
  v_leads_total bigint;
  v_leads_new bigint;
  v_contacts_worked bigint;
  v_appointments_set bigint;
  v_appointments_done bigint;
  v_appointments_no_show bigint;
  v_appointments_pending bigint;
  v_contracts_won bigint;
  v_revenue numeric;
  v_quotes_signed bigint;
  v_revenue_quotes numeric;
  v_opps_won bigint;
  v_contracts_lost bigint;
  v_revenue_lost numeric;
  v_total_spend numeric;
  v_calls_total bigint;
  v_calls_answered bigint;
  -- Previous KPIs
  v_prev_leads_total bigint;
  v_prev_leads_new bigint;
  v_prev_contacts_worked bigint;
  v_prev_appointments_set bigint;
  v_prev_appointments_done bigint;
  v_prev_appointments_no_show bigint;
  v_prev_contracts_won bigint;
  v_prev_revenue numeric;
  v_prev_quotes_signed bigint;
  v_prev_revenue_quotes numeric;
  v_prev_opps_won bigint;
  v_prev_contracts_lost bigint;
  v_prev_revenue_lost numeric;
  v_prev_total_spend numeric;
  v_prev_calls_total bigint;
  v_prev_calls_answered bigint;
  -- Enterprise fields
  v_pipeline_active_value numeric;
  v_avg_time_to_first_contact numeric;
  v_avg_time_to_close numeric;
  v_forecast_30d numeric;
  v_prev_pipeline_active_value numeric;
  v_open_opps_advanced bigint;
  v_avg_lead_to_won_days numeric;
  v_median_lead_to_won_days numeric;
  v_sales_velocity numeric;
  v_rpl numeric;
  v_weighted_pipeline numeric;
  v_open_opps_count bigint;
  v_prev_avg_lead_to_won_days numeric;
  v_prev_sales_velocity numeric;
  v_prev_rpl numeric;
  v_prev_close_rate numeric;
  v_prev_avg_ticket numeric;
  -- Sections
  v_funnel jsonb;
  v_sales jsonb;
  v_sources jsonb;
  v_alerts jsonb;
  v_trend jsonb;
  v_call_center jsonb;
  v_show_rate numeric;
  v_close_rate numeric;
  v_avg_ticket numeric;
BEGIN
  PERFORM public.assert_company_access(p_company_id);
  -- Il permesso della pagina (Dashboard marketing, Report marketing o Cruscotto),
  -- lo stesso di get_metric: prima bastava essere dell'azienda.
  IF NOT public.puo_vedere_metrica(p_company_id, 'marketing') THEN
    RAISE EXCEPTION 'Non hai il permesso di vedere la dashboard marketing' USING ERRCODE = '42501';
  END IF;
  IF public.solo_assegnati_attivo() THEN
    p_assigned_user_ids := ARRAY[auth.uid()];
  END IF;
  v_nascoste := COALESCE(public.pipeline_nascoste(), '{}'::uuid[]);

  -- CURRENT PERIOD KPIs
  SELECT COUNT(*) INTO v_leads_total
  FROM marketing_contacts mc
  WHERE mc.company_id = p_company_id AND mc.deleted_at IS NULL AND mc.created_at <= v_date_to
    AND (p_assigned_user_ids IS NULL OR mc.assigned_to = ANY(p_assigned_user_ids))
    AND (p_sources IS NULL OR mc.source = ANY(p_sources));

  SELECT COUNT(*) INTO v_leads_new
  FROM marketing_contacts mc
  WHERE mc.company_id = p_company_id AND mc.deleted_at IS NULL AND mc.created_at >= v_date_from AND mc.created_at <= v_date_to
    AND (p_assigned_user_ids IS NULL OR mc.assigned_to = ANY(p_assigned_user_ids))
    AND (p_sources IS NULL OR mc.source = ANY(p_sources));

  SELECT COUNT(DISTINCT mc.id) INTO v_contacts_worked
  FROM marketing_contacts mc
  WHERE mc.company_id = p_company_id AND mc.deleted_at IS NULL
    AND (p_assigned_user_ids IS NULL OR mc.assigned_to = ANY(p_assigned_user_ids))
    AND (p_sources IS NULL OR mc.source = ANY(p_sources))
    AND (
      EXISTS (SELECT 1 FROM marketing_contact_activities mca WHERE mca.contact_id = mc.id AND mca.created_at >= v_date_from AND mca.created_at <= v_date_to)
      OR EXISTS (SELECT 1 FROM marketing_opportunities mo WHERE mo.contact_id = mc.id AND mo.created_at >= v_date_from AND mo.created_at <= v_date_to)
    );

  -- appuntamenti con le regole di vendite_appuntamenti: fissati, effettuati,
  -- no-show e senza esito (confermati con la data passata)
  SELECT COUNT(*),
         COUNT(*) FILTER (WHERE COALESCE(a.status, '') IN ('presentato', 'da_preventivare', 'preventivo_inviato', 'venduto', 'perso', 'non_qualificato', 'completato')),
         COUNT(*) FILTER (WHERE a.status = 'no_show'),
         COUNT(*) FILTER (WHERE COALESCE(a.status, 'confermato') = 'confermato' AND a.appointment_date < v_oggi)
  INTO v_appointments_set, v_appointments_done, v_appointments_no_show, v_appointments_pending
  FROM appointments a
  WHERE a.company_id = p_company_id AND a.appointment_date BETWEEN v_giorno_da AND v_giorno_a
    AND a.calendar_id IS NOT NULL AND NOT COALESCE(a.is_blocked_slot, false) AND COALESCE(a.status, '') NOT IN ('annullato', 'riprogrammato')
    AND (p_assigned_user_ids IS NULL OR a.assigned_to = ANY(p_assigned_user_ids));

  -- vendite: preventivi firmati + opportunità vinte senza preventivo
  SELECT COUNT(*), COALESCE(SUM(v.valore), 0),
         COUNT(*) FILTER (WHERE v.tipo = 'preventivo'), COALESCE(SUM(v.valore) FILTER (WHERE v.tipo = 'preventivo'), 0)
  INTO v_contracts_won, v_revenue, v_quotes_signed, v_revenue_quotes
  FROM public.marketing_vendite_periodo(p_company_id, v_date_from, v_date_to, p_assigned_user_ids, p_sources, p_pipeline_id, v_nascoste) v;

  -- opportunità vinte e perse (per il tasso di chiusura, come Sales OS)
  SELECT COUNT(*) FILTER (WHERE mo.status = 'won' AND mo.won_at >= v_date_from AND mo.won_at <= v_date_to),
         COUNT(*) FILTER (WHERE mo.status = 'lost' AND mo.lost_at >= v_date_from AND mo.lost_at <= v_date_to),
         COALESCE(SUM(mo.value) FILTER (WHERE mo.status = 'lost' AND mo.lost_at >= v_date_from AND mo.lost_at <= v_date_to), 0)
  INTO v_opps_won, v_contracts_lost, v_revenue_lost
  FROM marketing_opportunities mo
  WHERE mo.company_id = p_company_id AND mo.deleted_at IS NULL AND mo.status IN ('won', 'lost')
    AND NOT (mo.pipeline_id IS NOT NULL AND mo.pipeline_id = ANY(v_nascoste))
    AND (p_assigned_user_ids IS NULL OR mo.assigned_to = ANY(p_assigned_user_ids))
    AND (p_sources IS NULL OR mo.source = ANY(p_sources))
    AND (p_pipeline_id IS NULL OR mo.pipeline_id = p_pipeline_id);

  SELECT COALESCE(SUM(cc.spend_amount), 0) INTO v_total_spend
  FROM campaign_costs cc
  WHERE cc.company_id = p_company_id AND cc.date BETWEEN v_giorno_da AND v_giorno_a
    AND (p_sources IS NULL OR cc.source = ANY(p_sources));

  SELECT COUNT(*), COUNT(*) FILTER (WHERE cl.outcome = 'answered')
  INTO v_calls_total, v_calls_answered
  FROM call_logs cl
  WHERE cl.company_id = p_company_id AND cl.started_at >= v_date_from AND cl.started_at <= v_date_to
    AND (p_assigned_user_ids IS NULL OR cl.user_id = ANY(p_assigned_user_ids));

  v_show_rate := CASE WHEN v_appointments_done + v_appointments_no_show > 0 THEN ROUND((v_appointments_done::numeric / (v_appointments_done + v_appointments_no_show)) * 100, 1) ELSE 0 END;
  v_close_rate := CASE WHEN v_opps_won + v_contracts_lost > 0 THEN ROUND((v_opps_won::numeric / (v_opps_won + v_contracts_lost)) * 100, 1) ELSE 0 END;
  v_avg_ticket := CASE WHEN v_contracts_won > 0 THEN ROUND(v_revenue / v_contracts_won, 2) ELSE 0 END;

  -- PIPELINE APERTA OGGI: valore, numero, pesata con la probabilità (come
  -- get_weighted_pipeline) e quelle in fase avanzata (per il forecast)
  SELECT COALESCE(SUM(mo.value), 0),
         COUNT(*),
         COALESCE(SUM(COALESCE(mo.value, 0) * GREATEST(0, LEAST(100, COALESCE(mo.probability, 50))) / 100.0), 0),
         COUNT(*) FILTER (WHERE mps.position >= max_pos.max_position / 2)
  INTO v_pipeline_active_value, v_open_opps_count, v_weighted_pipeline, v_open_opps_advanced
  FROM marketing_opportunities mo
  LEFT JOIN marketing_pipeline_stages mps ON mps.id = mo.stage_id
  LEFT JOIN LATERAL (
    SELECT COALESCE(MAX(mps2.position), 0) AS max_position
    FROM marketing_pipeline_stages mps2
    WHERE mps2.pipeline_id = mo.pipeline_id
  ) max_pos ON true
  WHERE mo.company_id = p_company_id AND mo.deleted_at IS NULL AND mo.status = 'open'
    AND NOT (mo.pipeline_id IS NOT NULL AND mo.pipeline_id = ANY(v_nascoste))
    AND (p_assigned_user_ids IS NULL OR mo.assigned_to = ANY(p_assigned_user_ids))
    AND (p_sources IS NULL OR mo.source = ANY(p_sources))
    AND (p_pipeline_id IS NULL OR mo.pipeline_id = p_pipeline_id);

  SELECT COALESCE(SUM(mo.value), 0) INTO v_prev_pipeline_active_value
  FROM marketing_opportunities mo
  WHERE mo.company_id = p_company_id AND mo.deleted_at IS NULL AND mo.status = 'open'
    AND mo.created_at <= v_prev_to
    AND NOT (mo.pipeline_id IS NOT NULL AND mo.pipeline_id = ANY(v_nascoste))
    AND (p_assigned_user_ids IS NULL OR mo.assigned_to = ANY(p_assigned_user_ids))
    AND (p_sources IS NULL OR mo.source = ANY(p_sources))
    AND (p_pipeline_id IS NULL OR mo.pipeline_id = p_pipeline_id);

  -- Avg time to first contact (hours)
  SELECT COALESCE(ROUND(AVG(EXTRACT(EPOCH FROM (mca.created_at - mc.created_at)) / 3600)::numeric, 1), 0)
  INTO v_avg_time_to_first_contact
  FROM marketing_contacts mc
  JOIN LATERAL (
    SELECT MIN(mca2.created_at) AS created_at
    FROM marketing_contact_activities mca2
    WHERE mca2.contact_id = mc.id
  ) mca ON true
  WHERE mc.company_id = p_company_id AND mc.deleted_at IS NULL AND mc.created_at >= v_date_from AND mc.created_at <= v_date_to
    AND mca.created_at IS NOT NULL
    AND (p_assigned_user_ids IS NULL OR mc.assigned_to = ANY(p_assigned_user_ids))
    AND (p_sources IS NULL OR mc.source = ANY(p_sources));

  -- Tempi di chiusura sulle opportunità vinte del periodo
  SELECT COALESCE(ROUND(AVG(EXTRACT(EPOCH FROM (mo.won_at - mo.created_at)) / 86400)::numeric, 1), 0),
         COALESCE(ROUND(AVG(EXTRACT(EPOCH FROM (mo.won_at - mc.created_at)) / 86400)::numeric, 1), 0),
         COALESCE(ROUND(percentile_cont(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (mo.won_at - mc.created_at)) / 86400)::numeric, 1), 0)
  INTO v_avg_time_to_close, v_avg_lead_to_won_days, v_median_lead_to_won_days
  FROM marketing_opportunities mo
  LEFT JOIN marketing_contacts mc ON mc.id = mo.contact_id
  WHERE mo.company_id = p_company_id AND mo.deleted_at IS NULL AND mo.status = 'won'
    AND mo.won_at >= v_date_from AND mo.won_at <= v_date_to
    AND NOT (mo.pipeline_id IS NOT NULL AND mo.pipeline_id = ANY(v_nascoste))
    AND (p_assigned_user_ids IS NULL OR mo.assigned_to = ANY(p_assigned_user_ids))
    AND (p_sources IS NULL OR mo.source = ANY(p_sources))
    AND (p_pipeline_id IS NULL OR mo.pipeline_id = p_pipeline_id);

  -- Sales Velocity = (aperte × tasso di chiusura × ticket medio) / giorni di ciclo
  v_sales_velocity := CASE
    WHEN v_avg_lead_to_won_days > 0 AND v_close_rate > 0 AND v_avg_ticket > 0
    THEN ROUND((v_open_opps_count * (v_close_rate / 100.0) * v_avg_ticket) / v_avg_lead_to_won_days, 2)
    ELSE 0
  END;

  v_rpl := CASE WHEN v_leads_new > 0 THEN ROUND(v_revenue / v_leads_new, 2) ELSE 0 END;

  v_forecast_30d := CASE
    WHEN v_close_rate > 0 AND v_avg_ticket > 0
    THEN ROUND((v_close_rate / 100.0) * v_avg_ticket * v_open_opps_advanced, 2)
    ELSE 0
  END;

  -- PREVIOUS PERIOD KPIs
  SELECT COUNT(*) INTO v_prev_leads_total
  FROM marketing_contacts mc
  WHERE mc.company_id = p_company_id AND mc.deleted_at IS NULL AND mc.created_at <= v_prev_to
    AND (p_assigned_user_ids IS NULL OR mc.assigned_to = ANY(p_assigned_user_ids))
    AND (p_sources IS NULL OR mc.source = ANY(p_sources));

  SELECT COUNT(*) INTO v_prev_leads_new
  FROM marketing_contacts mc
  WHERE mc.company_id = p_company_id AND mc.deleted_at IS NULL AND mc.created_at >= v_prev_from AND mc.created_at <= v_prev_to
    AND (p_assigned_user_ids IS NULL OR mc.assigned_to = ANY(p_assigned_user_ids))
    AND (p_sources IS NULL OR mc.source = ANY(p_sources));

  SELECT COUNT(DISTINCT mc.id) INTO v_prev_contacts_worked
  FROM marketing_contacts mc
  WHERE mc.company_id = p_company_id AND mc.deleted_at IS NULL
    AND (p_assigned_user_ids IS NULL OR mc.assigned_to = ANY(p_assigned_user_ids))
    AND (p_sources IS NULL OR mc.source = ANY(p_sources))
    AND (
      EXISTS (SELECT 1 FROM marketing_contact_activities mca WHERE mca.contact_id = mc.id AND mca.created_at >= v_prev_from AND mca.created_at <= v_prev_to)
      OR EXISTS (SELECT 1 FROM marketing_opportunities mo WHERE mo.contact_id = mc.id AND mo.created_at >= v_prev_from AND mo.created_at <= v_prev_to)
    );

  SELECT COUNT(*),
         COUNT(*) FILTER (WHERE COALESCE(a.status, '') IN ('presentato', 'da_preventivare', 'preventivo_inviato', 'venduto', 'perso', 'non_qualificato', 'completato')),
         COUNT(*) FILTER (WHERE a.status = 'no_show')
  INTO v_prev_appointments_set, v_prev_appointments_done, v_prev_appointments_no_show
  FROM appointments a
  WHERE a.company_id = p_company_id AND a.appointment_date BETWEEN v_prev_giorno_da AND v_prev_giorno_a
    AND a.calendar_id IS NOT NULL AND NOT COALESCE(a.is_blocked_slot, false) AND COALESCE(a.status, '') NOT IN ('annullato', 'riprogrammato')
    AND (p_assigned_user_ids IS NULL OR a.assigned_to = ANY(p_assigned_user_ids));

  SELECT COUNT(*), COALESCE(SUM(v.valore), 0),
         COUNT(*) FILTER (WHERE v.tipo = 'preventivo'), COALESCE(SUM(v.valore) FILTER (WHERE v.tipo = 'preventivo'), 0)
  INTO v_prev_contracts_won, v_prev_revenue, v_prev_quotes_signed, v_prev_revenue_quotes
  FROM public.marketing_vendite_periodo(p_company_id, v_prev_from, v_prev_to, p_assigned_user_ids, p_sources, p_pipeline_id, v_nascoste) v;

  SELECT COUNT(*) FILTER (WHERE mo.status = 'won' AND mo.won_at >= v_prev_from AND mo.won_at <= v_prev_to),
         COUNT(*) FILTER (WHERE mo.status = 'lost' AND mo.lost_at >= v_prev_from AND mo.lost_at <= v_prev_to),
         COALESCE(SUM(mo.value) FILTER (WHERE mo.status = 'lost' AND mo.lost_at >= v_prev_from AND mo.lost_at <= v_prev_to), 0)
  INTO v_prev_opps_won, v_prev_contracts_lost, v_prev_revenue_lost
  FROM marketing_opportunities mo
  WHERE mo.company_id = p_company_id AND mo.deleted_at IS NULL AND mo.status IN ('won', 'lost')
    AND NOT (mo.pipeline_id IS NOT NULL AND mo.pipeline_id = ANY(v_nascoste))
    AND (p_assigned_user_ids IS NULL OR mo.assigned_to = ANY(p_assigned_user_ids))
    AND (p_sources IS NULL OR mo.source = ANY(p_sources))
    AND (p_pipeline_id IS NULL OR mo.pipeline_id = p_pipeline_id);

  SELECT COALESCE(SUM(cc.spend_amount), 0) INTO v_prev_total_spend
  FROM campaign_costs cc
  WHERE cc.company_id = p_company_id AND cc.date BETWEEN v_prev_giorno_da AND v_prev_giorno_a
    AND (p_sources IS NULL OR cc.source = ANY(p_sources));

  SELECT COUNT(*), COUNT(*) FILTER (WHERE cl.outcome = 'answered')
  INTO v_prev_calls_total, v_prev_calls_answered
  FROM call_logs cl
  WHERE cl.company_id = p_company_id AND cl.started_at >= v_prev_from AND cl.started_at <= v_prev_to
    AND (p_assigned_user_ids IS NULL OR cl.user_id = ANY(p_assigned_user_ids));

  SELECT COALESCE(ROUND(AVG(EXTRACT(EPOCH FROM (mo.won_at - mc.created_at)) / 86400)::numeric, 1), 0)
  INTO v_prev_avg_lead_to_won_days
  FROM marketing_opportunities mo
  JOIN marketing_contacts mc ON mc.id = mo.contact_id
  WHERE mo.company_id = p_company_id AND mo.deleted_at IS NULL AND mo.status = 'won'
    AND mo.won_at >= v_prev_from AND mo.won_at <= v_prev_to
    AND NOT (mo.pipeline_id IS NOT NULL AND mo.pipeline_id = ANY(v_nascoste))
    AND (p_assigned_user_ids IS NULL OR mo.assigned_to = ANY(p_assigned_user_ids))
    AND (p_sources IS NULL OR mo.source = ANY(p_sources))
    AND (p_pipeline_id IS NULL OR mo.pipeline_id = p_pipeline_id);

  v_prev_close_rate := CASE WHEN v_prev_opps_won + v_prev_contracts_lost > 0 THEN ROUND((v_prev_opps_won::numeric / (v_prev_opps_won + v_prev_contracts_lost)) * 100, 1) ELSE 0 END;
  v_prev_avg_ticket := CASE WHEN v_prev_contracts_won > 0 THEN ROUND(v_prev_revenue / v_prev_contracts_won, 2) ELSE 0 END;

  v_prev_sales_velocity := CASE
    WHEN v_prev_avg_lead_to_won_days > 0 AND v_prev_close_rate > 0 AND v_prev_avg_ticket > 0
    THEN ROUND((v_open_opps_count * (v_prev_close_rate / 100.0) * v_prev_avg_ticket) / v_prev_avg_lead_to_won_days, 2)
    ELSE 0
  END;

  v_prev_rpl := CASE WHEN v_prev_leads_new > 0 THEN ROUND(v_prev_revenue / v_prev_leads_new, 2) ELSE 0 END;

  -- FUNNEL: le opportunità aperte oggi per fase, le stesse della pipeline
  SELECT COALESCE(jsonb_agg(row_to_json(f) ORDER BY f.position), '[]'::jsonb)
  INTO v_funnel
  FROM (
    SELECT mps.id AS stage_id, mps.name, mps.position,
      COUNT(mo.id) AS count, COALESCE(SUM(mo.value), 0) AS total_value,
      COALESCE(ROUND(AVG(
        CASE WHEN mo.id IS NOT NULL THEN EXTRACT(EPOCH FROM (now() - COALESCE(mo.stage_changed_at, mo.created_at))) / 86400 END
      )::numeric, 1), 0) AS avg_days_in_stage
    FROM marketing_pipeline_stages mps
    LEFT JOIN marketing_opportunities mo ON mo.stage_id = mps.id
      AND mo.company_id = p_company_id AND mo.deleted_at IS NULL AND mo.status = 'open'
      AND (p_assigned_user_ids IS NULL OR mo.assigned_to = ANY(p_assigned_user_ids))
      AND (p_sources IS NULL OR mo.source = ANY(p_sources))
    WHERE mps.company_id = p_company_id
      AND NOT (mps.pipeline_id IS NOT NULL AND mps.pipeline_id = ANY(v_nascoste))
      AND (p_pipeline_id IS NULL OR mps.pipeline_id = p_pipeline_id)
    GROUP BY mps.id, mps.name, mps.position
  ) f;

  -- SALES PERFORMANCE: vendite, vinte/perse e appuntamenti per commerciale
  WITH vendite AS (
    SELECT v.venditore AS user_id, COUNT(*) AS cnt, COALESCE(SUM(v.valore), 0) AS total_value
    FROM public.marketing_vendite_periodo(p_company_id, v_date_from, v_date_to, p_assigned_user_ids, p_sources, p_pipeline_id, v_nascoste) v
    GROUP BY v.venditore
  ),
  esiti AS (
    SELECT mo.assigned_to AS user_id,
           COUNT(*) FILTER (WHERE mo.status = 'won' AND mo.won_at >= v_date_from AND mo.won_at <= v_date_to) AS vinte,
           COUNT(*) FILTER (WHERE mo.status = 'lost' AND mo.lost_at >= v_date_from AND mo.lost_at <= v_date_to) AS perse
    FROM marketing_opportunities mo
    WHERE mo.company_id = p_company_id AND mo.deleted_at IS NULL AND mo.status IN ('won', 'lost')
      AND NOT (mo.pipeline_id IS NOT NULL AND mo.pipeline_id = ANY(v_nascoste))
      AND (p_sources IS NULL OR mo.source = ANY(p_sources))
      AND (p_pipeline_id IS NULL OR mo.pipeline_id = p_pipeline_id)
    GROUP BY mo.assigned_to
  ),
  appuntamenti AS (
    SELECT a.assigned_to AS user_id,
           COUNT(*) AS fissati,
           COUNT(*) FILTER (WHERE COALESCE(a.status, '') IN ('presentato', 'da_preventivare', 'preventivo_inviato', 'venduto', 'perso', 'non_qualificato', 'completato')) AS effettuati,
           COUNT(*) FILTER (WHERE a.status = 'no_show') AS no_show
    FROM appointments a
    WHERE a.company_id = p_company_id AND a.appointment_date BETWEEN v_giorno_da AND v_giorno_a
      AND a.calendar_id IS NOT NULL AND NOT COALESCE(a.is_blocked_slot, false) AND COALESCE(a.status, '') NOT IN ('annullato', 'riprogrammato')
    GROUP BY a.assigned_to
  ),
  sales_users AS (
    SELECT p.id AS user_id, p.first_name, p.last_name
    FROM profiles p
    WHERE p.company_id = p_company_id
      AND (p_assigned_user_ids IS NULL OR p.id = ANY(p_assigned_user_ids))
      AND (
        EXISTS (SELECT 1 FROM marketing_opportunities mo2 WHERE mo2.assigned_to = p.id AND mo2.company_id = p_company_id AND mo2.deleted_at IS NULL)
        OR EXISTS (SELECT 1 FROM appointments a2 WHERE a2.assigned_to = p.id AND a2.company_id = p_company_id)
        OR EXISTS (SELECT 1 FROM vendite v2 WHERE v2.user_id = p.id)
      )
  )
  SELECT COALESCE(jsonb_agg(row_to_json(s) ORDER BY s.revenue DESC), '[]'::jsonb)
  INTO v_sales
  FROM (
    SELECT su.user_id, btrim(concat_ws(' ', su.first_name, su.last_name)) AS name,
      COALESCE(ap.fissati, 0) AS appointments_set, COALESCE(ap.effettuati, 0) AS appointments_done,
      COALESCE(ve.cnt, 0) AS contracts_won, COALESCE(ve.total_value, 0) AS revenue,
      COALESCE(es.perse, 0) AS contracts_lost,
      CASE WHEN COALESCE(ap.effettuati, 0) + COALESCE(ap.no_show, 0) > 0 THEN ROUND((ap.effettuati::numeric / (ap.effettuati + ap.no_show)) * 100, 1) ELSE 0 END AS show_rate,
      CASE WHEN COALESCE(es.vinte, 0) + COALESCE(es.perse, 0) > 0 THEN ROUND((es.vinte::numeric / (es.vinte + es.perse)) * 100, 1) ELSE 0 END AS close_rate
    FROM sales_users su
    LEFT JOIN appuntamenti ap ON ap.user_id = su.user_id
    LEFT JOIN vendite ve ON ve.user_id = su.user_id
    LEFT JOIN esiti es ON es.user_id = su.user_id
  ) s;

  -- SOURCES: lead nuovi, vendite e spesa del periodo per fonte
  WITH lead_fonte AS (
    SELECT COALESCE(mc.source, 'Non specificata') AS source, COUNT(*) AS leads
    FROM marketing_contacts mc
    WHERE mc.company_id = p_company_id AND mc.deleted_at IS NULL AND mc.created_at >= v_date_from AND mc.created_at <= v_date_to
      AND (p_assigned_user_ids IS NULL OR mc.assigned_to = ANY(p_assigned_user_ids))
      AND (p_sources IS NULL OR mc.source = ANY(p_sources))
    GROUP BY 1
  ),
  vendite_fonte AS (
    SELECT COALESCE(v.fonte, 'Non specificata') AS source, COUNT(*) AS contracts_won, COALESCE(SUM(v.valore), 0) AS revenue
    FROM public.marketing_vendite_periodo(p_company_id, v_date_from, v_date_to, p_assigned_user_ids, p_sources, p_pipeline_id, v_nascoste) v
    GROUP BY 1
  ),
  spesa_fonte AS (
    SELECT COALESCE(cc.source, 'Non specificata') AS source, SUM(cc.spend_amount) AS spend
    FROM campaign_costs cc
    WHERE cc.company_id = p_company_id AND cc.date BETWEEN v_giorno_da AND v_giorno_a
      AND (p_sources IS NULL OR cc.source = ANY(p_sources))
    GROUP BY 1
  )
  SELECT COALESCE(jsonb_agg(row_to_json(src) ORDER BY src.roi_pct DESC NULLS LAST, src.revenue DESC), '[]'::jsonb)
  INTO v_sources
  FROM (
    SELECT k.source,
      COALESCE(l.leads, 0) AS leads,
      COALESCE(ve.contracts_won, 0) AS contracts_won,
      COALESCE(ve.revenue, 0) AS revenue,
      COALESCE(sp.spend, 0) AS spend,
      CASE WHEN COALESCE(sp.spend, 0) > 0 THEN ROUND(((COALESCE(ve.revenue, 0) - sp.spend) / sp.spend) * 100, 1) END AS roi_pct
    FROM (SELECT source FROM lead_fonte UNION SELECT source FROM vendite_fonte UNION SELECT source FROM spesa_fonte) k
    LEFT JOIN lead_fonte l ON l.source = k.source
    LEFT JOIN vendite_fonte ve ON ve.source = k.source
    LEFT JOIN spesa_fonte sp ON sp.source = k.source
  ) src;

  -- CALL CENTER
  SELECT COALESCE(jsonb_agg(row_to_json(cc_row) ORDER BY cc_row.calls_total DESC), '[]'::jsonb)
  INTO v_call_center
  FROM (
    SELECT cl.user_id, btrim(concat_ws(' ', p.first_name, p.last_name)) AS name,
      COUNT(*) AS calls_total,
      COUNT(*) FILTER (WHERE cl.outcome = 'answered') AS calls_answered,
      ROUND(AVG(cl.duration_sec)) AS avg_duration_sec,
      COALESCE(apt_cc.cnt, 0) AS appointments_set
    FROM call_logs cl
    JOIN profiles p ON p.id = cl.user_id
    LEFT JOIN (
      SELECT a5.assigned_to AS user_id, COUNT(*) AS cnt
      FROM appointments a5
      WHERE a5.company_id = p_company_id AND a5.appointment_date BETWEEN v_giorno_da AND v_giorno_a AND a5.calendar_id IS NOT NULL AND NOT COALESCE(a5.is_blocked_slot, false) AND COALESCE(a5.status, '') NOT IN ('annullato', 'riprogrammato')
      GROUP BY a5.assigned_to
    ) apt_cc ON apt_cc.user_id = cl.user_id
    WHERE cl.company_id = p_company_id AND cl.started_at >= v_date_from AND cl.started_at <= v_date_to
      AND (p_assigned_user_ids IS NULL OR cl.user_id = ANY(p_assigned_user_ids))
    GROUP BY cl.user_id, p.first_name, p.last_name, apt_cc.cnt
  ) cc_row;

  -- ALERTS
  SELECT jsonb_build_object(
    'stale_leads', (SELECT COUNT(*) FROM marketing_contacts mc WHERE mc.company_id = p_company_id AND mc.deleted_at IS NULL AND mc.created_at >= v_date_from AND mc.last_activity_at IS NULL AND mc.created_at < now() - interval '48 hours' AND (p_assigned_user_ids IS NULL OR mc.assigned_to = ANY(p_assigned_user_ids))),
    'stale_leads_2h', (SELECT COUNT(*) FROM marketing_contacts mc WHERE mc.company_id = p_company_id AND mc.deleted_at IS NULL AND mc.created_at >= v_date_from AND mc.last_activity_at IS NULL AND mc.created_at < now() - interval '2 hours' AND mc.created_at >= now() - interval '48 hours' AND (p_assigned_user_ids IS NULL OR mc.assigned_to = ANY(p_assigned_user_ids))),
    -- ferme con la regola di Sales OS (get_stalled_opportunities): nessuna
    -- attività, cambio fase o nota da più giorni della soglia della fase (14)
    'stale_opportunities', (
      SELECT COUNT(*) FROM marketing_opportunities mo
      JOIN marketing_pipeline_stages s ON s.id = mo.stage_id
      WHERE mo.company_id = p_company_id AND mo.deleted_at IS NULL AND mo.status = 'open'
        AND NOT (mo.pipeline_id IS NOT NULL AND mo.pipeline_id = ANY(v_nascoste))
        AND (p_assigned_user_ids IS NULL OR mo.assigned_to = ANY(p_assigned_user_ids))
        AND (p_pipeline_id IS NULL OR mo.pipeline_id = p_pipeline_id)
        AND floor(extract(epoch from (now() - GREATEST(
              (SELECT MAX(mca.created_at) FROM marketing_contact_activities mca WHERE mca.company_id = mo.company_id AND mca.contact_id = mo.contact_id),
              mo.last_activity_at, mo.stage_changed_at, mo.created_at))) / 86400) >= COALESCE(s.stalled_threshold_days, 14)),
    -- del periodo, come il KPI: prima erano tutti quelli di sempre
    'pending_appointments', v_appointments_pending,
    'show_rate_below_threshold', (v_show_rate < 60 AND v_appointments_done + v_appointments_no_show >= 5),
    'pipeline_declining', (v_pipeline_active_value < v_prev_pipeline_active_value * 0.8 AND v_prev_pipeline_active_value > 0)
  ) INTO v_alerts;

  -- TREND
  WITH vendite_giorno AS (
    SELECT (v.quando AT TIME ZONE 'Europe/Rome')::date AS day, COUNT(*) AS won
    FROM public.marketing_vendite_periodo(p_company_id, v_date_from, v_date_to, p_assigned_user_ids, p_sources, p_pipeline_id, v_nascoste) v
    GROUP BY 1
  )
  SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.day), '[]'::jsonb)
  INTO v_trend
  FROM (
    SELECT d.day::date AS day,
      (SELECT COUNT(*) FROM marketing_contacts mc WHERE mc.company_id = p_company_id AND mc.deleted_at IS NULL AND (mc.created_at AT TIME ZONE 'Europe/Rome')::date = d.day
        AND (p_assigned_user_ids IS NULL OR mc.assigned_to = ANY(p_assigned_user_ids))
        AND (p_sources IS NULL OR mc.source = ANY(p_sources))) AS leads,
      (SELECT COUNT(*) FROM appointments a WHERE a.company_id = p_company_id AND a.appointment_date = d.day
        AND a.calendar_id IS NOT NULL AND NOT COALESCE(a.is_blocked_slot, false) AND COALESCE(a.status, '') NOT IN ('annullato', 'riprogrammato')
        AND (p_assigned_user_ids IS NULL OR a.assigned_to = ANY(p_assigned_user_ids))) AS appointments,
      COALESCE(vg.won, 0) AS won
    FROM generate_series(v_giorno_da, v_giorno_a, '1 day'::interval) d(day)
    LEFT JOIN vendite_giorno vg ON vg.day = d.day::date
  ) t;

  result := jsonb_build_object(
    'kpi', jsonb_build_object(
      'leads_total', v_leads_total, 'leads_new', v_leads_new,
      'contacts_worked', v_contacts_worked,
      'appointments_set', v_appointments_set, 'appointments_done', v_appointments_done,
      'appointments_no_show', v_appointments_no_show, 'appointments_pending', v_appointments_pending,
      'show_rate', v_show_rate,
      'contracts_won', v_contracts_won, 'revenue', v_revenue,
      'quotes_signed', v_quotes_signed, 'revenue_quotes', v_revenue_quotes,
      'opps_won', v_opps_won,
      'contracts_lost', v_contracts_lost, 'revenue_lost', v_revenue_lost,
      'avg_ticket', v_avg_ticket,
      'close_rate', v_close_rate,
      'total_spend', v_total_spend,
      'cpl', CASE WHEN v_leads_new > 0 THEN ROUND(v_total_spend / v_leads_new, 2) ELSE 0 END,
      'cpa', CASE WHEN v_contracts_won > 0 THEN ROUND(v_total_spend / v_contracts_won, 2) ELSE 0 END,
      'calls_total', v_calls_total,
      'calls_answered', v_calls_answered,
      'contact_rate', CASE WHEN v_calls_total > 0 THEN ROUND((v_calls_answered::numeric / v_calls_total) * 100, 1) ELSE 0 END,
      'pipeline_active_value', v_pipeline_active_value,
      'open_opps_count', v_open_opps_count,
      'avg_time_to_first_contact', v_avg_time_to_first_contact,
      'avg_time_to_close', v_avg_time_to_close,
      'avg_lead_to_won_days', v_avg_lead_to_won_days,
      'median_lead_to_won_days', v_median_lead_to_won_days,
      'sales_velocity', v_sales_velocity,
      'rpl', v_rpl,
      'weighted_pipeline', ROUND(v_weighted_pipeline, 2),
      'lead_to_appointment_rate', CASE WHEN v_leads_new > 0 THEN ROUND((v_appointments_set::numeric / v_leads_new) * 100, 1) ELSE 0 END,
      'appointment_to_contract_rate', CASE WHEN v_appointments_done > 0 THEN ROUND((v_contracts_won::numeric / v_appointments_done) * 100, 1) ELSE 0 END,
      'lead_to_contract_rate', CASE WHEN v_leads_new > 0 THEN ROUND((v_contracts_won::numeric / v_leads_new) * 100, 1) ELSE 0 END,
      'forecast_30d', v_forecast_30d,
      'forecast_min', ROUND(v_forecast_30d * 0.8, 2),
      'forecast_max', ROUND(v_forecast_30d * 1.2, 2)
    ),
    -- i campi che non hanno un valore del periodo precedente (pipeline pesata,
    -- forecast, mediana, primo contatto) sono null: la pagina non mostra il
    -- confronto invece di un «+100%» contro zero
    'kpi_prev', jsonb_build_object(
      'leads_total', v_prev_leads_total, 'leads_new', v_prev_leads_new,
      'contacts_worked', v_prev_contacts_worked,
      'appointments_set', v_prev_appointments_set, 'appointments_done', v_prev_appointments_done,
      'appointments_no_show', v_prev_appointments_no_show, 'appointments_pending', null,
      'show_rate', CASE WHEN v_prev_appointments_done + v_prev_appointments_no_show > 0 THEN ROUND((v_prev_appointments_done::numeric / (v_prev_appointments_done + v_prev_appointments_no_show)) * 100, 1) ELSE 0 END,
      'contracts_won', v_prev_contracts_won, 'revenue', v_prev_revenue,
      'quotes_signed', v_prev_quotes_signed, 'revenue_quotes', v_prev_revenue_quotes,
      'opps_won', v_prev_opps_won,
      'contracts_lost', v_prev_contracts_lost, 'revenue_lost', v_prev_revenue_lost,
      'avg_ticket', v_prev_avg_ticket,
      'close_rate', v_prev_close_rate,
      'total_spend', v_prev_total_spend,
      'cpl', CASE WHEN v_prev_leads_new > 0 THEN ROUND(v_prev_total_spend / v_prev_leads_new, 2) ELSE 0 END,
      'cpa', CASE WHEN v_prev_contracts_won > 0 THEN ROUND(v_prev_total_spend / v_prev_contracts_won, 2) ELSE 0 END,
      'calls_total', v_prev_calls_total,
      'calls_answered', v_prev_calls_answered,
      'contact_rate', CASE WHEN v_prev_calls_total > 0 THEN ROUND((v_prev_calls_answered::numeric / v_prev_calls_total) * 100, 1) ELSE 0 END,
      'pipeline_active_value', v_prev_pipeline_active_value,
      'open_opps_count', null,
      'avg_time_to_first_contact', null,
      'avg_time_to_close', null,
      'avg_lead_to_won_days', v_prev_avg_lead_to_won_days,
      'median_lead_to_won_days', null,
      'sales_velocity', v_prev_sales_velocity,
      'rpl', v_prev_rpl,
      'weighted_pipeline', null,
      'lead_to_appointment_rate', CASE WHEN v_prev_leads_new > 0 THEN ROUND((v_prev_appointments_set::numeric / v_prev_leads_new) * 100, 1) ELSE 0 END,
      'appointment_to_contract_rate', CASE WHEN v_prev_appointments_done > 0 THEN ROUND((v_prev_contracts_won::numeric / v_prev_appointments_done) * 100, 1) ELSE 0 END,
      'lead_to_contract_rate', CASE WHEN v_prev_leads_new > 0 THEN ROUND((v_prev_contracts_won::numeric / v_prev_leads_new) * 100, 1) ELSE 0 END,
      'forecast_30d', null, 'forecast_min', null, 'forecast_max', null
    ),
    'funnel', v_funnel,
    'sales_performance', v_sales,
    'sources', v_sources,
    'call_center', v_call_center,
    'alerts', v_alerts,
    'trend', v_trend
  );

  RETURN result;
END;
$function$;

revoke all on function public.get_marketing_dashboard_stats(uuid, timestamptz, timestamptz, uuid[], text[], uuid) from public, anon;
grant execute on function public.get_marketing_dashboard_stats(uuid, timestamptz, timestamptz, uuid[], text[], uuid) to authenticated, service_role;

-- Il grafico dei 12 mesi: stesse regole e stessi filtri della pagina. Prima
-- contava i contratti per updated_at (l'ultima modifica), i lead cancellati e
-- gli appuntamenti annullati, e ignorava persona, fonte e pipeline.
drop function if exists public.marketing_trend_12m(uuid);

create or replace function public.marketing_trend_12m(
  p_company_id uuid,
  p_assigned_user_ids uuid[] default null,
  p_sources text[] default null,
  p_pipeline_id uuid default null
)
returns table(mese_key text, lead integer, appuntamenti integer, contratti integer)
language plpgsql
stable security definer
set search_path to 'public'
as $function$
declare
  v_da_locale timestamp := date_trunc('month', (now() at time zone 'Europe/Rome')) - interval '11 months';
  v_da timestamptz := v_da_locale at time zone 'Europe/Rome';
  v_nascoste uuid[];
begin
  perform public.assert_company_access(p_company_id);
  if not public.puo_vedere_metrica(p_company_id, 'marketing') then
    raise exception 'Non hai il permesso di vedere la dashboard marketing' using errcode = '42501';
  end if;
  if public.solo_assegnati_attivo() then
    p_assigned_user_ids := array[auth.uid()];
  end if;
  v_nascoste := coalesce(public.pipeline_nascoste(), '{}'::uuid[]);

  return query
  with mesi as (
    select to_char(v_da_locale + make_interval(months => gs), 'YYYY-MM') as k
      from generate_series(0, 11) gs
  ), l as (
    select to_char(mc.created_at at time zone 'Europe/Rome', 'YYYY-MM') as k, count(*) as v
      from marketing_contacts mc
     where mc.company_id = p_company_id and mc.deleted_at is null and mc.created_at >= v_da
       and (p_assigned_user_ids is null or mc.assigned_to = any (p_assigned_user_ids))
       and (p_sources is null or mc.source = any (p_sources))
     group by 1
  ), a as (
    select to_char(ap.appointment_date, 'YYYY-MM') as k, count(*) as v
      from appointments ap
     where ap.company_id = p_company_id and ap.appointment_date >= v_da_locale::date
       and ap.calendar_id is not null and not coalesce(ap.is_blocked_slot, false)
       and coalesce(ap.status, '') not in ('annullato', 'riprogrammato')
       and (p_assigned_user_ids is null or ap.assigned_to = any (p_assigned_user_ids))
     group by 1
  ), w as (
    select to_char(v.quando at time zone 'Europe/Rome', 'YYYY-MM') as k, count(*) as v
      from public.marketing_vendite_periodo(p_company_id, v_da, now(), p_assigned_user_ids, p_sources, p_pipeline_id, v_nascoste) v
     group by 1
  )
  select m.k, coalesce(l.v, 0)::integer, coalesce(a.v, 0)::integer, coalesce(w.v, 0)::integer
    from mesi m
    left join l on l.k = m.k
    left join a on a.k = m.k
    left join w on w.k = m.k
   order by m.k;
end;
$function$;

revoke all on function public.marketing_trend_12m(uuid, uuid[], text[], uuid) from public, anon;
grant execute on function public.marketing_trend_12m(uuid, uuid[], text[], uuid) to authenticated, service_role;
