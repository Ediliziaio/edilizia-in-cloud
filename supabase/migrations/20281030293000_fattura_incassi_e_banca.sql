-- Incassi della fattura nativa e abbinamento al bonifico (30/10/2026).
--
-- Dalla fattura (elenco /azienda/documenti e dettaglio) si vede lo storico
-- degli incassi, si annulla un incasso sbagliato e si abbina un movimento in
-- entrata della banca collegata. Tre pezzi:
--
-- 1. incassi_fattura: lo storico leggibile, con il bonifico a cui ogni incasso
--    è abbinato e se è un incasso «parlante» (ritenuta), che si annulla solo dal
--    registro ritenute.
-- 2. movimenti_banca_per_fattura: gli accrediti non ancora abbinati, da
--    proporre sulla fattura (l'ordine per probabilità lo fa l'app).
-- 3. riconcilia_bonifico_fattura con p_movimento_id: il bonifico si può
--    abbinare a un incasso GIÀ registrato («Segna pagata» fatto a mano) invece
--    di crearne un altro. Prima l'unica strada era un incasso nuovo: con la
--    fattura già pagata a mano il bonifico restava orfano in Tesoreria, e
--    abbinarlo voleva dire stornare e ripetere. Un abbinamento automatico
--    (cron) non crea un secondo incasso uguale a uno già registrato e senza
--    bonifico: si ferma e lascia la scelta a una persona.
--    scollega_bonifico_fattura, su un abbinamento a incasso già esistente,
--    toglie solo il legame: l'incasso c'era prima e resta.
--
-- Chi: chi può registrare incassi (puo_incassare_fatture) nell'azienda della
-- fattura (user_can_access_company). Le funzioni nuove nascono chiuse ad anon.

-- 1. Storico incassi ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.incassi_fattura(p_documento_id uuid)
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
  SELECT d.company_id INTO v_company FROM public.documenti_fiscali d WHERE d.id = p_documento_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Fattura non trovata' USING ERRCODE = 'P0002';
  END IF;
  IF auth.uid() IS NOT NULL AND (
       public.user_can_access_company(v_company) IS NOT TRUE
       OR NOT public.puo_incassare_fatture(v_company)) THEN
    RAISE EXCEPTION 'Non hai il permesso di vedere gli incassi di questa fattura.' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT m.id, m.data_movimento, m.importo, m.metodo, m.riferimento, m.note, m.created_at,
         EXISTS (SELECT 1 FROM public.ritenute_bonifici rb
                  WHERE rb.movimento_id = m.id AND rb.stato <> 'stornata'),
         r.id, r.match_type, t.id, t.booking_date, abs(t.amount),
         left(coalesce(nullif(btrim(t.description), ''), t.counterparty_name, t.debtor_name, ''), 200)
    FROM public.movimenti_cassa_native m
    LEFT JOIN LATERAL (
      SELECT br.id, br.match_type, br.transaction_id
        FROM public.bank_reconciliations br
       WHERE br.movimento_id = m.id AND br.unmatched_at IS NULL
       ORDER BY br.matched_at DESC NULLS LAST
       LIMIT 1
    ) r ON true
    LEFT JOIN public.bank_transactions t ON t.id = r.transaction_id
   WHERE m.documento_id = p_documento_id
     AND m.company_id = v_company
     AND m.tipo = 'incasso'
   ORDER BY m.data_movimento DESC, m.created_at DESC;
END;
$function$;

