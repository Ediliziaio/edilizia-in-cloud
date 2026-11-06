SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '15s';
ALTER TABLE public.purchase_orders ADD COLUMN IF NOT EXISTS document_details jsonb NOT NULL DEFAULT '{}'::jsonb;
COMMENT ON COLUMN public.purchase_orders.document_details IS 'Dati della copia ordine: destinatario e referenti specifici, consegna, condizioni. Quantità e importi restano nelle righe e nelle colonne canoniche.';
NOTIFY pgrst, 'reload schema';
