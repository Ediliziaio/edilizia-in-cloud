-- ============================================================================
-- Silvio AI — audit 2026-09-03
--   1) I tool dei soldi leggevano ancora le rate "piatte" su orders
--   2) Le funzioni uscite in questi giorni non avevano nessuno strumento
--   3) Telemetria della cache prompt (oggi non misurabile)
-- ============================================================================
-- 1) Da quando le rate di commessa sono righe vere (order_installments, con
--    aggancio all'evento di cantiere e giorni di preavviso), tre RPC di Silvio
--    continuavano a sommare deposit_/balance_/financing_ su orders. Chi ha
--    convertito il piano rate se le vedeva SPARIRE dalla risposta di Silvio:
--    su una azienda in produzione "chi mi deve pagare" diceva 248.015 €
--    invece di 279.080 €, su un'altra 243.653 € invece di 287.460 €, e su una
--    terza contava 62 righe legacy ormai sostituite invece delle 43 vere.
--    Una vista unica (rate strutturate se ci sono, legacy solo per le commesse
--    che non le hanno) diventa la sola fonte per tutti e tre.
-- 2) Flusso di lavoro commessa, uffici aziendali, bonus edilizi multipli,
--    blocca prezzo, banca dati candidati: Silvio non aveva NESSUN tool per
--    leggerli, quindi rispondeva "non ho il dato" su funzioni appena spedite.
-- 3) ai_router_usage_log registrava solo prompt_tokens: impossibile sapere se
--    la cache Anthropic stesse funzionando. Due colonne in piu' e si misura.
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- VISTA UNICA DELLE RATE — con codice commessa, tipo, aggancio evento
-- ─────────────────────────────────────────────────────────────────────────────
-- v_rate_commesse_unificate esisteva gia' ma non porta order_code ne' il tipo
-- di rata ne' il trigger: i tool ne hanno bisogno per dire "acconto della
-- GE-0012" invece di "una rata". Stessa regola: se una commessa ha rate
-- strutturate, le legacy si ignorano (altrimenti si contano due volte).
CREATE OR REPLACE VIEW public.v_rate_commesse_dettaglio AS
SELECT
  o.company_id,
  o.id AS order_id,
  COALESCE(NULLIF(TRIM(o.order_code), ''), 'Commessa senza codice') AS order_code,
  COALESCE(
    NULLIF(TRIM(o.client_name), ''),
    NULLIF(TRIM(o.client_company), ''),
    'Cliente non indicato'
  ) AS cliente,
  COALESCE(NULLIF(TRIM(oi.label), ''), oi.type, 'Rata') AS label,
  COALESCE(NULLIF(TRIM(oi.type), ''), 'rata') AS tipo,
  COALESCE(oi.amount, 0)::numeric AS amount,
  COALESCE(oi.is_paid, false) AS is_paid,
  oi.paid_date,
  oi.expected_date,
  oi.trigger_evento,
  oi.giorni_preavviso,
  'rate_db'::text AS fonte
FROM public.order_installments oi
JOIN public.orders o ON o.id = oi.order_id
UNION ALL
SELECT
  o.company_id,
  o.id,
  COALESCE(NULLIF(TRIM(o.order_code), ''), 'Commessa senza codice'),
  COALESCE(NULLIF(TRIM(o.client_name), ''), NULLIF(TRIM(o.client_company), ''), 'Cliente non indicato'),
  r.label,
  r.tipo,
  r.amount,
  r.is_paid,
  r.paid_date,
  r.expected_date,
  NULL::text,
  NULL::integer,
  'legacy'::text
FROM public.orders o
CROSS JOIN LATERAL (VALUES
  ('Acconto',       'acconto',       COALESCE(o.deposit_amount, 0)::numeric,   COALESCE(o.deposit_paid, false),   o.deposit_paid_date,   o.deposit_expected_date),
  ('Acconto 2',     'acconto_2',     COALESCE(o.deposit_2_amount, 0)::numeric, COALESCE(o.deposit_2_paid, false), o.deposit_2_paid_date, o.deposit_2_expected_date),
  ('Saldo',         'saldo',         COALESCE(o.balance_amount, 0)::numeric,   COALESCE(o.balance_paid, false),   o.balance_paid_date,   o.balance_expected_date),
  ('Finanziamento', 'finanziamento', COALESCE(o.financing_amount, 0)::numeric, COALESCE(o.financing_paid, false), o.financing_paid_date, o.financing_expected_date)
) AS r(label, tipo, amount, is_paid, paid_date, expected_date)
WHERE r.amount > 0
  AND NOT EXISTS (SELECT 1 FROM public.order_installments oi2 WHERE oi2.order_id = o.id);

COMMENT ON VIEW public.v_rate_commesse_dettaglio IS
  'Rate di commessa con codice, cliente, tipo e aggancio evento. Rate strutturate se presenti, legacy solo per le commesse senza. Fonte unica per i tool soldi di Silvio.';

