-- Listini Serramenti Avanzati — STEP 2
-- Modello dati fornitori + linee prodotto.
--
-- Due tabelle per azienda:
--   - supplier_catalogs: il fornitore infissi (es. Veka, Finstral, Schuco)
--   - supplier_product_lines: linee profilo del fornitore (es. Veka 70, 76, 82)
--
-- Ogni azienda ha i suoi fornitori privati. RLS stretta per company_id
-- + super_admin bypass. Idempotente (IF NOT EXISTS / DO blocks).

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. supplier_catalogs — "anagrafica fornitore"
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.supplier_catalogs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  codice_interno TEXT,
  -- Sconto di default del fornitore sui prezzi di listino (0..1).
  -- Esempio: 0.55 = il fornitore scrive sul listino 100€ ma l'azienda paga
  -- 100 × (1 - 0.55) = 45€. Override possibile per singola linea prodotto.
  sconto_default NUMERIC(6,4) NOT NULL DEFAULT 0
    CHECK (sconto_default >= 0 AND sconto_default <= 1),
  note TEXT,
  attivo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Dedup per (company, nome): non si può avere 2 fornitori "Veka" nella stessa azienda
  UNIQUE(company_id, nome)
);

CREATE INDEX IF NOT EXISTS idx_supplier_catalogs_company
  ON public.supplier_catalogs(company_id);
CREATE INDEX IF NOT EXISTS idx_supplier_catalogs_attivo
  ON public.supplier_catalogs(company_id, attivo)
  WHERE attivo = true;

ALTER TABLE public.supplier_catalogs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'supplier_catalogs'
      AND policyname = 'supplier_catalogs_select'
  ) THEN
    CREATE POLICY supplier_catalogs_select ON public.supplier_catalogs FOR SELECT
      USING (company_id = public.get_my_company_id());
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'supplier_catalogs'
      AND policyname = 'supplier_catalogs_cud'
  ) THEN
    CREATE POLICY supplier_catalogs_cud ON public.supplier_catalogs FOR ALL
      USING (company_id = public.get_my_company_id())
      WITH CHECK (company_id = public.get_my_company_id());
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'supplier_catalogs'
      AND policyname = 'supplier_catalogs_super_admin'
  ) THEN
    CREATE POLICY supplier_catalogs_super_admin ON public.supplier_catalogs FOR ALL
      USING (public.has_role(auth.uid(), 'super_admin'));
  END IF;
END$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. supplier_product_lines — "linea profilo del fornitore"
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.supplier_product_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  supplier_catalog_id UUID NOT NULL
    REFERENCES public.supplier_catalogs(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  -- Materiale profilo: coerente con casi d'uso serramentista
  materiale TEXT NOT NULL DEFAULT 'pvc'
    CHECK (materiale IN ('pvc','alluminio','legno','legno_alluminio','acciaio')),
  -- Ricarico di default dell'azienda sul costo acquisto (0..N).
  -- Esempio: 1.0 = raddoppia il costo → vende al 200% del costo.
  ricarico_default NUMERIC(6,4) NOT NULL DEFAULT 0
    CHECK (ricarico_default >= 0),
  -- Tariffa manodopera default (FK tariffe_aziendali.id) — opzionale
  manodopera_tariffa_id UUID REFERENCES public.tariffe_aziendali(id) ON DELETE SET NULL,
  -- Override sconto fornitore per questa linea (NULL = usa supplier_catalogs.sconto_default)
  sconto_override NUMERIC(6,4)
    CHECK (sconto_override IS NULL OR (sconto_override >= 0 AND sconto_override <= 1)),
  note TEXT,
  attivo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Dedup per (supplier, nome): non si possono avere due "Veka 70" dallo stesso fornitore
  UNIQUE(supplier_catalog_id, nome)
);

CREATE INDEX IF NOT EXISTS idx_supplier_lines_company
  ON public.supplier_product_lines(company_id);
CREATE INDEX IF NOT EXISTS idx_supplier_lines_supplier
  ON public.supplier_product_lines(supplier_catalog_id);
CREATE INDEX IF NOT EXISTS idx_supplier_lines_attivo
  ON public.supplier_product_lines(company_id, attivo)
  WHERE attivo = true;

ALTER TABLE public.supplier_product_lines ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'supplier_product_lines'
      AND policyname = 'supplier_lines_select'
  ) THEN
    CREATE POLICY supplier_lines_select ON public.supplier_product_lines FOR SELECT
      USING (company_id = public.get_my_company_id());
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'supplier_product_lines'
      AND policyname = 'supplier_lines_cud'
  ) THEN
    CREATE POLICY supplier_lines_cud ON public.supplier_product_lines FOR ALL
      USING (company_id = public.get_my_company_id())
      WITH CHECK (company_id = public.get_my_company_id());
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'supplier_product_lines'
      AND policyname = 'supplier_lines_super_admin'
  ) THEN
    CREATE POLICY supplier_lines_super_admin ON public.supplier_product_lines FOR ALL
      USING (public.has_role(auth.uid(), 'super_admin'));
  END IF;
END$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. Trigger updated_at (riusa se esiste, altrimenti crea)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.tg_serramenti_listini_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_supplier_catalogs_updated_at ON public.supplier_catalogs;
CREATE TRIGGER trg_supplier_catalogs_updated_at
  BEFORE UPDATE ON public.supplier_catalogs
  FOR EACH ROW EXECUTE FUNCTION public.tg_serramenti_listini_updated_at();

DROP TRIGGER IF EXISTS trg_supplier_lines_updated_at ON public.supplier_product_lines;
CREATE TRIGGER trg_supplier_lines_updated_at
  BEFORE UPDATE ON public.supplier_product_lines
  FOR EACH ROW EXECUTE FUNCTION public.tg_serramenti_listini_updated_at();

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. Commenti manutenzione
-- ═══════════════════════════════════════════════════════════════════════════

COMMENT ON TABLE public.supplier_catalogs IS
  'Fornitori infissi per azienda serramentista (es. Veka, Finstral). Feature listini_serramenti_avanzati.';
COMMENT ON COLUMN public.supplier_catalogs.sconto_default IS
  'Sconto standard applicato ai prezzi listino del fornitore (0..1). Default azienda, override possibile per linea prodotto.';

COMMENT ON TABLE public.supplier_product_lines IS
  'Linee profilo di un fornitore (es. Veka 70, Veka 76). Ricarico default + materiale + manodopera tariffa collegata.';
COMMENT ON COLUMN public.supplier_product_lines.ricarico_default IS
  'Ricarico azienda sul costo acquisto (0..N). Esempio: 1.0 = raddoppia.';
COMMENT ON COLUMN public.supplier_product_lines.sconto_override IS
  'Override sconto fornitore per questa linea. NULL = usa supplier_catalogs.sconto_default.';
