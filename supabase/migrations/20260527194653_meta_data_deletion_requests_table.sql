-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.

-- Tabella per tracciare le richieste di cancellazione dati ricevute da Meta
-- via callback (quando un utente revoca l'app dalle Impostazioni Facebook) o
-- da richieste manuali via email.
--
-- Conforme a Meta Data Deletion Callback Specifications:
-- https://developers.facebook.com/docs/development/create-an-app/app-dashboard/data-deletion-callback/

CREATE TABLE IF NOT EXISTS public.meta_data_deletion_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Identifier ricevuto da Meta: hash dell'user_id Facebook (no PII diretto)
  facebook_user_id text NOT NULL,
  
  -- Confirmation code univoco generato da noi e mostrato a Meta + utente
  confirmation_code text NOT NULL UNIQUE,
  
  -- Status del processo di cancellazione
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'in_progress', 'completed', 'failed', 'manual_review')),
  
  -- Email associata trovata via lookup su user_metadata di auth.users (se esistente)
  associated_email text,
  
  -- Riferimenti opzionali ai record cancellati
  deleted_user_ids uuid[],
  deleted_record_count integer DEFAULT 0,
  
  -- Tracking
  signed_request_raw text,  -- payload originale firmato di Meta (per audit)
  ip_address inet,
  user_agent text,
  error_message text,
  
  created_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  completed_at timestamptz,
  
  CONSTRAINT meta_data_deletion_processed_when_done CHECK (
    (status NOT IN ('completed', 'failed') OR processed_at IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_meta_data_deletion_fb_user 
  ON public.meta_data_deletion_requests (facebook_user_id);
CREATE INDEX IF NOT EXISTS idx_meta_data_deletion_status 
  ON public.meta_data_deletion_requests (status) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_meta_data_deletion_code 
  ON public.meta_data_deletion_requests (confirmation_code);

-- RLS: solo service role può leggere/scrivere. Gli utenti normali non
-- devono vedere le richieste di cancellazione di altri.
ALTER TABLE public.meta_data_deletion_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "meta_data_deletion_service_all"
  ON public.meta_data_deletion_requests
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- super_admin può leggere per audit
CREATE POLICY "meta_data_deletion_super_admin_read"
  ON public.meta_data_deletion_requests
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles 
      WHERE user_id = (SELECT auth.uid()) AND role = 'super_admin'
    )
  );

COMMENT ON TABLE public.meta_data_deletion_requests IS
  'Audit log delle richieste di cancellazione dati ricevute da Meta tramite callback o email. Conforme a Meta App Review requirements.';
