-- Aggiunge signer_phone e otp_canale su signature_requests

ALTER TABLE public.signature_requests
  ADD COLUMN IF NOT EXISTS signer_phone TEXT,
  ADD COLUMN IF NOT EXISTS otp_canale TEXT NOT NULL DEFAULT 'email'
    CHECK (otp_canale IN ('email', 'sms'));

COMMENT ON COLUMN public.signature_requests.signer_phone IS 'Telefono del firmatario in formato E.164 (+39...)';
COMMENT ON COLUMN public.signature_requests.otp_canale IS 'Canale di invio OTP: email o sms';
