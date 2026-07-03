-- Preventivo: modalità + fasi di pagamento STRUTTURATE.
-- Oggi le condizioni di pagamento nel preventivo sono solo testo libero (campo notes).
-- Le rendiamo strutturate così: (1) il cliente le firma nel PDF, (2) alla conversione
-- in commessa si copiano 1:1 in order_installments senza reinserimento manuale.
-- Additivo e idempotente: nessun impatto sui preventivi esistenti (colonne NULL).

ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS payment_method text,
  ADD COLUMN IF NOT EXISTS payment_phases jsonb;

COMMENT ON COLUMN public.quotes.payment_method IS
  'Modalità di pagamento (es. Bonifico bancario / Assegno / Finanziamento). Mostrata nel PDF firmato dal cliente.';
COMMENT ON COLUMN public.quotes.payment_phases IS
  'Fasi di pagamento strutturate: [{label,type,percent,amount}]. Firmate dal cliente nel PDF e copiate in order_installments alla conversione in commessa.';
