-- Bonifici del conto collegato e fatture della fatturazione interna (25/09/2026).
--
-- Richiesta di Flo: «se è collegato anche il conto corrente, si sincronizza».
-- L'abbinamento automatico dei bonifici (bank-auto-reconcile, ogni notte e dal
-- pulsante in Tesoreria) guardava solo le fatture dei provider esterni
-- (invoices): una fattura interna pagata con un bonifico restava «da
-- incassare», e con lei la rata della commessa.
--
-- Ora un bonifico abbinato a una fattura interna è il suo incasso vero:
--   · riconcilia_bonifico_fattura → registra_incasso_atomico (movimento,
--     prima nota, scadenza, stato; la rata della commessa segue col trigger),
--     la riga di prima nota porta il bonifico (bank_transaction_id: così
--     sync-prima-nota non lo riprende), il movimento bancario risulta
--     abbinato, e il registro delle riconciliazioni tiene l'incasso
--     (movimento_id);
--   · scollega_bonifico_fattura → storna quell'incasso: fattura, scadenza e
--     rata tornano da incassare, il bonifico torna libero;
--   · togliere l'incasso dal registro incassi libera anche il bonifico.

SET LOCAL lock_timeout = '3s';

ALTER TABLE public.bank_reconciliations
  ADD COLUMN IF NOT EXISTS movimento_id uuid
    REFERENCES public.movimenti_cassa_native(id) ON DELETE SET NULL;
COMMENT ON COLUMN public.bank_reconciliations.movimento_id IS
  'Incasso della fattura interna registrato da questo bonifico: scollegando si storna (scollega_bonifico_fattura).';

ALTER TABLE public.bank_reconciliations DROP CONSTRAINT IF EXISTS bank_reconciliations_target_check;
ALTER TABLE public.bank_reconciliations ADD CONSTRAINT bank_reconciliations_target_check
  CHECK (invoice_id IS NOT NULL OR scadenza_id IS NOT NULL OR movimento_id IS NOT NULL);

-- ── Abbinare un bonifico a una fattura interna ──────────────────────────
CREATE OR REPLACE FUNCTION public.riconcilia_bonifico_fattura(
  p_transaction_id uuid,
  p_documento_id uuid,
  p_match_type text DEFAULT 'manual',
  p_match_score integer DEFAULT NULL
)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  t record;
  d record;
  v_importo numeric;
  v_mov uuid;
  v_scad uuid;
