-- Sprint 4: integrazione finanziamenti reali nel modulo Fotovoltaico
-- Aggiunge a fv_progetti i riferimenti alla tabella finanziamento scelta
-- dall'utente nel wizard step 6 + i valori autoritativi (rata, TAEG, TAN)
-- letti da eic_tabelle_finanziamento_righe.
--
-- I campi sono nullable: rimangono null per progetti "cash" o "tasso zero"
-- che non hanno una tabella finanziaria associata.

ALTER TABLE public.fv_progetti
  ADD COLUMN IF NOT EXISTS finanziamento_tabella_id UUID
    REFERENCES public.eic_tabelle_finanziamento(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS finanziamento_durata_mesi INT,
  ADD COLUMN IF NOT EXISTS finanziamento_rata_eur NUMERIC(10, 2),
  ADD COLUMN IF NOT EXISTS finanziamento_taeg NUMERIC(6, 3),
  ADD COLUMN IF NOT EXISTS finanziamento_tan NUMERIC(6, 3),
  ADD COLUMN IF NOT EXISTS finanziamento_totale_dovuto_eur NUMERIC(12, 2);

-- Indice per join rapido in dashboard / report
CREATE INDEX IF NOT EXISTS idx_fv_progetti_finanziamento_tabella
  ON public.fv_progetti(finanziamento_tabella_id)
  WHERE finanziamento_tabella_id IS NOT NULL;

COMMENT ON COLUMN public.fv_progetti.finanziamento_tabella_id IS
  'FK alla tabella finanziamento scelta dal venditore nel wizard step 6 (Sprint 4).';
COMMENT ON COLUMN public.fv_progetti.finanziamento_rata_eur IS
  'Rata mensile reale dal lookup eic_tabelle_finanziamento_righe (Sprint 4).';
COMMENT ON COLUMN public.fv_progetti.finanziamento_taeg IS
  'TAEG validato server-side contro soglia ARERA antiusura (Sprint 4).';
