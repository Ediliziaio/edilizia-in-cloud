-- Referente principale del fornitore, distinto dai contatti generali dell’azienda.
-- Sole colonne opzionali: nessuna modifica ai fornitori esistenti o ai permessi.
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '15s';
ALTER TABLE public.suppliers
  ADD COLUMN IF NOT EXISTS contact_name text,
  ADD COLUMN IF NOT EXISTS contact_role text,
  ADD COLUMN IF NOT EXISTS contact_email text,
  ADD COLUMN IF NOT EXISTS contact_phone text;
COMMENT ON COLUMN public.suppliers.contact_name IS 'Nome e cognome del referente principale del fornitore';
COMMENT ON COLUMN public.suppliers.contact_role IS 'Ruolo o reparto del referente principale';
COMMENT ON COLUMN public.suppliers.contact_email IS 'Email del referente, distinta da suppliers.email';
COMMENT ON COLUMN public.suppliers.contact_phone IS 'Telefono del referente, distinto da suppliers.phone';
NOTIFY pgrst, 'reload schema';
