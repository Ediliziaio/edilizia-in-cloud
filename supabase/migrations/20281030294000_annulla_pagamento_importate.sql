-- «Annulla incasso» anche sulle fatture importate da un gestionale (30/10/2026).
--
-- Per le fatture importate (invoices con external_provider) il pagato lo
-- decide il gestionale; i pagamenti registrati in app stanno in
-- invoice_payments e billing-payment-push li porta su Fatture in Cloud.
-- Fino a oggi un pagamento sbagliato si toglieva solo scollegando il bonifico
-- in Tesoreria; uno segnato a mano non si toglieva affatto.
--
-- 1. pagamenti_fattura_importata: lo storico nella stessa forma di
--    incassi_fattura (così il pannello è lo stesso delle native), con il
--    bonifico se il pagamento viene da una riconciliazione ('recon:<id>').
-- 2. annulla_pagamento_importata: toglie il pagamento in una transazione; se
--    veniva da un bonifico chiude la riconciliazione e libera il movimento.
--    Restituisce l'importo, che l'app manda a billing-payment-push
--    { azione: "annulla" } perché lo tolga anche dal gestionale.
--
-- Chi: chi può registrare incassi (puo_incassare_fatture) nell'azienda della
-- fattura (user_can_access_company). Chiuse ad anon.

CREATE OR REPLACE FUNCTION public.pagamenti_fattura_importata(p_invoice_id uuid)
RETURNS TABLE (
  id uuid,
  data_movimento date,
  importo numeric,
  metodo text,
  riferimento text,
  note text,
  created_at timestamptz,
  parlante boolean,
  riconciliazione_id uuid,
  abbinamento text,
  bonifico_id uuid,
  bonifico_data date,
  bonifico_importo numeric,
  bonifico_descrizione text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_company uuid;
BEGIN
  SELECT i.company_id INTO v_company FROM public.invoices i WHERE i.id = p_invoice_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Fattura non trovata' USING ERRCODE = 'P0002';
  END IF;
  IF auth.uid() IS NOT NULL AND (
       public.user_can_access_company(v_company) IS NOT TRUE
       OR NOT public.puo_incassare_fatture(v_company)) THEN
    RAISE EXCEPTION 'Non hai il permesso di vedere gli incassi di questa fattura.' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT p.id, p.payment_date, p.amount,
         CASE p.payment_method WHEN 'bank_transfer' THEN 'bonifico' WHEN 'cash' THEN 'contanti'
              WHEN 'card' THEN 'carta' WHEN 'check' THEN 'assegno' ELSE p.payment_method END,
         p.reference, p.notes, p.created_at,
         false,
         r.id, r.match_type, t.id, t.booking_date, abs(t.amount),
         left(coalesce(nullif(btrim(t.description), ''), t.counterparty_name, t.debtor_name, ''), 200)
    FROM public.invoice_payments p
    LEFT JOIN public.bank_reconciliations r
           ON p.reference LIKE 'recon:%'
          AND r.id::text = substr(p.reference, 7)
          AND r.unmatched_at IS NULL
    LEFT JOIN public.bank_transactions t ON t.id = r.transaction_id
   WHERE p.invoice_id = p_invoice_id
     AND p.company_id = v_company
   ORDER BY p.payment_date DESC, p.created_at DESC;
END;
$function$;

REVOKE ALL ON FUNCTION public.pagamenti_fattura_importata(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pagamenti_fattura_importata(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.annulla_pagamento_importata(p_payment_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  p record;
  v_rec uuid;
  v_tx uuid;
BEGIN
  SELECT ip.id, ip.invoice_id, ip.company_id, ip.amount, ip.reference, i.external_provider
    INTO p
    FROM public.invoice_payments ip
    JOIN public.invoices i ON i.id = ip.invoice_id
   WHERE ip.id = p_payment_id
   FOR UPDATE OF ip;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pagamento non trovato' USING ERRCODE = 'P0002';
  END IF;
  IF auth.uid() IS NOT NULL AND (
       public.user_can_access_company(p.company_id) IS NOT TRUE
       OR NOT public.puo_incassare_fatture(p.company_id)) THEN
    RAISE EXCEPTION 'Non hai il permesso di annullare incassi.' USING ERRCODE = '42501';
  END IF;

  -- Veniva da un bonifico: la riconciliazione si chiude e il bonifico torna libero.
  IF p.reference LIKE 'recon:%' THEN
    UPDATE public.bank_reconciliations
       SET unmatched_at = now(), unmatch_reason = 'Incasso annullato dalla fattura'
     WHERE id::text = substr(p.reference, 7) AND unmatched_at IS NULL
    RETURNING id, transaction_id INTO v_rec, v_tx;
    IF v_tx IS NOT NULL THEN
      UPDATE public.bank_transactions
         SET linked_invoice_id = NULL, reconciliation_status = 'pending', reconciled_at = NULL
       WHERE id = v_tx AND linked_invoice_id = p.invoice_id;
    END IF;
  END IF;

  DELETE FROM public.invoice_payments WHERE id = p.id;

  RETURN jsonb_build_object(
    'invoice_id', p.invoice_id,
    'importo', p.amount,
    'esterna', p.external_provider IS NOT NULL,
    'provider', p.external_provider,
    'bonifico_liberato', v_tx
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.annulla_pagamento_importata(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.annulla_pagamento_importata(uuid) TO authenticated, service_role;
