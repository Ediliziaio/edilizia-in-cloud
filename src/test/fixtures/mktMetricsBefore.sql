CREATE OR REPLACE FUNCTION public.mkt_calcola_metriche(p_giorno date DEFAULT ((now() AT TIME ZONE 'Europe/Rome'::text))::date)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_n integer;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'non autorizzato';
  END IF;

  WITH par AS (
    SELECT p_giorno AS g,
           (p_giorno::timestamp AT TIME ZONE 'Europe/Rome') AS t0,
           ((p_giorno - 1)::timestamp AT TIME ZONE 'Europe/Rome') AS t1,
           ((p_giorno - 7)::timestamp AT TIME ZONE 'Europe/Rome') AS t7,
           ((p_giorno - 14)::timestamp AT TIME ZONE 'Europe/Rome') AS t14,
           ((p_giorno - 30)::timestamp AT TIME ZONE 'Europe/Rome') AS t30,
           ((p_giorno - 90)::timestamp AT TIME ZONE 'Europe/Rome') AS t90,
           (date_trunc('month', p_giorno)::date::timestamp AT TIME ZONE 'Europe/Rome') AS tm0,
           date_trunc('month', p_giorno)::date AS m0,
           extract(day FROM (date_trunc('month', p_giorno) + interval '1 month - 1 day'))::int AS giorni_mese,
           greatest(1, extract(day FROM p_giorno)::int - 1) AS giorni_trascorsi
  ),
  cli AS (
    SELECT sc.id, sc.company_id, sc.stato, sc.data_inizio, coalesce(sc.mkt_settore, 'altro') AS settore,
           sc.mkt_budget_mensile AS budget, sc.mkt_orario_servizio AS orario,
           (SELECT g FROM par) - coalesce(sc.data_inizio, (SELECT g FROM par)) AS giorni_dall_inizio
      FROM public.aedix_service_clients sc
      JOIN public.aedix_product_lines l ON l.id = sc.product_line_id
     WHERE sc.company_id IS NOT NULL AND l.categoria IN ('agenzia','performance') AND sc.stato IN ('attivo','pausa')
  ),
  base AS (
    SELECT cli.*, par.*, sg.cpl_target_effettivo, sg.cpl_giallo_effettivo, sg.cpl_rosso_effettivo, sg.fattore_stagionale,
           sg.moltiplicatore_zero_giallo AS mzg, sg.moltiplicatore_zero_rosso AS mzr,
           bm.appuntamento_min, bm.appuntamento_max,
           sp.*, aw.*, ld.*, ul.ultimo_lead, op.*, ap.*, pr.*, ac.*, te.*, ve.*
      FROM cli CROSS JOIN par
      LEFT JOIN LATERAL public.mkt_soglia_di(cli.id, par.g) sg ON true
      LEFT JOIN public.mkt_settori_benchmark bm ON bm.settore = cli.settore
      CROSS JOIN LATERAL (
        SELECT coalesce(sum(s.spesa) FILTER (WHERE s.giorno = par.g - 1), 0) AS spesa_ieri,
               coalesce(sum(s.spesa) FILTER (WHERE s.giorno >= par.g - 7 AND s.giorno < par.g), 0) AS spesa_7g,
               coalesce(sum(s.spesa) FILTER (WHERE s.giorno >= par.g - 14 AND s.giorno < par.g), 0) AS spesa_14g,
               coalesce(sum(s.spesa) FILTER (WHERE s.giorno >= par.m0 AND s.giorno < par.g), 0) AS spesa_mese,
               coalesce(sum(s.lead_dichiarati) FILTER (WHERE s.giorno >= par.g - 7 AND s.giorno < par.g), 0) AS lead_dichiarati_7g,
               max(s.sincronizzato_il) AS ultimo_sync,
               coalesce(bool_or(s.sincronizzato_il IS NOT NULL), false) AS spesa_disponibile
          FROM (
            SELECT m.giorno, m.spesa, m.lead_dichiarati, m.sincronizzato_il
              FROM public.mkt_spesa_giornaliera m WHERE m.company_id = cli.company_id AND m.giorno >= par.g - 31
            UNION ALL
            SELECT k.date, coalesce(k.spend_amount, 0), 0, NULL::timestamptz
              FROM public.campaign_costs k WHERE k.company_id = cli.company_id AND k.date >= par.g - 31
          ) s
      ) sp
      -- Spesa andata a campagne di awareness, interazione o traffico senza lead:
      -- esce dal CPL (regola in mkt_campagne_classificate).
      CROSS JOIN LATERAL (
        SELECT public.mkt_spesa_awareness(cli.company_id, par.g - 1, par.g) AS spesa_aw_ieri,
               public.mkt_spesa_awareness(cli.company_id, par.g - 7, par.g) AS spesa_aw_7g,
               public.mkt_spesa_awareness(cli.company_id, par.g - 14, par.g) AS spesa_aw_14g,
               public.mkt_spesa_awareness(cli.company_id, par.m0, par.g) AS spesa_aw_mese
      ) aw
      CROSS JOIN LATERAL (
        SELECT count(*) FILTER (WHERE l.t >= par.t1 AND l.t < par.t0) AS lead_grezzi_ieri,
               count(*) FILTER (WHERE l.t >= par.t7 AND l.t < par.t0) AS lead_grezzi_7g,
               count(*) FILTER (WHERE l.valido AND l.t >= par.t7 AND l.t < par.t0) AS lead_validi_7g,
               count(*) FILTER (WHERE l.valido AND l.t >= par.t14 AND l.t < par.t0) AS lead_validi_14g,
               count(*) FILTER (WHERE l.valido AND l.t >= par.t30 AND l.t < par.t0) AS lead_validi_30g
          FROM (
            SELECT mc.created_at AS t,
                   (nullif(regexp_replace(coalesce(mc.phone, ''), '\D', '', 'g'), '') IS NOT NULL
                    AND NOT EXISTS (
                      SELECT 1 FROM public.marketing_contacts d
                       WHERE d.company_id = mc.company_id AND d.id <> mc.id
                         AND d.created_at < mc.created_at AND d.created_at >= mc.created_at - interval '30 days'
                         AND regexp_replace(coalesce(d.phone, ''), '\D', '', 'g') = regexp_replace(mc.phone, '\D', '', 'g'))) AS valido
              FROM public.marketing_contacts mc
             WHERE mc.company_id = cli.company_id AND mc.created_at >= par.t30 AND mc.created_at < par.t0
               AND coalesce(mc.source, '') NOT ILIKE 'fatturazione%'
               AND coalesce(mc.source_channel, '') NOT IN ('cold_import', 'cliente_servizio')
          ) l
      ) ld
      CROSS JOIN LATERAL (
        SELECT max(mc.created_at) AS ultimo_lead
          FROM public.marketing_contacts mc
         WHERE mc.company_id = cli.company_id
           AND coalesce(mc.source, '') NOT ILIKE 'fatturazione%'
           AND coalesce(mc.source_channel, '') NOT IN ('cold_import', 'cliente_servizio')
      ) ul
      CROSS JOIN LATERAL (
        SELECT round(percentile_cont(0.5) WITHIN GROUP (ORDER BY x.min_pc) FILTER (WHERE x.created >= par.t7 AND x.min_pc IS NOT NULL))::int AS mediana_min_7g,
               count(*) FILTER (WHERE x.created >= par.t14) AS opp_14g,
               count(*) FILTER (WHERE x.created >= par.t14 AND x.prima IS NOT NULL) AS lavorate_14g,
               count(*) FILTER (WHERE x.created >= par.t14 AND x.created < par.t7) AS opp_da_esito,
               count(*) FILTER (WHERE x.created >= par.t14 AND x.created < par.t7 AND x.con_esito) AS opp_con_esito,
               count(*) FILTER (WHERE x.status = 'open' AND x.prima IS NULL AND x.min_att > 1440) AS lead_fermi,
               coalesce(max(x.min_att) FILTER (WHERE x.status = 'open' AND x.prima IS NULL), 0) AS fermo_max_min,
               avg(x.tentativi) FILTER (WHERE x.created >= par.t14 AND NOT x.con_app) AS tentativi_medi,
               count(*) FILTER (WHERE x.created >= par.tm0 AND x.status = 'open' AND x.prima IS NULL AND x.con_esito = false) AS senza_esito_mese,
               count(*) FILTER (WHERE x.created >= par.tm0) AS opp_mese
          FROM (
            SELECT o.created_at AS created, o.status,
                   p.prima,
                   CASE WHEN p.prima IS NOT NULL THEN public.mkt_minuti_lavorativi(o.created_at, p.prima, cli.orario) END AS min_pc,
                   public.mkt_minuti_lavorativi(o.created_at, now(), cli.orario) AS min_att,
                   (o.status <> 'open' OR p.fasi > 1) AS con_esito,
                   coalesce(p.note, 0) AS tentativi,
                   coalesce(p.app, false) AS con_app
              FROM public.marketing_opportunities o
              CROSS JOIN LATERAL (
                SELECT least(
                         (SELECT min(h.entered_at) FROM public.marketing_opportunity_stage_history h WHERE h.opportunity_id = o.id AND h.entered_at > o.created_at + interval '2 minutes'),
                         (SELECT min(a.created_at) FROM public.marketing_contact_activities a
                           WHERE a.contact_id = o.contact_id AND a.company_id = o.company_id AND a.created_at > o.created_at + interval '2 minutes'
                             AND a.activity_type NOT IN ('contact_created','opportunity_created','contact_assigned','opportunity_assigned','updated','opportunity_auto_created'))
                       ) AS prima,
                       (SELECT count(*) FROM public.marketing_opportunity_stage_history h WHERE h.opportunity_id = o.id) AS fasi,
                       (SELECT count(*) FROM public.marketing_contact_activities a WHERE a.contact_id = o.contact_id AND a.company_id = o.company_id AND a.activity_type IN ('note_added','status_changed','quote_sent')) AS note,
                       EXISTS (SELECT 1 FROM public.appointments ap WHERE ap.opportunity_id = o.id AND coalesce(ap.status,'') NOT IN ('annullato','cancelled','cancellato')) AS app
              ) p
             WHERE o.company_id = cli.company_id AND o.deleted_at IS NULL AND o.created_at >= par.t30
          ) x
      ) op
      CROSS JOIN LATERAL (
        SELECT (SELECT count(DISTINCT y.opportunity_id) FROM (
                  SELECT h.opportunity_id FROM public.marketing_opportunity_stage_history h
                    JOIN public.marketing_pipeline_stages s ON s.id = h.stage_id
                   WHERE h.company_id = cli.company_id AND h.entered_at >= par.t14 AND h.entered_at < par.t0
                     AND (s.name ILIKE '%appuntament%' OR s.name ILIKE '%incontro%' OR s.name ILIKE '%sopralluogo%')
                     AND s.name NOT ILIKE '%da fissare%' AND s.name NOT ILIKE '%rifissare%' AND s.name NOT ILIKE '%chiamata%'
                  UNION ALL
                  SELECT coalesce(a.opportunity_id, a.id) FROM public.appointments a
                   WHERE a.company_id = cli.company_id AND a.created_at >= par.t14 AND a.created_at < par.t0
                     AND coalesce(a.status, '') NOT IN ('annullato','cancelled','cancellato') AND NOT coalesce(a.is_blocked_slot, false)
                ) y) AS appuntamenti_14g,
               (SELECT count(DISTINCT y.opportunity_id) FROM (
                  SELECT h.opportunity_id FROM public.marketing_opportunity_stage_history h
                    JOIN public.marketing_pipeline_stages s ON s.id = h.stage_id
                   WHERE h.company_id = cli.company_id AND h.entered_at >= par.t30 AND h.entered_at < par.t0
                     AND (s.name ILIKE '%appuntament%' OR s.name ILIKE '%incontro%' OR s.name ILIKE '%sopralluogo%')
                     AND s.name NOT ILIKE '%da fissare%' AND s.name NOT ILIKE '%rifissare%' AND s.name NOT ILIKE '%chiamata%'
                  UNION ALL
                  SELECT coalesce(a.opportunity_id, a.id) FROM public.appointments a
                   WHERE a.company_id = cli.company_id AND a.created_at >= par.t30 AND a.created_at < par.t0
                     AND coalesce(a.status, '') NOT IN ('annullato','cancelled','cancellato') AND NOT coalesce(a.is_blocked_slot, false)
                ) y) AS appuntamenti_30g,
               (SELECT count(*) FROM public.appointments a
                 WHERE a.company_id = cli.company_id AND a.appointment_date >= par.g - 30 AND a.appointment_date < par.g
                   AND coalesce(a.status, '') NOT IN ('annullato','cancelled','cancellato') AND NOT coalesce(a.is_blocked_slot, false)) AS app_30g,
               (SELECT count(*) FROM public.appointments a
                 WHERE a.company_id = cli.company_id AND a.appointment_date >= par.g - 30 AND a.appointment_date < par.g
                   AND (a.is_completed OR coalesce(a.status, '') IN ('completato','da_preventivare','preventivo_inviato'))) AS app_fatti_30g
      ) ap
      CROSS JOIN LATERAL (
        SELECT (SELECT count(*) FROM public.appointments a
                 WHERE a.company_id = cli.company_id AND a.appointment_date >= par.g - 21 AND a.appointment_date < par.g - 7
                   AND (a.is_completed OR coalesce(a.status, '') IN ('completato','da_preventivare','preventivo_inviato'))) AS app_per_preventivo,
               (SELECT count(*) FROM public.appointments a
                 WHERE a.company_id = cli.company_id AND a.appointment_date >= par.g - 21 AND a.appointment_date < par.g - 7
                   AND (a.is_completed OR coalesce(a.status, '') IN ('completato','da_preventivare','preventivo_inviato'))
                   AND EXISTS (SELECT 1 FROM public.quotes q WHERE q.company_id = a.company_id
                                 AND (q.opportunity_id = a.opportunity_id OR (a.contact_id IS NOT NULL AND q.contact_id = a.contact_id))
                                 AND q.created_at >= a.appointment_date::timestamp AND q.created_at < a.appointment_date::timestamp + interval '7 days')) AS app_con_preventivo,
               (SELECT count(*) FROM public.quotes q WHERE q.company_id = cli.company_id AND q.status = 'inviata' AND coalesce(q.sent_at, q.created_at) < now() - interval '10 days') AS preventivi_sospesi
      ) pr
      CROSS JOIN LATERAL (
        SELECT (SELECT count(DISTINCT (coalesce(us.last_active_at, us.started_at) AT TIME ZONE 'Europe/Rome')::date)
                  FROM public.user_sessions us WHERE us.company_id = cli.company_id AND coalesce(us.last_active_at, us.started_at) >= par.t14) AS giorni_accesso_14g,
               (SELECT (par.g - (max(u.last_sign_in_at) AT TIME ZONE 'Europe/Rome')::date)
                  FROM public.profiles p JOIN auth.users u ON u.id = p.id WHERE p.company_id = cli.company_id) AS giorni_dall_ultimo_accesso
      ) ac
      CROSS JOIN LATERAL (
        SELECT (SELECT i.status FROM public.integrations i WHERE i.company_id = cli.company_id AND i.provider = 'meta'
                 ORDER BY (i.status = 'connected') DESC, i.updated_at DESC LIMIT 1) AS meta_stato,
               EXISTS (SELECT 1 FROM public.meta_assets a WHERE a.company_id = cli.company_id AND a.asset_type = 'ad_account' AND a.selected) AS meta_account
      ) te
      CROSS JOIN LATERAL (
        SELECT count(*) FILTER (WHERE coalesce(o.won_at, o.updated_at) >= par.tm0) AS vendite_mese,
               coalesce(sum(o.value) FILTER (WHERE coalesce(o.won_at, o.updated_at) >= par.tm0), 0) AS venduto_mese,
               count(*) FILTER (WHERE coalesce(o.won_at, o.updated_at) >= par.t30) AS vendite_30g,
               coalesce(sum(o.value) FILTER (WHERE coalesce(o.won_at, o.updated_at) >= par.tm0 - interval '3 months' AND coalesce(o.won_at, o.updated_at) < par.tm0), 0) / 3 AS venduto_medio_3m
          FROM public.marketing_opportunities o
         WHERE o.company_id = cli.company_id AND o.deleted_at IS NULL AND o.status = 'won'
           AND coalesce(o.won_at, o.updated_at) >= par.tm0 - interval '3 months'
      ) ve
  ),
  calc AS (
    SELECT b.*,
           CASE WHEN b.lead_grezzi_7g > 0 AND b.spesa_7g - b.spesa_aw_7g > 0 THEN round((b.spesa_7g - b.spesa_aw_7g) / b.lead_grezzi_7g, 2) END AS cpl_grezzo_7g,
           CASE WHEN b.lead_validi_7g > 0 AND b.spesa_7g - b.spesa_aw_7g > 0 THEN round((b.spesa_7g - b.spesa_aw_7g) / b.lead_validi_7g, 2) END AS cpl_valido_7g,
           CASE WHEN b.lead_grezzi_7g > 0 THEN round(b.lead_validi_7g::numeric / b.lead_grezzi_7g, 4) END AS tasso_validita_7g,
           CASE WHEN b.lead_validi_14g > 0 THEN round(b.appuntamenti_14g::numeric / b.lead_validi_14g, 4) END AS tasso_appuntamento_14g,
           CASE WHEN b.appuntamenti_14g > 0 AND b.spesa_14g - b.spesa_aw_14g > 0 THEN round((b.spesa_14g - b.spesa_aw_14g) / b.appuntamenti_14g, 2) END AS costo_appuntamento_14g,
           CASE WHEN b.app_30g > 0 THEN round(b.app_fatti_30g::numeric / b.app_30g, 4) END AS tasso_presenza_30g,
           CASE WHEN b.lead_dichiarati_7g > 0 THEN round(b.lead_grezzi_7g::numeric / b.lead_dichiarati_7g, 4) END AS scarto_attribuzione_7g,
           CASE WHEN b.budget > 0 THEN round(b.budget / b.giorni_mese, 2) END AS budget_giornaliero,
           CASE WHEN b.budget > 0 AND b.giorni_trascorsi > 0 THEN least(999, round(b.spesa_mese / b.budget * b.giorni_mese / b.giorni_trascorsi, 3)) END AS copertura_budget,
           greatest(0, (SELECT coalesce(sum(s.spesa), 0) FROM (
              SELECT m.giorno, m.spesa FROM public.mkt_spesa_giornaliera m WHERE m.company_id = b.company_id AND m.giorno >= b.g - 30
              UNION ALL SELECT k.date, coalesce(k.spend_amount, 0) FROM public.campaign_costs k WHERE k.company_id = b.company_id AND k.date >= b.g - 30
            ) s WHERE s.giorno > coalesce((b.ultimo_lead AT TIME ZONE 'Europe/Rome')::date, b.g - 31))
              - public.mkt_spesa_awareness(b.company_id, coalesce((b.ultimo_lead AT TIME ZONE 'Europe/Rome')::date, b.g - 31) + 1, b.g + 1)) AS spesa_senza_lead,
           (b.ultimo_sync IS NULL OR b.ultimo_sync >= now() - interval '8 hours') AS dati_freschi
      FROM base b
  ),
  calc2 AS (
    SELECT c.*,
           CASE WHEN c.cpl_target_effettivo > 0 THEN round(c.spesa_senza_lead / c.cpl_target_effettivo, 2) END AS rapporto_zero,
           (c.budget_giornaliero > 0 AND c.spesa_ieri < 0.5 * c.budget_giornaliero) AS sotto_consegna,
           (SELECT jsonb_strip_nulls(jsonb_build_object(
              'velocita', CASE WHEN c.mediana_min_7g IS NOT NULL THEN round(greatest(0, least(1, (480 - c.mediana_min_7g) / 450.0)), 2) END,
              'lavorati', CASE WHEN c.opp_14g > 0 THEN round(greatest(0, least(1, (c.lavorate_14g::numeric / c.opp_14g - 0.6) / 0.4)), 2) END,
              'esito',    CASE WHEN c.opp_da_esito > 0 THEN round(greatest(0, least(1, (c.opp_con_esito::numeric / c.opp_da_esito - 0.5) / 0.45)), 2) END,
              'tentativi', CASE WHEN c.tentativi_medi IS NOT NULL THEN round(greatest(0, least(1, (c.tentativi_medi - 1) / 4.0)), 2) END,
              'preventivi', CASE WHEN c.app_per_preventivo > 0 THEN round(greatest(0, least(1, (c.app_con_preventivo::numeric / c.app_per_preventivo - 0.4) / 0.45)), 2) END,
              'accessi',  CASE WHEN c.giorni_accesso_14g IS NOT NULL THEN round(greatest(0, least(1, (c.giorni_accesso_14g - 3) / 7.0)), 2) END))) AS componenti
      FROM calc c
  ),
  calc3 AS (
    SELECT c.*,
           (SELECT CASE WHEN sum(w.peso) > 0 THEN round(sum(w.peso * (c.componenti->>w.k)::numeric) / sum(w.peso) * 100)::int END
              FROM (VALUES ('velocita', 30), ('lavorati', 20), ('esito', 15), ('tentativi', 10), ('preventivi', 15), ('accessi', 10)) AS w(k, peso)
             WHERE c.componenti ? w.k) AS indice,
           CASE WHEN c.stato = 'pausa' THEN 'N'
                WHEN c.lead_fermi >= 5 OR c.fermo_max_min > 2880 OR c.mediana_min_7g > 240 THEN 'R'
                WHEN c.lead_fermi BETWEEN 1 AND 4 OR c.mediana_min_7g > 30 THEN 'G'
                WHEN c.mediana_min_7g IS NULL AND c.lead_fermi = 0 AND c.opp_14g = 0 THEN 'N'
                ELSE 'V' END AS s_velocita,
           CASE WHEN c.stato = 'pausa' OR NOT c.dati_freschi OR NOT c.spesa_disponibile OR c.rapporto_zero IS NULL THEN 'N'
                WHEN c.sotto_consegna THEN 'G'
                WHEN c.rapporto_zero >= c.mzr THEN 'R'
                WHEN c.rapporto_zero >= c.mzg THEN 'G'
                ELSE 'V' END AS s_flusso,
           CASE WHEN c.stato = 'pausa' OR c.giorni_dall_inizio < 31 OR NOT c.dati_freschi OR c.cpl_valido_7g IS NULL OR c.lead_validi_7g < 10 THEN 'N'
                WHEN c.cpl_valido_7g > c.cpl_rosso_effettivo THEN 'R'
                WHEN c.cpl_valido_7g > c.cpl_target_effettivo THEN 'G'
                ELSE 'V' END AS s_costo,
           CASE WHEN c.stato = 'pausa' OR c.giorni_dall_inizio < 31 OR c.tasso_appuntamento_14g IS NULL OR c.lead_validi_14g < 20 THEN 'N'
                WHEN c.tasso_appuntamento_14g < c.appuntamento_min * 0.5 THEN 'R'
                WHEN c.tasso_appuntamento_14g < c.appuntamento_min THEN 'G'
                ELSE 'V' END AS s_qualita,
           CASE WHEN c.meta_stato = 'token_expired' OR (c.meta_stato IS NOT NULL AND c.meta_stato <> 'connected') THEN 'R'
                WHEN c.scarto_attribuzione_7g IS NOT NULL AND c.scarto_attribuzione_7g < 0.8 THEN 'R'
                WHEN c.budget > 0 AND c.spesa_ieri = 0 AND c.spesa_7g > 0 AND c.stato = 'attivo' THEN 'R'
                WHEN c.scarto_attribuzione_7g IS NOT NULL AND c.scarto_attribuzione_7g < 0.9 THEN 'G'
                WHEN c.meta_stato IS NULL OR NOT c.meta_account THEN 'G'
                ELSE 'V' END AS s_tecnico
      FROM calc2 c
  ),
  calc4 AS (
    SELECT c.*,
           CASE WHEN c.stato = 'pausa' OR c.indice IS NULL THEN 'N' WHEN c.indice >= 75 THEN 'V' WHEN c.indice >= 50 THEN 'G' ELSE 'R' END AS s_esecuzione
      FROM calc3 c
  )
  INSERT INTO public.mkt_metriche_giorno AS m (
    service_client_id, giorno, stato_cliente, giorni_dall_inizio,
    spesa_giorno, spesa_7g, spesa_14g, spesa_mese, budget_giornaliero, spesa_aw_giorno, spesa_aw_7g, spesa_aw_mese, sopralluoghi_30g,
    lead_grezzi_giorno, lead_grezzi_7g, lead_validi_7g, lead_validi_14g, lead_validi_30g, lead_dichiarati_7g,
    cpl_grezzo_7g, cpl_valido_7g, cpl_target, cpl_giallo, cpl_rosso, fattore_stagionale,
    appuntamenti_14g, costo_appuntamento_14g, tasso_validita_7g, tasso_appuntamento_14g, tasso_presenza_30g, scarto_attribuzione_7g,
    mediana_primo_contatto_min_7g, lead_fermi, lead_fermo_piu_vecchio_ore,
    spesa_senza_lead, rapporto_zero, sotto_consegna, copertura_budget,
    vendite_mese, venduto_mese, venduto_medio_3m, vendite_30g, preventivi_sospesi, opp_mese, opp_senza_esito_mese,
    giorni_accesso_14g, giorni_dall_ultimo_accesso, meta_stato, meta_account,
    indice_esecuzione, indice_componenti, semaforo, semaforo_componenti,
    dati_freschi, ultimo_sync, spesa_disponibile, calcolato_il)
  SELECT c.id, c.g, c.stato, c.giorni_dall_inizio,
         c.spesa_ieri, c.spesa_7g, c.spesa_14g, c.spesa_mese, c.budget_giornaliero, c.spesa_aw_ieri, c.spesa_aw_7g, c.spesa_aw_mese, c.appuntamenti_30g,
         c.lead_grezzi_ieri, c.lead_grezzi_7g, c.lead_validi_7g, c.lead_validi_14g, c.lead_validi_30g, c.lead_dichiarati_7g,
         c.cpl_grezzo_7g, c.cpl_valido_7g, c.cpl_target_effettivo, c.cpl_giallo_effettivo, c.cpl_rosso_effettivo, c.fattore_stagionale,
         c.appuntamenti_14g, c.costo_appuntamento_14g, c.tasso_validita_7g, c.tasso_appuntamento_14g, c.tasso_presenza_30g, c.scarto_attribuzione_7g,
         c.mediana_min_7g, c.lead_fermi, round(c.fermo_max_min / 60.0)::int,
         c.spesa_senza_lead, c.rapporto_zero, c.sotto_consegna, c.copertura_budget,
         c.vendite_mese, c.venduto_mese, c.venduto_medio_3m, c.vendite_30g, c.preventivi_sospesi, c.opp_mese, c.senza_esito_mese,
         c.giorni_accesso_14g, c.giorni_dall_ultimo_accesso, c.meta_stato, c.meta_account,
         c.indice, c.componenti,
         CASE WHEN c.stato = 'pausa' THEN 'N'
              WHEN 'R' IN (c.s_velocita, c.s_flusso, c.s_costo, c.s_qualita, c.s_tecnico, c.s_esecuzione) THEN 'R'
              WHEN 'G' IN (c.s_velocita, c.s_flusso, c.s_costo, c.s_qualita, c.s_tecnico, c.s_esecuzione) THEN 'G'
              WHEN 'V' IN (c.s_velocita, c.s_flusso, c.s_costo, c.s_qualita, c.s_tecnico, c.s_esecuzione) THEN 'V'
              ELSE 'N' END,
         jsonb_build_object('velocita', c.s_velocita, 'flusso', c.s_flusso, 'costo', c.s_costo, 'qualita', c.s_qualita, 'tecnico', c.s_tecnico, 'esecuzione', c.s_esecuzione),
         c.dati_freschi, c.ultimo_sync, c.spesa_disponibile, now()
    FROM calc4 c
  ON CONFLICT (service_client_id, giorno) DO UPDATE SET
    stato_cliente = EXCLUDED.stato_cliente, giorni_dall_inizio = EXCLUDED.giorni_dall_inizio,
    spesa_aw_giorno = EXCLUDED.spesa_aw_giorno, spesa_aw_7g = EXCLUDED.spesa_aw_7g, spesa_aw_mese = EXCLUDED.spesa_aw_mese, sopralluoghi_30g = EXCLUDED.sopralluoghi_30g, spesa_giorno = EXCLUDED.spesa_giorno, spesa_7g = EXCLUDED.spesa_7g, spesa_14g = EXCLUDED.spesa_14g, spesa_mese = EXCLUDED.spesa_mese, budget_giornaliero = EXCLUDED.budget_giornaliero,
    lead_grezzi_giorno = EXCLUDED.lead_grezzi_giorno, lead_grezzi_7g = EXCLUDED.lead_grezzi_7g, lead_validi_7g = EXCLUDED.lead_validi_7g, lead_validi_14g = EXCLUDED.lead_validi_14g, lead_validi_30g = EXCLUDED.lead_validi_30g, lead_dichiarati_7g = EXCLUDED.lead_dichiarati_7g,
    cpl_grezzo_7g = EXCLUDED.cpl_grezzo_7g, cpl_valido_7g = EXCLUDED.cpl_valido_7g, cpl_target = EXCLUDED.cpl_target, cpl_giallo = EXCLUDED.cpl_giallo, cpl_rosso = EXCLUDED.cpl_rosso, fattore_stagionale = EXCLUDED.fattore_stagionale,
    appuntamenti_14g = EXCLUDED.appuntamenti_14g, costo_appuntamento_14g = EXCLUDED.costo_appuntamento_14g, tasso_validita_7g = EXCLUDED.tasso_validita_7g, tasso_appuntamento_14g = EXCLUDED.tasso_appuntamento_14g, tasso_presenza_30g = EXCLUDED.tasso_presenza_30g, scarto_attribuzione_7g = EXCLUDED.scarto_attribuzione_7g,
    mediana_primo_contatto_min_7g = EXCLUDED.mediana_primo_contatto_min_7g, lead_fermi = EXCLUDED.lead_fermi, lead_fermo_piu_vecchio_ore = EXCLUDED.lead_fermo_piu_vecchio_ore,
    spesa_senza_lead = EXCLUDED.spesa_senza_lead, rapporto_zero = EXCLUDED.rapporto_zero, sotto_consegna = EXCLUDED.sotto_consegna, copertura_budget = EXCLUDED.copertura_budget,
    vendite_mese = EXCLUDED.vendite_mese, venduto_mese = EXCLUDED.venduto_mese, venduto_medio_3m = EXCLUDED.venduto_medio_3m, vendite_30g = EXCLUDED.vendite_30g, preventivi_sospesi = EXCLUDED.preventivi_sospesi,
    opp_mese = EXCLUDED.opp_mese, opp_senza_esito_mese = EXCLUDED.opp_senza_esito_mese,
    giorni_accesso_14g = EXCLUDED.giorni_accesso_14g, giorni_dall_ultimo_accesso = EXCLUDED.giorni_dall_ultimo_accesso, meta_stato = EXCLUDED.meta_stato, meta_account = EXCLUDED.meta_account,
    indice_esecuzione = EXCLUDED.indice_esecuzione, indice_componenti = EXCLUDED.indice_componenti, semaforo = EXCLUDED.semaforo, semaforo_componenti = EXCLUDED.semaforo_componenti,
    dati_freschi = EXCLUDED.dati_freschi, ultimo_sync = EXCLUDED.ultimo_sync, spesa_disponibile = EXCLUDED.spesa_disponibile, calcolato_il = now();

  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END $function$
