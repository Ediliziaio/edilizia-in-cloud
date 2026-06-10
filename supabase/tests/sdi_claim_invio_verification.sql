-- ════════════════════════════════════════════════════════════════
-- Verifica fix P1 SDI — claim atomico anti doppio invio + reinvio scartate
-- (migration 20270723000000_sdi_claim_invio_idempotente.sql)
-- ════════════════════════════════════════════════════════════════
-- Esegui in Supabase SQL Editor (service_role) — PRIMA in sandbox.
-- Ogni sezione RAISE NOTICE con ✅/❌. Se vedi ❌ è un problema.
--
-- Tutto gira in transazione con ROLLBACK finale: nessun dato fixture
-- resta nel database (le NOTICE si vedono comunque).
--
-- NB: la serializzazione di due chiamate DAVVERO concorrenti è garantita
-- da Postgres (SELECT ... FOR UPDATE) e non è testabile in una singola
-- sessione. Qui verifichiamo la macchina a stati equivalente (claim →
-- in_invio → secondo claim negato). Per la prova a due sessioni vedi le
-- istruzioni in fondo al file.
-- ════════════════════════════════════════════════════════════════

BEGIN;

DO $$
DECLARE
  v_company UUID;
  v_doc UUID;
  v_claim RECORD;
  v_stato TEXT;
  v_pn_count INT;