REVOKE ALL ON FUNCTION public.incassi_fattura(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.incassi_fattura(uuid) TO authenticated, service_role;

-- 2. Accrediti da abbinare ----------------------------------------------------
CREATE OR REPLACE FUNCTION public.movimenti_banca_per_fattura(p_documento_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  d record;
  v_banca boolean;
  v_movimenti jsonb;
BEGIN
  SELECT id, company_id, data_emissione INTO d
    FROM public.documenti_fiscali WHERE id = p_documento_id AND deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Fattura non trovata' USING ERRCODE = 'P0002';
  END IF;
  IF auth.uid() IS NOT NULL AND (
       public.user_can_access_company(d.company_id) IS NOT TRUE
       OR NOT public.puo_incassare_fatture(d.company_id)) THEN
    RAISE EXCEPTION 'Non hai il permesso di abbinare incassi in questa azienda.' USING ERRCODE = '42501';
  END IF;

  SELECT EXISTS (SELECT 1 FROM public.bank_accounts a
                  WHERE a.company_id = d.company_id AND coalesce(a.is_active, true))
    INTO v_banca;

  -- Gli accrediti liberi dal mese prima dell'emissione in poi: un anticipo può
  -- arrivare prima della fattura, un saldo anche molti mesi dopo.
  SELECT coalesce(jsonb_agg(x ORDER BY x.data DESC), '[]'::jsonb) INTO v_movimenti
    FROM (
      SELECT t.id, t.booking_date AS data, abs(t.amount) AS importo,
             left(coalesce(t.description, ''), 300) AS descrizione,
             coalesce(nullif(btrim(t.counterparty_name), ''), nullif(btrim(t.debtor_name), ''),
                      nullif(btrim(t.creditor_name), '')) AS controparte,
             t.reference AS riferimento,
             coalesce(nullif(btrim(a.display_name), ''), nullif(btrim(a.account_name), '')) AS conto
        FROM public.bank_transactions t
        LEFT JOIN public.bank_accounts a ON a.id = t.account_id
       WHERE t.company_id = d.company_id
         AND t.transaction_type = 'credit'
         AND t.linked_invoice_id IS NULL AND t.linked_installment_id IS NULL
         AND t.linked_scadenza_id IS NULL AND t.linked_cost_id IS NULL
         AND coalesce(t.reconciliation_status, 'pending') <> 'reconciled'
         AND NOT EXISTS (SELECT 1 FROM public.bank_reconciliations r
                          WHERE r.transaction_id = t.id AND r.unmatched_at IS NULL)
         AND (d.data_emissione IS NULL OR t.booking_date >= d.data_emissione - 31)
       ORDER BY t.booking_date DESC
       LIMIT 300
    ) x;

  RETURN jsonb_build_object('banca_collegata', v_banca, 'movimenti', v_movimenti);
END;
$function$;

REVOKE ALL ON FUNCTION public.movimenti_banca_per_fattura(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.movimenti_banca_per_fattura(uuid) TO authenticated, service_role;

-- 3. Abbinamento: incasso nuovo oppure incasso già registrato ------------------
DROP FUNCTION IF EXISTS public.riconcilia_bonifico_fattura(uuid, uuid, text, integer);

CREATE OR REPLACE FUNCTION public.riconcilia_bonifico_fattura(
  p_transaction_id uuid,
  p_documento_id uuid,
  p_match_type text DEFAULT 'manual'::text,
  p_match_score integer DEFAULT NULL::integer,
  p_movimento_id uuid DEFAULT NULL::uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  t record;
  d record;
  m record;
  v_importo numeric;
  v_mov uuid;
  v_scad uuid;
  v_data date;
BEGIN
  SELECT id, company_id, amount, transaction_type, booking_date, description,
         linked_invoice_id, linked_installment_id, linked_scadenza_id, linked_cost_id
    INTO t FROM public.bank_transactions WHERE id = p_transaction_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Movimento bancario non trovato' USING ERRCODE = 'P0002';
  END IF;
  -- Dall'app: solo l'azienda del movimento e chi registra incassi. Dal cron (senza utente): tutte.
  IF auth.uid() IS NOT NULL AND (
       public.user_can_access_company(t.company_id) IS NOT TRUE
       OR NOT public.puo_incassare_fatture(t.company_id)) THEN
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

  IF p_movimento_id IS NOT NULL THEN
    -- Il bonifico È un incasso già registrato: nessun denaro nuovo, solo il legame.
    SELECT mc.id, mc.importo, mc.data_movimento INTO m
      FROM public.movimenti_cassa_native mc
     WHERE mc.id = p_movimento_id AND mc.documento_id = d.id
       AND mc.company_id = d.company_id AND mc.tipo = 'incasso'
     FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Incasso non trovato su questa fattura' USING ERRCODE = 'P0002';
    END IF;
    IF EXISTS (SELECT 1 FROM public.bank_reconciliations r
                WHERE r.movimento_id = m.id AND r.unmatched_at IS NULL) THEN
      RAISE EXCEPTION 'Questo incasso è già abbinato a un altro movimento della banca.' USING ERRCODE = '23505';
    END IF;
    v_mov := m.id;
    v_importo := m.importo;
  ELSE
    IF d.stato IN ('bozza', 'annullata', 'stornata', 'in_invio') THEN
      RAISE EXCEPTION 'La fattura n. % adesso non si può incassare (stato: %).', d.numero, d.stato USING ERRCODE = '22023';
    END IF;

    v_importo := least(abs(t.amount), round(coalesce(d.totale_da_pagare, 0) - coalesce(d.importo_pagato, 0)
                                            - public.documento_stornato_totale(d.id), 2));
    IF v_importo <= 0 THEN
      RAISE EXCEPTION 'La fattura n. % è già pagata.', d.numero USING ERRCODE = '22023';
    END IF;

    v_data := coalesce(t.booking_date, (now() AT TIME ZONE 'Europe/Rome')::date);

    -- Il cron non registra un secondo incasso identico a uno già fatto a mano e
    -- senza bonifico: con ogni probabilità è lo stesso pagamento. Lo decide una
    -- persona (in Tesoreria o dalla fattura, abbinando all'incasso esistente).
    IF coalesce(p_match_type, 'manual') = 'auto' AND EXISTS (
         SELECT 1 FROM public.movimenti_cassa_native mc
          WHERE mc.documento_id = d.id AND mc.tipo = 'incasso'
            AND abs(mc.importo - abs(t.amount)) <= 0.01
            AND abs(mc.data_movimento - v_data) <= 45
            AND NOT EXISTS (SELECT 1 FROM public.bank_reconciliations r
                             WHERE r.movimento_id = mc.id AND r.unmatched_at IS NULL)) THEN
      RAISE EXCEPTION 'Sulla fattura n. % c''è già un incasso uguale senza bonifico: abbinamento lasciato a mano.', d.numero
        USING ERRCODE = '23505';
    END IF;

    v_mov := public.registra_incasso_atomico(
      d.company_id, d.id, v_importo, 'bonifico', v_data,
      left(coalesce(nullif(btrim(t.description), ''), 'Bonifico'), 140),
      '[BANCA:' || t.id::text || ']'
    );
  END IF;

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
    CASE WHEN p_movimento_id IS NOT NULL THEN 'incasso_esistente' ELSE coalesce(p_match_type, 'manual') END,
    p_match_score, now(), auth.uid(), 'Fattura n. ' || d.numero
  );

  RETURN v_mov;
END;
$function$;

REVOKE ALL ON FUNCTION public.riconcilia_bonifico_fattura(uuid, uuid, text, integer, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.riconcilia_bonifico_fattura(uuid, uuid, text, integer, uuid) TO authenticated, service_role;

-- Scollegare: un incasso nato dal bonifico si storna (la fattura torna da
-- incassare); un incasso che esisteva già resta, si toglie solo il legame.
CREATE OR REPLACE FUNCTION public.scollega_bonifico_fattura(p_reconciliation_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  rc record;
BEGIN
  SELECT id, company_id, transaction_id, movimento_id, unmatched_at, match_type INTO rc
    FROM public.bank_reconciliations WHERE id = p_reconciliation_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Riconciliazione non trovata' USING ERRCODE = 'P0002';
  END IF;
  IF auth.uid() IS NOT NULL AND public.user_can_access_company(rc.company_id) IS NOT TRUE THEN
    RAISE EXCEPTION 'Accesso negato' USING ERRCODE = '42501';
  END IF;
  IF rc.unmatched_at IS NOT NULL THEN RETURN; END IF;

  IF rc.match_type = 'incasso_esistente' THEN
    IF auth.uid() IS NOT NULL AND NOT public.puo_incassare_fatture(rc.company_id) THEN
      RAISE EXCEPTION 'Non hai il permesso di modificare gli incassi.' USING ERRCODE = '42501';
    END IF;
    UPDATE public.prima_nota_entries SET bank_transaction_id = NULL
     WHERE movimento_id = rc.movimento_id AND bank_transaction_id = rc.transaction_id;
  ELSIF rc.movimento_id IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.movimenti_cassa_native WHERE id = rc.movimento_id) THEN
    -- Fattura, scadenza e rata della commessa tornano da incassare. Lo storno
    -- chiude anche questa riconciliazione (vedi storna_incasso_atomico).
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
