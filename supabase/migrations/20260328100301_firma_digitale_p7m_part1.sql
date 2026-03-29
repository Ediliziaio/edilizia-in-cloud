-- Aggiungi configurazione firma su anagrafica_azienda
ALTER TABLE public.anagrafica_azienda
ADD COLUMN IF NOT EXISTS sdi_firma_provider text DEFAULT 'manuale'
  CHECK (sdi_firma_provider IN ('manuale', 'aruba_sign', 'infocert')),
ADD COLUMN IF NOT EXISTS sdi_firma_api_key text,
ADD COLUMN IF NOT EXISTS sdi_firma_username text;
