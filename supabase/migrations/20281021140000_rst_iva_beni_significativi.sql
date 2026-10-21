-- ════════════════════════════════════════════════════════════════════════════
-- Ristrutturazione: IVA agevolata con i beni significativi (DM 29/12/1999)
-- ════════════════════════════════════════════════════════════════════════════
-- Nella manutenzione al 10% infissi, caldaie, sanitari e rubinetteria,
-- climatizzatori, ascensori… godono del 10% solo fino al valore del resto
-- della prestazione: l'eccedenza va al 22%. Prima il preventivo aveva una sola
-- aliquota per tutto.
--   rst_computo_voci.bene_significativo   la voce è un bene significativo
--   rst_progetti.iva_beni_significativi   il preventivo applica la regola
-- Solo colonne nuove con default: istantanea. Idempotente.
-- ════════════════════════════════════════════════════════════════════════════

SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '60s';

ALTER TABLE public.rst_computo_voci
  ADD COLUMN IF NOT EXISTS bene_significativo boolean NOT NULL DEFAULT false;
ALTER TABLE public.rst_progetti
  ADD COLUMN IF NOT EXISTS iva_beni_significativi boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.rst_computo_voci.bene_significativo IS
  'Bene significativo (DM 29/12/1999): con l''IVA al 10% è agevolato solo fino al valore del resto dei lavori.';
COMMENT ON COLUMN public.rst_progetti.iva_beni_significativi IS
  'Con l''IVA al 10%: le voci bene_significativo pagano il 22% sulla parte che supera il resto dei lavori.';
