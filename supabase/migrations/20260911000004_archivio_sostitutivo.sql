-- Crea tabella archivio_sostitutivo per conservazione 10 anni (D.M. 17/6/2014)

CREATE TABLE IF NOT EXISTS public.archivio_sostitutivo (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  tipo_documento TEXT NOT NULL
    CHECK (tipo_documento IN ('fattura_attiva','fattura_passiva','nota_credito','altro')),
  documento_id UUID,
  anno_fiscale INTEGER NOT NULL,
  storage_path TEXT NOT NULL,
  hash_sha256 TEXT NOT NULL,
  data_archivio TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  scadenza_conservazione TIMESTAMPTZ,
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.archivio_sostitutivo ENABLE ROW LEVEL SECURITY;

CREATE POLICY archivio_company ON public.archivio_sostitutivo
  USING (company_id = (SELECT company_id FROM profiles WHERE id = auth.uid()));

-- Trigger: auto-imposta scadenza_conservazione = data_archivio + 10 anni
CREATE OR REPLACE FUNCTION public.archivio_set_scadenza()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.scadenza_conservazione := NEW.data_archivio + INTERVAL '10 years';
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_archivio_scadenza
  BEFORE INSERT OR UPDATE OF data_archivio ON public.archivio_sostitutivo
  FOR EACH ROW EXECUTE FUNCTION public.archivio_set_scadenza();

CREATE INDEX IF NOT EXISTS idx_archivio_anno ON public.archivio_sostitutivo(company_id, anno_fiscale);
CREATE INDEX IF NOT EXISTS idx_archivio_scadenza ON public.archivio_sostitutivo(company_id, scadenza_conservazione);

-- Storage bucket privato per i documenti archiviati
INSERT INTO storage.buckets (id, name, public)
VALUES ('archivio-sostitutivo', 'archivio-sostitutivo', false) ON CONFLICT DO NOTHING;
