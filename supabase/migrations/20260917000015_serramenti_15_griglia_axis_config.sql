-- Listini Serramenti Avanzati — STEP 3
-- Estensione listino_griglia: axis_config + supplier tracking + nuovo unique.
--
-- Motivazione:
--   Una stessa famiglia (es. "Finestra 1 anta") può avere più fasce tariffarie
--   differenti per combinazione profilo/colore/vetro. Il DB originale supporta
--   solo (family_id, valore_x, valore_y) come chiave unica → non permette 2
--   prezzi diversi per stessa L×H. axis_config è il discriminatore JSONB.
--
--   Inoltre tracciamo supplier_catalog_id e supplier_product_line_id sulla
--   cella per ricalcolo a cascata quando sconto/ricarico cambia (STEP 6+).
--
-- Backward compat:
--   axis_config NULL → comportamento identico a prima. COALESCE({}) nel
--   unique garantisce corretta gestione NULL.
--
-- Idempotente (IF NOT EXISTS, DROP INDEX IF EXISTS).

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. Nuove colonne
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.listino_griglia
  ADD COLUMN IF NOT EXISTS axis_config JSONB;

ALTER TABLE public.listino_griglia
  ADD COLUMN IF NOT EXISTS supplier_catalog_id UUID
    REFERENCES public.supplier_catalogs(id) ON DELETE SET NULL;

ALTER TABLE public.listino_griglia
  ADD COLUMN IF NOT EXISTS supplier_product_line_id UUID
    REFERENCES public.supplier_product_lines(id) ON DELETE SET NULL;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. Indici
-- ═══════════════════════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_griglia_supplier_catalog
  ON public.listino_griglia(supplier_catalog_id)
  WHERE supplier_catalog_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_griglia_supplier_line
  ON public.listino_griglia(supplier_product_line_id)
  WHERE supplier_product_line_id IS NOT NULL;

-- GIN index per lookup rapido su chiavi axis_config (es. WHERE axis_config @> '{"profilo":"veka70"}')
CREATE INDEX IF NOT EXISTS idx_griglia_axis_config_gin
  ON public.listino_griglia USING GIN (axis_config jsonb_path_ops)
  WHERE axis_config IS NOT NULL;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. Rimpiazzo vincolo UNIQUE per supportare multi-fascia
-- ═══════════════════════════════════════════════════════════════════════════

-- Il vecchio idx_griglia_family_xy_unique (FASE 4.5) blocca 2 prezzi diversi
-- su stessa (family, x, y). Sostituiamo con uno che include axis_config.
DROP INDEX IF EXISTS public.idx_griglia_family_xy_unique;

-- COALESCE(axis_config, '{}'::jsonb) assicura che NULL e {} (empty object)
-- siano trattati come equivalenti nel confronto di unicità.
CREATE UNIQUE INDEX IF NOT EXISTS idx_griglia_family_axis_xy_unique
  ON public.listino_griglia (
    family_id,
    (COALESCE(axis_config, '{}'::jsonb)),
    valore_x,
    valore_y
  )
  WHERE family_id IS NOT NULL;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. Commenti
-- ═══════════════════════════════════════════════════════════════════════════

COMMENT ON COLUMN public.listino_griglia.axis_config IS
  'Configurazione assi (fascia/variante) che discrimina il prezzo su stessa L×H. Es.: {"profilo":"veka70","colore":"bianco_standard"}. NULL = fascia base.';

COMMENT ON COLUMN public.listino_griglia.supplier_catalog_id IS
  'Fornitore della cella (opzionale). Utile per ricalcolo a cascata quando sconto_default cambia.';

COMMENT ON COLUMN public.listino_griglia.supplier_product_line_id IS
  'Linea prodotto del fornitore (opzionale). Più fine di supplier_catalog_id: permette override sconto linea.';

COMMENT ON INDEX public.idx_griglia_family_axis_xy_unique IS
  'Unicità cella per (famiglia, axis_config, L, H). Rimpiazza idx_griglia_family_xy_unique per supportare multi-fascia.';
