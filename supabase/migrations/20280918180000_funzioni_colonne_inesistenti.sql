-- Funzioni con colonne o tabelle che non esistono più (plpgsql_check, 17/09/2026).
--
-- Una funzione plpgsql si compila solo quando gira: una colonna rinominata
-- non dà errore finché qualcuno non la chiama. Un controllo con plpgsql_check
-- su tutto public ne ha trovate una quarantina; qui le 29 con un bug vero,
-- corrette sullo schema attuale. Il resto del corpo è identico.
--
-- Bloccavano l'utente:
-- - create_ddt_from_uscita: vettore e indirizzo scritti come testo in colonne
--   jsonb → «Crea DDT» da un'uscita di magazzino falliva sempre.
-- - request_quote_approval: user_roles non ha company_id → la richiesta di
--   autorizzazione sconto su un preventivo falliva sempre.
-- - populate_broadcast_recipients: colonne phone_number/variables/
--   total_recipients inesistenti e campi del contatto (telefono) sbagliati →
--   un broadcast WhatsApp non accodava nessun destinatario.
-- - cg_get_aging: join su public.contacts (inesistente) → aging di scadenzario
--   nel Controllo di Gestione in errore.
-- - check_plan_limit: tabella customers inesistente (limite clienti del piano).
-- - ai_test_lab_kpi: percentile_cont restituisce double, il risultato numeric.
-- - generate_referral_code_secure: gen_random_bytes sta nello schema extensions.
-- - check_referral_fraud: companies.owner_id → titolare_user_id.
-- - partner_submit_referral_payout_details: CASE text/timestamptz.
-- - calculate_monthly_commissions: ai_credit_usage.cost_eur → cost_billed_total.
--
-- Falliva in silenzio (il dato non arrivava):
-- - insert_goods_receipt_atomic: document_ref è uuid → la riga «ricevuto» della
--   cronologia articolo non veniva mai scritta.
-- - get_ai_economics_dashboard: variance_eur → delta_eur.
-- - silvio_admin_alerts_runner: public.subscriptions non esiste → avvisi
--   «pagamento fallito» e «rischio abbandono» mai generati.
-- - Strumenti di Silvio: cashflow e KPI (bank_name, is_archived,
--   transaction_date), dipendenti (role → role_type), fatture ricevute
--   (colonne di fatture_ricevute), anagrafica fattura (anagrafiche_native),
--   DURC (anagrafica_azienda / subappaltatori_sicurezza), ticket (support_messages
--   ha message e non conversation_id), task (cs_tasks senza related_entity_*),
--   storico cliente (company_subscriptions), note lead (content), benchmark
--   (cluster_segment jsonb), export decisioni (is_critical).
-- - Mai chiamate ma sistemate perché banali: create_oda_from_order,
--   decrement_scorta.
--
-- Falsi allarmi lasciati come sono: commessa_salva, mkt_valuta_regole,
-- sentinelle_effetti_cron (tabelle temporanee create a runtime),
-- sweep_stuck_render_sessions (nome tabella dinamico in un FOREACH).
-- Non corrette, codice morto senza chiamanti: create_shipment_atomic
-- (public.documenti), get_cruscotto_stats (customers, cost_date),
-- compute_client_margin_history (quotes.customer_id/accepted_at).