BEGIN
  SELECT id, company_id, amount, transaction_type, booking_date, description,
         linked_invoice_id, linked_installment_id, linked_scadenza_id, linked_cost_id
    INTO t FROM public.bank_transactions WHERE id = p_transaction_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Movimento bancario non trovato' USING ERRCODE = 'P0002';
  END IF;
  -- Dall'app: solo l'azienda del movimento. Dal cron (senza utente): tutte.
  IF auth.uid() IS NOT NULL AND public.user_can_access_company(t.company_id) IS NOT TRUE THEN
    RAISE EXCEPTION 'Accesso negato' USING ERRCODE = '42501';
  END IF;
  IF t.transaction_type <> 'credit' THEN
    RAISE EXCEPTION 'Una fattura si incassa con un accredito, non con un addebito.' USING ERRCODE = '22023';
  END IF;
  IF t.linked_invoice_id IS NOT NULL OR t.linked_installment_id IS NOT NULL
     OR t.linked_scadenza_id IS NOT NULL OR t.linked_cost_id IS NOT NULL
     OR EXISTS (SELECT 1 FROM public.bank_reconciliations r
                 WHERE r.transaction_id = t.id AND r.unmatched_at IS NULL) THEN
    RAISE EXCEPTION 'Questo movimento bancario è già abbinato.' USING ERRCODE = '23505';
  END IF;

  SELECT id, company_id, numero, stato, totale_da_pagare, importo_pagato INTO d
    FROM public.documenti_fiscali
   WHERE id = p_documento_id AND deleted_at IS NULL
   FOR UPDATE;
  IF NOT FOUND OR d.company_id <> t.company_id THEN
    RAISE EXCEPTION 'Fattura non trovata' USING ERRCODE = 'P0002';
  END IF;
  IF d.stato IN ('bozza', 'annullata', 'stornata', 'in_invio') THEN
    RAISE EXCEPTION 'La fattura n. % adesso non si può incassare (stato: %).', d.numero, d.stato USING ERRCODE = '22023';
  END IF;

  v_importo := least(abs(t.amount), round(coalesce(d.totale_da_pagare, 0) - coalesce(d.importo_pagato, 0), 2));
  IF v_importo <= 0 THEN
    RAISE EXCEPTION 'La fattura n. % è già pagata.', d.numero USING ERRCODE = '22023';
  END IF;

  v_mov := public.registra_incasso_atomico(
    d.company_id, d.id, v_importo, 'bonifico',
    coalesce(t.booking_date, (now() AT TIME ZONE 'Europe/Rome')::date),
    left(coalesce(nullif(btrim(t.description), ''), 'Bonifico'), 140),
    '[BANCA:' || t.id::text || ']'
  );

  -- La prima nota di questo incasso È il bonifico: sync-prima-nota salta i
  -- movimenti bancari già citati da una riga di prima nota.
  UPDATE public.prima_nota_entries SET bank_transaction_id = t.id WHERE movimento_id = v_mov;

  SELECT id INTO v_scad FROM public.scadenze
   WHERE company_id = d.company_id AND notes LIKE '%[DOC:' || d.id::text || ']%' AND status <> 'annullata'
   LIMIT 1;

  UPDATE public.bank_transactions
     SET linked_scadenza_id = v_scad, reconciliation_status = 'reconciled', reconciled_at = now()
   WHERE id = t.id;

  INSERT INTO public.bank_reconciliations (
    company_id, transaction_id, scadenza_id, movimento_id, matched_amount,
    match_type, match_score, matched_at, matched_by, notes
  ) VALUES (
    d.company_id, t.id, v_scad, v_mov, v_importo,
    coalesce(p_match_type, 'manual'), p_match_score, now(), auth.uid(), 'Fattura n. ' || d.numero
  );

  RETURN v_mov;
