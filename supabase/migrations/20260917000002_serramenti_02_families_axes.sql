-- Preventivatore Verticalizzato Serramentisti — FASE 2.1
-- Data model famiglie / assi / maggiorazioni + estensione listino_griglia e
-- article_templates.
--
-- Idempotente (IF NOT EXISTS / DO blocks per policy/trigger/constraint).
--
-- Decisione su listino_griglia.prodotto_id:
-- la migration originale (20260324200015) dichiara `prodotto_id UUID NOT NULL`.
-- La DoD FASE 2 richiede che listino_griglia possa avere righe con solo
-- family_id (senza prodotto_id). Per rendere vero il CHECK
-- "prodotto_id IS NOT NULL OR family_id IS NOT NULL" droppiamo il NOT NULL
-- su prodotto_id: il CHECK preserva l'invariante (almeno uno dei due).
-- Operazione non distruttiva per righe esistenti (hanno prodotto_id valorizzato).

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. article_families
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.article_families (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  vertical TEXT NOT NULL,
  categoria_id UUID REFERENCES public.listino_categorie(id) ON DELETE SET NULL,
  nome TEXT NOT NULL,
  descrizione TEXT,
  immagine_url TEXT,
  pdf_scheda_url TEXT,
  modalita_prezzo_base TEXT NOT NULL DEFAULT 'griglia'
    CHECK (modalita_prezzo_base IN ('pz','mq','griglia','misura_libera')),
  prezzo_base_vendita NUMERIC(12,4) DEFAULT 0,
  prezzo_base_acquisto NUMERIC(12,4) DEFAULT 0,
  vat_rate NUMERIC(5,2) DEFAULT 22,
  unit_of_measure TEXT DEFAULT 'pz',
  -- Posa default collegata
  posa_tariffa_default_id UUID REFERENCES public.tariffe_aziendali(id),
  posa_quantita_default NUMERIC DEFAULT 1,
  -- Per modalità griglia, etichette degli assi dimensionali
  griglia_asse_x_label TEXT DEFAULT 'Larghezza (mm)',
  griglia_asse_y_label TEXT DEFAULT 'Altezza (mm)',
  griglia_unita TEXT DEFAULT 'mm',
  attivo BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  custom_field_values JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_families_company ON public.article_families(company_id);
CREATE INDEX IF NOT EXISTS idx_families_vertical ON public.article_families(vertical);
CREATE INDEX IF NOT EXISTS idx_families_categoria ON public.article_families(categoria_id);
CREATE INDEX IF NOT EXISTS idx_families_company_sort ON public.article_families(company_id, sort_order);

ALTER TABLE public.article_families ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'article_families' AND policyname = 'families_select'
  ) THEN
    CREATE POLICY families_select ON public.article_families FOR SELECT
      USING (company_id = public.get_my_company_id());
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'article_families' AND policyname = 'families_cud'
  ) THEN
    CREATE POLICY families_cud ON public.article_families FOR ALL
      USING (company_id = public.get_my_company_id())
      WITH CHECK (company_id = public.get_my_company_id());
  END IF;
END$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. article_family_axes
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.article_family_axes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES public.article_families(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  codice TEXT NOT NULL,
  descrizione TEXT,
  tipo TEXT NOT NULL DEFAULT 'discrete'
    CHECK (tipo IN ('discrete','boolean')),
  obbligatorio BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(family_id, codice)
);

CREATE INDEX IF NOT EXISTS idx_axes_family ON public.article_family_axes(family_id);

ALTER TABLE public.article_family_axes ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'article_family_axes' AND policyname = 'axes_select'
  ) THEN
    CREATE POLICY axes_select ON public.article_family_axes FOR SELECT
      USING (company_id = public.get_my_company_id());
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'article_family_axes' AND policyname = 'axes_cud'
  ) THEN
    CREATE POLICY axes_cud ON public.article_family_axes FOR ALL
      USING (company_id = public.get_my_company_id())
      WITH CHECK (company_id = public.get_my_company_id());
  END IF;
