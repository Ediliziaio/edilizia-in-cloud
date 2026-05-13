-- ════════════════════════════════════════════════════════════════════════════
-- company_photo_library — Galleria foto PRIVATA per azienda
-- ────────────────────────────────────────────────────────────────────────────
-- BUSINESS CASE
-- Oltre alla galleria globale `article_photo_templates` (gestita dal
-- super_admin, sola lettura per le aziende), ogni azienda deve poter
-- caricare foto proprie e riutilizzarle tra più articoli/macrocategorie.
--
-- ISOLATION REQUIREMENT
-- Le foto caricate dall'azienda A devono essere visibili SOLO all'azienda
-- A. Mai esposte ad altre aziende. RLS company-scoped al 100%.
--
-- DIFFERENZE da article_photo_templates:
--   • article_photo_templates: GLOBAL  · RW solo super_admin · R authenticated
--   • company_photo_library:   PRIVATE · RW solo company-members del row
--
-- DIFFERENZE da article-images bucket (esistente):
--   • article-images: 1 foto per articolo (immagine_url su article_families)
--   • company_photo_library: galleria centralizzata, 1 foto può essere
--     referenziata da N articoli/macrocategorie senza duplicare upload.
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.company_photo_library (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,

  -- Identità
  nome            TEXT NOT NULL,
  descrizione     TEXT,

  -- Tassonomia opzionale (per filtrare in galleria)
  vertical_slug   TEXT,
  categoria_slug  TEXT,
  tipologia       TEXT,

  -- Risorse
  image_url       TEXT NOT NULL,         -- URL pubblico bucket company-photos
  thumbnail_url   TEXT,
  storage_path    TEXT,                  -- path nel bucket (per delete)

  -- Tag per ricerca
  tags            TEXT[] NOT NULL DEFAULT '{}',

  -- Lifecycle
  is_active       BOOLEAN NOT NULL DEFAULT true,
  sort_order      INTEGER NOT NULL DEFAULT 0,

  -- Audit
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Vincolo nome unico per (company, nome) per evitare duplicati accidentali.
  -- Permette upsert su re-upload con stesso nome (UX comoda).
  UNIQUE (company_id, nome)
);

COMMENT ON TABLE public.company_photo_library IS
  'Galleria foto privata per azienda. Riutilizzabile tra articoli del listino. '
  'RLS company-scoped: una company vede SOLO le sue foto.';

-- Indici
CREATE INDEX IF NOT EXISTS idx_cpl_company
  ON public.company_photo_library (company_id) WHERE is_active;
CREATE INDEX IF NOT EXISTS idx_cpl_vertical
  ON public.company_photo_library (company_id, vertical_slug) WHERE is_active;
CREATE INDEX IF NOT EXISTS idx_cpl_categoria
  ON public.company_photo_library (company_id, categoria_slug) WHERE is_active;
CREATE INDEX IF NOT EXISTS idx_cpl_tags
  ON public.company_photo_library USING GIN (tags) WHERE is_active;
CREATE INDEX IF NOT EXISTS idx_cpl_sort
  ON public.company_photo_library (company_id, sort_order, nome);

-- Trigger updated_at
CREATE OR REPLACE FUNCTION public.touch_company_photo_library()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cpl_touch ON public.company_photo_library;
CREATE TRIGGER trg_cpl_touch
  BEFORE UPDATE ON public.company_photo_library
  FOR EACH ROW EXECUTE FUNCTION public.touch_company_photo_library();

-- ════════════════════════════════════════════════════════════════════════════
-- RLS — company-scoped totale
-- ════════════════════════════════════════════════════════════════════════════
ALTER TABLE public.company_photo_library ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cpl_select_own_company ON public.company_photo_library;
CREATE POLICY cpl_select_own_company ON public.company_photo_library
  FOR SELECT TO authenticated
  USING (company_id = public.get_user_company_id(auth.uid()));

DROP POLICY IF EXISTS cpl_insert_own_company ON public.company_photo_library;
CREATE POLICY cpl_insert_own_company ON public.company_photo_library
  FOR INSERT TO authenticated
  WITH CHECK (company_id = public.get_user_company_id(auth.uid()));

DROP POLICY IF EXISTS cpl_update_own_company ON public.company_photo_library;
CREATE POLICY cpl_update_own_company ON public.company_photo_library
  FOR UPDATE TO authenticated
  USING (company_id = public.get_user_company_id(auth.uid()))
  WITH CHECK (company_id = public.get_user_company_id(auth.uid()));

DROP POLICY IF EXISTS cpl_delete_own_company ON public.company_photo_library;
CREATE POLICY cpl_delete_own_company ON public.company_photo_library
  FOR DELETE TO authenticated
  USING (company_id = public.get_user_company_id(auth.uid()));

-- Super_admin: accesso completo per supporto (es. troubleshooting cliente)
DROP POLICY IF EXISTS cpl_super_admin_all ON public.company_photo_library;
CREATE POLICY cpl_super_admin_all ON public.company_photo_library
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'super_admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'super_admin')
  );

-- ════════════════════════════════════════════════════════════════════════════
-- Storage bucket — path-based isolation: {company_id}/{filename}
-- ────────────────────────────────────────────────────────────────────────────
-- Bucket pubblico in lettura (URL CDN comodi per <img>) ma WRITE/DELETE
-- gated da policy che verifica il path: l'azienda A può scrivere solo su
-- /A/... e non su /B/...
-- ════════════════════════════════════════════════════════════════════════════
INSERT INTO storage.buckets (id, name, public)
VALUES ('company-photo-library', 'company-photo-library', true)
ON CONFLICT (id) DO NOTHING;

-- READ: pubblico (le URL sono opache, gli ID company sono UUID non
-- indovinabili). Stesso pattern di article-images.
DROP POLICY IF EXISTS "cpl_storage_read_public" ON storage.objects;
CREATE POLICY "cpl_storage_read_public" ON storage.objects
  FOR SELECT
  USING (bucket_id = 'company-photo-library');

-- INSERT: solo nel proprio folder company_id
DROP POLICY IF EXISTS "cpl_storage_insert_own_company" ON storage.objects;
CREATE POLICY "cpl_storage_insert_own_company" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'company-photo-library'
    AND (storage.foldername(name))[1] = public.get_user_company_id(auth.uid())::text
  );

-- UPDATE: solo nel proprio folder
DROP POLICY IF EXISTS "cpl_storage_update_own_company" ON storage.objects;
CREATE POLICY "cpl_storage_update_own_company" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'company-photo-library'
    AND (storage.foldername(name))[1] = public.get_user_company_id(auth.uid())::text
  );

-- DELETE: solo nel proprio folder
DROP POLICY IF EXISTS "cpl_storage_delete_own_company" ON storage.objects;
CREATE POLICY "cpl_storage_delete_own_company" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'company-photo-library'
    AND (storage.foldername(name))[1] = public.get_user_company_id(auth.uid())::text
  );

-- Super_admin: accesso storage completo (supporto)
DROP POLICY IF EXISTS "cpl_storage_super_admin" ON storage.objects;
CREATE POLICY "cpl_storage_super_admin" ON storage.objects
  FOR ALL TO authenticated
  USING (
    bucket_id = 'company-photo-library'
    AND EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'super_admin')
  );

NOTIFY pgrst, 'reload schema';