BEGIN
  -- ─── Fixture: company + fattura in bozza ───
  INSERT INTO public.companies (name, email)
  VALUES ('TEST claim SDI (rollback)', 'test-claim-sdi-rollback@example.invalid')
  RETURNING id INTO v_company;

  INSERT INTO public.documenti_fiscali (company_id, tipo, numero, numero_progressivo, stato, totale_da_pagare, totale_documento)
  VALUES (v_company, 'fattura', 'TEST-CLAIM-001', 999901, 'bozza', 100.00, 100.00)
  RETURNING id INTO v_doc;

  -- ─── 0. La CHECK constraint accetta 'in_invio' ───
  BEGIN
    UPDATE public.documenti_fiscali SET stato = 'in_invio' WHERE id = v_doc;
    UPDATE public.documenti_fiscali SET stato = 'bozza' WHERE id = v_doc;
    RAISE NOTICE '✅ 0. CHECK constraint accetta lo stato in_invio';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE '❌ 0. CHECK constraint NON accetta in_invio — migration non applicata?';
  END;

  -- ─── 1. Emissione: bozza → emessa genera UNA prima nota ───
  UPDATE public.documenti_fiscali SET stato = 'emessa' WHERE id = v_doc;
  SELECT COUNT(*) INTO v_pn_count FROM public.prima_nota_entries WHERE invoice_id = v_doc;
  IF v_pn_count = 1 THEN
    RAISE NOTICE '✅ 1. Emissione genera 1 prima nota (trovate: %)', v_pn_count;
  ELSE
    RAISE NOTICE '❌ 1. Attesa 1 prima nota dopo emissione, trovate: %', v_pn_count;
  END IF;

  -- ─── 2. Claim da emessa → claimed=true, stato=in_invio ───
  SELECT * INTO v_claim FROM public.claim_documento_per_invio(v_doc);
  SELECT stato INTO v_stato FROM public.documenti_fiscali WHERE id = v_doc;
  IF v_claim.claimed AND v_claim.previous_stato = 'emessa' AND v_stato = 'in_invio' THEN
    RAISE NOTICE '✅ 2. Claim da emessa: claimed=true, previous=emessa, stato=in_invio';
  ELSE
    RAISE NOTICE '❌ 2. Claim da emessa fallito: claimed=%, previous=%, stato=%',
      v_claim.claimed, v_claim.previous_stato, v_stato;
  END IF;

  -- ─── 3. Secondo claim (doppio click/retry) → NEGATO ───
  SELECT * INTO v_claim FROM public.claim_documento_per_invio(v_doc);
  IF NOT v_claim.claimed AND v_claim.current_stato = 'in_invio' THEN
    RAISE NOTICE '✅ 3. Secondo claim negato (claimed=false, current=in_invio) — anti doppio invio';
  ELSE
    RAISE NOTICE '❌ 3. Secondo claim NON negato: claimed=%, current=%',
      v_claim.claimed, v_claim.current_stato;
  END IF;

  -- ─── 4. Rilascio guardato (invio fallito): in_invio → emessa ───
  UPDATE public.documenti_fiscali SET stato = 'emessa'
   WHERE id = v_doc AND stato = 'in_invio';
  SELECT stato INTO v_stato FROM public.documenti_fiscali WHERE id = v_doc;
  IF v_stato = 'emessa' THEN
    RAISE NOTICE '✅ 4. Rilascio claim: stato ripristinato a emessa';
  ELSE
    RAISE NOTICE '❌ 4. Rilascio claim fallito: stato=%', v_stato;
  END IF;

  -- ─── 5. REGRESSIONE prima nota: il ripristino NON deve duplicarla ───
  SELECT COUNT(*) INTO v_pn_count FROM public.prima_nota_entries WHERE invoice_id = v_doc;
  IF v_pn_count = 1 THEN
    RAISE NOTICE '✅ 5. Prima nota NON duplicata dopo ripristino in_invio→emessa (trovate: %)', v_pn_count;
  ELSE
    RAISE NOTICE '❌ 5. Prima nota DUPLICATA dal ripristino: trovate % (attesa 1) — trigger non patchato?', v_pn_count;
  END IF;

  -- ─── 6. Reinvio dopo scarto: claim da rifiutata → PERMESSO (bug #2) ───
  UPDATE public.documenti_fiscali SET stato = 'rifiutata' WHERE id = v_doc;
  SELECT * INTO v_claim FROM public.claim_documento_per_invio(v_doc);
  IF v_claim.claimed AND v_claim.previous_stato = 'rifiutata' THEN
    RAISE NOTICE '✅ 6. Claim da rifiutata permesso (reinvio fattura scartata)';
  ELSE
    RAISE NOTICE '❌ 6. Claim da rifiutata negato: claimed=%, previous=%',
      v_claim.claimed, v_claim.previous_stato;
  END IF;

  -- ─── 7. Rilascio dopo reinvio fallito: torna a rifiutata (non emessa!) ───
  UPDATE public.documenti_fiscali SET stato = 'rifiutata'
   WHERE id = v_doc AND stato = 'in_invio';
  SELECT stato INTO v_stato FROM public.documenti_fiscali WHERE id = v_doc;
  IF v_stato = 'rifiutata' THEN
    RAISE NOTICE '✅ 7. Rilascio dopo reinvio fallito: stato torna a rifiutata';
  ELSE
    RAISE NOTICE '❌ 7. Stato dopo rilascio: % (atteso rifiutata)', v_stato;
  END IF;

  -- ─── 8. Stati NON inviabili: claim negato ───
  UPDATE public.documenti_fiscali SET stato = 'inviata_sdi' WHERE id = v_doc;
  SELECT * INTO v_claim FROM public.claim_documento_per_invio(v_doc);
  IF NOT v_claim.claimed THEN
    RAISE NOTICE '✅ 8. Claim da inviata_sdi negato (no ritrasmissione)';
  ELSE
    RAISE NOTICE '❌ 8. Claim da inviata_sdi PERMESSO — rischio doppia trasmissione!';
  END IF;

  -- ─── 9. Documento soft-deleted: claim negato ───
  UPDATE public.documenti_fiscali SET stato = 'emessa', deleted_at = now() WHERE id = v_doc;
  SELECT * INTO v_claim FROM public.claim_documento_per_invio(v_doc);
  IF NOT v_claim.claimed THEN
    RAISE NOTICE '✅ 9. Claim su documento nel cestino negato';
  ELSE
    RAISE NOTICE '❌ 9. Claim su documento soft-deleted PERMESSO';
  END IF;

  -- ─── 10. Documento inesistente: claim negato ───
  SELECT * INTO v_claim FROM public.claim_documento_per_invio(gen_random_uuid());
  IF NOT v_claim.claimed THEN
    RAISE NOTICE '✅ 10. Claim su id inesistente negato';
  ELSE
    RAISE NOTICE '❌ 10. Claim su id inesistente PERMESSO';
  END IF;

  -- ─── 11. Guardia webhook anti-TOCTOU: update stato con .neq(in_invio) ───
  UPDATE public.documenti_fiscali SET stato = 'in_invio', deleted_at = NULL WHERE id = v_doc;
  -- Simula l'update del webhook (aggiornaStatoDaNotifica): eq(id) + neq(stato,in_invio)
  UPDATE public.documenti_fiscali SET stato = 'consegnata'
   WHERE id = v_doc AND stato <> 'in_invio';
  SELECT stato INTO v_stato FROM public.documenti_fiscali WHERE id = v_doc;
  IF v_stato = 'in_invio' THEN
    RAISE NOTICE '✅ 11. Notifica webhook NON sovrascrive in_invio (guardia atomica)';
  ELSE
    RAISE NOTICE '❌ 11. Notifica webhook ha sovrascritto in_invio: stato=%', v_stato;
  END IF;

  RAISE NOTICE '── Fine verifiche. ROLLBACK in corso: nessun dato di test persiste. ──';
END $$;

ROLLBACK;

-- ════════════════════════════════════════════════════════════════
-- PROVA DI CONCORRENZA REALE (due sessioni psql, SOLO in sandbox)
-- ════════════════════════════════════════════════════════════════
-- Sessione A:                          Sessione B:
--   BEGIN;
--   SELECT * FROM claim_documento_per_invio('<doc_id>');
--   -- (lascia la transazione aperta)
--                                        SELECT * FROM claim_documento_per_invio('<doc_id>');
--                                        -- resta BLOCCATA sul row lock (FOR UPDATE)
--   COMMIT;
--                                        -- si sblocca e ritorna claimed=false
-- Atteso: A → claimed=true · B → claimed=false. ESATTAMENTE un vincitore.
-- ════════════════════════════════════════════════════════════════
