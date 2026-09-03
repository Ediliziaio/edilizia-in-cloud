-- Rate della commessa: l'elenco completo degli eventi con cui si incassa.
--
-- La prima versione (20280903180000) ne copriva sei. Mancavano i momenti in cui
-- in edilizia si incassa davvero: alla fattura di acconto, alla posa, al SAL,
-- alla consegna in cantiere, all'accettazione del preventivo.
--
-- Ogni evento è agganciato a un dato che esiste già:
--   accettazione_preventivo → quotes.signed_at (via orders.quote_id)
--   firma_contratto         → orders.created_at (l'apertura della commessa)
--   merce_magazzino         → orders.warehouse_arrival_date
--   consegna_cantiere       → prima spedizione arrivata (shipments_to_site.arrived_at)
--   inizio_lavori           → orders.work_start_date
--   data_posa               → orders.expected_date (la data posa del calendario)
--   sal_numero              → sal.data_sal del SAL n. `trigger_numero`
--   fine_lavori             → orders.work_end_date
--   fattura_acconto         → prima fattura emessa sulla commessa
--   fattura_saldo           → ultima fattura emessa sulla commessa
--   stato_commessa          → quando la commessa raggiunge `trigger_status_id`
--   data_fissa              → la data scritta a mano sulla rata
-- Idempotente.

-- Il numero del SAL a cui la rata è agganciata ("saldo al SAL 3").
ALTER TABLE public.order_installments
  ADD COLUMN IF NOT EXISTS trigger_numero integer;
COMMENT ON COLUMN public.order_installments.trigger_numero IS
  'Solo per trigger_evento = sal_numero: il numero progressivo del SAL che rende esigibile la rata';

ALTER TABLE public.order_installments DROP CONSTRAINT IF EXISTS order_installments_trigger_evento_check;
ALTER TABLE public.order_installments
  ADD CONSTRAINT order_installments_trigger_evento_check
  CHECK (trigger_evento IN (
    'data_fissa', 'firma_contratto', 'accettazione_preventivo',
    'merce_magazzino', 'consegna_cantiere',
    'inizio_lavori', 'data_posa', 'sal_numero', 'fine_lavori',
    'fattura_acconto', 'fattura_saldo',
    'stato_commessa'
  ));

-- La vista dipende dalla funzione: si smonta e si rimonta.
DROP VIEW IF EXISTS public.v_rate_commessa_stato;
DROP FUNCTION IF EXISTS public.data_attesa_rata(text, date, uuid, uuid, timestamptz, date, date, date);

CREATE OR REPLACE FUNCTION public.data_attesa_rata(
  p_evento         text,
  p_expected_date  date,
  p_status_id      uuid,
  p_order_id       uuid,
  p_created_at     timestamptz,
  p_merce          date,
  p_inizio         date,
  p_fine           date,
  p_posa           date DEFAULT NULL,
  p_quote_id       uuid DEFAULT NULL,
  p_numero         integer DEFAULT NULL
) RETURNS date
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE coalesce(p_evento, 'data_fissa')
    -- La firma del contratto non ha una colonna sua: l'apertura della commessa
    -- è il momento più vicino che il sistema conosce davvero.
    WHEN 'firma_contratto' THEN p_created_at::date
    WHEN 'accettazione_preventivo' THEN (
      SELECT coalesce(q.signed_at::date, q.updated_at::date)
      FROM public.quotes q WHERE q.id = p_quote_id
    )
    WHEN 'merce_magazzino' THEN p_merce
    WHEN 'consegna_cantiere' THEN (
      SELECT min(s.arrived_at)::date
      FROM public.shipments_to_site s
      WHERE s.order_id = p_order_id AND s.arrived_at IS NOT NULL
    )
    WHEN 'inizio_lavori' THEN p_inizio
    -- `orders.expected_date` è la data posa: è così che la legge il calendario.
    WHEN 'data_posa' THEN p_posa
    WHEN 'sal_numero' THEN (
      SELECT min(sl.data_sal)
      FROM public.sal sl
      WHERE sl.order_id = p_order_id
        AND (p_numero IS NULL OR sl.numero_progressivo = p_numero)
    )
    WHEN 'fine_lavori' THEN p_fine
    -- Acconto = la PRIMA fattura emessa sulla commessa; saldo = l'ULTIMA.
    -- Le note di credito non contano: non sono una richiesta di denaro.
    WHEN 'fattura_acconto' THEN (
      SELECT min(inv.issue_date) FROM public.invoices inv
      WHERE inv.order_id = p_order_id AND coalesce(inv.document_type, 'invoice') <> 'credit_note'
    )
    WHEN 'fattura_saldo' THEN (
      SELECT max(inv.issue_date) FROM public.invoices inv
      WHERE inv.order_id = p_order_id AND coalesce(inv.document_type, 'invoice') <> 'credit_note'
    )
    WHEN 'stato_commessa' THEN (
      SELECT min(h.changed_at)::date
      FROM public.order_status_history h
      WHERE h.order_id = p_order_id AND h.status_id = p_status_id
    )
    ELSE p_expected_date
  END;
$$;

CREATE VIEW public.v_rate_commessa_stato
WITH (security_invoker = on) AS
SELECT
  i.id,
  i.order_id,
  o.company_id,
  o.order_code,
  o.description AS commessa,
  o.customer_id,
  i.position,
  i.label,
  i.type,
  i.amount,
  i.is_paid,
  i.paid_date,
  i.expected_date,
  i.trigger_evento,
  i.trigger_status_id,
  i.trigger_numero,
  i.giorni_preavviso,
  d.data_attesa,
  (d.data_attesa - CURRENT_DATE) AS giorni_all_evento,
  CASE
    WHEN i.is_paid                                          THEN 'pagata'
    WHEN d.data_attesa IS NULL                              THEN 'senza_data'
    WHEN d.data_attesa <= CURRENT_DATE                      THEN 'scaduta'
    WHEN d.data_attesa <= CURRENT_DATE + i.giorni_preavviso THEN 'preavviso'
    ELSE 'ok'
  END AS stato_incasso
FROM public.order_installments i
JOIN public.orders o ON o.id = i.order_id
CROSS JOIN LATERAL (
  SELECT public.data_attesa_rata(
    i.trigger_evento, i.expected_date, i.trigger_status_id,
    o.id, o.created_at, o.warehouse_arrival_date, o.work_start_date, o.work_end_date,
    o.expected_date, o.quote_id, i.trigger_numero
  ) AS data_attesa
) d;

GRANT SELECT ON public.v_rate_commessa_stato TO authenticated;

COMMENT ON VIEW public.v_rate_commessa_stato IS
  'Rate con la data attesa calcolata dall''evento del cantiere e lo stato di incasso (pagata|ok|preavviso|scaduta|senza_data). security_invoker: le RLS di order_installments e orders valgono.';

-- La creazione commessa deve salvare anche il numero del SAL.
DO $$
DECLARE
  v_src text;
  v_new text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_src
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'create_order_atomic'
  ORDER BY p.oid DESC LIMIT 1;

  IF v_src IS NULL OR position('trigger_numero' IN v_src) > 0 THEN
    RAISE NOTICE 'create_order_atomic: gia aggiornata o assente';
    RETURN;
  END IF;

  v_new := replace(v_src,
    'expected_date, trigger_evento, trigger_status_id, giorni_preavviso',
    'expected_date, trigger_evento, trigger_status_id, giorni_preavviso, trigger_numero');
  v_new := replace(v_new,
    'COALESCE((v_inst->>''giorni_preavviso'')::integer, 7)',
    'COALESCE((v_inst->>''giorni_preavviso'')::integer, 7),' || chr(10) ||
    '        NULLIF(v_inst->>''trigger_numero'', '''')::integer');

  IF v_new = v_src THEN
    RAISE WARNING 'create_order_atomic: schema INSERT rate non riconosciuto, aggiornare a mano';
    RETURN;
  END IF;
  EXECUTE v_new;
  RAISE NOTICE 'create_order_atomic: rate col numero SAL';
END $$;
