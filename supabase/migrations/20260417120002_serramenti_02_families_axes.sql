-- ════════════════════════════════════════════════════════════════════
-- FASE 2 — Data model famiglie, assi, maggiorazioni
-- ════════════════════════════════════════════════════════════════════

-- ═══ article_families ═══
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
  posa_tariffa_default_id UUID REFERENCES public.tariffe_aziendali(id) ON DELETE SET NULL,
  posa_quantita_default NUMERIC DEFAULT 1,
  griglia_asse_x_label TEXT DEFAULT 'Larghezza (mm)',
  griglia_asse_y_label TEXT DEFAULT 'Altezza (mm)',
  griglia_unita TEXT DEFAULT 'mm',
  attivo BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  custom_field_values JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_families_company ON public.article_families(company_id);
CREATE INDEX IF NOT EXISTS idx_families_vertical ON public.article_families(vertical);
CREATE INDEX IF NOT EXISTS idx_families_categoria ON public.article_families(categoria_id);
CREATE INDEX IF NOT EXISTS idx_families_company_sort ON public.article_families(company_id, sort_order);

ALTER TABLE public.article_families ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "families_select" ON public.article_families;
CREATE POLICY "families_select" ON public.article_families FOR SELECT TO authenticated
  USING (company_id = public.get_user_company_id(auth.uid()) OR public.has_role(auth.uid(),'super_admin'));

DROP POLICY IF EXISTS "families_cud" ON public.article_families;
CREATE POLICY "families_cud" ON public.article_families FOR ALL TO authenticated
  USING (company_id = public.get_user_company_id(auth.uid()) OR public.has_role(auth.uid(),'super_admin'))
  WITH CHECK (company_id = public.get_user_company_id(auth.uid()) OR public.has_role(auth.uid(),'super_admin'));

-- ═══ article_family_axes ═══
CREATE TABLE IF NOT EXISTS public.article_family_axes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES public.article_families(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  codice TEXT NOT NULL,
  descrizione TEXT,
  tipo TEXT NOT NULL DEFAULT 'discrete' CHECK (tipo IN ('discrete','boolean')),
  obbligatorio BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(family_id, codice)
);

CREATE INDEX IF NOT EXISTS idx_axes_family ON public.article_family_axes(family_id);
ALTER TABLE public.article_family_axes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "axes_select" ON public.article_family_axes;
CREATE POLICY "axes_select" ON public.article_family_axes FOR SELECT TO authenticated
  USING (company_id = public.get_user_company_id(auth.uid()) OR public.has_role(auth.uid(),'super_admin'));

DROP POLICY IF EXISTS "axes_cud" ON public.article_family_axes;
CREATE POLICY "axes_cud" ON public.article_family_axes FOR ALL TO authenticated
  USING (company_id = public.get_user_company_id(auth.uid()) OR public.has_role(auth.uid(),'super_admin'))
  WITH CHECK (company_id = public.get_user_company_id(auth.uid()) OR public.has_role(auth.uid(),'super_admin'));

-- ═══ article_family_axis_values ═══
CREATE TABLE IF NOT EXISTS public.article_family_axis_values (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  axis_id UUID NOT NULL REFERENCES public.article_family_axes(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  valore TEXT NOT NULL,
  label TEXT NOT NULL,
  descrizione TEXT,
  is_default BOOLEAN DEFAULT false,
  maggiorazione_tipo TEXT NOT NULL DEFAULT 'none'
    CHECK (maggiorazione_tipo IN ('none','percentuale','fisso_pz','fisso_mq','fisso_ml','fisso_mc')),
  maggiorazione_valore NUMERIC(12,4) DEFAULT 0,
  maggiorazione_acquisto NUMERIC(12,4) DEFAULT 0,
  sort_order INTEGER DEFAULT 0,
  attivo BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(axis_id, valore)
);

CREATE INDEX IF NOT EXISTS idx_axis_values_axis ON public.article_family_axis_values(axis_id);
ALTER TABLE public.article_family_axis_values ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "axis_values_select" ON public.article_family_axis_values;
CREATE POLICY "axis_values_select" ON public.article_family_axis_values FOR SELECT TO authenticated
  USING (company_id = public.get_user_company_id(auth.uid()) OR public.has_role(auth.uid(),'super_admin'));

DROP POLICY IF EXISTS "axis_values_cud" ON public.article_family_axis_values;
CREATE POLICY "axis_values_cud" ON public.article_family_axis_values FOR ALL TO authenticated
  USING (company_id = public.get_user_company_id(auth.uid()) OR public.has_role(auth.uid(),'super_admin'))
  WITH CHECK (company_id = public.get_user_company_id(auth.uid()) OR public.has_role(auth.uid(),'super_admin'));

-- ═══ estensione listino_griglia ═══
ALTER TABLE public.listino_griglia
  ADD COLUMN IF NOT EXISTS family_id UUID REFERENCES public.article_families(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_griglia_family ON public.listino_griglia(family_id);

DO $$ BEGIN
  ALTER TABLE public.listino_griglia
    ADD CONSTRAINT griglia_prodotto_or_family
    CHECK (prodotto_id IS NOT NULL OR family_id IS NOT NULL);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ═══ estensione article_templates ═══
ALTER TABLE public.article_templates
  ADD COLUMN IF NOT EXISTS family_id UUID REFERENCES public.article_families(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_articles_family ON public.article_templates(family_id);

-- ═══ trigger updated_at ═══
CREATE OR REPLACE FUNCTION public.tg_families_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_families_updated_at ON public.article_families;
CREATE TRIGGER trg_families_updated_at
  BEFORE UPDATE ON public.article_families
  FOR EACH ROW EXECUTE FUNCTION public.tg_families_updated_at();
