-- Rendi order_id nullable su signature_requests (era NOT NULL)
ALTER TABLE public.signature_requests
  ALTER COLUMN order_id DROP NOT NULL;

-- Storage buckets
INSERT INTO storage.buckets (id, name, public)
  VALUES ('documento-templates', 'documento-templates', false)
  ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public)
  VALUES ('documenti-firmati', 'documenti-firmati', false)
  ON CONFLICT (id) DO NOTHING;

-- documento_templates
CREATE TABLE IF NOT EXISTS public.documento_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  descrizione TEXT,
  tipo_doc TEXT NOT NULL DEFAULT 'generico'
    CHECK (tipo_doc IN ('generico','contratto','verbale','accettazione','modulo','preventivo','sal','ddt','variante')),
  file_url TEXT NOT NULL,
  file_type TEXT NOT NULL CHECK (file_type IN ('pdf','docx')),
  file_size INT,
  anteprima_url TEXT,
  attivo BOOLEAN NOT NULL DEFAULT TRUE,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- documento_template_fields
CREATE TABLE IF NOT EXISTS public.documento_template_fields (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES public.documento_templates(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  etichetta TEXT NOT NULL,
  tipo TEXT NOT NULL DEFAULT 'testo'
    CHECK (tipo IN ('testo','numero','data','valuta','scelta','email','telefono')),
  segnaposto TEXT NOT NULL,
  opzioni_scelta TEXT[],
  obbligatorio BOOLEAN NOT NULL DEFAULT TRUE,
  valore_default TEXT,
  ordinamento INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- documento_sessioni
CREATE TABLE IF NOT EXISTS public.documento_sessioni (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  template_id UUID NOT NULL REFERENCES public.documento_templates(id),
  nome TEXT NOT NULL,
  valori_campi JSONB NOT NULL DEFAULT '{}',
  pdf_url TEXT,
  pdf_hash TEXT,
  stato TEXT NOT NULL DEFAULT 'bozza'
    CHECK (stato IN ('bozza','generato','in_firma','firmato','archiviato')),
  order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
  quote_id UUID REFERENCES public.quotes(id) ON DELETE SET NULL,
  contact_id UUID REFERENCES public.marketing_contacts(id) ON DELETE SET NULL,
  note TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Estendi signature_requests con campi FEA
ALTER TABLE public.signature_requests
  ADD COLUMN IF NOT EXISTS tipo_documento TEXT DEFAULT 'order'
    CHECK (tipo_documento IN ('order','quote','sessione','odv')),
  ADD COLUMN IF NOT EXISTS sessione_id UUID REFERENCES public.documento_sessioni(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS tipo_firmatario TEXT NOT NULL DEFAULT 'b2b'
    CHECK (tipo_firmatario IN ('b2b','b2c')),
  ADD COLUMN IF NOT EXISTS otp_hash TEXT,
  ADD COLUMN IF NOT EXISTS otp_scadenza TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS otp_tentativi INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS documento_hash TEXT,
  ADD COLUMN IF NOT EXISTS certificato_url TEXT,
  ADD COLUMN IF NOT EXISTS firma_ip INET,
  ADD COLUMN IF NOT EXISTS firma_user_agent TEXT,
  ADD COLUMN IF NOT EXISTS firma_lat DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS firma_lng DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS b2c_recesso BOOLEAN,
  ADD COLUMN IF NOT EXISTS b2c_recesso_ts TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS b2c_clausole TEXT[],
  ADD COLUMN IF NOT EXISTS b2c_email_copia BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS rifiuto_motivo TEXT;

-- Aggiorna CHECK status signature_requests
ALTER TABLE public.signature_requests
  DROP CONSTRAINT IF EXISTS signature_requests_status_check;
ALTER TABLE public.signature_requests
  ADD CONSTRAINT signature_requests_status_check
  CHECK (status IN ('pending','otp_verified','signed','refused','expired','cancelled'));

-- fea_audit_log (immutabile)
CREATE TABLE IF NOT EXISTS public.fea_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL REFERENCES public.signature_requests(id) ON DELETE CASCADE,
  company_id UUID NOT NULL,
  evento TEXT NOT NULL CHECK (evento IN (
    'sessione_creata','link_inviato','link_aperto',
    'otp_inviato','otp_verificato','otp_fallito',
    'documento_visualizzato','recesso_accettato','clausola_approvata',
    'firma_completata','firma_rifiutata',
    'certificato_generato','email_copia_inviata','sessione_scaduta'
  )),
  ip INET,
  user_agent TEXT,
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  metadati JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Immutabile: blocca UPDATE e DELETE
CREATE OR REPLACE RULE fea_audit_no_update AS
  ON UPDATE TO public.fea_audit_log DO INSTEAD NOTHING;
CREATE OR REPLACE RULE fea_audit_no_delete AS
  ON DELETE TO public.fea_audit_log DO INSTEAD NOTHING;

-- fea_configurazione add-on
CREATE TABLE IF NOT EXISTS public.fea_configurazione (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL UNIQUE REFERENCES public.companies(id) ON DELETE CASCADE,
  addon_attivo BOOLEAN NOT NULL DEFAULT FALSE,
  testo_recesso_b2c TEXT,
  clausole_vess JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS
ALTER TABLE public.documento_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documento_template_fields ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documento_sessioni ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fea_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fea_configurazione ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS doc_templates_company ON public.documento_templates;
CREATE POLICY doc_templates_company ON public.documento_templates
  FOR ALL USING (company_id = public.get_my_company_id())
  WITH CHECK (company_id = public.get_my_company_id());

DROP POLICY IF EXISTS doc_fields_company ON public.documento_template_fields;
CREATE POLICY doc_fields_company ON public.documento_template_fields
  FOR ALL USING (company_id = public.get_my_company_id())
  WITH CHECK (company_id = public.get_my_company_id());

DROP POLICY IF EXISTS doc_sessioni_company ON public.documento_sessioni;
CREATE POLICY doc_sessioni_company ON public.documento_sessioni
  FOR ALL USING (company_id = public.get_my_company_id())
  WITH CHECK (company_id = public.get_my_company_id());

DROP POLICY IF EXISTS fea_audit_read ON public.fea_audit_log;
CREATE POLICY fea_audit_read ON public.fea_audit_log
  FOR SELECT USING (company_id = public.get_my_company_id());

DROP POLICY IF EXISTS fea_audit_insert ON public.fea_audit_log;
CREATE POLICY fea_audit_insert ON public.fea_audit_log
  FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS fea_config_company ON public.fea_configurazione;
CREATE POLICY fea_config_company ON public.fea_configurazione
  FOR ALL USING (company_id = public.get_my_company_id())
  WITH CHECK (company_id = public.get_my_company_id());

-- Storage policies
DROP POLICY IF EXISTS templates_upload ON storage.objects;
CREATE POLICY templates_upload ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'documento-templates' AND auth.role() = 'authenticated');

DROP POLICY IF EXISTS templates_read ON storage.objects;
CREATE POLICY templates_read ON storage.objects FOR SELECT
  USING (bucket_id = 'documento-templates' AND auth.role() = 'authenticated');

DROP POLICY IF EXISTS firmati_read ON storage.objects;
CREATE POLICY firmati_read ON storage.objects FOR SELECT
  USING (bucket_id = 'documenti-firmati');

-- Indici
CREATE INDEX IF NOT EXISTS idx_doc_templates_company ON public.documento_templates(company_id);
CREATE INDEX IF NOT EXISTS idx_doc_fields_template ON public.documento_template_fields(template_id);
CREATE INDEX IF NOT EXISTS idx_doc_sessioni_company ON public.documento_sessioni(company_id);
CREATE INDEX IF NOT EXISTS idx_doc_sessioni_template ON public.documento_sessioni(template_id);
CREATE INDEX IF NOT EXISTS idx_fea_audit_request ON public.fea_audit_log(request_id);
CREATE INDEX IF NOT EXISTS idx_sig_req_sessione ON public.signature_requests(sessione_id);