END;
$function$;
REVOKE ALL ON FUNCTION public.riconcilia_bonifico_fattura(uuid, uuid, text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.riconcilia_bonifico_fattura(uuid, uuid, text, integer) TO authenticated, service_role;

-- ── Scollegarlo: si storna l'incasso ─────────────────────────────────────
CREATE OR REPLACE FUNCTION public.scollega_bonifico_fattura(p_reconciliation_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  rc record;
BEGIN
  SELECT id, company_id, transaction_id, movimento_id, unmatched_at INTO rc
    FROM public.bank_reconciliations WHERE id = p_reconciliation_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Riconciliazione non trovata' USING ERRCODE = 'P0002';
  END IF;
  IF auth.uid() IS NOT NULL AND public.user_can_access_company(rc.company_id) IS NOT TRUE THEN
    RAISE EXCEPTION 'Accesso negato' USING ERRCODE = '42501';
  END IF;
  IF rc.unmatched_at IS NOT NULL THEN RETURN; END IF;

  -- Fattura, scadenza e rata della commessa tornano da incassare. Lo storno
  -- chiude anche questa riconciliazione (vedi storna_incasso_atomico).
  IF rc.movimento_id IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.movimenti_cassa_native WHERE id = rc.movimento_id) THEN
    PERFORM public.storna_incasso_atomico(rc.company_id, rc.movimento_id);
  END IF;

  UPDATE public.bank_transactions
     SET linked_scadenza_id = NULL, reconciliation_status = 'pending', reconciled_at = NULL
   WHERE id = rc.transaction_id;
  UPDATE public.bank_reconciliations SET unmatched_at = now()
   WHERE id = rc.id AND unmatched_at IS NULL;
END;
$function$;
REVOKE ALL ON FUNCTION public.scollega_bonifico_fattura(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.scollega_bonifico_fattura(uuid) TO authenticated, service_role;

-- ── Togliere l'incasso dal registro libera anche il bonifico ─────────────
-- Come in 20280925020000, più: se l'incasso veniva da un bonifico, la
-- riconciliazione si chiude e il movimento bancario torna libero.
CREATE OR REPLACE FUNCTION public.storna_incasso_atomico(p_company_id uuid, p_movimento_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_importo numeric; v_documento_id uuid; v_totale numeric; v_pagato numeric;
  v_nuovo_pagato numeric; v_nuovo_stato text; v_sdi_stato text; v_sdi_id text;
  v_tx uuid;
BEGIN
  IF public.get_my_company_id() IS DISTINCT FROM p_company_id THEN
    IF auth.uid() IS NOT NULL THEN
      RAISE EXCEPTION 'Accesso negato: non autorizzato per questa azienda';
    END IF;
  END IF;

  SELECT importo, documento_id INTO v_importo, v_documento_id
    FROM movimenti_cassa_native
   WHERE id = p_movimento_id AND company_id = p_company_id
   FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Movimento non trovato o accesso negato'; END IF;

  -- Veniva da un bonifico: la riconciliazione si chiude e il bonifico torna libero.
  FOR v_tx IN
    UPDATE bank_reconciliations SET unmatched_at = now()
     WHERE movimento_id = p_movimento_id AND unmatched_at IS NULL
    RETURNING transaction_id
  LOOP
    UPDATE bank_transactions
       SET linked_scadenza_id = NULL, reconciliation_status = 'pending', reconciled_at = NULL
     WHERE id = v_tx;
  END LOOP;

  IF v_documento_id IS NOT NULL THEN
    UPDATE scadenze
       SET paid_amount = GREATEST(0, COALESCE(paid_amount, 0) - v_importo),
           status = CASE WHEN COALESCE(paid_amount, 0) - v_importo > 0.01 THEN 'parziale' ELSE 'da_pagare' END,
           paid_date = CASE WHEN COALESCE(paid_amount, 0) - v_importo > 0.01 THEN paid_date ELSE NULL END,
           prima_nota_entry_id = CASE
             WHEN prima_nota_entry_id IN (SELECT pn.id FROM prima_nota_entries pn WHERE pn.movimento_id = p_movimento_id)
             THEN NULL ELSE prima_nota_entry_id END,
           updated_at = now()
     WHERE company_id = p_company_id
       AND notes LIKE '%[DOC:' || v_documento_id::text || ']%'
       AND status <> 'annullata';
  END IF;

  DELETE FROM movimenti_cassa_native WHERE id = p_movimento_id AND company_id = p_company_id;

  IF v_documento_id IS NOT NULL THEN
    SELECT totale_da_pagare, importo_pagato, sdi_stato, sdi_id_trasmissione
      INTO v_totale, v_pagato, v_sdi_stato, v_sdi_id
      FROM documenti_fiscali WHERE id = v_documento_id AND company_id = p_company_id FOR UPDATE;
    IF FOUND THEN
      v_nuovo_pagato := GREATEST(0, v_pagato - v_importo);
      v_nuovo_stato := CASE
        WHEN v_nuovo_pagato >= v_totale THEN 'pagata'
        WHEN v_nuovo_pagato > 0 THEN 'parzialmente_pagata'
        ELSE public.stato_documento_da_sdi(v_sdi_stato, v_sdi_id) END;
      UPDATE documenti_fiscali SET importo_pagato = v_nuovo_pagato, stato = v_nuovo_stato,
        pagato_at = CASE WHEN v_nuovo_stato = 'pagata' THEN pagato_at ELSE NULL END, updated_at = now()
      WHERE id = v_documento_id;
    END IF;
  END IF;
END; $function$;
