-- ════════════════════════════════════════════════════════════════════
-- FASE 3 — Tabelle template centrali (gestite da AEDIX super_admin)
-- ════════════════════════════════════════════════════════════════════

-- ═══ vertical_category_templates ═══
CREATE TABLE IF NOT EXISTS public.vertical_category_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vertical TEXT NOT NULL,
  nome TEXT NOT NULL,
  descrizione TEXT,
  icona TEXT,
  modalita_prezzo_suggerita TEXT CHECK (modalita_prezzo_suggerita IN ('pz','mq','griglia','misura_libera')),
  margine_target_percentuale NUMERIC(5,2) DEFAULT 30,
  sort_order INTEGER DEFAULT 0,
  attivo BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cat_templates_vertical ON public.vertical_category_templates(vertical);
ALTER TABLE public.vertical_category_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cat_templates_read" ON public.vertical_category_templates;
CREATE POLICY "cat_templates_read" ON public.vertical_category_templates
  FOR SELECT TO authenticated USING (attivo = true);

DROP POLICY IF EXISTS "cat_templates_admin" ON public.vertical_category_templates;
CREATE POLICY "cat_templates_admin" ON public.vertical_category_templates
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'super_admin'))
  WITH CHECK (public.has_role(auth.uid(),'super_admin'));

-- ═══ vertical_family_templates ═══
CREATE TABLE IF NOT EXISTS public.vertical_family_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vertical TEXT NOT NULL,
  categoria_template_id UUID REFERENCES public.vertical_category_templates(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  descrizione TEXT,
  modalita_prezzo_base TEXT NOT NULL DEFAULT 'griglia',
  unit_of_measure TEXT DEFAULT 'pz',
  griglia_asse_x_label TEXT,
  griglia_asse_y_label TEXT,
  assi_default JSONB NOT NULL DEFAULT '[]'::jsonb,
  sort_order INTEGER DEFAULT 0,
  attivo BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_family_templates_vertical ON public.vertical_family_templates(vertical);
ALTER TABLE public.vertical_family_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "family_templates_read" ON public.vertical_family_templates;
CREATE POLICY "family_templates_read" ON public.vertical_family_templates
  FOR SELECT TO authenticated USING (attivo = true);

DROP POLICY IF EXISTS "family_templates_admin" ON public.vertical_family_templates;
CREATE POLICY "family_templates_admin" ON public.vertical_family_templates
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'super_admin'))
  WITH CHECK (public.has_role(auth.uid(),'super_admin'));

-- ═══ vertical_tariffa_templates ═══
CREATE TABLE IF NOT EXISTS public.vertical_tariffa_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vertical TEXT NOT NULL,
  nome TEXT NOT NULL,
  tipo TEXT NOT NULL,
  unita_fatturazione TEXT NOT NULL DEFAULT 'pz',
  descrizione TEXT,
  is_default BOOLEAN DEFAULT false,
  sort_order INTEGER DEFAULT 0,
  attivo BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tariffa_templates_vertical ON public.vertical_tariffa_templates(vertical);
ALTER TABLE public.vertical_tariffa_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tariffa_templates_read" ON public.vertical_tariffa_templates;
CREATE POLICY "tariffa_templates_read" ON public.vertical_tariffa_templates
  FOR SELECT TO authenticated USING (attivo = true);

DROP POLICY IF EXISTS "tariffa_templates_admin" ON public.vertical_tariffa_templates;
CREATE POLICY "tariffa_templates_admin" ON public.vertical_tariffa_templates
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'super_admin'))
  WITH CHECK (public.has_role(auth.uid(),'super_admin'));
