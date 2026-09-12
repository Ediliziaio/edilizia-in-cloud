-- Le due RPC grandi della console clienti marketing, rifatte per rispettare il
-- responsabile del contratto (vedi 20280915420000):
--  - il riepilogo restituisce anche commerciale_id e responsabile_nome, e mostra
--    a ciascuno solo i clienti che segue (chi amministra vede tutti);
--  - la scheda usa la stessa guardia e porta dentro il diario della settimana.
-- Il corpo delle due funzioni non cambia altrove.

-- ------------------------------------------------------------------
-- Il riepilogo della console, con il responsabile e il filtro per persona.
-- Cambia il tipo di ritorno: va rimosso e ricreato, stessi permessi.
-- ------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.admin_clienti_marketing_riepilogo(date);

CREATE FUNCTION public.admin_clienti_marketing_riepilogo(p_mese date DEFAULT date_trunc('month', now())::date)
RETURNS TABLE (
  service_client_id uuid, company_id uuid, cliente_nome text, logo_url text, stato text, data_inizio date,
  billing_model text, provvigione_scaglioni jsonb, commerciale text, servizio text,
  lead_mese bigint, lead_prec bigint, lead_meta bigint, lead_google bigint, lead_form bigint, lead_altri bigint,
  lead_lavorati bigint, lead_non_gestiti bigint, ore_mediane_primo_contatto numeric,
  appuntamenti_mese bigint, appuntamenti_prec bigint,
  vinte_mese bigint, vinte_prec bigint, valore_vinto_mese numeric, valore_vinto_prec numeric,
  pipeline_aperta bigint, valore_pipeline_aperta numeric,
  fatturato_mese numeric, fatturato_prec numeric, fatture_collegate boolean,
  spesa_meta numeric, lead_meta_dichiarati bigint, spesa_meta_al timestamptz, spesa_google numeric, spesa_manuale numeric,
  meta_stato text, meta_integration_id uuid, meta_account_id text, meta_account_nome text, meta_pagine text,
  google_account text, form_attivi bigint, utenti bigint, ultimo_accesso timestamptz,
  mese_dovuto numeric, mese_incassato numeric, mese_chiuso boolean,
  lead_giorni jsonb, giorni_senza_lead integer,
  referente_nome text, referente_telefono text, referente_email text,
  promemoria_aperti bigint, promemoria_scaduti bigint, prossimo_promemoria jsonb,
  commerciale_id uuid, responsabile_nome text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH par AS (
    SELECT date_trunc('month', p_mese)::date AS m0,
           (date_trunc('month', p_mese) + interval '1 month')::date AS m1,
           (date_trunc('month', p_mese) - interval '1 month')::date AS mp
  ),
  oggi AS (SELECT (now() AT TIME ZONE 'Europe/Rome')::date AS d),
  cli AS (
    SELECT c.id, c.company_id, c.contact_id, c.cliente_nome, c.stato, c.data_inizio, c.billing_model,
           c.provvigione_scaglioni, c.commerciale, co.logo_url, co.phone AS azienda_telefono, co.email AS azienda_email,
           l.nome AS servizio, c.commerciale_id,
           coalesce(nullif(btrim(coalesce(pr.first_name, '') || ' ' || coalesce(pr.last_name, '')), ''), pr.email) AS responsabile_nome
      FROM public.aedix_service_clients c
      JOIN public.companies co ON co.id = c.company_id
      JOIN public.aedix_product_lines l ON l.id = c.product_line_id
      LEFT JOIN public.profiles pr ON pr.id = c.commerciale_id
     WHERE c.company_id IS NOT NULL
       AND l.categoria IN ('agenzia', 'performance')
       -- Chi amministra la piattaforma vede tutti i clienti; chi ne segue
       -- qualcuno vede solo i propri. Nessun altro entra qui.
       AND ((SELECT public.mkt_vede_tutto())
            OR ((SELECT public.is_platform_staff()) AND c.commerciale_id = (SELECT auth.uid())))
  ),
  -- Lead = contatti nati nel periodo, esclusi quelli importati dalle fatture
  -- o dalle liste a freddo: quelli non li ha portati il marketing.
  lead AS (
    SELECT c.company_id,
           count(*) FILTER (WHERE c.created_at >= par.m0 AND c.created_at < par.m1) AS mese,
           count(*) FILTER (WHERE c.created_at < par.m0) AS prec,
           count(*) FILTER (WHERE c.created_at >= par.m0 AND c.created_at < par.m1 AND c.canale = 'meta') AS meta,
           count(*) FILTER (WHERE c.created_at >= par.m0 AND c.created_at < par.m1 AND c.canale = 'google') AS google,
           count(*) FILTER (WHERE c.created_at >= par.m0 AND c.created_at < par.m1 AND c.canale = 'form') AS form,
           count(*) FILTER (WHERE c.created_at >= par.m0 AND c.created_at < par.m1 AND c.canale = 'altro') AS altri
      FROM par, (
        SELECT mc.company_id, mc.created_at,
               CASE
                 WHEN mc.meta_lead_id IS NOT NULL OR mc.fbclid IS NOT NULL
                      OR mc.source ILIKE '%meta%' OR mc.source ILIKE '%facebook%' OR mc.source ILIKE '%instagram%' OR mc.source ILIKE '%lead ads%'
                      OR mc.source_channel IN ('facebook', 'meta', 'instagram') THEN 'meta'
                 WHEN mc.gclid IS NOT NULL OR mc.source ILIKE '%google%' OR mc.source_channel ILIKE '%google%' THEN 'google'
                 WHEN mc.source ILIKE 'form%' OR mc.source ILIKE '%sito%' OR mc.source ILIKE '%website%' OR mc.source ILIKE '%landing%'
                      OR mc.source_channel IN ('form', 'website', 'sito', 'landing') THEN 'form'
                 ELSE 'altro'
               END AS canale
          FROM public.marketing_contacts mc
          JOIN cli ON cli.company_id = mc.company_id
          JOIN par p2 ON true
         WHERE mc.created_at >= p2.mp AND mc.created_at < p2.m1
           AND coalesce(mc.source, '') NOT ILIKE 'fatturazione%'
           AND coalesce(mc.source_channel, '') NOT IN ('cold_import', 'cliente_servizio')
      ) c
     GROUP BY c.company_id
  ),
  -- I lead di ogni giorno degli ultimi 30 (ora di Roma): la linea sulla scheda.
  lead_g AS (
    SELECT mc.company_id, (mc.created_at AT TIME ZONE 'Europe/Rome')::date AS g, count(*) AS n
      FROM public.marketing_contacts mc
      JOIN cli ON cli.company_id = mc.company_id
      CROSS JOIN oggi
     WHERE mc.created_at >= ((oggi.d - 29)::timestamp AT TIME ZONE 'Europe/Rome')
       AND coalesce(mc.source, '') NOT ILIKE 'fatturazione%'
       AND coalesce(mc.source_channel, '') NOT IN ('cold_import', 'cliente_servizio')
     GROUP BY mc.company_id, (mc.created_at AT TIME ZONE 'Europe/Rome')::date
  ),
  serie AS (
    SELECT cli.company_id, jsonb_agg(coalesce(lg.n, 0) ORDER BY k.i) AS lead_giorni
      FROM cli
      CROSS JOIN oggi
      CROSS JOIN generate_series(0, 29) AS k(i)
      LEFT JOIN lead_g lg ON lg.company_id = cli.company_id AND lg.g = oggi.d - 29 + k.i
     GROUP BY cli.company_id
  ),
  ultimo AS (
    SELECT cli.company_id,
           oggi.d - (SELECT (max(mc.created_at) AT TIME ZONE 'Europe/Rome')::date
                       FROM public.marketing_contacts mc
                      WHERE mc.company_id = cli.company_id
                        AND coalesce(mc.source, '') NOT ILIKE 'fatturazione%'
                        AND coalesce(mc.source_channel, '') NOT IN ('cold_import', 'cliente_servizio')) AS giorni
      FROM cli CROSS JOIN oggi
  ),
  -- Opportunità nate nel mese: lavorata = ha cambiato fase o ha un'attività
  -- (nota, chiamata, stato) dopo la nascita; il tempo al primo contatto è la
  -- mediana delle ore fra nascita e prima azione.
  opp AS (
    SELECT o.id, o.company_id, o.contact_id, o.created_at, o.status,
           least(
             (SELECT min(h.entered_at) FROM public.marketing_opportunity_stage_history h
               WHERE h.opportunity_id = o.id AND h.entered_at > o.created_at + interval '2 minutes'),
             (SELECT min(a.created_at) FROM public.marketing_contact_activities a
               WHERE a.contact_id = o.contact_id AND a.company_id = o.company_id
                 AND a.created_at > o.created_at + interval '2 minutes'
                 AND a.activity_type NOT IN ('contact_created', 'opportunity_created', 'contact_assigned', 'opportunity_assigned', 'updated'))
           ) AS prima_azione
      FROM public.marketing_opportunities o
      JOIN cli ON cli.company_id = o.company_id
      JOIN par ON true
     WHERE o.deleted_at IS NULL AND o.created_at >= par.m0 AND o.created_at < par.m1
  ),
  lav AS (
    SELECT o.company_id,
           count(*) FILTER (WHERE o.prima_azione IS NOT NULL) AS lavorati,
           count(*) FILTER (WHERE o.prima_azione IS NULL AND o.status = 'open' AND o.created_at < now() - interval '48 hours') AS non_gestiti,
           round((percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM (o.prima_azione - o.created_at)) / 3600.0))::numeric, 1) AS ore_mediane
      FROM opp o GROUP BY o.company_id
  ),
  -- Appuntamento = l'opportunità entra in una fase «appuntamento/incontro/
  -- sopralluogo» (non quelle da fissare o telefoniche), oppure un appuntamento
  -- in agenda non annullato. Un'opportunità conta una volta per mese.
  app AS (
    SELECT x.company_id,
           count(DISTINCT x.opportunity_id) FILTER (WHERE x.t >= par.m0 AND x.t < par.m1) AS mese,
           count(DISTINCT x.opportunity_id) FILTER (WHERE x.t < par.m0) AS prec
      FROM par, (
        SELECT h.company_id, h.opportunity_id, h.entered_at AS t
          FROM public.marketing_opportunity_stage_history h
          JOIN public.marketing_pipeline_stages s ON s.id = h.stage_id
          JOIN cli ON cli.company_id = h.company_id
          JOIN par p2 ON true
         WHERE h.entered_at >= p2.mp AND h.entered_at < p2.m1
           AND (s.name ILIKE '%appuntament%' OR s.name ILIKE '%incontro%' OR s.name ILIKE '%sopralluogo%')
           AND s.name NOT ILIKE '%da fissare%' AND s.name NOT ILIKE '%rifissare%' AND s.name NOT ILIKE '%chiamata%'
        UNION ALL
        SELECT a.company_id, coalesce(a.opportunity_id, a.id), a.appointment_date::timestamptz
          FROM public.appointments a
          JOIN cli ON cli.company_id = a.company_id
          JOIN par p2 ON true
         WHERE a.appointment_date >= p2.mp AND a.appointment_date < p2.m1
           AND coalesce(a.status, '') NOT IN ('annullato', 'cancelled', 'cancellato')
           AND NOT coalesce(a.is_blocked_slot, false)
      ) x
     GROUP BY x.company_id
  ),
  vin AS (
    SELECT o.company_id,
           count(*) FILTER (WHERE coalesce(o.won_at, o.updated_at) >= par.m0 AND coalesce(o.won_at, o.updated_at) < par.m1) AS mese,
           count(*) FILTER (WHERE coalesce(o.won_at, o.updated_at) < par.m0) AS prec,
           sum(coalesce(o.value, 0)) FILTER (WHERE coalesce(o.won_at, o.updated_at) >= par.m0 AND coalesce(o.won_at, o.updated_at) < par.m1) AS valore_mese,
           sum(coalesce(o.value, 0)) FILTER (WHERE coalesce(o.won_at, o.updated_at) < par.m0) AS valore_prec
      FROM public.marketing_opportunities o
      JOIN cli ON cli.company_id = o.company_id
      JOIN par ON true
     WHERE o.deleted_at IS NULL AND o.status = 'won'
       AND coalesce(o.won_at, o.updated_at) >= par.mp AND coalesce(o.won_at, o.updated_at) < par.m1
     GROUP BY o.company_id
  ),
  pipe AS (
    SELECT o.company_id, count(*) AS aperte, sum(coalesce(o.value, 0)) AS valore
      FROM public.marketing_opportunities o JOIN cli ON cli.company_id = o.company_id
     WHERE o.deleted_at IS NULL AND o.status = 'open'
     GROUP BY o.company_id
  ),
  -- Fatturato imponibile del mese dal gestionale (note di credito in negativo).
  fat AS (
    SELECT i.company_id,
           sum((CASE WHEN i.document_type = 'credit_note' THEN -1 ELSE 1 END) * coalesce(i.subtotal, 0))
             FILTER (WHERE i.issue_date >= par.m0 AND i.issue_date < par.m1) AS mese,
           sum((CASE WHEN i.document_type = 'credit_note' THEN -1 ELSE 1 END) * coalesce(i.subtotal, 0))
             FILTER (WHERE i.issue_date < par.m0) AS prec
      FROM public.invoices i JOIN cli ON cli.company_id = i.company_id JOIN par ON true
     WHERE i.deleted_at IS NULL AND i.issue_date >= par.mp AND i.issue_date < par.m1
       AND coalesce(i.status, '') NOT IN ('draft', 'cancelled', 'annullata')
     GROUP BY i.company_id
  ),
  fat_any AS (
    SELECT DISTINCT i.company_id FROM public.invoices i JOIN cli ON cli.company_id = i.company_id WHERE i.deleted_at IS NULL
  ),
  -- Spesa Meta: la riga a livello account del mese (scritta dal pulsante
  -- «Aggiorna costi» o dal sync notturno, level=account); la più recente vince.
  meta_sp AS (
    SELECT DISTINCT ON (m.company_id) m.company_id, m.fetched_at,
           (SELECT coalesce(sum((e->>'spend')::numeric), 0) FROM jsonb_array_elements(m.payload_json) e) AS spesa,
           (SELECT coalesce(sum((act->>'value')::numeric), 0)
              FROM jsonb_array_elements(m.payload_json) e, jsonb_array_elements(coalesce(e->'actions', '[]'::jsonb)) act
             WHERE act->>'action_type' = 'lead') AS lead_dichiarati
      FROM public.meta_insights_cache m JOIN cli ON cli.company_id = m.company_id JOIN par ON true
     WHERE m.level = 'account' AND m.date_start = par.m0 AND jsonb_typeof(m.payload_json) = 'array'
     ORDER BY m.company_id, m.fetched_at DESC
  ),
  google_sp AS (
    SELECT g.company_id, sum(coalesce(g.cost_micros, 0)) / 1e6 AS spesa
      FROM public.google_ads_insights_cache g JOIN cli ON cli.company_id = g.company_id JOIN par ON true
     WHERE g.date_start >= par.m0 AND g.date_start < par.m1 AND g.ad_group_id IS NULL AND g.ad_id IS NULL
     GROUP BY g.company_id
  ),
  man_sp AS (
    SELECT k.company_id, sum(coalesce(k.spend_amount, 0)) AS spesa
      FROM public.campaign_costs k JOIN cli ON cli.company_id = k.company_id JOIN par ON true
     WHERE k.date >= par.m0 AND k.date < par.m1
     GROUP BY k.company_id
  ),
  meta_int AS (
    SELECT DISTINCT ON (i.company_id) i.company_id, i.id AS integration_id, i.status
      FROM public.integrations i JOIN cli ON cli.company_id = i.company_id
     WHERE i.provider = 'meta'
     ORDER BY i.company_id, (i.status = 'connected') DESC, i.updated_at DESC
  ),
  meta_acc AS (
    SELECT DISTINCT ON (a.company_id) a.company_id, a.asset_id, a.asset_name
      FROM public.meta_assets a JOIN cli ON cli.company_id = a.company_id
     WHERE a.asset_type = 'ad_account' AND a.selected
     ORDER BY a.company_id, a.updated_at DESC
  ),
  meta_pag AS (
    SELECT a.company_id, string_agg(coalesce(a.asset_name, a.asset_id), ', ' ORDER BY a.asset_name) AS pagine
      FROM public.meta_assets a JOIN cli ON cli.company_id = a.company_id
     WHERE a.asset_type = 'page' AND a.selected
     GROUP BY a.company_id
  ),
  goog AS (
    SELECT g.company_id, string_agg(coalesce(g.customer_name, g.customer_id), ', ') AS account
      FROM public.google_ads_accounts g JOIN cli ON cli.company_id = g.company_id
     WHERE g.selected GROUP BY g.company_id
  ),
  frm AS (
    SELECT f.company_id, count(*) AS attivi FROM public.lead_forms f JOIN cli ON cli.company_id = f.company_id
     WHERE f.is_active GROUP BY f.company_id
  ),
  ute AS (
    SELECT p.company_id, count(*) AS utenti, max(u.last_sign_in_at) AS ultimo
      FROM public.profiles p JOIN cli ON cli.company_id = p.company_id
      LEFT JOIN auth.users u ON u.id = p.id
     GROUP BY p.company_id
  ),
  bil AS (
    SELECT b.service_client_id, b.importo_dovuto, b.importo_incassato
      FROM public.aedix_service_billings b JOIN cli ON cli.id = b.service_client_id JOIN par ON true
     WHERE b.periodo = par.m0
  ),
  -- Il referente: il contatto CRM del cliente, altrimenti i recapiti dell'azienda.
  ref AS (
    SELECT cli.id AS service_client_id,
           coalesce(nullif(trim(concat_ws(' ', mc.first_name, mc.last_name)), ''), nullif(mc.company_name, ''), cli.cliente_nome) AS nome,
           coalesce(nullif(mc.phone, ''), nullif(cli.azienda_telefono, '')) AS telefono,
           coalesce(nullif(mc.email, ''), nullif(cli.azienda_email, '')) AS email
      FROM cli LEFT JOIN public.marketing_contacts mc ON mc.id = cli.contact_id
  ),
  -- Promemoria (cs_tasks) aperti sull'azienda: quanti, quanti scaduti, il prossimo.
  prom AS (
    SELECT t.company_id,
           count(*) FILTER (WHERE t.status <> 'completed') AS aperti,
           count(*) FILTER (WHERE t.status <> 'completed' AND t.due_date < oggi.d) AS scaduti,
           (array_agg(jsonb_build_object('id', t.id, 'titolo', t.title, 'scadenza', t.due_date, 'tipo', t.task_type)
                      ORDER BY t.due_date NULLS LAST, t.created_at)
              FILTER (WHERE t.status <> 'completed'))[1] AS prossimo
      FROM public.cs_tasks t JOIN cli ON cli.company_id = t.company_id CROSS JOIN oggi
     GROUP BY t.company_id
  )
  SELECT cli.id, cli.company_id, cli.cliente_nome, cli.logo_url, cli.stato, cli.data_inizio,
         cli.billing_model, cli.provvigione_scaglioni, cli.commerciale, cli.servizio,
         coalesce(lead.mese, 0), coalesce(lead.prec, 0), coalesce(lead.meta, 0), coalesce(lead.google, 0), coalesce(lead.form, 0), coalesce(lead.altri, 0),
         coalesce(lav.lavorati, 0), coalesce(lav.non_gestiti, 0), lav.ore_mediane,
         coalesce(app.mese, 0), coalesce(app.prec, 0),
         coalesce(vin.mese, 0), coalesce(vin.prec, 0), coalesce(vin.valore_mese, 0), coalesce(vin.valore_prec, 0),
         coalesce(pipe.aperte, 0), coalesce(pipe.valore, 0),
         fat.mese, fat.prec, (fat_any.company_id IS NOT NULL),
         coalesce(meta_sp.spesa, 0), coalesce(meta_sp.lead_dichiarati, 0)::bigint, meta_sp.fetched_at, coalesce(google_sp.spesa, 0), coalesce(man_sp.spesa, 0),
         meta_int.status, meta_int.integration_id, meta_acc.asset_id, meta_acc.asset_name, meta_pag.pagine,
         goog.account, coalesce(frm.attivi, 0), coalesce(ute.utenti, 0), ute.ultimo,
         bil.importo_dovuto, bil.importo_incassato, (bil.service_client_id IS NOT NULL),
         coalesce(serie.lead_giorni, '[]'::jsonb), ultimo.giorni::integer,
         ref.nome, ref.telefono, ref.email,
         coalesce(prom.aperti, 0), coalesce(prom.scaduti, 0), prom.prossimo,
         cli.commerciale_id, cli.responsabile_nome
    FROM cli
    LEFT JOIN lead ON lead.company_id = cli.company_id
    LEFT JOIN lav ON lav.company_id = cli.company_id
    LEFT JOIN app ON app.company_id = cli.company_id
    LEFT JOIN vin ON vin.company_id = cli.company_id
    LEFT JOIN pipe ON pipe.company_id = cli.company_id
    LEFT JOIN fat ON fat.company_id = cli.company_id
    LEFT JOIN fat_any ON fat_any.company_id = cli.company_id
    LEFT JOIN meta_sp ON meta_sp.company_id = cli.company_id
    LEFT JOIN google_sp ON google_sp.company_id = cli.company_id
    LEFT JOIN man_sp ON man_sp.company_id = cli.company_id
    LEFT JOIN meta_int ON meta_int.company_id = cli.company_id
    LEFT JOIN meta_acc ON meta_acc.company_id = cli.company_id
    LEFT JOIN meta_pag ON meta_pag.company_id = cli.company_id
    LEFT JOIN goog ON goog.company_id = cli.company_id
    LEFT JOIN frm ON frm.company_id = cli.company_id
    LEFT JOIN ute ON ute.company_id = cli.company_id
    LEFT JOIN bil ON bil.service_client_id = cli.id
    LEFT JOIN serie ON serie.company_id = cli.company_id
    LEFT JOIN ultimo ON ultimo.company_id = cli.company_id
    LEFT JOIN ref ON ref.service_client_id = cli.id
    LEFT JOIN prom ON prom.company_id = cli.company_id
   ORDER BY (cli.stato = 'attivo') DESC, coalesce(lead.mese, 0) DESC, cli.cliente_nome;
