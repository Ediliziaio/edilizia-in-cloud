-- MP-CG-07 — Tabella log esportazioni Pacchetto Banca PDF + bucket storage

-- Bucket dedicato (privato)
INSERT INTO storage.buckets (id, name, public)
VALUES ('controllo-gestione-exports', 'controllo-gestione-exports', false)
ON CONFLICT (id) DO NOTHING;

-- Policy: solo la company proprietaria del path può leggere i propri file
DROP POLICY IF EXISTS "cg_exports_owner_read" ON storage.objects;
CREATE POLICY "cg_exports_owner_read" ON storage.objects FOR SELECT
USING (
  bucket_id = 'controllo-gestione-exports'
  AND (storage.foldername(name))[1] = public.get_my_company_id()::text
);

-- Tabella log
CREATE TABLE IF NOT EXISTS public.cg_exports_log (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  tipo            text NOT NULL CHECK (tipo IN ('pacchetto_banca','ce_only','sp_only','rating_only')),
  anno            int  NOT NULL,
  file_path       text NOT NULL,
  pdf_size_bytes  bigint,
  created_at      timestamptz NOT NULL DEFAULT now(),
  created_by      uuid REFERENCES auth.users(id) DEFAULT auth.uid()
);

CREATE INDEX IF NOT EXISTS idx_cg_exp_company ON public.cg_exports_log(company_id, created_at DESC);

ALTER TABLE public.cg_exports_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cg_exp_select" ON public.cg_exports_log FOR SELECT
  USING (company_id = public.get_my_company_id());
CREATE POLICY "cg_exp_insert" ON public.cg_exports_log FOR INSERT
  WITH CHECK (company_id = public.get_my_company_id());

COMMENT ON TABLE public.cg_exports_log IS
  'Log esportazioni PDF del modulo Controllo di Gestione (pacchetto banca, ecc.).';
