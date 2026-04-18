-- Preventivatore Verticalizzato Serramentisti — FASE 3.1
-- Tabelle template centralizzate per il seed catalogo verticalizzato.
-- Gestite da super_admin (AEDIX) e lette da tutti gli utenti autenticati.
--
-- Idempotente (IF NOT EXISTS + DO blocks per policy).

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. vertical_category_templates
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.vertical_category_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vertical TEXT NOT NULL,
  nome TEXT NOT NULL,
  descrizione TEXT,
  icona TEXT,
  modalita_prezzo_suggerita TEXT
    CHECK (modalita_prezzo_suggerita IN ('pz','mq','griglia','misura_libera')),
  margine_target_percentuale NUMERIC(5,2) DEFAULT 30,
  sort_order INTEGER DEFAULT 0,
  attivo BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Idempotenza seed: un nome categoria per vertical è unico.
  UNIQUE (vertical, nome)
);

CREATE INDEX IF NOT EXISTS idx_cat_templates_vertical ON public.vertical_category_templates(vertical);

ALTER TABLE public.vertical_category_templates ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='vertical_category_templates' AND policyname='cat_templates_read'
  ) THEN
    CREATE POLICY cat_templates_read ON public.vertical_category_templates
      FOR SELECT TO authenticated USING (attivo = true);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='vertical_category_templates' AND policyname='cat_templates_admin'
  ) THEN
    -- Codebase usa helper `has_role(uid, role)` invece di `current_user_role()`.
    CREATE POLICY cat_templates_admin ON public.vertical_category_templates
      FOR ALL TO authenticated
      USING (public.has_role(auth.uid(), 'super_admin'))
      WITH CHECK (public.has_role(auth.uid(), 'super_admin'));
  END IF;
END$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. vertical_family_templates
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.vertical_family_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vertical TEXT NOT NULL,
  categoria_template_id UUID REFERENCES public.vertical_category_templates(id) ON DELETE SET NULL,
  nome TEXT NOT NULL,
  descrizione TEXT,
  modalita_prezzo_base TEXT NOT NULL DEFAULT 'griglia'
    CHECK (modalita_prezzo_base IN ('pz','mq','griglia','misura_libera')),
  unit_of_measure TEXT DEFAULT 'pz',
  griglia_asse_x_label TEXT,
  griglia_asse_y_label TEXT,
  -- Struttura assi + valori (no prezzi): array di oggetti con codice/nome/tipo/obbligatorio/valori.
  assi_default JSONB NOT NULL DEFAULT '[]'::jsonb,
  sort_order INTEGER DEFAULT 0,
  attivo BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Idempotenza seed: un nome famiglia per vertical è unico.
  UNIQUE (vertical, nome)
);

CREATE INDEX IF NOT EXISTS idx_family_templates_vertical ON public.vertical_family_templates(vertical);
CREATE INDEX IF NOT EXISTS idx_family_templates_categoria ON public.vertical_family_templates(categoria_template_id);

ALTER TABLE public.vertical_family_templates ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='vertical_family_templates' AND policyname='family_templates_read'
  ) THEN
    CREATE POLICY family_templates_read ON public.vertical_family_templates
      FOR SELECT TO authenticated USING (attivo = true);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='vertical_family_templates' AND policyname='family_templates_admin'
  ) THEN
    CREATE POLICY family_templates_admin ON public.vertical_family_templates
      FOR ALL TO authenticated
      USING (public.has_role(auth.uid(), 'super_admin'))
      WITH CHECK (public.has_role(auth.uid(), 'super_admin'));
  END IF;
END$$;

COMMENT ON TABLE public.vertical_category_templates IS
  'Template centralizzato delle categorie per vertical. Gestito da super_admin (AEDIX). Letto in SELECT da tutti gli utenti autenticati per popolare listino_categorie di una company via Edge Function installa-template-vertical.';
COMMENT ON TABLE public.vertical_family_templates IS
  'Template centralizzato delle famiglie articoli per vertical. `assi_default` è un JSONB array di oggetti { codice, nome, tipo, obbligatorio, valori:[{valore,label,is_default?}] }. Nessun prezzo: l''azienda lo setta dopo il seed.';
