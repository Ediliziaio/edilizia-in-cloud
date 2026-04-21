-- ============================================================================
-- article_families · IVA di acquisto separata da IVA di vendita
-- ============================================================================
-- Semantica:
--  - vat_rate              → IVA di VENDITA (quella fatturata al cliente).
--                            Già presente, semantica immutata.
--  - vat_rate_acquisto     → IVA di ACQUISTO (quella pagata al fornitore).
--                            Nuova colonna: serve per scenari in cui l'IVA
--                            acquisto ≠ IVA vendita — tipicamente acquisti
--                            intra-UE/estero al 0% (reverse charge) che poi
--                            si rivendono in Italia al 22%.
--
-- I prezzi in questa tabella sono SEMPRE al netto IVA: prezzo_base_vendita e
-- prezzo_base_acquisto non includono le aliquote. Le IVA sono metadata
-- contabili applicate a valle dalla pipeline preventivi / fatturazione.
--
-- Retrocompat: righe esistenti ottengono vat_rate_acquisto = vat_rate (cioè
-- l'assunzione pre-migration di "IVA acquisto = IVA vendita"). In seguito
-- l'utente può distinguere le due aliquote solo dove necessario.
-- ============================================================================

ALTER TABLE public.article_families
  ADD COLUMN IF NOT EXISTS vat_rate_acquisto NUMERIC(5,2) NOT NULL DEFAULT 22;

-- Backfill idempotente: righe con default 22 ricevono il valore di vat_rate
-- se diverso. Senza questa UPDATE una famiglia pre-migration con vat_rate=10
-- finirebbe con vat_rate_acquisto=22 creando un mismatch retroattivo.
UPDATE public.article_families
  SET vat_rate_acquisto = vat_rate
  WHERE vat_rate_acquisto = 22
    AND vat_rate <> 22;

-- Check range [0, 100] (stessa logica di vat_rate). 0 è ammesso per reverse
-- charge / acquisti intracomunitari.
ALTER TABLE public.article_families
  DROP CONSTRAINT IF EXISTS article_families_vat_rate_acquisto_check;
ALTER TABLE public.article_families
  ADD CONSTRAINT article_families_vat_rate_acquisto_check
    CHECK (vat_rate_acquisto >= 0 AND vat_rate_acquisto <= 100);

COMMENT ON COLUMN public.article_families.vat_rate IS
  'IVA di VENDITA (%) — aliquota addebitata al cliente in fattura. '
  'Range [0, 100]. 0 = reverse charge / vendita estero.';

COMMENT ON COLUMN public.article_families.vat_rate_acquisto IS
  'IVA di ACQUISTO (%) — aliquota pagata al fornitore. '
  'Range [0, 100]. 0 = acquisto intra-UE / estero con reverse charge. '
  'Può differire da vat_rate quando si compra estero e si vende in Italia.';

-- Force PostgREST schema cache reload
NOTIFY pgrst, 'reload schema';
