-- Add DURC expiry date to anagrafica_azienda for compliance alerts
ALTER TABLE public.anagrafica_azienda
  ADD COLUMN IF NOT EXISTS durc_expiry_date DATE;

COMMENT ON COLUMN public.anagrafica_azienda.durc_expiry_date
  IS 'Scadenza DURC (Documento Unico di Regolarità Contributiva)';
