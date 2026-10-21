-- ════════════════════════════════════════════════════════════════════════════
-- Fatture importate: timbro del collegamento al cliente
-- ════════════════════════════════════════════════════════════════════════════
-- clienti-da-fatture-importate porta nei Clienti gli intestatari delle fatture
-- emesse importate (un contatto del CRM diventa cliente; chi è già fatturato è
-- un cliente). Ogni fattura si guarda una volta sola: qui si scrive quando e
-- con che esito («collegato» oppure «da_verificare: motivo»). Una fattura con
-- esito da verificare si rimette in giro azzerando cliente_collegato_at.
-- Solo colonne e un indice parziale: istantanea. Idempotente.
-- ════════════════════════════════════════════════════════════════════════════

SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '60s';

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS cliente_collegato_at timestamptz,
  ADD COLUMN IF NOT EXISTS cliente_collegato_esito text;

COMMENT ON COLUMN public.invoices.cliente_collegato_at IS
  'Quando clienti-da-fatture-importate ha riconosciuto o creato il cliente (Clienti) dell''intestatario. Vuoto = ancora da guardare.';
COMMENT ON COLUMN public.invoices.cliente_collegato_esito IS
  '«collegato» oppure «da_verificare: motivo» (P.IVA/CF assenti o non validi, più clienti con gli stessi dati…).';

CREATE INDEX IF NOT EXISTS idx_invoices_cliente_da_collegare
  ON public.invoices (issue_date DESC)
  WHERE cliente_collegato_at IS NULL AND deleted_at IS NULL AND external_provider IS NOT NULL;