REVOKE ALL ON public.v_rate_commesse_dettaglio FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.v_rate_commesse_dettaglio TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- FIX 1 — "chi mi deve pagare" (114 chiamate in 60 giorni, il tool piu' usato)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.silvio_tool_overdue_payments(p_company_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_orders_count int := 0;
  v_total numeric := 0;
  v_count int := 0;
  v_overdue jsonb := '[]'::jsonb;
  v_warnings text[] := ARRAY[]::text[];
BEGIN
  PERFORM public.assert_company_access(p_company_id);

  SELECT COUNT(*) INTO v_orders_count
  FROM public.orders WHERE company_id = p_company_id;

  WITH overdue AS (
    SELECT
      r.order_code,
      r.cliente,
      r.tipo,
      r.label,
      r.amount AS importo_eur,
      r.expected_date AS data_attesa,
      (CURRENT_DATE - r.expected_date) AS giorni_ritardo
    FROM public.v_rate_commesse_dettaglio r
    WHERE r.company_id = p_company_id
      AND r.is_paid = false
      AND r.expected_date IS NOT NULL
      AND r.expected_date < CURRENT_DATE
      AND r.amount > 0
  ),
  ranked AS (
    SELECT *,
      ROW_NUMBER() OVER (ORDER BY (importo_eur + (GREATEST(giorni_ritardo, 0) * 50)) DESC, giorni_ritardo DESC, importo_eur DESC) AS priorita_num,
      ROUND((importo_eur + (GREATEST(giorni_ritardo, 0) * 50))::numeric, 2) AS priority_score
    FROM overdue
  )
  SELECT
    COUNT(*),
    COALESCE(SUM(importo_eur), 0),
    COALESCE(jsonb_agg(jsonb_build_object(
      'priorita_num', priorita_num,
      'priorita', CASE WHEN priorita_num <= 3 THEN 'alta' WHEN priorita_num <= 6 THEN 'media' ELSE 'bassa' END,
      'priority_score', priority_score,
      'commessa', order_code,
      'cliente', cliente,
      'tipo_rata', tipo,
      'rata', label,
      'importo_eur', ROUND(importo_eur::numeric, 2),
      'data_attesa', data_attesa,
      'giorni_ritardo', giorni_ritardo,
      'azione_suggerita', CASE
        WHEN giorni_ritardo >= 30 THEN 'telefonata oggi + promessa pagamento scritta'
        WHEN importo_eur >= 5000 THEN 'telefonata oggi + sollecito formale'
        ELSE 'sollecito email/whatsapp oggi'
      END
    ) ORDER BY priorita_num ASC), '[]'::jsonb)
  INTO v_count, v_total, v_overdue
  FROM ranked;

  IF v_orders_count = 0 THEN v_warnings := array_append(v_warnings, 'orders_missing'); END IF;
  IF v_count = 0 THEN v_warnings := array_append(v_warnings, 'overdue_receivables_missing'); END IF;

  RETURN jsonb_build_object(
    'totale_scaduti', v_count,
    'count', v_count,
    'importo_totale_eur', ROUND(v_total::numeric, 2),
    'total_overdue_eur', ROUND(v_total::numeric, 2),
    'data_quality', jsonb_build_object(
      'orders_count', v_orders_count,
      'overdue_receivables_count', v_count,
      'fonte_rate', 'order_installments + legacy solo dove mancano',
      'warnings', to_jsonb(v_warnings)
    ),
    'rate_scadute', v_overdue,
    'priorita_recupero', v_overdue
  );
END;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- FIX 2 — incassi previsti nei prossimi N giorni
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.silvio_tool_revenue_forecast(p_company_id uuid, p_days_ahead integer DEFAULT 30)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_days int := LEAST(GREATEST(COALESCE(p_days_ahead, 30), 1), 365);
  v_until date;
  v_orders_count int := 0;
  v_total_due numeric := 0;
  v_future_count int := 0;
  v_overdue_excluded numeric := 0;
  v_breakdown jsonb := '[]'::jsonb;
  v_per_tipo jsonb := '{}'::jsonb;
  v_warnings text[] := ARRAY[]::text[];
BEGIN
  PERFORM public.assert_company_access(p_company_id);
  v_until := (CURRENT_DATE + (v_days || ' days')::interval)::date;

  SELECT COUNT(*) INTO v_orders_count FROM public.orders WHERE company_id = p_company_id;

  WITH due AS (
    SELECT r.order_code, r.cliente, r.tipo, r.label, r.amount AS importo_eur, r.expected_date AS data_attesa
    FROM public.v_rate_commesse_dettaglio r
    WHERE r.company_id = p_company_id
      AND r.is_paid = false
      AND r.amount > 0
      AND r.expected_date BETWEEN CURRENT_DATE AND v_until
  )
  SELECT
    COALESCE(SUM(importo_eur), 0),
    COUNT(*),
    COALESCE(jsonb_agg(jsonb_build_object(
      'commessa', order_code,
      'cliente', cliente,
      'tipo_rata', tipo,
      'rata', label,
      'importo_eur', ROUND(importo_eur::numeric, 2),
      'data_attesa', data_attesa,
      'giorni_a_scadenza', data_attesa - CURRENT_DATE,
      'priorita', CASE
        WHEN data_attesa <= CURRENT_DATE + 7 THEN 'alta'
        WHEN data_attesa <= CURRENT_DATE + 30 THEN 'media'
        ELSE 'bassa' END
    ) ORDER BY data_attesa ASC, importo_eur DESC), '[]'::jsonb)
  INTO v_total_due, v_future_count, v_breakdown
  FROM due;

  SELECT COALESCE(jsonb_object_agg(tipo, tot), '{}'::jsonb) INTO v_per_tipo
  FROM (
    SELECT r.tipo, ROUND(SUM(r.amount)::numeric, 2) AS tot
    FROM public.v_rate_commesse_dettaglio r
    WHERE r.company_id = p_company_id AND r.is_paid = false AND r.amount > 0
      AND r.expected_date BETWEEN CURRENT_DATE AND v_until
    GROUP BY r.tipo
  ) s;

  SELECT COALESCE(SUM(r.amount), 0) INTO v_overdue_excluded
  FROM public.v_rate_commesse_dettaglio r
  WHERE r.company_id = p_company_id AND r.is_paid = false AND r.amount > 0
    AND r.expected_date IS NOT NULL AND r.expected_date < CURRENT_DATE;

  IF v_orders_count = 0 THEN v_warnings := array_append(v_warnings, 'orders_missing'); END IF;
  IF v_future_count = 0 THEN v_warnings := array_append(v_warnings, 'future_receivables_missing'); END IF;

  RETURN jsonb_build_object(
    'orizzonte_giorni', v_days,
    'dal', CURRENT_DATE,
    'data_limite', v_until,
    'totale_da_incassare_eur', ROUND(v_total_due::numeric, 2),
    'total_expected_eur', ROUND(v_total_due::numeric, 2),
    'future_receivables_count', v_future_count,
    'expected_count', v_future_count,
    'scaduti_esclusi_eur', ROUND(v_overdue_excluded::numeric, 2),
    'overdue_excluded_eur', ROUND(v_overdue_excluded::numeric, 2),
    'nota', 'Il forecast include solo incassi futuri. I crediti gia scaduti sono esclusi e vanno letti con get_overdue_payments.',
    'data_quality', jsonb_build_object(
      'orders_count', v_orders_count,
      'future_receivables_count', v_future_count,
      'fonte_rate', 'order_installments + legacy solo dove mancano',
      'warnings', to_jsonb(v_warnings)
    ),
    'breakdown', v_per_tipo,
    'top_commesse', v_breakdown,
    'incassi_futuri', v_breakdown
  );
END;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- FIX 3 — le "leve di incasso anticipabile" nello scenario what-if
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.silvio_tool_simula_scenario(p_company_id uuid, p_ipotesi text, p_orizzonte integer DEFAULT 6, p_variabili jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_weeks int; v_cf jsonb; v_pipe jsonb; v_workload jsonb;
  v_nuova numeric; v_costo numeric; v_net numeric;
  v_base_min numeric; v_base_fine numeric; v_scenario_min numeric; v_scenario_fine numeric;
  v_leve jsonb; v_overload int; v_free int;
  v_mesi int := GREATEST(coalesce(p_orizzonte, 6), 1);
BEGIN
  PERFORM public.assert_company_access(p_company_id);
  IF p_company_id IS NULL OR coalesce(p_ipotesi, '') = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'company_id e ipotesi obbligatori');
  END IF;
  v_weeks := LEAST(v_mesi * 4 + 2, 52);
  v_cf := public.silvio_cashflow_forecast_90d(p_company_id, v_weeks, true);
  BEGIN v_pipe := public.silvio_tool_get_pipeline_forecast(p_company_id, v_mesi * 30);
  EXCEPTION WHEN OTHERS THEN v_pipe := NULL; END;

  v_base_min  := coalesce((v_cf->>'saldo_minimo_eur')::numeric, 0);
  v_base_fine := coalesce((v_cf->>'saldo_atteso_fine_periodo_eur')::numeric, 0);
  v_nuova := coalesce((p_variabili->>'nuova_commessa_eur')::numeric, 0);
  v_costo := coalesce((p_variabili->>'costo_fornitori_eur')::numeric,
                      CASE WHEN v_nuova > 0 THEN round(v_nuova * 0.65, 2) ELSE 0 END);
  v_net := v_nuova - v_costo;
  v_scenario_fine := v_base_fine + v_net;
  v_scenario_min := v_base_min + CASE
    WHEN coalesce((p_variabili->>'incasso_giorni')::int, 9999) <= v_mesi * 30 THEN v_net ELSE 0 END;

  -- Leve = le rate non ancora incassate piu' grosse dell'orizzonte. Legge dalla
  -- vista unica: prima guardava solo acconto/saldo piatti su orders e su una
  -- commessa con piano rate strutturato non proponeva nulla.
  BEGIN
    SELECT coalesce(jsonb_agg(e ORDER BY (e->>'importo')::numeric DESC), '[]'::jsonb) INTO v_leve
    FROM (
      SELECT jsonb_build_object(
               'cliente', r.cliente,
               'commessa', r.order_code,
               'tipo', r.tipo,
               'importo', ROUND(r.amount::numeric, 2),
               'atteso_il', r.expected_date) AS e
      FROM public.v_rate_commesse_dettaglio r
      WHERE r.company_id = p_company_id
        AND r.is_paid = false
        AND r.amount > 0
        AND r.expected_date IS NOT NULL
        AND r.expected_date <= CURRENT_DATE + (v_mesi * 30)
      ORDER BY r.amount DESC
      LIMIT 3
    ) t;
  EXCEPTION WHEN OTHERS THEN v_leve := '[]'::jsonb; END;

  BEGIN
    v_workload := public.silvio_employees_workload(p_company_id);
    SELECT count(*) FILTER (WHERE (w->>'utilizzo_pct')::numeric >= 85),
           count(*) FILTER (WHERE (w->>'stato_carico') = 'libero')
      INTO v_overload, v_free
    FROM jsonb_array_elements(v_workload) w;
  EXCEPTION WHEN OTHERS THEN v_overload := NULL; v_free := NULL; END;

  RETURN jsonb_build_object(
    'ok', true, 'ipotesi', p_ipotesi, 'orizzonte_mesi', v_mesi, 'variabili', p_variabili,
    'cassa', jsonb_build_object(
      'saldo_oggi_eur', (v_cf->>'saldo_oggi_eur')::numeric,
      'saldo_minimo_base_eur', v_base_min,
      'settimana_critica', v_cf->>'settimana_critica',
      'settimane_critiche', (v_cf->>'critical_weeks_count')::int,
      'saldo_fine_periodo_base_eur', v_base_fine,
      'costo_personale_mensile_eur', (v_cf->>'costo_personale_mensile_netto_eur')::numeric),
    'scenario', jsonb_build_object(
      'nuova_commessa_eur', v_nuova, 'costo_stimato_eur', v_costo, 'impatto_netto_eur', v_net,
      'saldo_minimo_stimato_eur', v_scenario_min, 'saldo_fine_periodo_stimato_eur', v_scenario_fine,
      'regge', (v_scenario_min >= 0)),
    'pipeline', CASE WHEN v_pipe IS NULL THEN NULL ELSE jsonb_build_object(
      'weighted_eur', (v_pipe->>'pipeline_weighted_eur')::numeric,
      'forecast_90d_eur', (v_pipe->>'forecast_90d_eur')::numeric) END,
    'squadre', jsonb_build_object('sovraccarichi', v_overload, 'liberi', v_free),
    'leve_incassi_anticipabili', v_leve,
    'nota', 'Stima composita read-only su forecast cassa reale + ipotesi. Non modifica dati. Costo commessa stimato al 65% se non specificato in variabili.'
  );
END $function$;

-- ═════════════════════════════════════════════════════════════════════════════
-- NUOVI STRUMENTI — le funzioni uscite in questi giorni erano invisibili a Silvio
-- ═════════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- Flusso di lavoro della commessa: a che punto siamo, chi ha la palla
-- ─────────────────────────────────────────────────────────────────────────────
-- I passi del processo standard sono task collegati alla commessa: uno sblocca
-- il successivo (bloccata_da_task_id) e puo' essere assegnato a una persona o
-- a un ufficio. Senza questo tool alla domanda "a che punto e' la GE-0012"
-- Silvio sapeva rispondere solo con lo stato commerciale della commessa.
CREATE OR REPLACE FUNCTION public.silvio_tool_flusso_commessa(
  p_company_id uuid,
  p_order_code text DEFAULT NULL,
  p_order_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_order record;
  v_passi jsonb := '[]'::jsonb;
  v_tot int := 0; v_fatti int := 0; v_corso int := 0; v_attesa int := 0; v_ritardo int := 0;
BEGIN
  PERFORM public.assert_company_access(p_company_id);

  SELECT o.id, o.order_code, o.client_name, o.client_company, o.status, o.expected_date
    INTO v_order
  FROM public.orders o
  WHERE o.company_id = p_company_id
    AND (
      (p_order_id IS NOT NULL AND o.id = p_order_id)
      OR (p_order_code IS NOT NULL AND UPPER(TRIM(o.order_code)) = UPPER(TRIM(p_order_code)))
    )
  LIMIT 1;

  IF v_order.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error',
      'Commessa non trovata: passa il codice esatto (es. GE-0012) o l''id.');
  END IF;

  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE t.status = 'completata'),
    COUNT(*) FILTER (WHERE t.status = 'in_corso'),
    COUNT(*) FILTER (WHERE t.status <> 'completata' AND t.bloccata_da_task_id IS NOT NULL
                       AND EXISTS (SELECT 1 FROM public.tasks b WHERE b.id = t.bloccata_da_task_id AND b.status <> 'completata')),
    COUNT(*) FILTER (WHERE t.status <> 'completata' AND t.due_date IS NOT NULL AND t.due_date < CURRENT_DATE),
    COALESCE(jsonb_agg(jsonb_build_object(
      'passo', t.title,
      'stato', CASE
        WHEN t.status = 'completata' THEN 'fatto'
        WHEN t.bloccata_da_task_id IS NOT NULL
             AND EXISTS (SELECT 1 FROM public.tasks b WHERE b.id = t.bloccata_da_task_id AND b.status <> 'completata')
          THEN 'in attesa del passo precedente'
        WHEN t.status = 'in_corso' THEN 'in corso'
        ELSE 'da fare' END,
      'scadenza', t.due_date,
      'in_ritardo', (t.status <> 'completata' AND t.due_date IS NOT NULL AND t.due_date < CURRENT_DATE),
      'responsabile', COALESCE(NULLIF(TRIM(CONCAT_WS(' ', pr.first_name, pr.last_name)), ''), pr.email),
      'ufficio', uf.nome,
      'completato_il', t.completed_at,
      'ore_stimate', t.estimated_hours,
      'ore_effettive', t.actual_hours
    ) ORDER BY COALESCE(t.sort_order, 999), t.due_date NULLS LAST, t.created_at), '[]'::jsonb)
  INTO v_tot, v_fatti, v_corso, v_attesa, v_ritardo, v_passi
  FROM public.tasks t
  LEFT JOIN public.profiles pr ON pr.id = t.assigned_to
  LEFT JOIN public.company_uffici uf ON uf.id = t.ufficio_id
  WHERE t.company_id = p_company_id AND t.order_id = v_order.id;

  RETURN jsonb_build_object(
    'ok', true,
    'commessa', v_order.order_code,
    'cliente', COALESCE(NULLIF(TRIM(v_order.client_name), ''), NULLIF(TRIM(v_order.client_company), ''), 'Cliente non indicato'),
    'stato_commessa', v_order.status,
    'consegna_prevista', v_order.expected_date,
    'passi_totali', v_tot,
    'passi_fatti', v_fatti,
    'passi_in_corso', v_corso,
    'passi_in_attesa', v_attesa,
    'passi_in_ritardo', v_ritardo,
    'avanzamento_pct', CASE WHEN v_tot > 0 THEN ROUND((v_fatti::numeric / v_tot) * 100, 1) ELSE NULL END,
    'passi', v_passi,
    'nota', CASE WHEN v_tot = 0
      THEN 'Questa commessa non ha ancora passi di processo: il flusso standard non e stato applicato.'
      ELSE 'Un passo "in attesa del passo precedente" non e in ritardo di nessuno: si sblocca da solo quando chiudono quello prima.' END
  );
