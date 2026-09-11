-- Clienti marketing: provvigione a scaglioni e i numeri del mese per cliente.
--
-- I clienti a provvigione (Marketing Edile) pagano una percentuale del loro
-- venduto imponibile mensile che SCENDE a scaglioni progressivi: 3% fino a
-- 50.000, 2,5% da 50.001 a 150.000, 2% fino a 250.000, 1,5% fino a 500.000,
-- 1% fino a 1.000.000, 0,75% oltre. Su 75.000 € di venduto: 1.500 + 625 =
-- 2.125 €. Le righe a percentuale fissa (aedix_service_commission_lines)
-- restano per gli altri contratti: qui si aggiungono gli scaglioni.
--
-- admin_clienti_marketing_riepilogo(mese) è la console: per ogni cliente
-- collegato a un'azienda della piattaforma dice, nel mese scelto e in quello
-- prima, quanti lead sono arrivati e da dove, quanti sono stati lavorati e
-- quanto in fretta, quanti appuntamenti, quante vendite e per quanto, il
-- fatturato dal gestionale, la spesa pubblicitaria, cosa è collegato
-- (Meta, Google, fatture, form) e lo stato del mese (chiuso, incassato).
-- Solo super admin: controllo UNA volta all'ingresso.

ALTER TABLE public.aedix_service_clients
  ADD COLUMN IF NOT EXISTS provvigione_scaglioni jsonb;

COMMENT ON COLUMN public.aedix_service_clients.provvigione_scaglioni IS
  'Scaglioni progressivi [{da, a, pct}] sul venduto mensile del cliente; null = righe a percentuale fissa.';

-- Provvigione progressiva: ogni scaglione si applica solo alla fetta di base
-- che ci cade dentro. Scaglioni non validi o vuoti → 0.
CREATE OR REPLACE FUNCTION public.aedix_provvigione_scaglioni(p_base numeric, p_scaglioni jsonb)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT coalesce(round(sum(
           greatest(0, least(coalesce(p_base, 0), coalesce((s->>'a')::numeric, 1e15)) - (s->>'da')::numeric)
           * (s->>'pct')::numeric / 100
         ), 2), 0)
    FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p_scaglioni) = 'array' THEN p_scaglioni ELSE '[]'::jsonb END) s
   WHERE (s->>'da') ~ '^\d+(\.\d+)?$' AND (s->>'pct') ~ '^\d+(\.\d+)?$';
$$;

-- Lo storico delle fasi si legge per azienda e periodo: senza questo indice
-- ogni lettura passava dall'indice (azienda, fase, data) e costava secondi.
CREATE INDEX IF NOT EXISTS idx_mosh_company_entered ON public.marketing_opportunity_stage_history (company_id, entered_at);

CREATE OR REPLACE FUNCTION public.admin_clienti_marketing_riepilogo(p_mese date DEFAULT date_trunc('month', now())::date)
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
  mese_dovuto numeric, mese_incassato numeric, mese_chiuso boolean)
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
  cli AS (
    SELECT c.id, c.company_id, c.cliente_nome, c.stato, c.data_inizio, c.billing_model,
           c.provvigione_scaglioni, c.commerciale, co.logo_url, l.nome AS servizio
      FROM public.aedix_service_clients c
      JOIN public.companies co ON co.id = c.company_id
      JOIN public.aedix_product_lines l ON l.id = c.product_line_id
     WHERE c.company_id IS NOT NULL
       AND l.categoria IN ('agenzia', 'performance')
       AND (SELECT public.is_super_admin())
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
  -- Spesa Meta: la riga a livello account del mese scritta dal pulsante
  -- «Aggiorna costi» (meta-api-proxy, level=account); la più recente vince.
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
         bil.importo_dovuto, bil.importo_incassato, (bil.service_client_id IS NOT NULL)
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
   ORDER BY (cli.stato = 'attivo') DESC, coalesce(lead.mese, 0) DESC, cli.cliente_nome;
$$;

REVOKE ALL ON FUNCTION public.aedix_provvigione_scaglioni(numeric, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_clienti_marketing_riepilogo(date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.aedix_provvigione_scaglioni(numeric, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_clienti_marketing_riepilogo(date) TO authenticated, service_role;
