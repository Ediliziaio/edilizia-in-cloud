-- ============================================================================
-- v8.6.45 — Custom Fields: soft-delete + folders (cartelle) CRUD
--
-- Sblocca le 2 tab disabled del modulo Campi Personalizzati:
-- 1. "Campi eliminati" — soft-delete via deleted_at + restore
-- 2. "Cartelle" — tabella custom_field_folders + CRUD utente
--
-- Backward compatible: il default `deleted_at IS NULL` rende le query
-- esistenti compatibili senza modifiche.
-- ============================================================================

-- ── 1. Soft-delete su marketing_custom_fields ─────────────────────────────
ALTER TABLE public.marketing_custom_fields
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- Index parziale per query attive (la più frequente)
CREATE INDEX IF NOT EXISTS idx_mcf_active
  ON public.marketing_custom_fields(company_id, object_type)
  WHERE deleted_at IS NULL;

-- Index per la tab "eliminati"
CREATE INDEX IF NOT EXISTS idx_mcf_deleted
  ON public.marketing_custom_fields(company_id, deleted_at DESC)
  WHERE deleted_at IS NOT NULL;

-- ── 2. Tabella folders ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.marketing_custom_field_folders (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name        TEXT NOT NULL CHECK (length(trim(name)) > 0 AND length(name) <= 80),
  -- Oggetto a cui appartiene la cartella ('contact' / 'order' / 'invoice' / ecc).
  -- NULL = cartella generica (cross-object).
  object_type TEXT,
  -- Icona lucide-react opzionale (es. 'FolderOpen', 'Briefcase').
  icon        TEXT,
  -- Colore esadecimale per badge UI.
  color       TEXT CHECK (color IS NULL OR color ~* '^#[0-9a-f]{6}$'),
  position    INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Soft-delete coerente con i campi
  deleted_at  TIMESTAMPTZ,
  UNIQUE (company_id, object_type, name)
);

CREATE INDEX IF NOT EXISTS idx_mcff_company_active
  ON public.marketing_custom_field_folders(company_id, object_type, position)
  WHERE deleted_at IS NULL;

-- Trigger updated_at
CREATE OR REPLACE FUNCTION public.mcff_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_mcff_updated_at ON public.marketing_custom_field_folders;
CREATE TRIGGER trg_mcff_updated_at
  BEFORE UPDATE ON public.marketing_custom_field_folders
  FOR EACH ROW EXECUTE FUNCTION public.mcff_set_updated_at();

-- ── 3. Aggiungi folder_id (FK opzionale) a marketing_custom_fields ────────
ALTER TABLE public.marketing_custom_fields
  ADD COLUMN IF NOT EXISTS folder_id UUID
  REFERENCES public.marketing_custom_field_folders(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_mcf_folder
  ON public.marketing_custom_fields(folder_id)
  WHERE folder_id IS NOT NULL;

-- ── 4. RLS su marketing_custom_field_folders ──────────────────────────────
ALTER TABLE public.marketing_custom_field_folders ENABLE ROW LEVEL SECURITY;

-- Lettura: utenti della company (o multi_company_access)
DROP POLICY IF EXISTS "mcff_company_read" ON public.marketing_custom_field_folders;
CREATE POLICY "mcff_company_read"
  ON public.marketing_custom_field_folders FOR SELECT
  USING (
    company_id IN (
      SELECT company_id FROM public.profiles WHERE id = auth.uid()
      UNION
      SELECT company_id FROM public.multi_company_access WHERE user_id = auth.uid()
    )
  );

-- Write: solo company_admin / super_admin
DROP POLICY IF EXISTS "mcff_admin_insert" ON public.marketing_custom_field_folders;
CREATE POLICY "mcff_admin_insert"
  ON public.marketing_custom_field_folders FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
        AND role IN ('super_admin', 'company_admin')
    )
    AND company_id IN (
      SELECT company_id FROM public.profiles WHERE id = auth.uid()
      UNION
      SELECT company_id FROM public.multi_company_access WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "mcff_admin_update" ON public.marketing_custom_field_folders;
CREATE POLICY "mcff_admin_update"
  ON public.marketing_custom_field_folders FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
        AND role IN ('super_admin', 'company_admin')
    )
    AND company_id IN (
      SELECT company_id FROM public.profiles WHERE id = auth.uid()
      UNION
      SELECT company_id FROM public.multi_company_access WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "mcff_admin_delete" ON public.marketing_custom_field_folders;
CREATE POLICY "mcff_admin_delete"
  ON public.marketing_custom_field_folders FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
        AND role IN ('super_admin', 'company_admin')
    )
    AND company_id IN (
      SELECT company_id FROM public.profiles WHERE id = auth.uid()
      UNION
      SELECT company_id FROM public.multi_company_access WHERE user_id = auth.uid()
    )
  );

-- ============================================================================
-- Frontend collegato:
-- - src/components/settings/CustomFieldsConfig.tsx — soft-delete + tab
--   "Campi eliminati" con restore + tab "Cartelle" CRUD
-- - src/hooks/useCustomFieldFolders.ts — hook per CRUD cartelle
-- ============================================================================