$$;

REVOKE ALL ON FUNCTION public.admin_clienti_marketing_riepilogo(date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_clienti_marketing_riepilogo(date) TO authenticated, service_role;

-- ------------------------------------------------------------------
-- La scheda del cliente: stessa guardia, più il responsabile e il diario.
-- ------------------------------------------------------------------

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
    SELECT (SELECT public.mkt_vede_cliente(p_service_client_id)) AS ok
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
           l.nome AS servizio, l.categoria,
           coalesce(nullif(btrim(coalesce(pr.first_name, '') || ' ' || coalesce(pr.last_name, '')), ''), pr.email) AS responsabile_nome
      FROM public.aedix_service_clients sc
      JOIN public.companies co ON co.id = sc.company_id
      JOIN public.aedix_product_lines l ON l.id = sc.product_line_id
      LEFT JOIN public.profiles pr ON pr.id = sc.commerciale_id
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
    'attivita', (SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.n DESC), '[]'::jsonb) FROM attivita x),
    -- Il diario: cosa ho notato la settimana scorsa e cosa faccio questa.
    'diario', (SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.settimana DESC), '[]'::jsonb) FROM (
        SELECT d.settimana, d.trend, d.cosa_fare, d.esito, d.chiusa, d.updated_at
          FROM public.mkt_diario_settimana d CROSS JOIN guardia
         WHERE d.service_client_id = p_service_client_id AND guardia.ok
         ORDER BY d.settimana DESC LIMIT 12) x)
  );
$$;

REVOKE ALL ON FUNCTION public.admin_cliente_marketing_scheda(uuid, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_cliente_marketing_scheda(uuid, date, date) TO authenticated, service_role;
