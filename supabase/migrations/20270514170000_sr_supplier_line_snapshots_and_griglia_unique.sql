-- Serramenti · listini fornitore e snapshot preventivo
-- Obiettivo:
-- 1) permettere piu' linee fornitore sulla stessa family/dimensione senza overwrite;
-- 2) salvare nel preventivo la linea fornitore scelta, cosi' i ricalcoli restano
--    deterministici anche dopo refresh/edit misure.

ALTER TABLE public.sr_serramenti_progetto
  ADD COLUMN IF NOT EXISTS supplier_catalog_id uuid REFERENCES public.supplier_catalogs(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS supplier_product_line_id uuid REFERENCES public.supplier_product_lines(id) ON DELETE SET NULL;

ALTER TABLE public.sr_accessori_progetto
  ADD COLUMN IF NOT EXISTS supplier_catalog_id uuid REFERENCES public.supplier_catalogs(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS supplier_product_line_id uuid REFERENCES public.supplier_product_lines(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_sr_serramenti_supplier_line
  ON public.sr_serramenti_progetto (company_id, supplier_product_line_id)
  WHERE supplier_product_line_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sr_accessori_supplier_line
  ON public.sr_accessori_progetto (company_id, supplier_product_line_id)
  WHERE supplier_product_line_id IS NOT NULL;

-- Il vecchio vincolo ignorava supplier_product_line_id: due listini diversi
-- con stessa family + stessa misura si sovrascrivevano. Lo sostituiamo con
-- una chiave che distingue la linea fornitore, mantenendo compatibilita' per
-- celle legacy senza supplier_product_line_id.
DROP INDEX IF EXISTS public.idx_griglia_family_axis_xy_unique;
DROP INDEX IF EXISTS public.idx_griglia_family_xy_unique;

CREATE UNIQUE INDEX IF NOT EXISTS idx_griglia_family_supplier_axis_xy_unique
  ON public.listino_griglia (
    family_id,
    (COALESCE(supplier_product_line_id, '00000000-0000-0000-0000-000000000000'::uuid)),
    (COALESCE(axis_config, '{}'::jsonb)),
    valore_x,
    valore_y
  )
  WHERE family_id IS NOT NULL;

COMMENT ON COLUMN public.sr_serramenti_progetto.supplier_product_line_id IS
  'Snapshot linea prodotto fornitore usata per calcolare la riga preventivo.';
COMMENT ON COLUMN public.sr_accessori_progetto.supplier_product_line_id IS
  'Snapshot linea prodotto fornitore usata per calcolare l''accessorio.';

NOTIFY pgrst, 'reload schema';
