-- ============================================================================
-- DDT Ricezione: UX procedurale + allegati
-- ----------------------------------------------------------------------------
-- Aggiunge:
--   • Allegato principale (DDT cartaceo scansionato/fotografato)
--   • Multi-allegato JSONB (bolla consegna, foto danni, packing list)
--   • Metadati corriere: nome, targa, autista, telefono, ore arrivo/partenza
--   • Firma digitale/foto + nome del ricevente fisico
--   • Stato esteso: atteso / verificato / non_conforme
--   • Campo non_conformità + flag danni
--   • Storage bucket 'ddt_attachments' con RLS per-company
-- ============================================================================

-- ─── 1) Nuove colonne su ddt_ricezione ──────────────────────────────────────
ALTER TABLE public.ddt_ricezione
  ADD COLUMN IF NOT EXISTS ddt_file_url      TEXT,
  ADD COLUMN IF NOT EXISTS ddt_file_name     TEXT,
  ADD COLUMN IF NOT EXISTS ddt_file_mime     TEXT,
  ADD COLUMN IF NOT EXISTS attachments       JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS corriere          TEXT,
  ADD COLUMN IF NOT EXISTS targa_mezzo       TEXT,
  ADD COLUMN IF NOT EXISTS autista_nome      TEXT,
  ADD COLUMN IF NOT EXISTS autista_telefono  TEXT,
  ADD COLUMN IF NOT EXISTS ora_arrivo        TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ora_partenza      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ricevuto_da_nome  TEXT,
  ADD COLUMN IF NOT EXISTS signature_url     TEXT,
  ADD COLUMN IF NOT EXISTS non_conformita    TEXT,
  ADD COLUMN IF NOT EXISTS has_damages       BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS verified_at       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS verified_by       UUID REFERENCES auth.users(id);

COMMENT ON COLUMN public.ddt_ricezione.attachments IS
  'Array di allegati: [{url, name, mime, size, uploaded_at, kind}]. kind ∈ {ddt, bolla, danni, packing_list, firma, altro}';

-- ─── 2) Estendi il CHECK su stato ───────────────────────────────────────────
-- Nuovi stati: 'atteso' (pre-avviso) e 'verificato' (controllo completato)
-- e 'non_conforme' (difforme da ODA).
ALTER TABLE public.ddt_ricezione
  DROP CONSTRAINT IF EXISTS ddt_ricezione_stato_check;

ALTER TABLE public.ddt_ricezione
  ADD CONSTRAINT ddt_ricezione_stato_check
  CHECK (stato IN ('atteso', 'attesa', 'parziale', 'ricevuto', 'verificato', 'non_conforme'));

-- ─── 3) Indici utili per ricerche UI ───────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_ddt_ric_data
  ON public.ddt_ricezione(data_ricezione DESC);

CREATE INDEX IF NOT EXISTS idx_ddt_ric_corriere
  ON public.ddt_ricezione(corriere)
  WHERE corriere IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ddt_ric_has_damages
  ON public.ddt_ricezione(company_id)
  WHERE has_damages = TRUE;

-- ─── 4) Storage bucket per allegati DDT ────────────────────────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('ddt_attachments', 'ddt_attachments', false)
ON CONFLICT (id) DO NOTHING;

-- RLS: solo membri della stessa company possono leggere/inserire
-- Convenzione path: {company_id}/{ddt_id}/{filename}
DROP POLICY IF EXISTS "ddt_attachments_select" ON storage.objects;
CREATE POLICY "ddt_attachments_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'ddt_attachments'
    AND (
      -- Path inizia con una company_id dell'utente
      (storage.foldername(name))[1]::uuid IN (
        SELECT company_id FROM public.profiles WHERE id = auth.uid()
        UNION
        SELECT company_id FROM public.multi_company_access WHERE user_id = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS "ddt_attachments_insert" ON storage.objects;
CREATE POLICY "ddt_attachments_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'ddt_attachments'
    AND (
      (storage.foldername(name))[1]::uuid IN (
        SELECT company_id FROM public.profiles WHERE id = auth.uid()
        UNION
        SELECT company_id FROM public.multi_company_access WHERE user_id = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS "ddt_attachments_delete" ON storage.objects;
CREATE POLICY "ddt_attachments_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'ddt_attachments'
    AND (
      (storage.foldername(name))[1]::uuid IN (
        SELECT company_id FROM public.profiles WHERE id = auth.uid()
        UNION
        SELECT company_id FROM public.multi_company_access WHERE user_id = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS "ddt_attachments_update" ON storage.objects;
CREATE POLICY "ddt_attachments_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'ddt_attachments'
    AND (
      (storage.foldername(name))[1]::uuid IN (
        SELECT company_id FROM public.profiles WHERE id = auth.uid()
        UNION
        SELECT company_id FROM public.multi_company_access WHERE user_id = auth.uid()
      )
    )
  );

-- ─── 5) Trigger: auto-set verified_at/verified_by quando stato → verificato ─
CREATE OR REPLACE FUNCTION public.ddt_auto_set_verified()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.stato = 'verificato' AND OLD.stato IS DISTINCT FROM 'verificato' THEN
    NEW.verified_at = COALESCE(NEW.verified_at, NOW());
    NEW.verified_by = COALESCE(NEW.verified_by, auth.uid());
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ddt_auto_verified ON public.ddt_ricezione;
CREATE TRIGGER trg_ddt_auto_verified
  BEFORE UPDATE ON public.ddt_ricezione
  FOR EACH ROW EXECUTE FUNCTION public.ddt_auto_set_verified();
