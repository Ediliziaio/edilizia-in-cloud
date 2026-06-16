-- ============================================================================
-- Scheda dipendente HR: documenti/scadenze + assenze/malattie (agganciate a hr_profili)
-- Idempotente: sicuro da ri-applicare.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.hr_set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE OR REPLACE FUNCTION public.hr_documento_stato(p_scadenza date, p_alert int)
RETURNS text LANGUAGE sql STABLE AS $$
  SELECT CASE
    WHEN p_scadenza IS NULL THEN 'senza_scadenza'
    WHEN p_scadenza < current_date THEN 'scaduto'
    WHEN p_scadenza <= current_date + COALESCE(p_alert, 30) THEN 'in_scadenza'
    ELSE 'valido'
  END;
$$;

CREATE TABLE IF NOT EXISTS public.hr_documenti (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  hr_profilo_id uuid NOT NULL REFERENCES public.hr_profili(id) ON DELETE CASCADE,
  categoria text NOT NULL DEFAULT 'altro',
  titolo text,
  ente text,
  data_rilascio date,
  data_scadenza date,
  alert_giorni_prima int NOT NULL DEFAULT 30,
  file_path text,
  file_name text,
  note text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hr_documenti_categoria_chk CHECK (categoria IN
    ('contratto','visita_medica','corso_sicurezza','idoneita','patente','durc',
     'documento_identita','permesso_soggiorno','unilav','altro'))
);
CREATE INDEX IF NOT EXISTS idx_hr_documenti_profilo ON public.hr_documenti(hr_profilo_id);
CREATE INDEX IF NOT EXISTS idx_hr_documenti_company_scad ON public.hr_documenti(company_id, data_scadenza);
DROP TRIGGER IF EXISTS trg_hr_documenti_updated ON public.hr_documenti;
CREATE TRIGGER trg_hr_documenti_updated BEFORE UPDATE ON public.hr_documenti
  FOR EACH ROW EXECUTE FUNCTION public.hr_set_updated_at();

CREATE TABLE IF NOT EXISTS public.hr_assenze_eventi (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  hr_profilo_id uuid NOT NULL REFERENCES public.hr_profili(id) ON DELETE CASCADE,
  tipo text NOT NULL DEFAULT 'malattia',
  data_inizio date NOT NULL,
  data_fine date,
  giorni numeric,
  protocollo text,
  certificato_path text,
  certificato_name text,
  note text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hr_assenze_tipo_chk CHECK (tipo IN
    ('malattia','infortunio','permesso','aspettativa','congedo','maternita','paternita','altro'))
);
CREATE INDEX IF NOT EXISTS idx_hr_assenze_profilo ON public.hr_assenze_eventi(hr_profilo_id);
DROP TRIGGER IF EXISTS trg_hr_assenze_updated ON public.hr_assenze_eventi;
CREATE TRIGGER trg_hr_assenze_updated BEFORE UPDATE ON public.hr_assenze_eventi
  FOR EACH ROW EXECUTE FUNCTION public.hr_set_updated_at();

ALTER TABLE public.hr_documenti ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_assenze_eventi ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS hr_documenti_admin ON public.hr_documenti;
CREATE POLICY hr_documenti_admin ON public.hr_documenti FOR ALL TO authenticated
  USING (company_id = public.get_my_company_id()
    AND (public.has_role(auth.uid(),'company_admin') OR public.has_role(auth.uid(),'super_admin')))
  WITH CHECK (company_id = public.get_my_company_id()
    AND (public.has_role(auth.uid(),'company_admin') OR public.has_role(auth.uid(),'super_admin')));
DROP POLICY IF EXISTS hr_documenti_self_read ON public.hr_documenti;
CREATE POLICY hr_documenti_self_read ON public.hr_documenti FOR SELECT TO authenticated
  USING (hr_profilo_id IN (SELECT id FROM public.hr_profili WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS hr_assenze_admin ON public.hr_assenze_eventi;
CREATE POLICY hr_assenze_admin ON public.hr_assenze_eventi FOR ALL TO authenticated
  USING (company_id = public.get_my_company_id()
    AND (public.has_role(auth.uid(),'company_admin') OR public.has_role(auth.uid(),'super_admin')))
  WITH CHECK (company_id = public.get_my_company_id()
    AND (public.has_role(auth.uid(),'company_admin') OR public.has_role(auth.uid(),'super_admin')));
DROP POLICY IF EXISTS hr_assenze_self_read ON public.hr_assenze_eventi;
CREATE POLICY hr_assenze_self_read ON public.hr_assenze_eventi FOR SELECT TO authenticated
  USING (hr_profilo_id IN (SELECT id FROM public.hr_profili WHERE user_id = auth.uid()));

INSERT INTO storage.buckets (id, name, public) VALUES ('hr-documenti','hr-documenti', false)
  ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS hr_doc_storage_admin ON storage.objects;
CREATE POLICY hr_doc_storage_admin ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'hr-documenti'
    AND (storage.foldername(name))[1] = public.get_my_company_id()::text
    AND (public.has_role(auth.uid(),'company_admin') OR public.has_role(auth.uid(),'super_admin')))
  WITH CHECK (bucket_id = 'hr-documenti'
    AND (storage.foldername(name))[1] = public.get_my_company_id()::text
    AND (public.has_role(auth.uid(),'company_admin') OR public.has_role(auth.uid(),'super_admin')));
