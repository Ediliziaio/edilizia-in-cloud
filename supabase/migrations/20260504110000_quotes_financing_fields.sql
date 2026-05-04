-- MP-QF-01 — Integrazione Preventivi ↔ Finanziamenti
--
-- Aggiunge a `quotes` 5 campi per agganciare un preventivo a una proposta
-- di finanziamento calcolata via lib/finanziamenti/calcolaFinanziamento.
--
-- Tutti nullable: backward compat con preventivi esistenti senza finanziamento.

ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS financing_table_id uuid
    REFERENCES public.eic_tabelle_finanziamento(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS financing_amount numeric(12, 2),
    -- importo finanziato (di norma = total ma puo' essere diverso)
  ADD COLUMN IF NOT EXISTS financing_num_installments int,
    -- es. 12, 24, 36, 60, 84 — vincolata a durate_disponibili della tabella
  ADD COLUMN IF NOT EXISTS financing_monthly_rate numeric(10, 2),
    -- rata mensile calcolata (importo_rata da RigaTabellaFinanziamento)
  ADD COLUMN IF NOT EXISTS financing_total_due numeric(12, 2),
    -- importo totale dovuto (rata × n + spese)
  ADD COLUMN IF NOT EXISTS financing_calculation_json jsonb;
    -- snapshot del RisultatoCalcolo completo (audit trail + replay)

-- Indice per filtrare preventivi con finanziamento (analisi conversione)
CREATE INDEX IF NOT EXISTS idx_quotes_financing_table_id
  ON public.quotes(financing_table_id)
  WHERE financing_table_id IS NOT NULL;

COMMENT ON COLUMN public.quotes.financing_table_id IS
  'FK a eic_tabelle_finanziamento se il preventivo include proposta finanziamento.';
COMMENT ON COLUMN public.quotes.financing_amount IS
  'Importo finanziato (puo essere diverso dal total se finanzia solo una parte).';
COMMENT ON COLUMN public.quotes.financing_num_installments IS
  'Numero rate scelte (deve essere in durate_disponibili della tabella).';
COMMENT ON COLUMN public.quotes.financing_monthly_rate IS
  'Rata mensile calcolata (snapshot al momento della creazione).';
COMMENT ON COLUMN public.quotes.financing_total_due IS
  'Importo totale dovuto = rata × num + spese istruttoria + spese incasso.';
COMMENT ON COLUMN public.quotes.financing_calculation_json IS
  'Snapshot RisultatoCalcolo (TAN, TAEG, ICC, modalita esatto/interpolato).';
