-- ============================================================================
-- Manodopera (ex "Posa") — modalità manuale + denominazione
-- ============================================================================
-- Rinominiamo l'area "Posa" in "Manodopera" a livello UX, senza rinominare le
-- colonne legacy (posa_tariffa_default_id, posa_quantita_default, posa_linked)
-- per evitare break della codebase / dei types già distribuiti.
--
-- Aggiungiamo 4 colonne per abilitare la modalità "Importo manuale": il
-- company_admin può fissare direttamente costo di montaggio (pagato al
-- subappaltatore) e prezzo di vendita (listino cliente) senza passare da
-- tariffe_aziendali. Questo sblocca il caso d'uso "tariffa piatta a corpo
-- per questo articolo" tipico dei serramentisti.
--
-- Modalità:
--   · 'tariffa'  → usa posa_tariffa_default_id + posa_quantita_default
--                  (comportamento legacy, è il default per retrocompat)
--   · 'manuale'  → usa manodopera_costo_acquisto + manodopera_prezzo_vendita
--                  + manodopera_unita (+ quantità default)
--   · 'nessuna'  → nessuna riga manodopera auto-generata al preventivo
--
-- Backfill conservativo:
--   · famiglie con posa_tariffa_default_id != NULL → 'tariffa'
--   · altre → 'nessuna' (coerente con UX attuale: senza tariffa non nasce riga)
--
-- Idempotente: ADD COLUMN IF NOT EXISTS + UPDATE WHERE modalita IS NULL.
-- ============================================================================

ALTER TABLE public.article_families
  ADD COLUMN IF NOT EXISTS manodopera_modalita TEXT
    CHECK (manodopera_modalita IN ('tariffa','manuale','nessuna'));

ALTER TABLE public.article_families
  ADD COLUMN IF NOT EXISTS manodopera_costo_acquisto NUMERIC(12,4) NOT NULL DEFAULT 0;

ALTER TABLE public.article_families
  ADD COLUMN IF NOT EXISTS manodopera_prezzo_vendita NUMERIC(12,4) NOT NULL DEFAULT 0;

ALTER TABLE public.article_families
  ADD COLUMN IF NOT EXISTS manodopera_unita TEXT NOT NULL DEFAULT 'pz'
    CHECK (manodopera_unita IN ('pz','ml','mq','h','a_corpo'));

-- Backfill: derivato dallo stato legacy.
UPDATE public.article_families
SET    manodopera_modalita = CASE
         WHEN posa_tariffa_default_id IS NOT NULL THEN 'tariffa'
         ELSE 'nessuna'
       END
WHERE  manodopera_modalita IS NULL;

-- Default definitivo: da adesso le nuove righe nascono come 'nessuna' per
-- evitare sorprese (nessuna riga manodopera senza scelta esplicita).
ALTER TABLE public.article_families
  ALTER COLUMN manodopera_modalita SET DEFAULT 'nessuna';

ALTER TABLE public.article_families
  ALTER COLUMN manodopera_modalita SET NOT NULL;

COMMENT ON COLUMN public.article_families.manodopera_modalita IS
  'Modalità di gestione manodopera (ex "posa"): tariffa | manuale | nessuna. '
  'Quando ''manuale'' usa i campi manodopera_costo_acquisto/prezzo_vendita/unita. '
  'Quando ''tariffa'' usa posa_tariffa_default_id (legacy) e ignora i campi '
  'manuali. Default ''nessuna''.';

COMMENT ON COLUMN public.article_families.manodopera_costo_acquisto IS
  'Costo di montaggio pagato al subappaltatore/dipendente (modalità manuale). '
  'Ignorato quando manodopera_modalita != ''manuale''.';

COMMENT ON COLUMN public.article_families.manodopera_prezzo_vendita IS
  'Prezzo di vendita della manodopera al cliente (modalità manuale). '
  'Ignorato quando manodopera_modalita != ''manuale''.';

COMMENT ON COLUMN public.article_families.manodopera_unita IS
  'Unità di misura manodopera in modalità manuale: pz | ml | mq | h | a_corpo. '
  'Moltiplicata per posa_quantita_default × quantità al momento dell''aggiunta '
  'al preventivo.';

NOTIFY pgrst, 'reload schema';