END;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Piano rate di una commessa (con aggancio evento cantiere e preavviso)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.silvio_tool_rate_commessa(
  p_company_id uuid,
  p_order_code text DEFAULT NULL,
  p_order_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_order record;
  v_rate jsonb := '[]'::jsonb;
  v_tot numeric := 0; v_inc numeric := 0; v_res numeric := 0; v_scad numeric := 0;
BEGIN
  PERFORM public.assert_company_access(p_company_id);

  SELECT o.id, o.order_code, o.client_name, o.client_company, o.total_amount
    INTO v_order
  FROM public.orders o
  WHERE o.company_id = p_company_id
    AND ((p_order_id IS NOT NULL AND o.id = p_order_id)
      OR (p_order_code IS NOT NULL AND UPPER(TRIM(o.order_code)) = UPPER(TRIM(p_order_code))))
  LIMIT 1;

  IF v_order.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Commessa non trovata: serve il codice esatto o l''id.');
  END IF;

  SELECT
    COALESCE(SUM(r.amount), 0),
    COALESCE(SUM(r.amount) FILTER (WHERE r.is_paid), 0),
    COALESCE(SUM(r.amount) FILTER (WHERE NOT r.is_paid), 0),
    COALESCE(SUM(r.amount) FILTER (WHERE NOT r.is_paid AND r.expected_date IS NOT NULL AND r.expected_date < CURRENT_DATE), 0),
    COALESCE(jsonb_agg(jsonb_build_object(
      'rata', r.label,
      'tipo', r.tipo,
      'importo_eur', ROUND(r.amount::numeric, 2),
      'incassata', r.is_paid,
      'incassata_il', r.paid_date,
      'attesa_il', r.expected_date,
      'giorni', CASE WHEN r.is_paid OR r.expected_date IS NULL THEN NULL ELSE r.expected_date - CURRENT_DATE END,
      'semaforo', CASE
        WHEN r.is_paid THEN 'incassata'
        WHEN r.expected_date IS NULL THEN 'senza data'
        WHEN r.expected_date < CURRENT_DATE THEN 'scaduta'
        WHEN r.giorni_preavviso IS NOT NULL AND r.expected_date <= CURRENT_DATE + r.giorni_preavviso THEN 'in preavviso'
        ELSE 'futura' END,
      'agganciata_a_evento', r.trigger_evento,
      'giorni_preavviso', r.giorni_preavviso
    ) ORDER BY r.expected_date NULLS LAST, r.amount DESC), '[]'::jsonb)
  INTO v_tot, v_inc, v_res, v_scad, v_rate
  FROM public.v_rate_commesse_dettaglio r
  WHERE r.company_id = p_company_id AND r.order_id = v_order.id;

  RETURN jsonb_build_object(
    'ok', true,
    'commessa', v_order.order_code,
    'cliente', COALESCE(NULLIF(TRIM(v_order.client_name), ''), NULLIF(TRIM(v_order.client_company), ''), 'Cliente non indicato'),
    'valore_commessa_eur', ROUND(COALESCE(v_order.total_amount, 0)::numeric, 2),
    'piano_rate_eur', ROUND(v_tot::numeric, 2),
    'incassato_eur', ROUND(v_inc::numeric, 2),
    'residuo_eur', ROUND(v_res::numeric, 2),
    'scaduto_eur', ROUND(v_scad::numeric, 2),
    'quadra_col_valore', (ABS(COALESCE(v_order.total_amount, 0) - v_tot) < 0.01),
    'rate', v_rate,
    'nota', 'Una rata "agganciata a evento" prende la data dall''evento di cantiere: se il cantiere slitta, slitta anche l''incasso.'
  );
END;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Bonus edilizi di una commessa + versamenti da restituire (blocca prezzo)
-- ─────────────────────────────────────────────────────────────────────────────
-- La ritenuta 11% (art. 25 D.L. 78/2010) si calcola sul lordo del bonifico
-- scorporato con l'IVA CONVENZIONALE del 22% (circolare AdE 40/E/2010), non
-- con l'IVA della fattura: la banca l'aliquota vera non la conosce.
CREATE OR REPLACE FUNCTION public.silvio_tool_bonus_commessa(
  p_company_id uuid,
  p_order_code text DEFAULT NULL,
  p_order_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_order record;
  v_lines jsonb := '[]'::jsonb;
  v_n int := 0;
  v_imp numeric := 0;
  v_lordo numeric := 0;
  v_rit numeric := 0;
  v_blocchi jsonb := '[]'::jsonb;
  v_blocchi_tot numeric := 0;
  v_iva numeric;
BEGIN
  PERFORM public.assert_company_access(p_company_id);

  SELECT o.id, o.order_code, o.client_name, o.client_company, o.total_amount, o.vat_rate
    INTO v_order
  FROM public.orders o
  WHERE o.company_id = p_company_id
    AND ((p_order_id IS NOT NULL AND o.id = p_order_id)
      OR (p_order_code IS NOT NULL AND UPPER(TRIM(o.order_code)) = UPPER(TRIM(p_order_code))))
  LIMIT 1;

  IF v_order.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Commessa non trovata: serve il codice esatto o l''id.');
  END IF;

  v_iva := COALESCE(v_order.vat_rate, 22) / 100.0;

  SELECT
    COUNT(*),
    COALESCE(SUM(b.imponibile), 0),
    COALESCE(SUM(b.imponibile * (1 + v_iva)), 0),
    COALESCE(SUM((b.imponibile * (1 + v_iva)) / 1.22 * 0.11), 0),
    COALESCE(jsonb_agg(jsonb_build_object(
      'agevolazione', b.label,
      'imponibile_eur', ROUND(b.imponibile::numeric, 2),
      'lordo_bonifico_eur', ROUND((b.imponibile * (1 + v_iva))::numeric, 2),
      'aliquota_detrazione_pct', b.aliquota_detrazione,
      'detrazione_cliente_eur', CASE WHEN b.aliquota_detrazione IS NULL THEN NULL
        ELSE ROUND((b.imponibile * (1 + v_iva) * b.aliquota_detrazione / 100)::numeric, 2) END,
      'ritenuta_11_eur', ROUND(((b.imponibile * (1 + v_iva)) / 1.22 * 0.11)::numeric, 2),
      'netto_in_cassa_eur', ROUND((b.imponibile * (1 + v_iva) - (b.imponibile * (1 + v_iva)) / 1.22 * 0.11)::numeric, 2),
      'causale_bonifico', b.causale,
      'note', b.note
    ) ORDER BY b.position), '[]'::jsonb)
  INTO v_n, v_imp, v_lordo, v_rit, v_lines
  FROM public.order_bonus_lines b
  WHERE b.company_id = p_company_id AND b.order_id = v_order.id;

  SELECT
    COALESCE(SUM(bp.importo) FILTER (WHERE bp.stato <> 'restituito'), 0),
    COALESCE(jsonb_agg(jsonb_build_object(
      'importo_eur', ROUND(bp.importo::numeric, 2),
      'incassato_il', bp.data_incasso,
      'metodo', bp.metodo,
      'stato', bp.stato,
      'da_restituire_entro', bp.data_prevista_restituzione,
      'riferimento', bp.riferimento
    ) ORDER BY bp.data_incasso), '[]'::jsonb)
  INTO v_blocchi_tot, v_blocchi
  FROM public.blocca_prezzo bp
  WHERE bp.company_id = p_company_id AND bp.order_id = v_order.id;

  RETURN jsonb_build_object(
    'ok', true,
    'commessa', v_order.order_code,
    'cliente', COALESCE(NULLIF(TRIM(v_order.client_name), ''), NULLIF(TRIM(v_order.client_company), ''), 'Cliente non indicato'),
    'valore_commessa_eur', ROUND(COALESCE(v_order.total_amount, 0)::numeric, 2),
    'iva_commessa_pct', COALESCE(v_order.vat_rate, 22),
    'numero_agevolazioni', v_n,
    'bonifici_parlanti_attesi', v_n,
    'imponibile_agevolato_eur', ROUND(v_imp::numeric, 2),
    'lordo_bonifici_eur', ROUND(v_lordo::numeric, 2),
    'ritenuta_totale_11_eur', ROUND(v_rit::numeric, 2),
    'netto_in_cassa_eur', ROUND((v_lordo - v_rit)::numeric, 2),
    'quadra_col_valore', (v_n = 0 OR ABS(COALESCE(v_order.total_amount, 0) - v_imp) < 0.01),
    'agevolazioni', v_lines,
    'blocca_prezzo_da_restituire_eur', ROUND(v_blocchi_tot::numeric, 2),
    'blocca_prezzo', v_blocchi,
    'nota', 'Ogni agevolazione = un bonifico parlante separato con la sua causale: se il cliente ne fa uno solo, una detrazione salta. La ritenuta 11% la banca la calcola scorporando SEMPRE al 22%, qualunque IVA abbia la fattura. Il blocca prezzo va restituito PRIMA dei bonifici parlanti.'
  );
END;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Banca dati candidati + colloqui
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.silvio_tool_candidati_hr(
  p_company_id uuid,
  p_stato text DEFAULT NULL,
  p_ruolo text DEFAULT NULL,
  p_limit integer DEFAULT 20
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_limit int := LEAST(GREATEST(COALESCE(p_limit, 20), 1), 100);
  v_rows jsonb := '[]'::jsonb;
  v_tot int := 0;
  v_per_stato jsonb := '{}'::jsonb;
  v_colloqui int := 0;
BEGIN
  PERFORM public.assert_company_access(p_company_id);

  SELECT COUNT(*) INTO v_tot FROM public.hr_candidati WHERE company_id = p_company_id;

  SELECT COALESCE(jsonb_object_agg(stato, n), '{}'::jsonb) INTO v_per_stato
  FROM (SELECT COALESCE(stato, 'senza stato') AS stato, COUNT(*) AS n
        FROM public.hr_candidati WHERE company_id = p_company_id GROUP BY 1) s;

  SELECT COUNT(*) INTO v_colloqui
  FROM public.hr_candidati_colloqui
  WHERE company_id = p_company_id AND data_colloquio >= CURRENT_DATE;

  SELECT COALESCE(jsonb_agg(x ORDER BY x->>'ultimo_aggiornamento' DESC), '[]'::jsonb) INTO v_rows
  FROM (
    SELECT jsonb_build_object(
      'nome', TRIM(CONCAT_WS(' ', c.nome, c.cognome)),
      'ruolo', c.ruolo,
      'stato', c.stato,
      'fonte', c.fonte,
      'citta', c.citta,
      'valutazione', c.valutazione,
      'ha_cv', (c.cv_path IS NOT NULL),
      'email', c.email,
      'telefono', c.telefono,
      'ultimo_aggiornamento', c.updated_at,
      'prossimo_colloquio', (
        SELECT MIN(k.data_colloquio) FROM public.hr_candidati_colloqui k
        WHERE k.candidato_id = c.id AND k.data_colloquio >= CURRENT_DATE),
      'colloqui_fatti', (
        SELECT COUNT(*) FROM public.hr_candidati_colloqui k
        WHERE k.candidato_id = c.id AND k.data_colloquio < CURRENT_DATE)
    ) AS x
    FROM public.hr_candidati c
    WHERE c.company_id = p_company_id
      AND (p_stato IS NULL OR c.stato = p_stato)
      AND (p_ruolo IS NULL OR c.ruolo ILIKE '%' || p_ruolo || '%')
    ORDER BY c.updated_at DESC
    LIMIT v_limit
  ) t;

  RETURN jsonb_build_object(
    'ok', true,
    'candidati_totali', v_tot,
    'per_stato', v_per_stato,
    'colloqui_futuri', v_colloqui,
    'candidati', v_rows,
    'nota', CASE WHEN v_tot = 0
      THEN 'Nessun candidato in banca dati: la sezione Candidati non e ancora stata usata.'
      ELSE 'Elenco filtrabile per stato e ruolo. Il talent test vive nella scheda Selezioni, non qui.' END
  );
END;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Uffici aziendali (a chi puo' essere assegnato un passo del flusso)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.silvio_tool_uffici_aziendali(p_company_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_rows jsonb := '[]'::jsonb;
  v_n int := 0;
BEGIN
  PERFORM public.assert_company_access(p_company_id);

  SELECT COUNT(*), COALESCE(jsonb_agg(jsonb_build_object(
      'ufficio', u.nome,
      'descrizione', u.descrizione,
      'attivo', u.attivo,
      'responsabile', COALESCE(NULLIF(TRIM(CONCAT_WS(' ', pr.first_name, pr.last_name)), ''), pr.email),
      'persone', (
        SELECT COALESCE(jsonb_agg(COALESCE(NULLIF(TRIM(CONCAT_WS(' ', p2.first_name, p2.last_name)), ''), p2.email)), '[]'::jsonb)
        FROM public.ufficio_membri m
        JOIN public.profiles p2 ON p2.id = m.profile_id
        WHERE m.ufficio_id = u.id),
      'attivita_aperte', (
        SELECT COUNT(*) FROM public.tasks t
        WHERE t.ufficio_id = u.id AND t.status <> 'completata')
    ) ORDER BY COALESCE(u.sort_order, 999), u.nome), '[]'::jsonb)
  INTO v_n, v_rows
  FROM public.company_uffici u
  LEFT JOIN public.profiles pr ON pr.id = u.responsabile_id
  WHERE u.company_id = p_company_id;

  RETURN jsonb_build_object(
    'ok', true,
    'uffici_totali', v_n,
    'uffici', v_rows,
    'nota', CASE WHEN v_n = 0
      THEN 'Nessun ufficio configurato: i passi del flusso commessa si assegnano solo a persone.'
      ELSE 'Un passo assegnato a un ufficio arriva a tutte le persone dell''ufficio.' END
  );
END;
$function$;

-- Esecuzione: come tutti i silvio_tool_*, solo service_role (le edge function).
-- La guardia assert_company_access resta comunque dentro ogni funzione.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname IN (
      'silvio_tool_flusso_commessa','silvio_tool_rate_commessa','silvio_tool_bonus_commessa',
      'silvio_tool_candidati_hr','silvio_tool_uffici_aziendali')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', r.sig);
  END LOOP;
END $$;

-- ═════════════════════════════════════════════════════════════════════════════
-- TELEMETRIA CACHE PROMPT — finora invisibile
-- ═════════════════════════════════════════════════════════════════════════════
-- prompt_tokens contava tutto allo stesso prezzo: impossibile sapere se i
-- breakpoint cache_control su Anthropic stessero davvero funzionando (un token
-- riletto dalla cache costa il 10%, uno scritto il 125%). Senza questi due
-- numeri ogni ottimizzazione sui token e' a occhio.
ALTER TABLE public.ai_router_usage_log
  ADD COLUMN IF NOT EXISTS cached_tokens integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cache_write_tokens integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.ai_router_usage_log.cached_tokens IS
  'Token di input riletti dalla cache del provider (costano ~10%). 0 = cache non usata o provider senza cache.';
COMMENT ON COLUMN public.ai_router_usage_log.cache_write_tokens IS
  'Token di input scritti in cache in questa chiamata (costano ~125%).';

CREATE OR REPLACE VIEW public.v_silvio_cache_efficacia AS
SELECT
  task_key,
  date_trunc('day', created_at)::date AS giorno,
  COUNT(*) AS chiamate,
  ROUND(AVG(prompt_tokens)) AS token_input_medi,
  ROUND(AVG(cached_tokens)) AS token_da_cache_medi,
  CASE WHEN SUM(prompt_tokens) > 0
    THEN ROUND(100.0 * SUM(cached_tokens) / SUM(prompt_tokens), 1) ELSE 0 END AS quota_cache_pct,
  ROUND(SUM(cost_usd)::numeric, 4) AS costo_usd
FROM public.ai_router_usage_log
WHERE created_at > now() - interval '90 days'
GROUP BY 1, 2;

COMMENT ON VIEW public.v_silvio_cache_efficacia IS
  'Quanto della finestra di input viene riletto dalla cache invece che ripagato. Sotto il 50% su persona_silvio il prefisso non e stabile.';

REVOKE ALL ON public.v_silvio_cache_efficacia FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.v_silvio_cache_efficacia TO service_role;
