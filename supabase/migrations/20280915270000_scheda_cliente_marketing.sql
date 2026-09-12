-- La scheda del cliente marketing: tutto il report senza entrare nell'azienda.
--
-- Il titolare non vuole impersonare il cliente per sapere come va: apre la
-- scheda e in una schermata ha il giorno per giorno (le colonne del suo
-- Excel), le settimane con le variazioni, i lead veri con chi li ha toccati e
-- quando, le vendite con il lead d'origine, l'imbuto e i motivi di perdita.
--
-- Una sola funzione, un solo giro di query: admin_cliente_marketing_scheda.
-- Solo super admin (o il ruolo di servizio per i rapporti).
--
-- In più: le colonne del giorno per giorno che mancavano alla spesa
-- sincronizzata (copertura, CPM, interazioni, campagne attive), che
-- meta-ads-sync-insights riempie a ogni giro.

ALTER TABLE public.mkt_spesa_giornaliera
  ADD COLUMN IF NOT EXISTS copertura bigint,
  ADD COLUMN IF NOT EXISTS cpm numeric(10,2),
  ADD COLUMN IF NOT EXISTS interazioni bigint,
  ADD COLUMN IF NOT EXISTS campagne_attive integer;

COMMENT ON COLUMN public.mkt_spesa_giornaliera.copertura IS 'Persone raggiunte nel giorno (reach): la colonna «Copertura» del report giornaliero.';
COMMENT ON COLUMN public.mkt_spesa_giornaliera.interazioni IS 'Interazioni con il post nel giorno (post_engagement).';

