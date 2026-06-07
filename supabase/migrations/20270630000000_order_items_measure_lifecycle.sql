-- ════════════════════════════════════════════════════════════════════════════
-- Order Items — Ciclo di vita delle MISURE (prodotti su misura)
-- ----------------------------------------------------------------------------
-- L'order_item diventa la "spina dorsale viva" dell'articolo su misura:
-- nasce dal preventivo (porta con sé famiglia + assi + misure INIZIALI), viene
-- arricchito dal sopralluogo con le misure DEFINITIVE, e alimenta l'ordine al
-- fornitore con le misure giuste.
--
-- Scelte (confermate con l'utente):
--  · order_items ESTESO (niente tabella nuova)
--  · misure per-asse in jsonb (flessibile: {larghezza:600, altezza:700, ...})
--  · legame ESPLICITO order_item ↔ elemento sopralluogo (no auto-match)
--  · scostamento = SOLO AVVISO (nessun ricalcolo prezzo automatico)
--
-- NB: surveys.order_id / estimate_id / supplier_order_id sono soft-link già
--     esistenti: qui aggiungo solo gli indici per ritrovarli dalla commessa.
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS family_id         uuid REFERENCES public.article_families(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS axis_selections   jsonb,
  ADD COLUMN IF NOT EXISTS misure_preventivo jsonb,
  ADD COLUMN IF NOT EXISTS misure_rilevate   jsonb,
  ADD COLUMN IF NOT EXISTS measure_status    text,
  ADD COLUMN IF NOT EXISTS measure_variance  jsonb,
  ADD COLUMN IF NOT EXISTS survey_id         uuid REFERENCES public.surveys(id)          ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS survey_element_id uuid REFERENCES public.survey_elements(id)  ON DELETE SET NULL;

-- Stato del ciclo misura (null = articolo non su misura)
ALTER TABLE public.order_items DROP CONSTRAINT IF EXISTS order_items_measure_status_chk;
ALTER TABLE public.order_items
  ADD CONSTRAINT order_items_measure_status_chk
  CHECK (measure_status IS NULL OR measure_status IN ('da_rilevare','rilevato','confermato'));

-- Vista "Controllo misure": articoli su misura in attesa/da confermare per commessa
CREATE INDEX IF NOT EXISTS idx_order_items_measure_status
  ON public.order_items(order_id, measure_status)
  WHERE measure_status IS NOT NULL;

-- Ritrovare i sopralluoghi a partire dalla commessa / preventivo
CREATE INDEX IF NOT EXISTS idx_surveys_order_id
  ON public.surveys(order_id) WHERE order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_surveys_estimate_id
  ON public.surveys(estimate_id) WHERE estimate_id IS NOT NULL;

COMMENT ON COLUMN public.order_items.family_id IS 'Articolo su misura: famiglia listino (copiata dal preventivo).';
COMMENT ON COLUMN public.order_items.axis_selections IS 'Selezioni assi configurazione (copiate dal preventivo): {axisCode: axisValueId}.';
COMMENT ON COLUMN public.order_items.misure_preventivo IS 'Misure iniziali da preventivo, per asse: {larghezza:600, altezza:700}.';
COMMENT ON COLUMN public.order_items.misure_rilevate IS 'Misure definitive rilevate al sopralluogo, per asse.';
COMMENT ON COLUMN public.order_items.measure_status IS 'Ciclo misura su misura: da_rilevare -> rilevato -> confermato (null = non su misura).';
COMMENT ON COLUMN public.order_items.measure_variance IS 'Scostamenti preventivo<->rilevato per la vista controllo: {larghezza:{prev,def,delta}}.';
COMMENT ON COLUMN public.order_items.survey_id IS 'Sopralluogo collegato che ha rilevato le misure.';
COMMENT ON COLUMN public.order_items.survey_element_id IS 'Elemento del sopralluogo associato a questa riga (legame esplicito, no auto-match).';
