-- Dati firmografici sui contatti marketing: codice ATECO e dimensione azienda.
-- Servono alla Dashboard commerciale per clusterizzare i lead per settore
-- (ATECO) e per dimensione, oltre al mestiere (tipo) già presente.
-- Additivo e idempotente: nessun impatto sui dati esistenti (colonne nullable).

ALTER TABLE public.marketing_contacts
  ADD COLUMN IF NOT EXISTS ateco_code text,
  ADD COLUMN IF NOT EXISTS company_size text;

COMMENT ON COLUMN public.marketing_contacts.ateco_code IS 'Codice ATECO (classificazione attività economica) dell''azienda del contatto';
COMMENT ON COLUMN public.marketing_contacts.company_size IS 'Dimensione azienda: micro / piccola / media / grande (o fascia dipendenti)';
