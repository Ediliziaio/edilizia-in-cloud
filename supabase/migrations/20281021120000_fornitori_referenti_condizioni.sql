-- ════════════════════════════════════════════════════════════════════════════
-- Fornitori: più referenti, email per gli ordini, PEC/SDI, termini, codice
-- cliente, sconto, ritiro merce
-- ════════════════════════════════════════════════════════════════════════════
-- La scheda fornitore aveva un solo referente e mancavano i dati che servono
-- a ordini e pagamenti:
--   altri_referenti      oltre al principale (contact_*): ordini, amministrazione,
--                        consegne, tecnico, altro — [{ruolo,nome,email,telefono}]
--   email_ordini         dove partono gli ordini d'acquisto (poi il referente
--                        degli ordini, poi l'email generale)
--   pec, codice_sdi      comunicazioni formali e fatturazione elettronica
--   termini_giorni,      «60 gg fine mese»: il metodo (bonifico, Ri.Ba.) c'era,
--   termini_fine_mese    i giorni no
--   codice_cliente       il nostro codice presso il fornitore, va sugli ordini
--   sconto_percentuale   lo sconto concordato sul suo listino
--   ritiro_*             dove mandare il furgone, se non è la sede
-- Solo colonne nuove con vincoli semplici: istantanea. Idempotente.
-- ════════════════════════════════════════════════════════════════════════════

SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '60s';

ALTER TABLE public.suppliers
  ADD COLUMN IF NOT EXISTS altri_referenti jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS email_ordini text,
  ADD COLUMN IF NOT EXISTS pec text,
  ADD COLUMN IF NOT EXISTS codice_sdi text,
  ADD COLUMN IF NOT EXISTS termini_giorni integer,
  ADD COLUMN IF NOT EXISTS termini_fine_mese boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS codice_cliente text,
  ADD COLUMN IF NOT EXISTS sconto_percentuale numeric(5,2),
  ADD COLUMN IF NOT EXISTS ritiro_indirizzo text,
  ADD COLUMN IF NOT EXISTS ritiro_citta text,
  ADD COLUMN IF NOT EXISTS ritiro_note text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'suppliers_altri_referenti_array') THEN
    ALTER TABLE public.suppliers ADD CONSTRAINT suppliers_altri_referenti_array
      CHECK (jsonb_typeof(altri_referenti) = 'array') NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'suppliers_termini_giorni_range') THEN
    ALTER TABLE public.suppliers ADD CONSTRAINT suppliers_termini_giorni_range
      CHECK (termini_giorni IS NULL OR termini_giorni BETWEEN 0 AND 365) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'suppliers_sconto_range') THEN
    ALTER TABLE public.suppliers ADD CONSTRAINT suppliers_sconto_range
      CHECK (sconto_percentuale IS NULL OR sconto_percentuale BETWEEN 0 AND 100) NOT VALID;
  END IF;
END $$;

COMMENT ON COLUMN public.suppliers.altri_referenti IS
  'Referenti oltre al principale (contact_*): [{ruolo: ordini|amministrazione|consegne|tecnico|altro, nome, email, telefono}].';
COMMENT ON COLUMN public.suppliers.email_ordini IS
  'Destinatario degli ordini d''acquisto; se vuota: referente degli ordini, poi email generale.';
COMMENT ON COLUMN public.suppliers.termini_giorni IS
  'Giorni di pagamento concordati (dalla data fattura, o a fine mese se termini_fine_mese).';
COMMENT ON COLUMN public.suppliers.codice_cliente IS
  'Il codice con cui il fornitore ci identifica: va sugli ordini.';
