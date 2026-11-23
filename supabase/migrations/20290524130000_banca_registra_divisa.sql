-- Tesoreria: un movimento di banca diviso in quote dallo stesso popup della Prima Nota
-- (23/11/2026, lotto 5). Fatture emesse, fatture ricevute, stipendi e voci senza fattura
-- (commissioni, arrotondamenti, giroconti) in un colpo solo, legati al movimento di banca.
--
-- Non è una terza strada: prima_nota_registra_divisa scrive le quote come in Prima Nota, poi
-- bank_associa_pagamenti le collega al movimento come «pagamenti già registrati» (una riga
-- ripartita per quota). Tutto nella stessa transazione: se il collegamento non riesce, non
-- resta nemmeno la registrazione.
--
-- SECURITY DEFINER perché i movimenti di banca non sono leggibili direttamente dagli utenti:
-- l'accesso lo decide private.bank_operativa_access, come per bank_associa_pagamenti; le
-- quote passano comunque dai controlli di prima_nota_registra_divisa (auth.uid()).
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '60s';

CREATE OR REPLACE FUNCTION public.banca_registra_divisa(p_company uuid, p_tx uuid, p_testata jsonb, p_quote jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  t record; v_resto numeric; v_esito jsonb; v_ids uuid[]; v_dir text;
BEGIN
  PERFORM private.bank_operativa_access(p_company, true);
  SELECT b.id, b.amount, b.transaction_type, b.booking_date, b.account_id AS bank_account_id INTO t
    FROM public.bank_transactions b WHERE b.id = p_tx AND b.company_id = p_company;
  IF NOT FOUND THEN RAISE EXCEPTION 'Movimento di banca non trovato' USING ERRCODE = 'P0002'; END IF;
  v_dir := CASE WHEN t.transaction_type = 'credit' THEN 'entrata' ELSE 'uscita' END;
  SELECT round(abs(t.amount) - coalesce(sum(r.matched_amount), 0), 2) INTO v_resto
    FROM public.bank_reconciliations r WHERE r.transaction_id = t.id AND r.unmatched_at IS NULL;
  IF round((p_testata->>'importo')::numeric, 2) <> v_resto THEN
    RAISE EXCEPTION 'Le quote devono fare quanto resta del movimento: % €', replace(to_char(v_resto, 'FM9999999990.00'), '.', ',') USING ERRCODE = '22023';
  END IF;
  -- Verso, data e conto sono quelli del movimento di banca, non quelli scritti nel popup.
  v_esito := public.prima_nota_registra_divisa(p_company,
    p_testata || jsonb_build_object('direction', v_dir, 'data', coalesce(t.booking_date, current_date),
                                    'bank_account_id', t.bank_account_id, 'account_label', 'banca'),
    p_quote);
  SELECT array_agg((x->>'prima_nota_id')::uuid) INTO v_ids FROM jsonb_array_elements(v_esito->'righe') x;
  PERFORM public.bank_associa_pagamenti(p_company, p_tx, v_ids);
  RETURN v_esito || jsonb_build_object('transazione', p_tx);
END $function$;
REVOKE ALL ON FUNCTION public.banca_registra_divisa(uuid, uuid, jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.banca_registra_divisa(uuid, uuid, jsonb, jsonb) TO authenticated;
