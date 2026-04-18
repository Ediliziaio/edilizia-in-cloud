-- Listini Serramenti Avanzati — STEP 6
-- Collega i quote_items al fornitore/linea prodotto usati per il pricing.
--
-- Motivazione:
--   Il wizard serramentista (QuoteWizardSerramenti) a partire da STEP 6 chiede
--   all'utente di scegliere quale "linea prodotto" di quale fornitore usare
--   per calcolare il prezzo della famiglia selezionata (es. Veka 70 @ sconto
--   55% + ricarico 100%). Per poter:
--     - rigenerare il prezzo in modifica del preventivo con le stesse regole
--     - tracciare statistiche di vendita per fornitore/linea
--     - calcolare margine atteso coerente
--   dobbiamo persistere le due FK sulla riga del preventivo.
--
-- Contratto:
--   - Entrambi i campi NULL → riga legacy (prodotto catalogo, tariffa, nota,
--     posa, sconto, ecc.). Preservato retro-compatibilità.
--   - supplier_catalog_id NOT NULL AND supplier_product_line_id NOT NULL →
--     riga generata dal wizard serramentista con scelta linea prodotto.
--   - ON DELETE SET NULL su entrambi: la cancellazione del fornitore/linea
--     non cancella le righe preventivo storicizzate (il prezzo unitario è
--     già stato scritto su unit_price/prezzo_acquisto).
--
-- Idempotente (ADD COLUMN IF NOT EXISTS).

ALTER TABLE public.quote_items
  ADD COLUMN IF NOT EXISTS supplier_catalog_id UUID
    REFERENCES public.supplier_catalogs(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS supplier_product_line_id UUID
    REFERENCES public.supplier_product_lines(id) ON DELETE SET NULL;

-- Indici parziali: solo le righe serramento avanzate. Evita bloat sulle
-- migliaia di righe legacy (nota, sconto, posa "normale", ecc.).
CREATE INDEX IF NOT EXISTS idx_quote_items_supplier_catalog
  ON public.quote_items(supplier_catalog_id)
  WHERE supplier_catalog_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_quote_items_supplier_product_line
  ON public.quote_items(supplier_product_line_id)
  WHERE supplier_product_line_id IS NOT NULL;

COMMENT ON COLUMN public.quote_items.supplier_catalog_id IS
  'STEP 6 Serramenti Avanzati: fornitore usato nel wizard per pricing (es. Veka). NULL per righe legacy.';

COMMENT ON COLUMN public.quote_items.supplier_product_line_id IS
  'STEP 6 Serramenti Avanzati: linea prodotto usata nel wizard (es. Veka 70). Da questa si derivano sconto override e ricarico default.';

-- Forza ricaricamento schema PostgREST per rendere le colonne visibili via API
NOTIFY pgrst, 'reload schema';