CREATE OR REPLACE FUNCTION public.admin_cliente_marketing_scheda(
  p_service_client_id uuid,
  p_da date DEFAULT NULL,
  p_a date DEFAULT NULL)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH guardia AS (
    SELECT (SELECT public.is_super_admin()) OR coalesce((SELECT auth.jwt() ->> 'role'), '') = 'service_role' AS ok
  ),
  par AS (
    SELECT coalesce(p_da, coalesce(p_a, (now() AT TIME ZONE 'Europe/Rome')::date) - 29) AS da,
           coalesce(p_a, (now() AT TIME ZONE 'Europe/Rome')::date) AS a
  ),
  p AS (
    SELECT par.da, par.a, (par.a - par.da + 1) AS n,
           (par.da::timestamp AT TIME ZONE 'Europe/Rome') AS t_da,
           ((par.a + 1)::timestamp AT TIME ZONE 'Europe/Rome') AS t_a,
           ((par.da - (par.a - par.da + 1))::timestamp AT TIME ZONE 'Europe/Rome') AS t_pda,
           (par.da - (par.a - par.da + 1)) AS pda
      FROM par
  ),
  cli AS (
    SELECT sc.id, sc.company_id, sc.contact_id, sc.cliente_nome, sc.stato, sc.data_inizio, sc.commerciale, sc.commerciale_id,
           sc.provvigione_scaglioni, sc.mkt_settore, sc.mkt_classe, sc.mkt_budget_mensile, sc.mkt_ticket_medio, sc.mkt_chi_richiama,
           co.name AS azienda_nome, co.logo_url, co.phone AS azienda_telefono, co.email AS azienda_email,
           l.nome AS servizio, l.categoria
      FROM public.aedix_service_clients sc
      JOIN public.companies co ON co.id = sc.company_id
      JOIN public.aedix_product_lines l ON l.id = sc.product_line_id
     WHERE sc.id = p_service_client_id AND (SELECT ok FROM guardia)
  ),
  -- Tutti i servizi dello stesso cliente: marketing oggi, consulenza domani.
  servizi AS (
    SELECT s.id, l.nome AS servizio, l.categoria, s.stato, s.billing_model, s.ricorrenza, s.importo,
           s.data_inizio, s.data_fine, (s.id = p_service_client_id) AS corrente,
           (SELECT coalesce(sum(b.importo_incassato), 0) FROM public.aedix_service_billings b WHERE b.service_client_id = s.id) AS incassato,
           (SELECT coalesce(sum(b.importo_dovuto - coalesce(b.importo_incassato, 0)), 0) FROM public.aedix_service_billings b WHERE b.service_client_id = s.id AND b.importo_dovuto > coalesce(b.importo_incassato, 0)) AS da_incassare
      FROM public.aedix_service_clients s
      JOIN public.aedix_product_lines l ON l.id = s.product_line_id
      JOIN cli c ON s.company_id = c.company_id OR (s.contact_id IS NOT NULL AND s.contact_id = c.contact_id)
  ),
  gg AS (SELECT d::date AS giorno FROM p, generate_series(p.da, p.a, interval '1 day') d),
  -- Spesa sincronizzata (per canale) + costi a mano, giorno per giorno.
  sp AS (
    SELECT s.giorno,
           sum(s.spesa) AS spesa,
           sum(s.copertura) AS copertura,
           sum(s.interazioni) AS interazioni,
           sum(s.click) AS click,
           sum(s.impression) AS impression,
           sum(s.lead_dichiarati) AS lead_dichiarati,
           max(s.frequenza) AS frequenza,
           max(s.campagne_attive) AS campagne_attive
      FROM (
        SELECT m.giorno, m.spesa, m.copertura, m.interazioni, m.click, m.impression, m.lead_dichiarati, m.frequenza, m.campagne_attive
          FROM public.mkt_spesa_giornaliera m JOIN cli ON cli.company_id = m.company_id
      CROSS JOIN p
         WHERE m.giorno BETWEEN p.pda AND p.a
        UNION ALL
        SELECT k.date, coalesce(k.spend_amount, 0), NULL, NULL, NULL, NULL, NULL, NULL, NULL
          FROM public.campaign_costs k JOIN cli ON cli.company_id = k.company_id
      CROSS JOIN p
         WHERE k.date BETWEEN p.pda AND p.a
      ) s
     GROUP BY s.giorno
  ),
  -- Lead veri nel CRM (non quelli dichiarati da Meta), esclusi import e fatture.
  ld AS (
    SELECT (mc.created_at AT TIME ZONE 'Europe/Rome')::date AS giorno, count(*) AS n
      FROM public.marketing_contacts mc JOIN cli ON cli.company_id = mc.company_id
      CROSS JOIN p
     WHERE mc.created_at >= p.t_pda AND mc.created_at < p.t_a
       AND coalesce(mc.source, '') NOT ILIKE 'fatturazione%'
       AND coalesce(mc.source_channel, '') NOT IN ('cold_import', 'cliente_servizio')
     GROUP BY 1
  ),
  -- Opportunità del periodo con la prima azione registrata: è la misura della lavorazione.
  opp AS (
    SELECT o.id, o.contact_id, o.created_at, o.status, o.value, o.stage_id, o.assigned_to, o.won_at, o.lost_at,
           o.name, o.source, o.lost_reason, o.lost_reason_category, o.last_activity_at,
           pr.prima
      FROM public.marketing_opportunities o JOIN cli ON cli.company_id = o.company_id
      CROSS JOIN p
      CROSS JOIN LATERAL (
        SELECT least(
                 (SELECT min(h.entered_at) FROM public.marketing_opportunity_stage_history h
                   WHERE h.opportunity_id = o.id AND h.entered_at > o.created_at + interval '2 minutes'),
                 (SELECT min(a.created_at) FROM public.marketing_contact_activities a
                   WHERE a.contact_id = o.contact_id AND a.company_id = o.company_id AND a.created_at > o.created_at + interval '2 minutes'
                     AND a.activity_type NOT IN ('contact_created','opportunity_created','contact_assigned','opportunity_assigned','updated','opportunity_auto_created'))
               ) AS prima
      ) pr
     WHERE o.deleted_at IS NULL AND o.created_at >= p.t_pda AND o.created_at < p.t_a
  ),
  opp_g AS (
    SELECT (o.created_at AT TIME ZONE 'Europe/Rome')::date AS giorno,
           count(*) AS opportunita,
           count(*) FILTER (WHERE o.prima IS NOT NULL) AS lavorate,
           round(percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM (o.prima - o.created_at)) / 60)
                 FILTER (WHERE o.prima IS NOT NULL))::int AS mediana_min
      FROM opp o GROUP BY 1
  ),
  app_g AS (
    SELECT (a.created_at AT TIME ZONE 'Europe/Rome')::date AS giorno, count(*) AS n
      FROM public.appointments a JOIN cli ON cli.company_id = a.company_id
      CROSS JOIN p
     WHERE a.created_at >= p.t_pda AND a.created_at < p.t_a
       AND coalesce(a.status, '') NOT IN ('annullato','cancelled','cancellato') AND NOT coalesce(a.is_blocked_slot, false)
     GROUP BY 1
  ),
  vin_g AS (
    SELECT (coalesce(o.won_at, o.updated_at) AT TIME ZONE 'Europe/Rome')::date AS giorno,
           count(*) AS n, coalesce(sum(o.value), 0) AS valore
      FROM public.marketing_opportunities o JOIN cli ON cli.company_id = o.company_id
      CROSS JOIN p
     WHERE o.deleted_at IS NULL AND o.status = 'won'
       AND coalesce(o.won_at, o.updated_at) >= p.t_pda AND coalesce(o.won_at, o.updated_at) < p.t_a
     GROUP BY 1
  ),
  giorni AS (
    SELECT gg.giorno,
           coalesce(sp.spesa, 0) AS spesa, sp.copertura, sp.interazioni, sp.impression, sp.click,
           CASE WHEN sp.impression > 0 THEN round(coalesce(sp.spesa, 0) / sp.impression * 1000, 2) END AS cpm,
           CASE WHEN sp.click > 0 THEN round(coalesce(sp.spesa, 0) / sp.click, 2) END AS cpc,
           sp.frequenza, sp.campagne_attive, coalesce(sp.lead_dichiarati, 0) AS lead_dichiarati,
           coalesce(ld.n, 0) AS lead,
           CASE WHEN coalesce(ld.n, 0) > 0 AND coalesce(sp.spesa, 0) > 0 THEN round(sp.spesa / ld.n, 2) END AS cpl,
           coalesce(opp_g.opportunita, 0) AS opportunita, coalesce(opp_g.lavorate, 0) AS lavorate, opp_g.mediana_min,
           coalesce(app_g.n, 0) AS appuntamenti,
           coalesce(vin_g.n, 0) AS vendite, coalesce(vin_g.valore, 0) AS valore
      FROM gg
      LEFT JOIN sp ON sp.giorno = gg.giorno
      LEFT JOIN ld ON ld.giorno = gg.giorno
      LEFT JOIN opp_g ON opp_g.giorno = gg.giorno
      LEFT JOIN app_g ON app_g.giorno = gg.giorno
      LEFT JOIN vin_g ON vin_g.giorno = gg.giorno
  ),
  -- Settimane (lunedì) con le variazioni sulla settimana prima.
  sett AS (
    SELECT date_trunc('week', g.giorno)::date AS settimana,
           sum(g.spesa) AS spesa, sum(g.lead) AS lead, sum(g.lavorate) AS lavorate,
           sum(g.appuntamenti) AS appuntamenti, sum(g.vendite) AS vendite, sum(g.valore) AS valore,
           round(avg(g.mediana_min))::int AS mediana_min,
           CASE WHEN sum(g.lead) > 0 AND sum(g.spesa) > 0 THEN round(sum(g.spesa) / sum(g.lead), 2) END AS cpl
      FROM giorni g GROUP BY 1
  ),
  sett2 AS (
    SELECT s.*, lag(s.lead) OVER (ORDER BY s.settimana) AS lead_prec, lag(s.cpl) OVER (ORDER BY s.settimana) AS cpl_prec,
           lag(s.spesa) OVER (ORDER BY s.settimana) AS spesa_prec, lag(s.appuntamenti) OVER (ORDER BY s.settimana) AS app_prec
      FROM sett s
  ),
  -- Il periodo precedente, stessa lunghezza: serve al confronto in testa.
  prec AS (
    SELECT coalesce(sum(x.spesa), 0) AS spesa, coalesce(sum(x.lead), 0) AS lead, coalesce(sum(x.app), 0) AS appuntamenti,
           coalesce(sum(x.vendite), 0) AS vendite, coalesce(sum(x.valore), 0) AS valore
      FROM (
        SELECT coalesce(sp.spesa, 0) AS spesa, 0 AS lead, 0 AS app, 0 AS vendite, 0::numeric AS valore FROM sp, p WHERE sp.giorno >= p.pda AND sp.giorno < p.da
        UNION ALL SELECT 0, coalesce(ld.n, 0), 0, 0, 0 FROM ld, p WHERE ld.giorno >= p.pda AND ld.giorno < p.da
        UNION ALL SELECT 0, 0, coalesce(app_g.n, 0), 0, 0 FROM app_g, p WHERE app_g.giorno >= p.pda AND app_g.giorno < p.da
        UNION ALL SELECT 0, 0, 0, coalesce(vin_g.n, 0), coalesce(vin_g.valore, 0) FROM vin_g, p WHERE vin_g.giorno >= p.pda AND vin_g.giorno < p.da
      ) x
  ),
  -- I lead del periodo, con chi li segue e quando sono stati toccati.
  lead_lista AS (
    SELECT mc.id, nullif(trim(concat_ws(' ', mc.first_name, mc.last_name)), '') AS nome, mc.company_name, mc.phone, mc.email,
           mc.created_at, coalesce(mc.source, mc.source_channel) AS fonte, mc.city, mc.province,
           o.id AS opportunita_id, o.status, o.value, o.prima, o.assigned_to, o.last_activity_at,
           st.name AS fase,
           coalesce(nullif(trim(concat_ws(' ', pf.first_name, pf.last_name)), ''), pf.email) AS assegnato_a,
           CASE WHEN o.prima IS NOT NULL THEN round(extract(epoch FROM (o.prima - mc.created_at)) / 60)::int END AS primo_contatto_min
      FROM public.marketing_contacts mc
      JOIN cli ON cli.company_id = mc.company_id
      CROSS JOIN p
      LEFT JOIN LATERAL (SELECT * FROM opp o2 WHERE o2.contact_id = mc.id ORDER BY o2.created_at DESC LIMIT 1) o ON true
      LEFT JOIN public.marketing_pipeline_stages st ON st.id = o.stage_id
      LEFT JOIN public.profiles pf ON pf.id = o.assigned_to
     WHERE mc.created_at >= p.t_da AND mc.created_at < p.t_a
       AND coalesce(mc.source, '') NOT ILIKE 'fatturazione%'
       AND coalesce(mc.source_channel, '') NOT IN ('cold_import', 'cliente_servizio')
     ORDER BY mc.created_at DESC
     LIMIT 100
  ),
  -- Le vendite del periodo, con il lead d'origine e quanto ci è voluto.
  vendite_lista AS (
    SELECT o.id, o.name, o.value, coalesce(o.won_at, o.updated_at) AS vinto_il, o.source,
           coalesce(nullif(trim(concat_ws(' ', mc.first_name, mc.last_name)), ''), mc.company_name) AS cliente_finale,
           mc.created_at AS lead_il,
           CASE WHEN mc.created_at IS NOT NULL THEN round(extract(epoch FROM (coalesce(o.won_at, o.updated_at) - mc.created_at)) / 86400)::int END AS giorni_dal_lead,
           coalesce(nullif(trim(concat_ws(' ', pf.first_name, pf.last_name)), ''), pf.email) AS venditore
      FROM public.marketing_opportunities o
      JOIN cli ON cli.company_id = o.company_id
      CROSS JOIN p
      LEFT JOIN public.marketing_contacts mc ON mc.id = o.contact_id
      LEFT JOIN public.profiles pf ON pf.id = o.assigned_to
     WHERE o.deleted_at IS NULL AND o.status = 'won'
       AND coalesce(o.won_at, o.updated_at) >= p.t_da AND coalesce(o.won_at, o.updated_at) < p.t_a
     ORDER BY coalesce(o.won_at, o.updated_at) DESC
     LIMIT 100
  ),
  -- L'imbuto di adesso: dove stanno ferme le opportunità aperte.
  imbuto AS (
    SELECT coalesce(st.name, 'senza fase') AS fase, coalesce(st.position, 999) AS ordine,
           count(*) AS n, coalesce(sum(o.value), 0) AS valore,
           count(*) FILTER (WHERE coalesce(o.last_activity_at, o.updated_at) < now() - interval '14 days') AS ferme_14g
      FROM public.marketing_opportunities o JOIN cli ON cli.company_id = o.company_id
      LEFT JOIN public.marketing_pipeline_stages st ON st.id = o.stage_id
     WHERE o.deleted_at IS NULL AND o.status = 'open'
     GROUP BY 1, 2
  ),
  perse AS (
    SELECT coalesce(nullif(o.lost_reason_category, ''), nullif(o.lost_reason, ''), 'non indicato') AS motivo, count(*) AS n
      FROM public.marketing_opportunities o JOIN cli ON cli.company_id = o.company_id
      CROSS JOIN p
     WHERE o.deleted_at IS NULL AND o.status = 'lost'
       AND coalesce(o.lost_at, o.updated_at) >= p.t_da AND coalesce(o.lost_at, o.updated_at) < p.t_a
     GROUP BY 1
  ),
  -- Chi, dentro l'azienda del cliente, lavora davvero i lead.
  persone AS (
    SELECT coalesce(nullif(trim(concat_ws(' ', pf.first_name, pf.last_name)), ''), pf.email, 'non assegnati') AS persona,
           count(*) AS opportunita,
           count(*) FILTER (WHERE o.prima IS NOT NULL) AS lavorate,
           count(*) FILTER (WHERE o.status = 'won') AS vinte,
           round(percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM (o.prima - o.created_at)) / 60) FILTER (WHERE o.prima IS NOT NULL))::int AS mediana_min
      FROM opp o LEFT JOIN public.profiles pf ON pf.id = o.assigned_to CROSS JOIN p
     WHERE o.created_at >= p.t_da
     GROUP BY 1
  ),
  attivita AS (
    SELECT a.activity_type AS tipo, count(*) AS n
      FROM public.marketing_contact_activities a JOIN cli ON cli.company_id = a.company_id
      CROSS JOIN p
     WHERE a.created_at >= p.t_da AND a.created_at < p.t_a
     GROUP BY 1
  ),
  tot AS (
    SELECT coalesce(sum(g.spesa), 0) AS spesa, coalesce(sum(g.lead), 0) AS lead, coalesce(sum(g.opportunita), 0) AS opportunita,
           coalesce(sum(g.lavorate), 0) AS lavorate, coalesce(sum(g.appuntamenti), 0) AS appuntamenti,
           coalesce(sum(g.vendite), 0) AS vendite, coalesce(sum(g.valore), 0) AS valore,
           coalesce(sum(g.copertura), 0) AS copertura, coalesce(sum(g.click), 0) AS click,
           round(avg(g.mediana_min))::int AS mediana_min
      FROM giorni g
  )
  SELECT jsonb_build_object(
    'cliente', (SELECT to_jsonb(c) FROM cli c),
    'servizi', (SELECT coalesce(jsonb_agg(to_jsonb(s) ORDER BY s.corrente DESC, s.data_inizio), '[]'::jsonb) FROM servizi s),
    'periodo', (SELECT jsonb_build_object('da', p.da, 'a', p.a, 'giorni', p.n, 'precedente_da', p.pda) FROM p),
    'totali', (SELECT to_jsonb(t) || jsonb_build_object(
                 'cpl', CASE WHEN t.lead > 0 AND t.spesa > 0 THEN round(t.spesa / t.lead, 2) END,
                 'costo_appuntamento', CASE WHEN t.appuntamenti > 0 AND t.spesa > 0 THEN round(t.spesa / t.appuntamenti, 2) END,
                 'cpa', CASE WHEN t.vendite > 0 AND t.spesa > 0 THEN round(t.spesa / t.vendite, 2) END,
                 'roas', CASE WHEN t.spesa > 0 THEN round(t.valore / t.spesa, 1) END,
                 'tasso_lavorati', CASE WHEN t.opportunita > 0 THEN round(t.lavorate::numeric / t.opportunita, 4) END,
                 'tasso_appuntamento', CASE WHEN t.lead > 0 THEN round(t.appuntamenti::numeric / t.lead, 4) END,
                 'tasso_chiusura', CASE WHEN t.appuntamenti > 0 THEN round(t.vendite::numeric / t.appuntamenti, 4) END)
               FROM tot t),
    'precedente', (SELECT to_jsonb(x) FROM prec x),
    'giorni', (SELECT coalesce(jsonb_agg(to_jsonb(g) ORDER BY g.giorno DESC), '[]'::jsonb) FROM giorni g),
    'settimane', (SELECT coalesce(jsonb_agg(to_jsonb(s) ORDER BY s.settimana DESC), '[]'::jsonb) FROM sett2 s),
    'lead', (SELECT coalesce(jsonb_agg(to_jsonb(l) ORDER BY l.created_at DESC), '[]'::jsonb) FROM lead_lista l),
    'vendite', (SELECT coalesce(jsonb_agg(to_jsonb(v) ORDER BY v.vinto_il DESC), '[]'::jsonb) FROM vendite_lista v),
    'imbuto', (SELECT coalesce(jsonb_agg(to_jsonb(i) ORDER BY i.ordine, i.fase), '[]'::jsonb) FROM imbuto i),
    'perse', (SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.n DESC), '[]'::jsonb) FROM perse x),
    'persone', (SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.opportunita DESC), '[]'::jsonb) FROM persone x),
    'attivita', (SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.n DESC), '[]'::jsonb) FROM attivita x)
  );
$$;

REVOKE ALL ON FUNCTION public.admin_cliente_marketing_scheda(uuid, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_cliente_marketing_scheda(uuid, date, date) TO authenticated, service_role;