END$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. article_family_axis_values
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.article_family_axis_values (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  axis_id UUID NOT NULL REFERENCES public.article_family_axes(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  valore TEXT NOT NULL,
  label TEXT NOT NULL,
  descrizione TEXT,
  is_default BOOLEAN DEFAULT false,
  -- Maggiorazione applicata quando questo valore è selezionato
  maggiorazione_tipo TEXT NOT NULL DEFAULT 'none'
    CHECK (maggiorazione_tipo IN ('none','percentuale','fisso_pz','fisso_mq','fisso_ml','fisso_mc')),
  maggiorazione_valore NUMERIC(12,4) DEFAULT 0,
  maggiorazione_acquisto NUMERIC(12,4) DEFAULT 0,
  sort_order INTEGER DEFAULT 0,
  attivo BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(axis_id, valore)
);

CREATE INDEX IF NOT EXISTS idx_axis_values_axis ON public.article_family_axis_values(axis_id);

ALTER TABLE public.article_family_axis_values ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'article_family_axis_values' AND policyname = 'axis_values_select'
  ) THEN
    CREATE POLICY axis_values_select ON public.article_family_axis_values FOR SELECT
      USING (company_id = public.get_my_company_id());
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'article_family_axis_values' AND policyname = 'axis_values_cud'
  ) THEN
    CREATE POLICY axis_values_cud ON public.article_family_axis_values FOR ALL
      USING (company_id = public.get_my_company_id())
      WITH CHECK (company_id = public.get_my_company_id());
  END IF;
END$$;

-- Super admin bypass (coerente con pattern già usato su listino_griglia/altre tabelle)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'article_families' AND policyname = 'families_super_admin'
  ) THEN
    CREATE POLICY families_super_admin ON public.article_families FOR ALL
      USING (public.has_role(auth.uid(), 'super_admin'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'article_family_axes' AND policyname = 'axes_super_admin'
  ) THEN
    CREATE POLICY axes_super_admin ON public.article_family_axes FOR ALL
      USING (public.has_role(auth.uid(), 'super_admin'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'article_family_axis_values' AND policyname = 'axis_values_super_admin'
  ) THEN
    CREATE POLICY axis_values_super_admin ON public.article_family_axis_values FOR ALL
      USING (public.has_role(auth.uid(), 'super_admin'));
  END IF;
END$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. Estensione listino_griglia: family_id + rilassamento NOT NULL prodotto_id
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.listino_griglia
  ADD COLUMN IF NOT EXISTS family_id UUID REFERENCES public.article_families(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_griglia_family ON public.listino_griglia(family_id);

-- Rilassa NOT NULL su prodotto_id (legacy) per permettere righe family-only.
-- Il CHECK successivo preserva l'invariante (almeno uno tra prodotto_id/family_id).
ALTER TABLE public.listino_griglia
  ALTER COLUMN prodotto_id DROP NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'griglia_prodotto_or_family'
      AND conrelid = 'public.listino_griglia'::regclass
  ) THEN
    ALTER TABLE public.listino_griglia
      ADD CONSTRAINT griglia_prodotto_or_family
      CHECK (prodotto_id IS NOT NULL OR family_id IS NOT NULL);
  END IF;
END$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. Estensione article_templates: legame opzionale a family_id
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.article_templates
  ADD COLUMN IF NOT EXISTS family_id UUID REFERENCES public.article_families(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_articles_family ON public.article_templates(family_id);

-- ═══════════════════════════════════════════════════════════════════════════
-- 6. Trigger updated_at su article_families
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.tg_families_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_families_updated_at ON public.article_families;
CREATE TRIGGER trg_families_updated_at
  BEFORE UPDATE ON public.article_families
  FOR EACH ROW EXECUTE FUNCTION public.tg_families_updated_at();

-- ═══════════════════════════════════════════════════════════════════════════
-- 7. Commenti per manutenzione futura
-- ═══════════════════════════════════════════════════════════════════════════

COMMENT ON TABLE public.article_families IS
  'Famiglie di articoli verticalizzati (es. "Finestra 2 ante"). Ogni famiglia ha una modalità prezzo (pz/mq/griglia/misura_libera) e uno o più assi configurabili. Fondazione FASE 2 Preventivatore Serramenti.';
COMMENT ON TABLE public.article_family_axes IS
  'Assi di configurazione di una famiglia (es. "Apertura", "Materiale", "Vetro"). Codice snake_case usato come chiave nel JSONB valori_assi del quote_item.';
COMMENT ON TABLE public.article_family_axis_values IS
  'Valori ammessi per un asse + maggiorazione applicata (percentuale o fissa per pz/mq/ml/mc).';
COMMENT ON COLUMN public.listino_griglia.family_id IS
  'Legame opzionale a article_families (FASE 2). Se NULL, la riga usa prodotto_id legacy (article_templates).';
COMMENT ON COLUMN public.article_templates.family_id IS
  'Legame opzionale a article_families (FASE 2). Quando valorizzato, la famiglia guida la modalità prezzo e gli assi.';