CREATE OR REPLACE FUNCTION public.insert_goods_receipt_atomic(p_order_item_id uuid, p_warehouse_id uuid, p_quantity_received numeric, p_quality_check_status text, p_supplier_id uuid DEFAULT NULL::uuid, p_ddt_number text DEFAULT NULL::text, p_ddt_photo_url text DEFAULT NULL::text, p_ddt_ricezione_id uuid DEFAULT NULL::uuid, p_quality_notes text DEFAULT NULL::text, p_notes text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_user_id uuid; v_company_id uuid; v_item_company_id uuid; v_receipt_id uuid;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Unauthorized: no auth.uid()'; END IF;
  v_company_id := public.get_my_company_id();
  IF v_company_id IS NULL THEN RAISE EXCEPTION 'Nessuna company attiva'; END IF;

  SELECT o.company_id INTO v_item_company_id
  FROM public.order_items oi JOIN public.orders o ON o.id = oi.order_id
  WHERE oi.id = p_order_item_id;
  IF v_item_company_id IS NULL THEN RAISE EXCEPTION 'Order item % non trovato', p_order_item_id; END IF;
  IF v_item_company_id <> v_company_id THEN RAISE EXCEPTION 'Forbidden: order item di altra company'; END IF;

  INSERT INTO public.goods_receipts (
    order_item_id, warehouse_id, company_id, supplier_id, quantity_received, ddt_number,
    ddt_photo_url, quality_check_status, quality_notes, notes, received_by, ddt_ricezione_id
  ) VALUES (
    p_order_item_id, p_warehouse_id, v_company_id, p_supplier_id, p_quantity_received, p_ddt_number,
    p_ddt_photo_url, p_quality_check_status, p_quality_notes, p_notes, v_user_id, p_ddt_ricezione_id
  ) RETURNING id INTO v_receipt_id;

  UPDATE public.order_items
     SET quantity_received = COALESCE(quantity_received, 0) + p_quantity_received,
         receipt_id = v_receipt_id, fulfillment_status = 'received', last_goods_receipt_date = now()
   WHERE id = p_order_item_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order item update fallito per id %', p_order_item_id; END IF;

  BEGIN
    INSERT INTO public.order_item_timeline (order_item_id, company_id, event_type, event_by, photo_url, document_ref, notes, location)
    VALUES (p_order_item_id, v_company_id, 'received', v_user_id, p_ddt_photo_url, v_receipt_id,
            COALESCE(p_notes, format('Ricevuto %s pz - Qualità: %s', p_quantity_received, p_quality_check_status)), 'Magazzino');
  EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'Timeline insert skipped: %', SQLERRM; END;

  RETURN v_receipt_id;
END; $function$;

CREATE OR REPLACE FUNCTION public.create_ddt_from_uscita(p_uscita_id uuid, p_ddt_extra jsonb DEFAULT NULL::jsonb)
 RETURNS TABLE(documento_id uuid, numero_ddt text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_company_id uuid := public.get_my_company_id();
  v_u public.warehouse_uscite%ROWTYPE;
  v_year integer := EXTRACT(YEAR FROM CURRENT_DATE)::integer;
  v_numero_ddt text; v_progressivo integer; v_documento_id uuid;
  v_indirizzo text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  IF v_company_id IS NULL THEN RAISE EXCEPTION 'No company context'; END IF;

  SELECT * INTO v_u FROM public.warehouse_uscite WHERE id = p_uscita_id AND company_id = v_company_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Uscita non trovata'; END IF;
  IF v_u.documento_id IS NOT NULL THEN
    RETURN QUERY SELECT v_u.documento_id, (SELECT numero FROM public.documenti_fiscali WHERE id = v_u.documento_id);
    RETURN;
  END IF;
  IF jsonb_array_length(COALESCE(v_u.righe,'[]'::jsonb)) = 0 THEN RAISE EXCEPTION 'Uscita senza righe'; END IF;

  v_numero_ddt := public.genera_numero_documento_native(v_company_id, 'ddt'::text, v_year);
  v_progressivo := COALESCE(NULLIF(split_part(v_numero_ddt, '-', array_length(string_to_array(v_numero_ddt, '-'), 1)), '')::integer, 1);

  -- indirizzo consegna: da snapshot cliente o da destinatario libero
  v_indirizzo := COALESCE(
    p_ddt_extra->>'indirizzo_consegna',
    NULLIF(trim(concat_ws(', ',
      v_u.cliente_snapshot->>'indirizzo_via',
      concat_ws(' ', v_u.cliente_snapshot->>'indirizzo_cap', v_u.cliente_snapshot->>'indirizzo_comune'),
      v_u.cliente_snapshot->>'indirizzo_provincia')), ''),
    v_u.destinatario_libero->>'indirizzo'
  );

  INSERT INTO public.documenti_fiscali (
    company_id, tipo, numero, numero_progressivo, anno, data_emissione, stato,
    ordine_id, anagrafica_id, cliente_snapshot, righe, note_documento,
    ddt_causale_trasporto, ddt_aspetto_beni, ddt_numero_colli, ddt_peso,
    ddt_mezzo_trasporto, ddt_porto, ddt_vettore, ddt_indirizzo_consegna
  ) VALUES (
    v_company_id, 'ddt', v_numero_ddt, v_progressivo, v_year, CURRENT_DATE, 'bozza',
    v_u.order_id, v_u.customer_id, v_u.cliente_snapshot, v_u.righe,
    NULLIF(concat_ws(' · ', p_ddt_extra->>'note_documento', v_u.note), ''),
    COALESCE(p_ddt_extra->>'causale_trasporto', 'Vendita'),
    NULLIF(p_ddt_extra->>'aspetto_beni',''),
    NULLIF((p_ddt_extra->>'numero_colli')::integer, 0),
    NULLIF(p_ddt_extra->>'peso',''),
    NULLIF(p_ddt_extra->>'mezzo_trasporto',''),
    COALESCE(p_ddt_extra->>'porto', 'Franco'),
    COALESCE(v_u.vettore, CASE WHEN NULLIF(p_ddt_extra->>'vettore','') IS NOT NULL THEN jsonb_build_object('descrizione', p_ddt_extra->>'vettore') END),
    CASE WHEN v_indirizzo IS NOT NULL THEN jsonb_build_object('indirizzo', v_indirizzo) END
  ) RETURNING id INTO v_documento_id;

  UPDATE public.warehouse_uscite SET documento_id = v_documento_id, stato = 'ddt_creato', updated_at = now() WHERE id = p_uscita_id;
  UPDATE public.warehouse_movements SET notes = 'Uscita ' || v_u.numero || ' · DDT ' || v_numero_ddt WHERE uscita_id = p_uscita_id;

  RETURN QUERY SELECT v_documento_id, v_numero_ddt;
END;
$function$;

CREATE OR REPLACE FUNCTION public.populate_broadcast_recipients(p_broadcast_id uuid, p_segment_filter jsonb, p_variable_mapping jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_company_id uuid;
  v_count int := 0;
  v_tipo_filter text;
  v_stato_filter text;
  v_exclude_opt_out boolean;
BEGIN
  -- [audit sicurezza 2026-08-27] guardia anti cross-tenant
  IF (SELECT x.company_id FROM public.whatsapp_broadcasts x WHERE x.id = p_broadcast_id) IS NOT NULL
     AND NOT public.user_can_access_company((SELECT x.company_id FROM public.whatsapp_broadcasts x WHERE x.id = p_broadcast_id)) THEN
    RAISE EXCEPTION 'accesso negato: azienda non consentita' USING ERRCODE = '42501';
  END IF;
  SELECT company_id INTO v_company_id
  FROM public.whatsapp_broadcasts
  WHERE id = p_broadcast_id;

  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'Broadcast % non trovato', p_broadcast_id;
  END IF;

  v_tipo_filter := p_segment_filter->>'tipo';
  v_stato_filter := p_segment_filter->>'stato';
  v_exclude_opt_out := COALESCE((p_segment_filter->>'exclude_opt_out')::boolean, true);

  -- Le variabili del template stanno sul broadcast (template_variables) e le
  -- risolve process-scheduled-broadcasts all'invio: qui solo chi e a che numero.
  INSERT INTO public.whatsapp_broadcast_recipients (broadcast_id, contact_id, phone, status)
  SELECT p_broadcast_id, mc.id, mc.telefono_normalized, 'pending'
  FROM public.marketing_contacts mc
  WHERE mc.company_id = v_company_id
    AND (v_tipo_filter IS NULL OR v_tipo_filter = 'all' OR mc.tipo = v_tipo_filter)
    AND (v_stato_filter IS NULL OR mc.stato = v_stato_filter)
    AND (NOT v_exclude_opt_out OR COALESCE(mc.opt_out, false) = false)
    AND mc.telefono_normalized IS NOT NULL;

  GET DIAGNOSTICS v_count = ROW_COUNT;

  UPDATE public.whatsapp_broadcasts
  SET total_contacts = v_count
  WHERE id = p_broadcast_id;

  RETURN v_count;
END;
$function$;

CREATE OR REPLACE FUNCTION public.request_quote_approval(p_quote_id uuid, p_sconto_richiesto_pct numeric, p_note text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_company_id UUID;
  v_total NUMERIC;
  v_margine NUMERIC;
  v_approval_id UUID;
BEGIN
  SELECT company_id, total, margine_pct_snapshot
    INTO v_company_id, v_total, v_margine
  FROM public.quotes WHERE id = p_quote_id;

  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'quote_not_found';
  END IF;

  INSERT INTO public.quote_approvals (
    company_id, quote_id, requested_by, sconto_richiesto_pct,
    importo_preventivo, margine_stimato_pct, note_richiesta
  ) VALUES (
    v_company_id, p_quote_id, auth.uid(), p_sconto_richiesto_pct,
    COALESCE(v_total,0), v_margine, p_note
  )
  RETURNING id INTO v_approval_id;

  UPDATE public.quotes
     SET approval_status = 'pending',
         sconto_richiesto_pct = p_sconto_richiesto_pct,
         status = CASE WHEN status = 'bozza' THEN 'bozza' ELSE status END
   WHERE id = p_quote_id;

  -- Notifica a tutti gli admin della company
  INSERT INTO public.notifications (company_id, user_id, type, title, body, entity_type, entity_id, action_url)
  SELECT v_company_id, ur.user_id, 'quote_approval_requested',
         'Richiesta autorizzazione sconto preventivo',
         'Nuova richiesta di sconto ' || p_sconto_richiesto_pct || '% da autorizzare',
         'quote', p_quote_id,
         '/azienda/marketing/preventivi/approvazioni'
  FROM public.user_roles ur
  JOIN public.profiles p ON p.id = ur.user_id
  WHERE p.company_id = v_company_id
    AND ur.role = 'company_admin'
  UNION
  SELECT v_company_id, mca.user_id, 'quote_approval_requested',
         'Richiesta autorizzazione sconto preventivo',
         'Nuova richiesta di sconto ' || p_sconto_richiesto_pct || '% da autorizzare',
         'quote', p_quote_id,
         '/azienda/marketing/preventivi/approvazioni'
  FROM public.multi_company_access mca
  WHERE mca.company_id = v_company_id
    AND mca.status = 'active'
    AND mca.access_role::text = 'company_admin';

  RETURN v_approval_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.cg_get_aging(p_company_id uuid DEFAULT NULL::uuid, p_direction text DEFAULT 'out'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_company_id uuid;
  v_oggi       date := current_date;
  v_result     jsonb;
BEGIN
  v_company_id := COALESCE(p_company_id, public.get_my_company_id());
  IF v_company_id IS NULL THEN RAISE EXCEPTION 'company_id non risolvibile'; END IF;
  IF v_company_id <> public.get_my_company_id()
     AND NOT public.has_role(auth.uid(), 'super_admin'::public.app_role) THEN
    RAISE EXCEPTION 'Accesso negato';
  END IF;

  WITH dovuto AS (
    SELECT s.id,
           s.description,
           s.due_date,
           s.amount - COALESCE(s.paid_amount, 0) AS residuo,
           s.supplier_id,
           s.contact_id,
           CASE
             WHEN s.due_date >= v_oggi THEN 'a_scadere'
             WHEN v_oggi - s.due_date BETWEEN 1 AND 30  THEN 'sc_30'
             WHEN v_oggi - s.due_date BETWEEN 31 AND 60 THEN 'sc_60'
             WHEN v_oggi - s.due_date BETWEEN 61 AND 90 THEN 'sc_90'
             ELSE 'sc_oltre'
           END AS fascia
    FROM public.scadenze s
    WHERE s.company_id = v_company_id
      AND s.direction = p_direction
      AND s.status NOT IN ('paid','cancelled')
      AND (s.amount - COALESCE(s.paid_amount, 0)) > 0
  ),
  totali AS (
    SELECT
      COALESCE(sum(residuo) FILTER (WHERE fascia = 'a_scadere'), 0) AS a_scadere,
      COALESCE(sum(residuo) FILTER (WHERE fascia = 'sc_30'),     0) AS sc_30,
      COALESCE(sum(residuo) FILTER (WHERE fascia = 'sc_60'),     0) AS sc_60,
      COALESCE(sum(residuo) FILTER (WHERE fascia = 'sc_90'),     0) AS sc_90,
      COALESCE(sum(residuo) FILTER (WHERE fascia = 'sc_oltre'),  0) AS sc_oltre,
      count(*) AS n_aperte,
      count(*) FILTER (WHERE fascia <> 'a_scadere') AS n_scadute
    FROM dovuto
  ),
  righe AS (
    SELECT jsonb_agg(jsonb_build_object(
              'id',          d.id,
              'descrizione', d.description,
              'due_date',    d.due_date,
              'residuo',     d.residuo,
              'fascia',      d.fascia,
              'controparte', COALESCE(s.name, c.company_name, NULLIF(trim(COALESCE(c.first_name, '') || ' ' || COALESCE(c.last_name, '')), ''))
           ) ORDER BY d.due_date ASC) AS items
    FROM dovuto d
    LEFT JOIN public.suppliers s ON s.id = d.supplier_id
    LEFT JOIN public.marketing_contacts c ON c.id = d.contact_id
  )
  SELECT jsonb_build_object(
    'direction',  p_direction,
    'totale',     (a_scadere + sc_30 + sc_60 + sc_90 + sc_oltre),
    'totale_scaduto', (sc_30 + sc_60 + sc_90 + sc_oltre),
    'fasce', jsonb_build_object(
      'a_scadere', a_scadere,
      'sc_30',     sc_30,
      'sc_60',     sc_60,
      'sc_90',     sc_90,
      'sc_oltre',  sc_oltre
    ),
    'n_aperte',   n_aperte,
    'n_scadute',  n_scadute,
    'righe',      COALESCE((SELECT items FROM righe), '[]'::jsonb)
  ) INTO v_result FROM totali;

  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.check_plan_limit(p_company_id uuid, p_resource_type text, p_increment integer DEFAULT 1)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_plan_name text; v_max_value integer; v_current integer := 0;
  v_allowed boolean; v_override integer; v_origine text;
BEGIN
  IF NOT public.user_can_access_company(p_company_id) THEN
    RAISE EXCEPTION 'Accesso negato' USING ERRCODE = '42501';
  END IF;

  SELECT sp.name,
         CASE p_resource_type
           WHEN 'orders' THEN sp.max_orders WHEN 'users' THEN sp.max_users
           WHEN 'storage_mb' THEN sp.max_storage_mb ELSE -1 END
    INTO v_plan_name, v_max_value
    FROM company_subscriptions cs
    JOIN subscription_plans sp ON sp.id = cs.plan_id
   WHERE cs.company_id = p_company_id AND cs.status = 'active'
   ORDER BY cs.created_at DESC LIMIT 1;

  IF v_plan_name IS NOT NULL THEN
    v_origine := 'abbonamento';
  ELSE
    -- Il piano che vale per le 15 aziende su 17 senza abbonamento formale.
    SELECT sp.name,
           CASE p_resource_type
             WHEN 'orders' THEN sp.max_orders WHEN 'users' THEN sp.max_users
             WHEN 'storage_mb' THEN sp.max_storage_mb ELSE -1 END
      INTO v_plan_name, v_max_value
      FROM companies c
      JOIN subscription_plans sp ON sp.id = c.subscription_plan_id
     WHERE c.id = p_company_id;
    v_origine := 'piano assegnato';
  END IF;

  IF v_plan_name IS NULL THEN
    RETURN jsonb_build_object('allowed', true, 'current', 0, 'limit', -1,
      'plan_name', 'nessun piano', 'origine', 'nessuna', 'percentuale', 0,
      'vicino_al_limite', false);
  END IF;

  SELECT CASE p_resource_type WHEN 'orders' THEN custom_max_orders ELSE NULL END
    INTO v_override FROM company_billing_overrides WHERE company_id = p_company_id;
  IF v_override IS NOT NULL THEN
    v_max_value := v_override;
    v_origine := v_origine || ' + override';
  END IF;

  IF v_max_value IS NULL OR v_max_value = -1 THEN
    RETURN jsonb_build_object('allowed', true, 'current', 0, 'limit', -1,
      'plan_name', v_plan_name, 'origine', v_origine, 'percentuale', 0,
      'vicino_al_limite', false);
  END IF;

  IF p_resource_type = 'orders' THEN
    SELECT COUNT(*)::integer INTO v_current FROM orders WHERE company_id = p_company_id;
  ELSIF p_resource_type = 'users' THEN
    SELECT COUNT(*)::integer INTO v_current FROM profiles WHERE company_id = p_company_id;
  ELSIF p_resource_type = 'storage_mb' THEN
    v_current := public.company_storage_mb(p_company_id);
  ELSIF p_resource_type = 'customers' THEN
    SELECT COUNT(*)::integer INTO v_current FROM profiles p
      WHERE p.company_id = p_company_id
        AND EXISTS (SELECT 1 FROM user_roles ur WHERE ur.user_id = p.id AND ur.role = 'customer');
  END IF;

  v_allowed := (v_current + p_increment) <= v_max_value;

  RETURN jsonb_build_object('allowed', v_allowed, 'current', v_current, 'limit', v_max_value,
    'plan_name', v_plan_name, 'origine', v_origine,
    'percentuale', round(100.0 * v_current / NULLIF(v_max_value, 0)),
    'vicino_al_limite', (v_current::numeric / NULLIF(v_max_value, 0)) >= 0.8);
END;
$function$;

CREATE OR REPLACE FUNCTION public.ai_test_lab_kpi(p_company_id uuid, p_from timestamp with time zone DEFAULT (now() - '30 days'::interval), p_to timestamp with time zone DEFAULT now())
 RETURNS TABLE(feature text, model_id text, provider text, total_calls bigint, avg_cost_usd numeric, total_cost_usd numeric, avg_latency_ms numeric, p50_latency_ms numeric, p95_latency_ms numeric, avg_input_tokens numeric, avg_output_tokens numeric, avg_rating numeric, ratings_count bigint, errors_count bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_demo_company_id uuid := '778a2c76-1253-49f2-a5e8-283363ac3e29'::uuid;
  v_caller_company_id uuid;
BEGIN
  PERFORM public.assert_company_access(p_company_id);
  -- Defense 1: solo Demo Azienda è valida
  IF p_company_id IS DISTINCT FROM v_demo_company_id THEN
    RETURN; -- 0 righe per qualunque company non-demo
  END IF;

  -- Defense 2: il caller deve essere effettivamente nella demo company
  SELECT p.company_id INTO v_caller_company_id
    FROM public.profiles p
    WHERE p.id = auth.uid()
    LIMIT 1;

  IF v_caller_company_id IS DISTINCT FROM v_demo_company_id THEN
    RETURN; -- 0 righe per caller non-demo (anche se passa company_id corretto)
  END IF;

  -- OK, ritorna i KPI
  RETURN QUERY
  SELECT
    a.feature,
    a.model_id,
    a.provider,
    count(*)::bigint AS total_calls,
    ROUND(avg(a.cost_usd)::numeric, 6) AS avg_cost_usd,
    ROUND(sum(a.cost_usd)::numeric, 4) AS total_cost_usd,
    ROUND(avg(a.latency_ms)::numeric, 0) AS avg_latency_ms,
    percentile_cont(0.50) WITHIN GROUP (ORDER BY a.latency_ms)::numeric AS p50_latency_ms,
    percentile_cont(0.95) WITHIN GROUP (ORDER BY a.latency_ms)::numeric AS p95_latency_ms,
    ROUND(avg(a.input_tokens)::numeric, 0) AS avg_input_tokens,
    ROUND(avg(a.output_tokens)::numeric, 0) AS avg_output_tokens,
    ROUND(avg(a.user_rating)::numeric, 2) AS avg_rating,
    count(*) FILTER (WHERE a.user_rating IS NOT NULL)::bigint AS ratings_count,
    count(*) FILTER (WHERE a.error IS NOT NULL)::bigint AS errors_count
  FROM public.ai_test_runs a
  WHERE a.company_id = p_company_id
    AND a.created_at >= p_from
    AND a.created_at <= p_to
  GROUP BY a.feature, a.model_id, a.provider
  ORDER BY total_calls DESC, total_cost_usd DESC;
END;
$function$;

CREATE OR REPLACE FUNCTION public.generate_referral_code_secure()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_code text;
BEGIN
  FOR i IN 1..20 LOOP
    v_code := upper(substr(encode(extensions.gen_random_bytes(9), 'base64'), 1, 10));
    v_code := regexp_replace(v_code, '[^A-Z0-9]', '', 'g');
    v_code := replace(replace(v_code, 'O', 'X'), '0', '9');
    v_code := substr(v_code || upper(substr(encode(extensions.gen_random_bytes(6), 'hex'), 1, 6)), 1, 10);

    IF NOT EXISTS (SELECT 1 FROM public.referrers WHERE referral_code = v_code) THEN
      RETURN v_code;
    END IF;
  END LOOP;

  RAISE EXCEPTION 'Unable to generate unique referral code';
END;
$function$;

CREATE OR REPLACE FUNCTION public.check_referral_fraud(p_referrer_id uuid, p_company_id uuid, p_ip_address text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  v_result           JSONB    := '{"ok": true}'::JSONB;
  v_referrer_email   TEXT;
  v_company_email    TEXT;
  v_existing_count   INTEGER;
BEGIN
  PERFORM public.assert_company_access(p_company_id);
  -- Check 1: Self-referral (stesso email)
  SELECT email INTO v_referrer_email FROM referrers WHERE id = p_referrer_id;

  SELECT u.email INTO v_company_email
    FROM companies c
    JOIN auth.users u ON u.id = c.titolare_user_id
   WHERE c.id = p_company_id;

  IF LOWER(v_referrer_email) = LOWER(v_company_email) THEN
    INSERT INTO referral_fraud_log(referrer_id, company_id, fraud_type, details)
    VALUES(p_referrer_id, p_company_id, 'self_referral',
           jsonb_build_object('referrer_email', v_referrer_email));
    RETURN '{"ok": false, "reason": "self_referral"}'::JSONB;
  END IF;

  -- Check 2: Stessa company già referenziata da questo referrer
  SELECT COUNT(*) INTO v_existing_count
    FROM referral_companies
   WHERE referrer_id = p_referrer_id AND company_id = p_company_id;

  IF v_existing_count > 0 THEN
    RETURN '{"ok": false, "reason": "duplicate_referral"}'::JSONB;
  END IF;

  -- Check 3: IP duplication (stesso IP con >2 conversioni per questo referrer in 30gg)
  IF p_ip_address IS NOT NULL THEN
    SELECT COUNT(*) INTO v_existing_count
      FROM referral_clicks rc
      JOIN referral_companies rco ON rco.referrer_id = rc.referrer_id
     WHERE rc.referrer_id = p_referrer_id
       AND rc.ip_address  = p_ip_address
       AND rc.created_at >= NOW() - INTERVAL '30 days';

    IF v_existing_count >= 3 THEN
      INSERT INTO referral_fraud_log(referrer_id, company_id, fraud_type, details)
      VALUES(p_referrer_id, p_company_id, 'ip_duplication',
             jsonb_build_object('ip', p_ip_address, 'count', v_existing_count));
      RETURN '{"ok": false, "reason": "ip_duplication"}'::JSONB;
    END IF;
  END IF;

  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.partner_submit_referral_payout_details(p_name text, p_phone text, p_partner_type text, p_payout_method text, p_iban text, p_account_holder text, p_bank text, p_fiscal_code text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_referrer public.referrers%ROWTYPE;
  v_current jsonb;
  v_next jsonb;
  v_bank_changed boolean;
  v_next_bank_status text;
BEGIN
  SELECT *
  INTO v_referrer
  FROM public.referrers
  WHERE user_id = auth.uid()
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_referrer.id IS NULL THEN
    RAISE EXCEPTION 'Profilo partner non trovato';
  END IF;

  IF COALESCE(trim(p_name), '') = '' THEN
    RAISE EXCEPTION 'Nome partner obbligatorio';
  END IF;

  IF COALESCE(p_payout_method, 'bank_transfer') = 'bank_transfer' THEN
    IF COALESCE(trim(p_iban), '') = '' OR COALESCE(trim(p_account_holder), '') = '' THEN
      RAISE EXCEPTION 'IBAN e intestatario sono obbligatori';
    END IF;
  END IF;

  v_current := COALESCE(v_referrer.payout_details, '{}'::jsonb);
  v_bank_changed :=
    COALESCE(upper(replace(p_iban, ' ', '')), '') <> COALESCE(v_current->>'iban', '')
    OR COALESCE(trim(p_account_holder), '') <> COALESCE(v_current->>'account_holder', '')
    OR COALESCE(trim(p_bank), '') <> COALESCE(v_current->>'bank', '')
    OR COALESCE(trim(p_fiscal_code), '') <> COALESCE(v_current->>'fiscal_code', '');

  v_next_bank_status := CASE
    WHEN COALESCE(p_payout_method, 'bank_transfer') <> 'bank_transfer' THEN COALESCE(v_current #>> '{bank_verification,status}', 'missing')
    WHEN v_bank_changed OR COALESCE(v_current #>> '{bank_verification,status}', '') IN ('', 'draft', 'rejected') THEN 'pending'
    ELSE COALESCE(v_current #>> '{bank_verification,status}', 'pending')
  END;

  v_next := jsonb_set(
    v_current,
    '{iban}',
    COALESCE(to_jsonb(NULLIF(upper(replace(COALESCE(p_iban, ''), ' ', '')), '')), 'null'::jsonb),
    true
  );
  v_next := jsonb_set(
    v_next,
    '{account_holder}',
    COALESCE(to_jsonb(NULLIF(trim(COALESCE(p_account_holder, '')), '')), 'null'::jsonb),
    true
  );
  v_next := jsonb_set(
    v_next,
    '{bank}',
    COALESCE(to_jsonb(NULLIF(trim(COALESCE(p_bank, '')), '')), 'null'::jsonb),
    true
  );
  v_next := jsonb_set(
    v_next,
    '{fiscal_code}',
    COALESCE(to_jsonb(NULLIF(trim(COALESCE(p_fiscal_code, '')), '')), 'null'::jsonb),
    true
  );
  v_next := jsonb_set(
    v_next,
    '{bank_verification}',
    jsonb_build_object(
      'status', v_next_bank_status,
      'submitted_at', CASE WHEN v_next_bank_status = 'pending' THEN now()::text ELSE v_current #>> '{bank_verification,submitted_at}' END,
      'verified_at', CASE WHEN v_next_bank_status = 'verified' THEN COALESCE(v_current #>> '{bank_verification,verified_at}', now()::text) ELSE NULL END,
      'rejected_at', NULL,
      'reviewed_by', CASE WHEN v_next_bank_status = 'verified' THEN v_current #>> '{bank_verification,reviewed_by}' ELSE NULL END,
      'rejection_reason', NULL
    ),
    true
  );

  UPDATE public.referrers
  SET
    name = trim(p_name),
    phone = NULLIF(trim(COALESCE(p_phone, '')), ''),
    partner_type = COALESCE(NULLIF(trim(p_partner_type), ''), partner_type),
    payout_method = COALESCE(NULLIF(trim(p_payout_method), ''), 'bank_transfer'),
    payout_details = v_next
  WHERE id = v_referrer.id;

  RETURN jsonb_build_object('bank_status', v_next_bank_status, 'bank_changed', v_bank_changed);
END;
$function$;

CREATE OR REPLACE FUNCTION public.calculate_monthly_commissions(p_month integer, p_year integer)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  v_referrer       RECORD;
  v_company        RECORD;
  v_plan_mrr       NUMERIC;
  v_plan_comm      NUMERIC;
  v_addon_total    NUMERIC;
  v_addon_comm     NUMERIC;
  v_plan_pct       NUMERIC;
  v_addon_pct      NUMERIC;
  v_multiplier     NUMERIC;
  v_usage          NUMERIC;
  v_usage_comm     NUMERIC;
  v_usage_pct      NUMERIC;
  v_period_start   TIMESTAMPTZ;
  v_period_end     TIMESTAMPTZ;
  v_count          INTEGER := 0;
BEGIN
  IF NOT public.is_platform_staff() THEN
    RAISE EXCEPTION 'Accesso riservato allo staff di piattaforma' USING ERRCODE = '42501';
  END IF;

  v_period_start := make_date(p_year, p_month, 1)::TIMESTAMPTZ;
  v_period_end   := (make_date(p_year, p_month, 1) + INTERVAL '1 month')::TIMESTAMPTZ;

  FOR v_referrer IN
    SELECT r.*,
           COALESCE(rt.commission_multiplier, 1.00)   AS tier_multiplier,
           COALESCE(rt.commission_plan_pct,  20.0)     AS tier_plan_pct,
           COALESCE(rt.commission_addon_pct,  5.0)     AS tier_addon_pct,
           COALESCE(rt.commission_on_usage, false)     AS on_usage,
           COALESCE(rt.usage_commission_pct, 5.0)      AS tier_usage_pct
    FROM referrers r
    LEFT JOIN referral_tiers rt ON r.tier_id = rt.id
    WHERE r.is_active = true
  LOOP
    v_plan_pct  := v_referrer.tier_plan_pct;
    v_addon_pct := v_referrer.tier_addon_pct;
    v_multiplier := COALESCE(v_referrer.tier_multiplier, 1.00);

    -- ── Plan-based commissions ──────────────────────────────────
    FOR v_company IN
      SELECT rc.company_id, sp.price_monthly, sp.name AS plan_name
      FROM referral_companies rc
      JOIN companies c ON rc.company_id = c.id
      JOIN subscription_plans sp ON c.subscription_plan_id = sp.id
      WHERE rc.referrer_id = v_referrer.id
        AND rc.is_active = true
        AND c.status = 'active'
    LOOP
      v_plan_mrr := COALESCE(v_company.price_monthly, 0);

      -- Plan commission: tier plan_pct * multiplier
      v_plan_comm := ROUND(v_plan_mrr * (v_plan_pct / 100) * v_multiplier, 2);

      -- Addon commission: sum active add-on prices for this company
      SELECT COALESCE(SUM(pff.price_per_month), 0)
      INTO v_addon_total
      FROM public.company_feature_overrides cfo
      JOIN public.platform_feature_flags pff ON pff.key = cfo.feature_key
      WHERE cfo.company_id = v_company.company_id
        AND cfo.is_enabled = true
        AND pff.category = 'addon'
        AND pff.price_per_month IS NOT NULL
        AND (cfo.expires_at IS NULL OR cfo.expires_at > now());

      v_addon_comm := ROUND(v_addon_total * (v_addon_pct / 100) * v_multiplier, 2);

      INSERT INTO referral_commission_ledger (
        referrer_id, company_id, period_month, period_year,
        subscription_plan_name, plan_mrr,
        commission_type, commission_rate, tier_multiplier, commission_amount,
        status
      ) VALUES (
        v_referrer.id, v_company.company_id, p_month, p_year,
        v_company.plan_name, v_plan_mrr,
        'percentage', v_plan_pct,
        v_multiplier, v_plan_comm + v_addon_comm,
        'pending'
      )
      ON CONFLICT (referrer_id, company_id, period_month, period_year)
      DO UPDATE SET
        plan_mrr               = EXCLUDED.plan_mrr,
        commission_amount      = EXCLUDED.commission_amount,
        commission_rate        = EXCLUDED.commission_rate,
        tier_multiplier        = EXCLUDED.tier_multiplier,
        subscription_plan_name = EXCLUDED.subscription_plan_name,
        calculated_at          = now();

      v_count := v_count + 1;
    END LOOP;

    -- ── Usage-based commissions ─────────────────────────────────
    IF v_referrer.on_usage THEN
      v_usage_pct := COALESCE(v_referrer.tier_usage_pct, 5.0);

      FOR v_company IN
        SELECT rc.company_id
        FROM referral_companies rc
        WHERE rc.referrer_id = v_referrer.id
          AND rc.is_active = true
      LOOP
        SELECT COALESCE(
          (
            SELECT SUM(ABS(ecl.amount_eur))
            FROM email_credits_log ecl
            WHERE ecl.company_id = v_company.company_id
              AND ecl.type = 'deduct'
              AND ecl.created_at >= v_period_start
              AND ecl.created_at <  v_period_end
          ), 0
        ) +
        COALESCE(
          (
            SELECT SUM(ABS(wcl.amount_eur))
            FROM whatsapp_credits_log wcl
            WHERE wcl.company_id = v_company.company_id
              AND wcl.type = 'deduct'
              AND wcl.created_at >= v_period_start
              AND wcl.created_at <  v_period_end
          ), 0
        ) +
        COALESCE(
          (
            SELECT SUM(acu.cost_billed_total)
            FROM ai_credit_usage acu
            WHERE acu.company_id = v_company.company_id
              AND acu.created_at >= v_period_start
              AND acu.created_at <  v_period_end
          ), 0
        )
        INTO v_usage;

        IF v_usage > 0 THEN
          v_usage_comm := ROUND(v_usage * v_usage_pct / 100, 4);

          INSERT INTO referral_commission_ledger (
            referrer_id, company_id, period_month, period_year,
            subscription_plan_name, plan_mrr,
            commission_type, commission_rate, tier_multiplier, commission_amount,
            status
          ) VALUES (
            v_referrer.id, v_company.company_id, p_month, p_year,
            'usage_commission', v_usage,
            'usage', v_usage_pct,
            1.0, v_usage_comm,
            'pending'
          )
          ON CONFLICT (referrer_id, company_id, period_month, period_year)
          DO UPDATE SET
            commission_amount = referral_commission_ledger.commission_amount + v_usage_comm,
            plan_mrr          = EXCLUDED.plan_mrr,
            calculated_at     = now();

          v_count := v_count + 1;
        END IF;
      END LOOP;
    END IF;

    -- Update total_earned for this referrer
    UPDATE referrers SET
      total_earned = (
        SELECT COALESCE(SUM(commission_amount), 0)
        FROM referral_commission_ledger
        WHERE referrer_id = v_referrer.id AND status != 'cancelled'
      )
    WHERE id = v_referrer.id;

  END LOOP;

  RETURN v_count;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_ai_economics_dashboard(p_period text DEFAULT 'mese'::text, p_company_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_since         TIMESTAMPTZ;
  v_since_prev    TIMESTAMPTZ;
  v_until_prev    TIMESTAMPTZ;
  v_kpi           JSONB;
  v_kpi_prev      JSONB;
  v_by_provider   JSONB;
  v_by_model      JSONB;
  v_by_company    JSONB;
  v_by_task       JSONB;
  v_daily_trend   JSONB;
  v_render        JSONB;
  v_data_quality  JSONB;
  v_topup         JSONB;
  v_coverage      JSONB;
  v_reconciliation JSONB;
  v_is_super      BOOLEAN;
BEGIN
  v_is_super := EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role = 'super_admin'
  );

  IF NOT v_is_super AND p_company_id IS NULL THEN
    RAISE EXCEPTION 'Permesso negato: solo super_admin può vedere dati globali (p_company_id=NULL)'
      USING ERRCODE = '42501';
  END IF;

  v_since := CASE p_period
    WHEN 'oggi'      THEN now()::date
    WHEN 'settimana' THEN now() - interval '7 days'
    WHEN 'mese'      THEN now() - interval '30 days'
    WHEN 'anno'      THEN now() - interval '365 days'
    ELSE '1970-01-01'::timestamptz
  END;

  v_since_prev := v_since - (now() - v_since);
  v_until_prev := v_since;

  -- KPI corrente
  SELECT jsonb_build_object(
    'cost_real_eur',   COALESCE(SUM(cost_real_eur), 0),
    'cost_billed_eur', COALESCE(SUM(cost_billed_eur), 0),
    'margin_eur',      COALESCE(SUM(margin_eur), 0),
    'margin_pct',      CASE WHEN COALESCE(SUM(cost_billed_eur), 0) > 0
                        THEN ROUND(SUM(margin_eur) / SUM(cost_billed_eur) * 100, 2)
                        ELSE 0 END,
    'n_calls',         COUNT(*),
    'n_companies',     COUNT(DISTINCT company_id) FILTER (WHERE company_id IS NOT NULL),
    'tokens_total',    COALESCE(SUM(tokens_total), 0),
    'avg_cost_per_call_eur', CASE WHEN COUNT(*) > 0
                        THEN ROUND(SUM(cost_billed_eur)::NUMERIC / COUNT(*), 6)
                        ELSE 0 END
  ) INTO v_kpi
  FROM public.ai_model_usage_log
  WHERE ts >= v_since AND ok = true AND credits_deducted = true
    AND (p_company_id IS NULL OR company_id = p_company_id);

  -- KPI periodo precedente
  SELECT jsonb_build_object(
    'cost_real_eur',   COALESCE(SUM(cost_real_eur), 0),
    'cost_billed_eur', COALESCE(SUM(cost_billed_eur), 0),
    'margin_eur',      COALESCE(SUM(margin_eur), 0),
    'n_calls',         COUNT(*)
  ) INTO v_kpi_prev
  FROM public.ai_model_usage_log
  WHERE ts >= v_since_prev AND ts < v_until_prev
    AND ok = true AND credits_deducted = true
    AND (p_company_id IS NULL OR company_id = p_company_id);

  -- By provider
  SELECT jsonb_agg(row_obj ORDER BY cost_real_eur DESC) INTO v_by_provider
  FROM (
    SELECT jsonb_build_object(
      'provider',        COALESCE(provider_used, split_part(model_used, '/', 1), 'unknown'),
      'n_calls',         COUNT(*),
      'cost_real_eur',   ROUND(COALESCE(SUM(cost_real_eur), 0)::NUMERIC, 4),
      'cost_billed_eur', ROUND(COALESCE(SUM(cost_billed_eur), 0)::NUMERIC, 4),
      'margin_eur',      ROUND(COALESCE(SUM(margin_eur), 0)::NUMERIC, 4),
      'margin_pct',      CASE WHEN COALESCE(SUM(cost_billed_eur), 0) > 0
                          THEN ROUND(SUM(margin_eur) / SUM(cost_billed_eur) * 100, 1)
                          ELSE 0 END,
      'tokens_total',    COALESCE(SUM(tokens_total), 0),
      'avg_markup_x',    CASE WHEN COALESCE(SUM(cost_real_eur), 0) > 0
                          THEN ROUND(SUM(cost_billed_eur) / SUM(cost_real_eur), 2)
                          ELSE 0 END
    ) AS row_obj,
    COALESCE(SUM(cost_real_eur), 0) AS cost_real_eur
    FROM public.ai_model_usage_log
    WHERE ts >= v_since AND ok = true AND credits_deducted = true
      AND (p_company_id IS NULL OR company_id = p_company_id)
    GROUP BY COALESCE(provider_used, split_part(model_used, '/', 1), 'unknown')
  ) sub;

  -- By model
  SELECT jsonb_agg(row_obj ORDER BY cost_real_eur DESC) INTO v_by_model
  FROM (
    SELECT jsonb_build_object(
      'model_used',      model_used,
      'provider',        split_part(model_used, '/', 1),
      'n_calls',         COUNT(*),
      'cost_real_eur',   ROUND(COALESCE(SUM(cost_real_eur), 0)::NUMERIC, 4),
      'cost_billed_eur', ROUND(COALESCE(SUM(cost_billed_eur), 0)::NUMERIC, 4),
      'margin_eur',      ROUND(COALESCE(SUM(margin_eur), 0)::NUMERIC, 4),
      'margin_pct',      CASE WHEN COALESCE(SUM(cost_billed_eur), 0) > 0
                          THEN ROUND(SUM(margin_eur) / SUM(cost_billed_eur) * 100, 1)
                          ELSE 0 END,
      'avg_markup_x',    CASE WHEN COALESCE(SUM(cost_real_eur), 0) > 0
                          THEN ROUND(SUM(cost_billed_eur) / SUM(cost_real_eur), 2)
                          ELSE 0 END,
      'avg_cost_per_call_usd', ROUND(AVG(cost_usd)::NUMERIC, 8),
      'avg_tokens',      ROUND(AVG(tokens_total))
    ) AS row_obj,
    COALESCE(SUM(cost_real_eur), 0) AS cost_real_eur
    FROM public.ai_model_usage_log
    WHERE ts >= v_since AND ok = true AND credits_deducted = true
      AND (p_company_id IS NULL OR company_id = p_company_id)
    GROUP BY model_used
    ORDER BY COALESCE(SUM(cost_real_eur), 0) DESC
    LIMIT 20
  ) sub;

  -- By company
  SELECT jsonb_agg(row_obj ORDER BY cost_billed_eur DESC) INTO v_by_company
  FROM (
    SELECT jsonb_build_object(
      'company_id',      l.company_id,
      'company_name',    COALESCE(c.name, 'Sconosciuta'),
      'n_calls',         COUNT(*),
      'cost_real_eur',   ROUND(COALESCE(SUM(l.cost_real_eur), 0)::NUMERIC, 4),
      'cost_billed_eur', ROUND(COALESCE(SUM(l.cost_billed_eur), 0)::NUMERIC, 4),
      'margin_eur',      ROUND(COALESCE(SUM(l.margin_eur), 0)::NUMERIC, 4),
      'margin_pct',      CASE WHEN COALESCE(SUM(l.cost_billed_eur), 0) > 0
                          THEN ROUND(SUM(l.margin_eur) / SUM(l.cost_billed_eur) * 100, 1)
                          ELSE 0 END
    ) AS row_obj,
    COALESCE(SUM(l.cost_billed_eur), 0) AS cost_billed_eur
    FROM public.ai_model_usage_log l
    LEFT JOIN public.companies c ON c.id = l.company_id
    WHERE l.ts >= v_since AND l.ok = true AND l.credits_deducted = true
      AND l.company_id IS NOT NULL
      AND (p_company_id IS NULL OR l.company_id = p_company_id)
    GROUP BY l.company_id, c.name
    ORDER BY COALESCE(SUM(l.cost_billed_eur), 0) DESC
    LIMIT 10
  ) sub;

  -- By task
  SELECT jsonb_agg(row_obj ORDER BY cost_billed_eur DESC) INTO v_by_task
  FROM (
    SELECT jsonb_build_object(
      'task_kind',       l.task_kind,
      'display_label',   COALESCE(
        (SELECT display_label FROM public.ai_pricing_markup pm
         WHERE pm.task_kind = l.task_kind AND pm.model_pattern IS NULL LIMIT 1),
        l.task_kind
      ),
      'n_calls',         COUNT(*),
      'cost_real_eur',   ROUND(COALESCE(SUM(l.cost_real_eur), 0)::NUMERIC, 4),
      'cost_billed_eur', ROUND(COALESCE(SUM(l.cost_billed_eur), 0)::NUMERIC, 4),
      'margin_eur',      ROUND(COALESCE(SUM(l.margin_eur), 0)::NUMERIC, 4),
      'margin_pct',      CASE WHEN COALESCE(SUM(l.cost_billed_eur), 0) > 0
                          THEN ROUND(SUM(l.margin_eur) / SUM(l.cost_billed_eur) * 100, 1)
                          ELSE 0 END
    ) AS row_obj,
    COALESCE(SUM(l.cost_billed_eur), 0) AS cost_billed_eur
    FROM public.ai_model_usage_log l
    WHERE l.ts >= v_since AND l.ok = true AND l.credits_deducted = true
      AND (p_company_id IS NULL OR l.company_id = p_company_id)
    GROUP BY l.task_kind
  ) sub;

  -- Daily trend
  SELECT jsonb_agg(row_obj ORDER BY day) INTO v_daily_trend
  FROM (
    SELECT jsonb_build_object(
      'day',             DATE_TRUNC('day', ts)::date,
      'n_calls',         COUNT(*),
      'cost_real_eur',   ROUND(COALESCE(SUM(cost_real_eur), 0)::NUMERIC, 4),
      'cost_billed_eur', ROUND(COALESCE(SUM(cost_billed_eur), 0)::NUMERIC, 4),
      'margin_eur',      ROUND(COALESCE(SUM(margin_eur), 0)::NUMERIC, 4)
    ) AS row_obj,
    DATE_TRUNC('day', ts)::date AS day
    FROM public.ai_model_usage_log
    WHERE ts >= now() - interval '30 days'
      AND ok = true AND credits_deducted = true
      AND (p_company_id IS NULL OR company_id = p_company_id)
    GROUP BY DATE_TRUNC('day', ts)
  ) sub;

  -- ─────────────────────────────────────────────────────────────────────
  -- RENDER ECONOMICS — schema reale verificato:
  --   render_sessions.cost_real_total / cost_billed / revenue_eur / margin_eur
  --   render_credit_ledger.delta (in CREDITI int) / revenue_eur / reason
  -- ─────────────────────────────────────────────────────────────────────
  BEGIN
    EXECUTE $RENDER$
      WITH ledger AS (
        SELECT
          COUNT(*) FILTER (WHERE reason = 'consume')                       AS n_consumed,
          COALESCE(SUM(revenue_eur) FILTER (WHERE reason = 'consume'), 0)  AS revenue_consumed,
          COALESCE(SUM(revenue_eur) FILTER (WHERE reason = 'topup'), 0)    AS revenue_topup
        FROM public.render_credit_ledger
        WHERE created_at >= $1
          AND ($2::uuid IS NULL OR company_id = $2)
      ),
      sessions AS (
        SELECT
          COALESCE(SUM(cost_real_total), 0) AS cost_real_eur,
          COALESCE(SUM(cost_billed), 0)     AS cost_billed_eur,
          COUNT(*)                          AS n_sessions
        FROM public.render_sessions
        WHERE created_at >= $1
          AND ($2::uuid IS NULL OR company_id = $2)
      )
      SELECT jsonb_build_object(
        'n_renders',       COALESCE(s.n_sessions, l.n_consumed, 0),
        'cost_real_eur',   ROUND(s.cost_real_eur::numeric, 4),
        'cost_billed_eur', ROUND(s.cost_billed_eur::numeric, 4),
        -- margin_eur = cost_billed - cost_real (coerente con chat AI)
        'margin_eur',      ROUND((s.cost_billed_eur - s.cost_real_eur)::numeric, 4),
        'margin_pct',      CASE WHEN s.cost_billed_eur > 0
                            THEN ROUND(((s.cost_billed_eur - s.cost_real_eur) / s.cost_billed_eur * 100)::numeric, 1)
                            ELSE 0 END,
        -- revenue_eur = consumi reali ledger (cash effettivamente riconosciuto)
        'revenue_eur',     ROUND(l.revenue_consumed::numeric, 4),
        'topup_eur',       ROUND(l.revenue_topup::numeric, 4)
      )
      FROM ledger l, sessions s
    $RENDER$
    INTO v_render
    USING v_since, p_company_id;
  EXCEPTION
    WHEN undefined_table OR undefined_column THEN
      v_render := jsonb_build_object(
        'n_renders', 0, 'cost_real_eur', 0, 'cost_billed_eur', 0,
        'revenue_eur', 0, 'margin_eur', 0, 'margin_pct', 0, 'topup_eur', 0,
        'note', 'render schema non disponibile'
      );
  END;

  -- ─────────────────────────────────────────────────────────────────────
  -- TOPUP — ricariche AI dalle aziende (cash in)
  -- tipo IN ('ricarica', 'bonus') — nessun 'topup' nello schema attuale
  -- ─────────────────────────────────────────────────────────────────────
  SELECT jsonb_build_object(
    'n_topups',    COUNT(*) FILTER (WHERE tipo = 'ricarica'),
    'topup_eur',   COALESCE(SUM(crediti) FILTER (WHERE tipo = 'ricarica'), 0),
    'n_bonus',     COUNT(*) FILTER (WHERE tipo = 'bonus'),
    'bonus_eur',   COALESCE(SUM(crediti) FILTER (WHERE tipo = 'bonus'), 0),
    'n_companies', COUNT(DISTINCT company_id) FILTER (WHERE tipo IN ('ricarica','bonus'))
  ) INTO v_topup
  FROM public.ai_credit_transactions
  WHERE creato_il >= v_since
    AND (p_company_id IS NULL OR company_id = p_company_id);

  -- ─────────────────────────────────────────────────────────────────────
  -- DATA QUALITY
  -- ─────────────────────────────────────────────────────────────────────
  SELECT jsonb_build_object(
    'n_calls_total',     COUNT(*),
    'n_calls_real_cost', COUNT(*) FILTER (WHERE COALESCE(cost_is_estimated, false) = false),
    'n_calls_estimated', COUNT(*) FILTER (WHERE cost_is_estimated = true),
    'pct_real',          CASE WHEN COUNT(*) > 0
                          THEN ROUND(
                            COUNT(*) FILTER (WHERE COALESCE(cost_is_estimated, false) = false)::NUMERIC
                            / COUNT(*) * 100, 1)
                          ELSE 100 END
  ) INTO v_data_quality
  FROM public.ai_model_usage_log
  WHERE ts >= v_since AND ok = true AND credits_deducted = true
    AND (p_company_id IS NULL OR company_id = p_company_id);

  -- ─────────────────────────────────────────────────────────────────────
  -- COVERAGE — chiamate centralizzate vs dirette (cost leakage)
  -- ─────────────────────────────────────────────────────────────────────
  SELECT jsonb_build_object(
    'centralized', COUNT(*) FILTER (WHERE metadata->>'source' = 'ai_provider'),
    'direct',      COUNT(*) FILTER (WHERE COALESCE(metadata->>'source', '') != 'ai_provider'
                                        AND tipo = 'consumo_ai'),
    'pct_centralized', CASE
      WHEN COUNT(*) FILTER (WHERE tipo = 'consumo_ai') > 0
      THEN ROUND(
        COUNT(*) FILTER (WHERE metadata->>'source' = 'ai_provider')::NUMERIC
        / COUNT(*) FILTER (WHERE tipo = 'consumo_ai') * 100, 1)
      ELSE 100 END
  ) INTO v_coverage
  FROM public.ai_credit_transactions
  WHERE creato_il >= v_since
    AND (p_company_id IS NULL OR company_id = p_company_id);

  -- Reconciliation (se esiste)
  BEGIN
    EXECUTE 'SELECT jsonb_build_object(
      ''n_records'',         COUNT(*),
      ''total_variance_eur'', COALESCE(SUM(delta_eur), 0)
    ) FROM public.ai_provider_reconciliation
    WHERE created_at >= $1'
    INTO v_reconciliation
    USING v_since;
  EXCEPTION
    WHEN undefined_table OR undefined_column THEN
      v_reconciliation := jsonb_build_object('n_records', 0, 'total_variance_eur', 0);
  END;

  RETURN jsonb_build_object(
    'period',         p_period,
    'since',          v_since,
    'now',            now(),
    'kpi',            COALESCE(v_kpi, '{}'::jsonb),
    'kpi_prev',       COALESCE(v_kpi_prev, '{}'::jsonb),
    'by_provider',    COALESCE(v_by_provider, '[]'::jsonb),
    'by_model',       COALESCE(v_by_model, '[]'::jsonb),
    'by_company',     COALESCE(v_by_company, '[]'::jsonb),
    'by_task',        COALESCE(v_by_task, '[]'::jsonb),
    'daily_trend',    COALESCE(v_daily_trend, '[]'::jsonb),
    'render',         COALESCE(v_render, '{}'::jsonb),
    'topup',          COALESCE(v_topup, '{}'::jsonb),
    'data_quality',   COALESCE(v_data_quality, '{}'::jsonb),
    'coverage',       COALESCE(v_coverage, '{}'::jsonb),
    'reconciliation', COALESCE(v_reconciliation, '{}'::jsonb),
    'usd_eur_rate',   COALESCE(
      (SELECT NULLIF(value,'')::NUMERIC FROM public.platform_settings WHERE key='usd_eur_rate'),
      0.92
    ),
    'is_super_admin', v_is_super
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_industry_benchmark(p_metric_key text, p_company_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_segment jsonb;
  v_benchmark RECORD;
BEGIN
  PERFORM public.ai_assert_company_access(p_company_id);

  SELECT jsonb_build_object(
    'sector', COALESCE(c.sector, 'altro'),
    'area_macro', area_macro_from_region(c.region),
    'dimensione', dimensione_from_revenue_range(c.annual_revenue_range)
  ) INTO v_segment
  FROM public.companies c WHERE c.id = p_company_id;

  IF v_segment IS NULL THEN
    RETURN jsonb_build_object('available', false, 'reason', 'company_not_found');
  END IF;

  -- Il segmento sta in cluster_segment (jsonb); la soglia di anonimato è il
  -- campione minimo k=5 (non esiste una colonna is_publishable).
  SELECT *
  INTO v_benchmark
  FROM public.kb_aggregated_benchmarks b
  WHERE b.metric_key = p_metric_key
    AND b.sample_size >= 5
    AND b.cluster_segment->>'sector' = (v_segment->>'sector')
    AND b.cluster_segment->>'area_macro' = (v_segment->>'area_macro')
    AND b.cluster_segment->>'dimensione' = (v_segment->>'dimensione')
  ORDER BY b.data_period_end DESC NULLS LAST
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'available', false,
      'reason', 'insufficient_anonymous_sample',
      'k_min', 5,
      'segment', v_segment
    );
  END IF;

  RETURN jsonb_build_object(
    'available', true,
    'metric_key', v_benchmark.metric_key,
    'segment', v_segment,
    'sample_size', v_benchmark.sample_size,
    'median', v_benchmark.median,
    'p25', v_benchmark.p25,
    'p75', v_benchmark.p75,
    'period', jsonb_build_object('from', v_benchmark.data_period_start, 'to', v_benchmark.data_period_end),
    'computed_at', v_benchmark.computed_at
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.create_oda_from_order(p_company_id uuid, p_order_id uuid, p_supplier_id uuid, p_item_ids uuid[] DEFAULT NULL::uuid[])
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_po_id UUID;
  v_item RECORD;
BEGIN
  PERFORM public.assert_company_access(p_company_id);
  -- Create the purchase order (oda_number auto-assigned by trigger)
  INSERT INTO purchase_orders (company_id, supplier_id, order_id, created_by)
  VALUES (p_company_id, p_supplier_id, p_order_id, auth.uid())
  RETURNING id INTO v_po_id;

  -- Copy items (all or selected)
  FOR v_item IN
    SELECT * FROM order_items
    WHERE order_id = p_order_id
      AND (p_item_ids IS NULL OR id = ANY(p_item_ids))
  LOOP
    INSERT INTO purchase_order_items (
      company_id, purchase_order_id, order_item_id,
      description, quantity, unit_price, vat_rate, 
      discount_percent, unit_of_measure, sort_order
    ) VALUES (
      p_company_id, v_po_id, v_item.id,
      v_item.description, v_item.quantity, v_item.unit_price, 
      COALESCE(v_item.vat_rate, 22), 0, 
      'pz', v_item.position
    );
    
    -- Mark order item as ordered
    UPDATE order_items SET status = 'ordinato' WHERE id = v_item.id;
  END LOOP;

  RETURN v_po_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.decrement_scorta(p_id uuid, p_qty numeric)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
BEGIN
  UPDATE scorte_furgone
  SET quantita = GREATEST(0, quantita - p_qty),
      updated_at = NOW()
  WHERE id = p_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.silvio_admin_alerts_runner()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_alerts_created INT := 0;
  v_alerts_dedup   INT := 0;
  v_rec            RECORD;
BEGIN

  -- ─────────────────────────────────────────────────────────────────────
  -- 1. PAYMENT FAILED — subscription past_due/unpaid recente
  -- ─────────────────────────────────────────────────────────────────────
  BEGIN
    -- La tabella subscriptions non esiste più: il fallimento del pagamento lo
    -- registra il dunning sull'azienda (last_payment_failure_at).
    FOR v_rec IN
      SELECT c.id AS company_id, c.name AS company_name,
             c.id::text || ':' || to_char(c.last_payment_failure_at, 'YYYYMMDD') AS sub_id,
             COALESCE(c.stripe_subscription_status, c.dunning_status, 'pagamento_fallito') AS sub_status
      FROM public.companies c
      WHERE c.last_payment_failure_at >= now() - interval '24 hours'
        AND c.deleted_at IS NULL
    LOOP
      PERFORM public.silvio_admin_alert_upsert(
        'revenue',
        'critical',
        '🚨 Pagamento fallito: ' || COALESCE(v_rec.company_name, 'Sconosciuta'),
        'Subscription ' || v_rec.sub_status || ' — verificare carta cliente',
        'payment_failed:' || v_rec.sub_id,
        jsonb_build_object('type', 'company', 'id', v_rec.company_id, 'name', v_rec.company_name),
        'Manda email recovery + check carta scaduta'
      );
      v_alerts_created := v_alerts_created + 1;
    END LOOP;
  EXCEPTION WHEN undefined_table OR undefined_column THEN
    -- subscriptions table non disponibile, skip
    NULL;
  END;

  -- ─────────────────────────────────────────────────────────────────────
  -- 2. DEMO REQUEST RECENT — nuovo lead source=demo_request <30min
  --    FIX flood: SOLO source demo. L'`OR contact_type='lead'` originale
  --    alertava ogni contatto creato dallo scraper (~3k/giorno → 89k righe).
  -- ─────────────────────────────────────────────────────────────────────
  BEGIN
    FOR v_rec IN
      SELECT mc.id, mc.first_name, mc.last_name, mc.email, mc.company_name, mc.source
      FROM public.marketing_contacts mc
      WHERE mc.created_at >= now() - interval '30 minutes'
        AND mc.source ILIKE '%demo%'
    LOOP
      PERFORM public.silvio_admin_alert_upsert(
        'lead',
        'warning',
        '⚠️ Demo request: ' || COALESCE(v_rec.first_name || ' ' || v_rec.last_name, v_rec.email, 'Sconosciuto'),
        COALESCE(v_rec.company_name || ' — ', '') || 'arrivato negli ultimi 30 min via ' || COALESCE(v_rec.source, 'demo'),
        'demo_request:' || v_rec.id,
        jsonb_build_object('type', 'lead', 'id', v_rec.id, 'email', v_rec.email),
        'Contatta entro 1 ora — conversion rate scende del 60% dopo'
      );
      v_alerts_created := v_alerts_created + 1;
    END LOOP;
  EXCEPTION WHEN undefined_table OR undefined_column THEN
    NULL;
  END;

  -- ─────────────────────────────────────────────────────────────────────
  -- 3. LEAD SILENT HOT — lead score >80 e non contattato da >48h
  -- ─────────────────────────────────────────────────────────────────────
  BEGIN
    FOR v_rec IN
      SELECT mc.id, mc.first_name, mc.last_name, mc.company_name, mc.email,
             COALESCE(mc.ai_score, mc.lead_score, mc.score, 0) AS score_eff,
             mc.last_activity_at
      FROM public.marketing_contacts mc
      WHERE COALESCE(mc.ai_score, mc.lead_score, mc.score, 0) >= 80
        AND COALESCE(mc.last_activity_at, mc.created_at) <= now() - interval '48 hours'
        AND COALESCE(mc.last_activity_at, mc.created_at) >= now() - interval '14 days'  -- evita lead vecchissimi
        AND (mc.contact_type IS NULL OR mc.contact_type IN ('lead','prospect'))
      LIMIT 50
    LOOP
      PERFORM public.silvio_admin_alert_upsert(
        'lead',
        'warning',
        '🔥 Lead caldo silente: ' || COALESCE(v_rec.first_name || ' ' || v_rec.last_name, v_rec.email),
        'Score ' || v_rec.score_eff || ' · non contattato da ' ||
        ROUND(EXTRACT(EPOCH FROM (now() - COALESCE(v_rec.last_activity_at, now()))) / 86400) || ' giorni',
        'lead_silent_hot:' || v_rec.id,
        jsonb_build_object('type', 'lead', 'id', v_rec.id, 'score', v_rec.score_eff),
        'Manda follow-up oggi — score sta degradando'
      );
      v_alerts_created := v_alerts_created + 1;
    END LOOP;
  EXCEPTION WHEN undefined_table OR undefined_column THEN
    NULL;
  END;

  -- ─────────────────────────────────────────────────────────────────────
  -- 4. CHURN WARNING — cliente paying che non si logga da >14gg
  -- ─────────────────────────────────────────────────────────────────────
  BEGIN
    FOR v_rec IN
      SELECT
        c.id AS company_id,
        c.name AS company_name,
        MAX(u.last_sign_in_at) AS last_login,
        EXTRACT(EPOCH FROM (now() - MAX(u.last_sign_in_at))) / 86400 AS days_silent
      FROM public.companies c
      JOIN public.profiles p ON p.company_id = c.id
      JOIN auth.users u ON u.id = p.id
      LEFT JOIN public.company_subscriptions s ON s.company_id = c.id AND s.status = 'active'
      WHERE c.is_platform_admin_company = false
        AND s.id IS NOT NULL  -- è paying
      GROUP BY c.id, c.name
      HAVING MAX(u.last_sign_in_at) <= now() - interval '14 days'
         AND MAX(u.last_sign_in_at) IS NOT NULL
      LIMIT 30
    LOOP
      PERFORM public.silvio_admin_alert_upsert(
        'churn',
        'warning',
        '⚠️ Churn risk: ' || COALESCE(v_rec.company_name, 'Sconosciuta'),
        'Nessun login da ' || ROUND(v_rec.days_silent) || ' giorni — possibile abbandono',
        'churn_warning:' || v_rec.company_id,
        jsonb_build_object('type', 'company', 'id', v_rec.company_id, 'name', v_rec.company_name, 'days_silent', v_rec.days_silent),
        'Manda email check-in proattivo + offri sessione 1:1'
      );
      v_alerts_created := v_alerts_created + 1;
    END LOOP;
  EXCEPTION WHEN undefined_table OR undefined_column THEN
    NULL;
  END;

  -- ─────────────────────────────────────────────────────────────────────
  -- 5. ERRORS 5XX SPIKE — edge function failing rate >5/15min
  -- ─────────────────────────────────────────────────────────────────────
  BEGIN
    FOR v_rec IN
      SELECT
        task_kind,
        COUNT(*) AS n_errors
      FROM public.ai_model_usage_log
      WHERE ts >= now() - interval '15 minutes'
        AND ok = false
      GROUP BY task_kind
      HAVING COUNT(*) > 5
    LOOP
      PERFORM public.silvio_admin_alert_upsert(
        'product',
        'critical',
        '🔥 Errori AI spike: ' || v_rec.task_kind,
        v_rec.n_errors || ' errori in 15 min su task ' || v_rec.task_kind,
        'errors_5xx_spike:' || v_rec.task_kind,
        jsonb_build_object('type', 'task_kind', 'name', v_rec.task_kind, 'errors', v_rec.n_errors),
        'Check Supabase logs + verifica rate limit OpenRouter'
      );
      v_alerts_created := v_alerts_created + 1;
    END LOOP;
  EXCEPTION WHEN undefined_table OR undefined_column THEN
    NULL;
  END;

  RETURN jsonb_build_object(
    'ran_at', now(),
    'alerts_processed', v_alerts_created,
    'rules_executed', 5
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.silvio_decision_log_audit_export(p_company_id uuid DEFAULT NULL::uuid, p_from timestamp with time zone DEFAULT (now() - '90 days'::interval), p_to timestamp with time zone DEFAULT now())
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_result jsonb;
BEGIN
  IF p_company_id IS NULL THEN
    IF NOT public.ai_is_service_role()
       AND NOT public.has_role(auth.uid(), 'super_admin'::public.app_role) THEN
      RAISE EXCEPTION 'super_admin required for global audit export' USING ERRCODE = '42501';
    END IF;
  ELSE
    PERFORM public.ai_assert_company_admin_access(p_company_id);
  END IF;

  SELECT jsonb_build_object(
    'export_at', now(),
    'period', jsonb_build_object('from', p_from, 'to', p_to),
    'total_decisions', count(*),
    'critical_count', count(*) FILTER (WHERE is_critical),
    'decisions', COALESCE(jsonb_agg(decision_obj) FILTER (WHERE decision_obj IS NOT NULL), '[]'::jsonb)
  ) INTO v_result
  FROM (
    SELECT jsonb_build_object(
      'id', id,
      'company_id', company_id,
      'created_at', created_at,
      'persona', persona_key,
      'situation', situation_description,
      'options_count', jsonb_array_length(ai_options_proposed),
      'chosen', user_chosen_option_id,
      'status', status,
      'evaluation', outcome_evaluation,
      'is_critical', is_critical
    ) AS decision_obj,
    is_critical
    FROM public.silvio_decision_log
    WHERE (p_company_id IS NULL OR company_id = p_company_id)
      AND created_at BETWEEN p_from AND p_to
  ) sub;

  RETURN COALESCE(v_result, jsonb_build_object('total_decisions', 0, 'decisions', '[]'::jsonb));
END;
$function$;

CREATE OR REPLACE FUNCTION public.silvio_cluster_tickets(p_period text DEFAULT '30d'::text, p_min_cluster integer DEFAULT 3)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_since TIMESTAMPTZ;
  v_clusters JSONB;
  v_total_tickets INT;
BEGIN
  IF NOT public.is_silvio_superadmin() THEN
    RAISE EXCEPTION 'Permesso negato' USING ERRCODE = '42501';
  END IF;

  v_since := CASE p_period
    WHEN '7d'  THEN now() - interval '7 days'
    WHEN '30d' THEN now() - interval '30 days'
    WHEN '90d' THEN now() - interval '90 days'
    ELSE now() - interval '30 days'
  END;

  -- Cluster semplice: keyword frequenti negli internal_notes / messages
  -- (in V1 base via word frequency. In V2 si aggiunge embedding clustering).
  WITH messages AS (
    SELECT
      lower(unnest(string_to_array(
        regexp_replace(COALESCE(sm.message, ''), '[^a-zA-ZÀ-ÿ]', ' ', 'g'),
        ' '
      ))) AS word,
      sm.company_id AS conversation_id
    FROM public.support_messages sm
    WHERE sm.created_at >= v_since
      AND sm.message IS NOT NULL
  ),
  word_clusters AS (
    SELECT
      word,
      COUNT(DISTINCT conversation_id) AS ticket_count
    FROM messages
    WHERE LENGTH(word) > 4  -- ignora parole brevi (a, di, il, ...)
      AND word NOT IN ('ciao','buon','buona','grazie','salve','egregi','spettabile','cordiali','saluti','please','hello','allegato','ticket')
    GROUP BY word
    HAVING COUNT(DISTINCT conversation_id) >= p_min_cluster
    ORDER BY ticket_count DESC
    LIMIT 15
  )
  SELECT jsonb_agg(jsonb_build_object(
    'keyword', word,
    'tickets_count', ticket_count
  ) ORDER BY ticket_count DESC) INTO v_clusters
  FROM word_clusters;

  SELECT COUNT(DISTINCT id) INTO v_total_tickets
  FROM public.support_conversations
  WHERE created_at >= v_since;

  RETURN jsonb_build_object(
    'period', p_period,
    'since', v_since,
    'total_tickets_period', v_total_tickets,
    'top_keyword_clusters', COALESCE(v_clusters, '[]'::jsonb),
    'note', 'V1: keyword-based clustering. V2 prevede embedding semantico (più accurato).'
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.silvio_create_task(p_title text, p_due_date timestamp with time zone DEFAULT NULL::timestamp with time zone, p_related_to uuid DEFAULT NULL::uuid, p_related_type text DEFAULT NULL::text, p_notes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id UUID := auth.uid();
  v_task_id UUID;
BEGIN
  IF NOT public.is_silvio_superadmin(v_user_id) THEN
    RAISE EXCEPTION 'Permesso negato' USING ERRCODE = '42501';
  END IF;

  -- Insert in cs_tasks (schema basico — adattare se necessario)
  BEGIN
    INSERT INTO public.cs_tasks (
      company_id, title, description, task_type, due_date, status, assigned_to,
      created_by, created_at
    ) VALUES (
      CASE WHEN p_related_type = 'company' THEN p_related_to END,
      p_title,
      concat_ws(E'\n', NULLIF(COALESCE(p_notes, ''), ''),
        CASE WHEN p_related_to IS NOT NULL THEN format('Collegato a %s %s', COALESCE(p_related_type, 'elemento'), p_related_to) END),
      COALESCE(p_related_type, 'silvio'),
      p_due_date::date,
      'pending',
      v_user_id,
      v_user_id,
      now()
    )
    RETURNING id INTO v_task_id;
  EXCEPTION WHEN undefined_column THEN
    -- Schema cs_tasks diverso: insert minimal
    INSERT INTO public.cs_tasks (title, status, created_at)
    VALUES (p_title, 'pending', now())
    RETURNING id INTO v_task_id;
  END;

  RETURN jsonb_build_object(
    'ok', true,
    'task_id', v_task_id,
    'title', p_title,
    'due_date', p_due_date,
    'related_to', p_related_to
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.silvio_draft_ticket_reply(p_ticket_id uuid, p_tone text DEFAULT 'empathetic'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_ticket   RECORD;
  v_messages JSONB;
  v_company  RECORD;
BEGIN
  IF NOT public.is_silvio_superadmin() THEN
    RAISE EXCEPTION 'Permesso negato' USING ERRCODE = '42501';
  END IF;

  SELECT
    sc.id, sc.company_id, sc.status, sc.priority,
    sc.created_at, sc.resolved_at, sc.internal_notes
  INTO v_ticket
  FROM public.support_conversations sc
  WHERE sc.id = p_ticket_id;

  IF v_ticket IS NULL THEN
    RETURN jsonb_build_object('error', 'Ticket non trovato');
  END IF;

  -- Carica company
  SELECT id, name, status::text AS company_status
  INTO v_company
  FROM public.companies WHERE id = v_ticket.company_id;

  -- Carica ultimi 10 messaggi (per contesto AI)
  SELECT jsonb_agg(jsonb_build_object(
    'sender_id', sm.sender_id,
    'content',   LEFT(sm.message, 500),
    'created_at', sm.created_at
  ) ORDER BY sm.created_at) INTO v_messages
  FROM (
    SELECT sender_id, message, created_at
    FROM public.support_messages
    WHERE company_id = v_ticket.company_id
    ORDER BY created_at DESC
    LIMIT 10
  ) sm;

  -- Ritorna context — l'AI userà questi dati per generare la bozza
  RETURN jsonb_build_object(
    'ticket', row_to_json(v_ticket),
    'company', row_to_json(v_company),
    'recent_messages', COALESCE(v_messages, '[]'::jsonb),
    'tone_requested', p_tone,
    'note', 'Usa questi dati per generare bozza. La risposta NON viene inviata: Florin la rivede prima.'
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.silvio_get_customer_history(p_company_id uuid, p_days integer DEFAULT 90)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_company    RECORD;
  v_tickets    JSONB;
  v_logins     JSONB;
  v_subscription JSONB;
  v_since      TIMESTAMPTZ := now() - (p_days || ' days')::interval;
BEGIN
  IF NOT public.is_silvio_superadmin() THEN
    RAISE EXCEPTION 'Permesso negato' USING ERRCODE = '42501';
  END IF;

  SELECT id, name, status::text AS status, created_at INTO v_company
  FROM public.companies WHERE id = p_company_id;

  IF v_company IS NULL THEN
    RETURN jsonb_build_object('error', 'Azienda non trovata');
  END IF;

  -- Tickets aperti/recenti
  SELECT jsonb_agg(jsonb_build_object(
    'id', sc.id,
    'status', sc.status,
    'priority', sc.priority,
    'created_at', sc.created_at,
    'resolved_at', sc.resolved_at,
    'days_open', EXTRACT(EPOCH FROM (COALESCE(sc.resolved_at, now()) - sc.created_at)) / 86400
  ) ORDER BY sc.created_at DESC) INTO v_tickets
  FROM public.support_conversations sc
  WHERE sc.company_id = p_company_id
    AND sc.created_at >= v_since;

  -- Subscription corrente (se tabella esiste)
  BEGIN
    SELECT jsonb_build_object(
      'plan_id', s.plan_id,
      'status', s.status,
      'current_period_end', s.current_period_end,
      'canceled_at', s.canceled_at
    ) INTO v_subscription
    FROM public.company_subscriptions s
    WHERE s.company_id = p_company_id
      AND s.status IN ('active','trialing','past_due','unpaid')
    ORDER BY s.created_at DESC
    LIMIT 1;
  EXCEPTION WHEN undefined_table OR undefined_column THEN
    v_subscription := NULL;
  END;

  -- Last login (da auth users → profiles)
  BEGIN
    SELECT jsonb_agg(jsonb_build_object(
      'user_id', p.id,
      'email', u.email,
      'last_sign_in_at', u.last_sign_in_at,
      'days_ago', EXTRACT(EPOCH FROM (now() - u.last_sign_in_at)) / 86400
    ) ORDER BY u.last_sign_in_at DESC NULLS LAST) INTO v_logins
    FROM public.profiles p
    JOIN auth.users u ON u.id = p.id
    WHERE p.company_id = p_company_id
    LIMIT 5;
  EXCEPTION WHEN undefined_table OR undefined_column THEN
    v_logins := NULL;
  END;

  RETURN jsonb_build_object(
    'company', row_to_json(v_company),
    'subscription', v_subscription,
    'tickets', COALESCE(v_tickets, '[]'::jsonb),
    'tickets_count', COALESCE(jsonb_array_length(v_tickets), 0),
    'last_logins', COALESCE(v_logins, '[]'::jsonb),
    'period_days', p_days
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.silvio_get_lead_detail(p_lead_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_lead       RECORD;
  v_activities JSONB;
  v_notes      JSONB;
BEGIN
  IF NOT public.is_silvio_superadmin() THEN
    RAISE EXCEPTION 'Permesso negato' USING ERRCODE = '42501';
  END IF;

  SELECT
    mc.id, mc.first_name, mc.last_name, mc.email, mc.phone,
    mc.company_name, mc.contact_type, mc.source, mc.attr_source,
    mc.tags, mc.lead_score, mc.ai_score, mc.ai_score_tier, mc.ai_score_reasoning,
    mc.last_activity_at, mc.created_at
  INTO v_lead
  FROM public.marketing_contacts mc WHERE mc.id = p_lead_id;

  IF v_lead IS NULL THEN
    RETURN jsonb_build_object('error', 'Lead non trovato');
  END IF;

  -- Activities (eventi tracciati)
  BEGIN
    SELECT jsonb_agg(jsonb_build_object(
      'type', mca.activity_type,
      'created_at', mca.created_at,
      'metadata', mca.metadata
    ) ORDER BY mca.created_at DESC) INTO v_activities
    FROM (
      SELECT activity_type, created_at, metadata
      FROM public.marketing_contact_activities
      WHERE contact_id = p_lead_id
      ORDER BY created_at DESC
      LIMIT 20
    ) mca;
  EXCEPTION WHEN undefined_column THEN
    v_activities := NULL;
  END;

  -- Notes
  SELECT jsonb_agg(jsonb_build_object(
    'note', mcn.content,
    'created_at', mcn.created_at
  ) ORDER BY mcn.created_at DESC) INTO v_notes
  FROM public.marketing_contact_notes mcn
  WHERE mcn.contact_id = p_lead_id
  LIMIT 10;

  RETURN jsonb_build_object(
    'lead', row_to_json(v_lead),
    'recent_activities', COALESCE(v_activities, '[]'::jsonb),
    'notes', COALESCE(v_notes, '[]'::jsonb)
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.silvio_tool_cashflow_status(p_company_id uuid, p_days_back integer DEFAULT 30)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_balance_total numeric;
  v_accounts jsonb;
  v_in numeric;
  v_out numeric;
  v_since date := (CURRENT_DATE - p_days_back);
BEGIN
  -- Saldo totale per banca
  SELECT
    COALESCE(sum(ba.current_balance), 0),
    jsonb_agg(jsonb_build_object(
      'banca', COALESCE(ba.display_name, ba.account_name),
      'iban_last4', RIGHT(COALESCE(ba.iban, ''), 4),
      'saldo_eur', round(COALESCE(ba.current_balance, 0)::numeric, 2),
      'aggiornato_il', ba.balance_updated_at
    ))
  INTO v_balance_total, v_accounts
  FROM public.bank_accounts ba
  WHERE ba.company_id = p_company_id
    AND COALESCE(ba.is_active, true);

  -- Entrate / uscite ultimi N giorni (se bank_transactions accessibile)
  BEGIN
    SELECT
      COALESCE(sum(CASE WHEN bt.amount > 0 THEN bt.amount ELSE 0 END), 0),
      COALESCE(sum(CASE WHEN bt.amount < 0 THEN ABS(bt.amount) ELSE 0 END), 0)
    INTO v_in, v_out
    FROM public.bank_transactions bt
    WHERE bt.company_id = p_company_id
      AND bt.booking_date >= v_since;
  EXCEPTION WHEN OTHERS THEN
    v_in := NULL;
    v_out := NULL;
  END;

  RETURN jsonb_build_object(
    'saldo_totale_eur', round(v_balance_total::numeric, 2),
    'banche', COALESCE(v_accounts, '[]'::jsonb),
    'periodo_movimenti_giorni', p_days_back,
    'entrate_periodo_eur', CASE WHEN v_in IS NOT NULL THEN round(v_in::numeric, 2) ELSE NULL END,
    'uscite_periodo_eur', CASE WHEN v_out IS NOT NULL THEN round(v_out::numeric, 2) ELSE NULL END,
    'cashflow_netto_periodo_eur', CASE WHEN v_in IS NOT NULL THEN round((v_in - v_out)::numeric, 2) ELSE NULL END
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.silvio_tool_company_kpi(p_company_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_employees int;
  v_orders_active int;
  v_orders_ytd int;
  v_revenue_ytd numeric;
  v_quotes_open int;
  v_overdue_count int;
  v_overdue_amount numeric;
  v_bank_balance numeric;
  v_bank_accounts int := 0;
  v_inc_rate_ytd numeric;
  v_inc_fatture_ytd numeric;
  v_fatture_emesse int;
BEGIN
  SELECT count(*) INTO v_employees
    FROM public.profiles WHERE company_id = p_company_id;

  -- Attiva = almeno una rata non incassata OPPURE nessun piano rate
  -- (il flag legacy balance_paid è morto per le commesse col piano rate)
  SELECT count(*) INTO v_orders_active
    FROM public.orders o
   WHERE o.company_id = p_company_id
     AND (
       EXISTS (SELECT 1 FROM public.v_rate_commesse_unificate r WHERE r.order_id = o.id AND NOT r.is_paid)
       OR NOT EXISTS (SELECT 1 FROM public.v_rate_commesse_unificate r WHERE r.order_id = o.id)
     );

  SELECT count(*), COALESCE(sum(total_amount), 0) INTO v_orders_ytd, v_revenue_ytd
    FROM public.orders WHERE company_id = p_company_id
      AND created_at >= date_trunc('year', CURRENT_DATE);

  BEGIN
    SELECT count(*) INTO v_quotes_open
      FROM public.quotes WHERE company_id = p_company_id
        AND status IN ('draft', 'sent', 'pending', 'aperto', 'inviato', 'inviata');
  EXCEPTION WHEN OTHERS THEN v_quotes_open := NULL; END;

  SELECT count(*), COALESCE(sum(amount), 0) INTO v_overdue_count, v_overdue_amount
    FROM public.v_rate_commesse_unificate
   WHERE company_id = p_company_id AND NOT is_paid AND expected_date < CURRENT_DATE;

  SELECT COALESCE(sum(amount), 0) INTO v_inc_rate_ytd
    FROM public.v_rate_commesse_unificate
   WHERE company_id = p_company_id AND is_paid
     AND paid_date >= date_trunc('year', CURRENT_DATE);

  SELECT COALESCE(sum(coalesce(importo_pagato,0) * public.documento_segno(tipo)), 0) INTO v_inc_fatture_ytd
    FROM public.documenti_fiscali
   WHERE company_id = p_company_id AND deleted_at IS NULL
     AND pagato_at >= date_trunc('year', CURRENT_DATE);

  SELECT count(*) INTO v_fatture_emesse
    FROM public.documenti_fiscali
   WHERE company_id = p_company_id AND deleted_at IS NULL
     AND tipo IN ('fattura','fattura_pa','autofattura','fattura_riepilogativa')
     AND stato <> 'bozza';

  BEGIN
    SELECT COALESCE(sum(current_balance), 0), count(*) INTO v_bank_balance, v_bank_accounts
      FROM public.bank_accounts WHERE company_id = p_company_id
        AND COALESCE(is_active, true);
  EXCEPTION WHEN OTHERS THEN v_bank_balance := NULL; v_bank_accounts := 0; END;

  RETURN jsonb_build_object(
    'aggiornato_al', now(),
    'team_size', v_employees,
    'commesse_attive', v_orders_active,
    'commesse_anno_corrente', v_orders_ytd,
    'venduto_anno_corrente_eur', round(v_revenue_ytd::numeric, 2),
    'fatturato_anno_corrente_eur', round(v_revenue_ytd::numeric, 2),
    'incassato_anno_corrente_eur', round((v_inc_rate_ytd + v_inc_fatture_ytd)::numeric, 2),
    'incassato_da_rate_commesse_eur', round(v_inc_rate_ytd::numeric, 2),
    'incassato_da_fatture_eur', round(v_inc_fatture_ytd::numeric, 2),
    'fatture_emesse_count', v_fatture_emesse,
    'usa_fatturazione_eic', v_fatture_emesse > 0,
    'preventivi_aperti', v_quotes_open,
    'rate_scadute_count', v_overdue_count,
    'rate_scadute_eur', round(v_overdue_amount::numeric, 2),
    'banca_collegata', v_bank_accounts > 0,
    'saldo_banche_totale_eur', CASE WHEN v_bank_accounts > 0 AND v_bank_balance IS NOT NULL THEN round(v_bank_balance::numeric, 2) ELSE NULL END,
    'nota_lettura', 'Venduto (commesse) ≠ fatturato ≠ incassato. Se usa_fatturazione_eic=false l''azienda fattura fuori piattaforma: gli incassi veri sono quelli sulle rate commesse, NON dire che non ci sono incassi.'
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.silvio_tool_lista_dipendenti_oggi(p_company_id uuid, p_user_id uuid, p_only_active boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_result jsonb;
  v_table_exists boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = 'employees'
  ) INTO v_table_exists;

  IF NOT v_table_exists THEN
    RETURN jsonb_build_object('count', 0, 'note', 'Modulo HR non attivo', 'employees', '[]'::jsonb);
  END IF;

  SELECT jsonb_build_object(
    'count', COUNT(*),
    'employees', COALESCE(jsonb_agg(
      jsonb_build_object(
        'id', id,
        'full_name', COALESCE(first_name, '') || ' ' || COALESCE(last_name, ''),
        'role', role_type,
        'qualifica', qualifica,
        'is_active', is_active
      ) ORDER BY last_name ASC
    ) FILTER (WHERE id IS NOT NULL), '[]'::jsonb)
  ) INTO v_result
  FROM public.employees
  WHERE company_id = p_company_id
    AND (NOT p_only_active OR is_active = true);

  RETURN COALESCE(v_result, jsonb_build_object('count', 0, 'employees', '[]'::jsonb));
END $function$;

CREATE OR REPLACE FUNCTION public.silvio_tool_quadro_incassi(p_company_id uuid, p_mesi integer DEFAULT 3)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  n int := greatest(1, least(coalesce(p_mesi, 3), 24));
  da date := (date_trunc('month', now()) - ((greatest(1, least(coalesce(p_mesi,3),24)) - 1) || ' months')::interval)::date;
  v_venduto numeric; v_n_ordini int;
  v_inc_rate numeric; v_inc_fatture numeric; v_inc_pn_manuale numeric := 0;
  v_rate_future numeric; v_rate_scadute numeric; v_fatture_residuo numeric;
  v_fatture_emesse int;
  v_n_conti int := 0; v_banca_in numeric; v_banca_out numeric;
  v_pn_uscite numeric := 0;
  v_avvisi jsonb := '[]'::jsonb;
BEGIN
  PERFORM public.assert_company_access(p_company_id);
  SELECT COALESCE(sum(total_amount),0), count(*) INTO v_venduto, v_n_ordini
    FROM orders WHERE company_id = p_company_id AND created_at >= da;

  SELECT COALESCE(sum(amount),0) INTO v_inc_rate
    FROM v_rate_commesse_unificate
   WHERE company_id = p_company_id AND is_paid AND paid_date >= da;

  SELECT COALESCE(sum(coalesce(importo_pagato,0) * public.documento_segno(tipo)),0) INTO v_inc_fatture
    FROM documenti_fiscali
   WHERE company_id = p_company_id AND deleted_at IS NULL AND pagato_at >= da;

  SELECT count(*) INTO v_fatture_emesse
    FROM documenti_fiscali
   WHERE company_id = p_company_id AND deleted_at IS NULL
     AND tipo IN ('fattura','fattura_pa','autofattura','fattura_riepilogativa') AND stato <> 'bozza';

  SELECT COALESCE(sum(amount) FILTER (WHERE expected_date >= CURRENT_DATE), 0),
         COALESCE(sum(amount) FILTER (WHERE expected_date < CURRENT_DATE), 0)
    INTO v_rate_future, v_rate_scadute
    FROM v_rate_commesse_unificate
   WHERE company_id = p_company_id AND NOT is_paid AND expected_date IS NOT NULL;

  SELECT COALESCE(sum(greatest(coalesce(totale_da_pagare, totale_documento, 0)
                                  - coalesce(importo_pagato,0)
                                  - public.documento_stornato(id), 0)),0)
    INTO v_fatture_residuo
    FROM documenti_fiscali
   WHERE company_id = p_company_id AND deleted_at IS NULL
     AND tipo IN ('fattura','fattura_pa','fattura_riepilogativa');

  BEGIN
    SELECT COALESCE(sum(amount) FILTER (WHERE direction = 'entrata' AND coalesce(is_auto,false) = false), 0),
           COALESCE(sum(amount) FILTER (WHERE direction = 'uscita'), 0)
      INTO v_inc_pn_manuale, v_pn_uscite
      FROM prima_nota_entries
     WHERE company_id = p_company_id AND entry_date >= da;
  EXCEPTION WHEN OTHERS THEN v_inc_pn_manuale := 0; v_pn_uscite := 0; END;

  BEGIN
    SELECT count(*) INTO v_n_conti FROM bank_accounts
     WHERE company_id = p_company_id AND coalesce(is_active,true);
    IF v_n_conti > 0 THEN
      SELECT COALESCE(sum(CASE WHEN amount > 0 THEN amount ELSE 0 END),0),
             COALESCE(sum(CASE WHEN amount < 0 THEN abs(amount) ELSE 0 END),0)
        INTO v_banca_in, v_banca_out
        FROM bank_transactions
       WHERE company_id = p_company_id AND booking_date >= da;
    END IF;
  EXCEPTION WHEN OTHERS THEN v_n_conti := 0; v_banca_in := NULL; v_banca_out := NULL; END;

  IF v_inc_rate > 0 AND v_fatture_emesse = 0 THEN
    v_avvisi := v_avvisi || jsonb_build_array('L''azienda registra incassi sulle rate delle commesse ma NON emette fatture in EiC: la fatturazione avviene fuori piattaforma. Non concludere mai che "non ci sono incassi" guardando solo le fatture.');
  END IF;
  IF v_inc_rate > 0 AND v_inc_fatture > 0 THEN
    v_avvisi := v_avvisi || jsonb_build_array('Risultano incassi sia da fatture sia da rate commesse: la stessa entrata potrebbe essere registrata due volte. Prima di sommare, segnala il possibile overlap.');
  END IF;
  IF v_n_conti = 0 THEN
    v_avvisi := v_avvisi || jsonb_build_array('Nessun conto corrente collegato: gli incassi dichiarati non sono verificabili con la banca. Suggerisci di collegare il conto (Finanza → Tesoreria) per la riconciliazione automatica.');
  ELSE
    v_avvisi := v_avvisi || jsonb_build_array('Conto corrente collegato: confronta gli incassi registrati con le entrate banca del periodo per verificare la coerenza.');
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'periodo', jsonb_build_object('da', da, 'a', CURRENT_DATE, 'mesi', n),
    'venduto', jsonb_build_object('totale_eur', round(v_venduto,2), 'n_commesse', v_n_ordini),
    'incassato', jsonb_build_object(
      'rate_commesse_eur', round(v_inc_rate,2),
      'fatture_eur', round(v_inc_fatture,2),
      'prima_nota_manuale_eur', round(v_inc_pn_manuale,2),
      'nota', 'Fonti separate apposta: NON sommarle alla cieca, possono sovrapporsi (vedi avvisi).'),
    'da_incassare', jsonb_build_object(
      'rate_commesse_future_eur', round(v_rate_future,2),
      'rate_commesse_scadute_eur', round(v_rate_scadute,2),
      'fatture_residuo_eur', round(v_fatture_residuo,2)),
    'uscite', jsonb_build_object(
      'prima_nota_uscite_eur', round(v_pn_uscite,2),
      'banca_uscite_eur', CASE WHEN v_banca_out IS NOT NULL THEN round(v_banca_out,2) ELSE NULL END),
    'strumenti', jsonb_build_object(
      'usa_fatturazione_eic', v_fatture_emesse > 0,
      'fatture_emesse_count', v_fatture_emesse,
      'banca_collegata', v_n_conti > 0,
      'n_conti', v_n_conti,
      'banca_entrate_periodo_eur', CASE WHEN v_banca_in IS NOT NULL THEN round(v_banca_in,2) ELSE NULL END),
    'avvisi', v_avvisi
  );
END $function$;

CREATE OR REPLACE FUNCTION public.silvio_tool_received_invoices(p_company_id uuid, p_status text DEFAULT 'unpaid'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_total int;
  v_total_amount numeric;
  v_invoices jsonb;
  v_has_table boolean;
BEGIN
  -- Verifica esistenza tabella e relevant columns (defensive)
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = 'fatture_ricevute'
  ) INTO v_has_table;

  IF NOT v_has_table THEN
    RETURN jsonb_build_object('error', 'tabella fatture_ricevute non disponibile');
  END IF;

  -- Query dinamica defensive (alcune colonne potrebbero non esistere)
  BEGIN
    -- Colonne reali di fatture_ricevute: numero_fattura, cedente_ragione_sociale,
    -- data_fattura, totale_documento. «Pagata» = contabilizzata in prima nota.
    SELECT
      COUNT(*),
      COALESCE(SUM(fr.totale_documento), 0),
      jsonb_agg(jsonb_build_object(
        'numero', fr.numero_fattura,
        'fornitore', fr.cedente_ragione_sociale,
        'data_emissione', fr.data_fattura,
        'data_scadenza', NULL,
        'importo_eur', round(COALESCE(fr.totale_documento, 0)::numeric, 2),
        'pagata', fr.stato = 'contabilizzata',
        'descrizione', LEFT(COALESCE(fr.ai_riassunto, fr.note, ''), 80)
      ) ORDER BY fr.data_fattura DESC NULLS LAST)
    INTO v_total, v_total_amount, v_invoices
    FROM public.fatture_ricevute fr
    WHERE fr.company_id = p_company_id
      AND CASE
        WHEN p_status = 'unpaid' THEN fr.stato IS DISTINCT FROM 'contabilizzata'
        WHEN p_status = 'paid' THEN fr.stato = 'contabilizzata'
        ELSE true
      END;
  EXCEPTION WHEN undefined_column OR undefined_function THEN
    -- Fallback: just count rows
    SELECT count(*), 0, '[]'::jsonb INTO v_total, v_total_amount, v_invoices
    FROM public.fatture_ricevute WHERE company_id = p_company_id;
  END;

  RETURN jsonb_build_object(
    'filter_status', p_status,
    'totale_fatture', v_total,
    'importo_totale_eur', round(v_total_amount::numeric, 2),
    'fatture', COALESCE(v_invoices, '[]'::jsonb)
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.silvio_tool_verifica_anagrafica_fattura(p_company_id uuid, p_user_id uuid, p_customer_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_customer RECORD;
  v_missing text[] := ARRAY[]::text[];
  v_complete boolean := true;
BEGIN
  -- I dati di fatturazione stanno in anagrafiche_native (collegata al cliente
  -- con cliente_id); profiles ha solo indirizzo e codice fiscale di base.
  SELECT COALESCE(an.id, p.id) AS id,
         COALESCE(an.nome, p.first_name) AS first_name,
         COALESCE(an.cognome, p.last_name) AS last_name,
         COALESCE(an.partita_iva, p.vat_number) AS vat_number,
         COALESCE(an.codice_fiscale, p.fiscal_code) AS codice_fiscale,
         COALESCE(an.email, p.email) AS email,
         COALESCE(an.telefono, p.phone) AS phone,
         COALESCE(an.indirizzo_via, p.address) AS indirizzo,
         COALESCE(an.indirizzo_comune, p.city) AS comune,
         COALESCE(an.indirizzo_provincia::text, p.province) AS provincia,
         COALESCE(an.indirizzo_cap, p.postal_code) AS cap,
         an.codice_sdi AS sdi_code,
         an.pec AS pec_email,
         (length(COALESCE(an.codice_sdi, '')) = 6) AS is_pa,
         NULL::text AS regime_fiscale
    INTO v_customer
    FROM (SELECT p_customer_id AS cid) x
    LEFT JOIN public.profiles p ON p.id = x.cid
    LEFT JOIN LATERAL (
      SELECT * FROM public.anagrafiche_native a
       WHERE a.cliente_id = x.cid OR a.id = x.cid
       ORDER BY (a.cliente_id = x.cid) DESC NULLS LAST, a.updated_at DESC NULLS LAST
       LIMIT 1
    ) an ON true
   WHERE p.id IS NOT NULL OR an.id IS NOT NULL;
  IF v_customer.id IS NULL THEN
    RETURN jsonb_build_object('error', 'Cliente non trovato', 'complete', false);
  END IF;

  IF v_customer.vat_number IS NULL AND v_customer.codice_fiscale IS NULL THEN
    v_missing := array_append(v_missing, 'partita_iva o codice_fiscale');
    v_complete := false;
  END IF;
  IF v_customer.indirizzo IS NULL THEN
    v_missing := array_append(v_missing, 'indirizzo'); v_complete := false;
  END IF;
  IF v_customer.comune IS NULL THEN
    v_missing := array_append(v_missing, 'comune'); v_complete := false;
  END IF;
  IF v_customer.cap IS NULL THEN
    v_missing := array_append(v_missing, 'cap'); v_complete := false;
  END IF;
  IF v_customer.sdi_code IS NULL AND v_customer.pec_email IS NULL THEN
    v_missing := array_append(v_missing, 'sdi_code o pec_email');
    v_complete := false;
  END IF;

  RETURN jsonb_build_object(
    'customer_id', p_customer_id,
    'complete', v_complete,
    'missing_fields', to_jsonb(v_missing),
    'is_pa', COALESCE(v_customer.is_pa, false),
    'regime_fiscale', v_customer.regime_fiscale,
    'has_pec', v_customer.pec_email IS NOT NULL,
    'has_sdi', v_customer.sdi_code IS NOT NULL,
    'splitting_required', COALESCE(v_customer.is_pa, false)
  );
END $function$;

CREATE OR REPLACE FUNCTION public.silvio_tool_verifica_durc(p_company_id uuid, p_user_id uuid, p_target_type text DEFAULT 'self'::text, p_target_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_result jsonb;
BEGIN
  -- Il DURC dell'azienda sta in anagrafica_azienda.durc_expiry_date, quello dei
  -- subappaltatori in subappaltatori_sicurezza.durc_scadenza (la tabella
  -- durc_documents e companies.durc_expiry non sono mai esistite).
  IF p_target_type = 'self' THEN
    SELECT jsonb_build_object(
      'target_type', 'self',
      'esito', CASE
        WHEN aa.durc_expiry_date IS NULL THEN 'sconosciuto'
        WHEN aa.durc_expiry_date < CURRENT_DATE THEN 'scaduto'
        WHEN aa.durc_expiry_date < CURRENT_DATE + 30 THEN 'in_scadenza'
        ELSE 'regolare'
      END,
      'data_scadenza', aa.durc_expiry_date,
      'giorni_alla_scadenza', aa.durc_expiry_date - CURRENT_DATE
    ) INTO v_result
    FROM public.anagrafica_azienda aa
    WHERE aa.company_id = p_company_id
    LIMIT 1;
  ELSIF p_target_id IS NOT NULL THEN
    SELECT jsonb_build_object(
      'target_type', 'subcontractor',
      'target_id', p_target_id,
      'ragione_sociale', ss.ragione_sociale,
      'esito', CASE
        WHEN ss.durc_scadenza IS NULL THEN 'sconosciuto'
        WHEN ss.durc_scadenza < CURRENT_DATE THEN 'scaduto'
        WHEN ss.durc_scadenza < CURRENT_DATE + 30 THEN 'in_scadenza'
        ELSE 'regolare'
      END,
      'data_scadenza', ss.durc_scadenza,
      'giorni_alla_scadenza', ss.durc_scadenza - CURRENT_DATE
    ) INTO v_result
    FROM public.subappaltatori_sicurezza ss
    WHERE ss.company_id = p_company_id
      AND (ss.id = p_target_id OR ss.campo_subappaltatore_id = p_target_id)
    ORDER BY ss.durc_scadenza DESC NULLS LAST
    LIMIT 1;
  END IF;
  RETURN COALESCE(v_result, jsonb_build_object('esito', 'sconosciuto', 'note', 'Nessun DURC trovato'));
END $function$;
