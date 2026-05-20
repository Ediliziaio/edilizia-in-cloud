-- ─────────────────────────────────────────────────────────────────────────────
-- Backfill: warehouse_lotti (legacy) → stock_lotti (unified)
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Prima di 20270520030000 c'erano DUE tabelle per i lotti:
--   - warehouse_lotti  (usata da WarehouseLottiTab versione vecchia)
--   - stock_lotti      (usata dal sistema seriali serializzati)
--
-- Dal commit ec9110595 il refactor di WarehouseLottiTab usa SOLO stock_lotti.
-- Per non perdere i lotti storici creati su warehouse_lotti, questo backfill
-- li copia in stock_lotti con il mapping campi:
--
--   warehouse_lotti.numero_lotto   →  stock_lotti.codice_lotto
--   warehouse_lotti.articolo       →  stock_lotti.articolo + descrizione
--   warehouse_lotti.fornitore      →  stock_lotti.fornitore (testo)
--   warehouse_lotti.quantita       →  stock_lotti.quantita
--   warehouse_lotti.unita_misura   →  stock_lotti.unita_misura
--   warehouse_lotti.data_scadenza  →  stock_lotti.data_scadenza
--   warehouse_lotti.note           →  stock_lotti.note  (+ marker import)
--   warehouse_lotti.created_at     →  stock_lotti.created_at
--   warehouse_lotti.company_id     →  stock_lotti.company_id
--
-- Strategia anti-duplicati: WHERE NOT EXISTS sul match (company_id + codice_lotto).
-- Re-eseguibile in sicurezza: la seconda passata non duplica nulla.
--
-- warehouse_lotti NON viene droppata (backup per audit + rollback emergency).
-- Marcheremo deprecated via COMMENT, ed eventualmente rimuoveremo in
-- migration dedicata dopo conferma utente.

DO $$
DECLARE
  v_has_legacy boolean;
  v_migrated_count integer := 0;
BEGIN
  -- Verifica se la tabella legacy esiste (può non esserci in ambienti freschi).
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'warehouse_lotti'
  ) INTO v_has_legacy;

  IF NOT v_has_legacy THEN
    RAISE NOTICE 'warehouse_lotti (legacy) non esiste, nessun backfill necessario.';
    RETURN;
  END IF;

  -- Backfill solo le righe non già presenti in stock_lotti (match per codice).
  INSERT INTO public.stock_lotti (
    company_id,
    codice_lotto,
    articolo,
    descrizione,
    fornitore,
    quantita,
    unita_misura,
    data_scadenza,
    note,
    created_at
  )
  SELECT
    w.company_id,
    w.numero_lotto,
    w.articolo,
    w.articolo,  -- descrizione legacy NOT NULL → riempire con articolo
    w.fornitore,
    w.quantita,
    COALESCE(w.unita_misura, 'pz'),
    w.data_scadenza,
    COALESCE(w.note, '') ||
      CASE WHEN COALESCE(w.note, '') = '' THEN '' ELSE E'\n' END ||
      '[import legacy warehouse_lotti ' || to_char(now(), 'YYYY-MM-DD') || ']',
    w.created_at
  FROM public.warehouse_lotti w
  WHERE NOT EXISTS (
    SELECT 1 FROM public.stock_lotti s
    WHERE s.company_id = w.company_id
      AND s.codice_lotto = w.numero_lotto
  );

  GET DIAGNOSTICS v_migrated_count = ROW_COUNT;
  IF v_migrated_count > 0 THEN
    RAISE NOTICE 'Backfill warehouse_lotti → stock_lotti: % righe migrate.', v_migrated_count;
  ELSE
    RAISE NOTICE 'Backfill warehouse_lotti → stock_lotti: nessuna riga da migrare.';
  END IF;

  -- Marca la tabella legacy come deprecata (no DROP, solo annotazione).
  EXECUTE 'COMMENT ON TABLE public.warehouse_lotti IS ' ||
    quote_literal('DEPRECATED 2027-05-20: i lotti vivono ora in stock_lotti. ' ||
    'Questa tabella è mantenuta solo per audit / rollback. ' ||
    'Non scrivere nuove righe qui. Vedi migration 20270520040000.');
END $$;
