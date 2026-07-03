-- Timestamp del rifiuto firma (simmetrico a signed_at); usato da fea-rifiuta-firma.
-- Scoperto in test live: la colonna mancava e il rifiuto falliva con 500.
ALTER TABLE public.signature_requests
  ADD COLUMN IF NOT EXISTS refused_at timestamptz;
