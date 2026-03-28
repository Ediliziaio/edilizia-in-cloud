-- GAP3: Supporto firma digitale p7m per fatture PA
-- Le fatture verso la PA (FPA12) devono essere firmate digitalmente (CAdES-BES)

-- Aggiungi colonne per tracciare lo stato della firma
ALTER TABLE public.documenti_fiscali
ADD COLUMN IF NOT EXISTS sdi_firmato boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS sdi_file_p7m_url text;

-- Aggiungi configurazione firma su anagrafica_azienda
ALTER TABLE public.anagrafica_azienda
ADD COLUMN IF NOT EXISTS sdi_firma_provider text DEFAULT 'manuale'
  CHECK (sdi_firma_provider IN ('manuale', 'aruba_sign', 'infocert')),
ADD COLUMN IF NOT EXISTS sdi_firma_api_key text,
ADD COLUMN IF NOT EXISTS sdi_firma_username text;

COMMENT ON COLUMN documenti_fiscali.sdi_firmato IS 'True se XML è stato firmato digitalmente (p7m CAdES-BES)';
COMMENT ON COLUMN documenti_fiscali.sdi_file_p7m_url IS 'URL del file .xml.p7m firmato in Supabase Storage';
COMMENT ON COLUMN anagrafica_azienda.sdi_firma_provider IS 'Provider per firma digitale: manuale (upload p7m) o API';
