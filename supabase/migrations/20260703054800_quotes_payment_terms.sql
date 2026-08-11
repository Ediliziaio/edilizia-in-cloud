-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.

ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS payment_method text,
  ADD COLUMN IF NOT EXISTS payment_phases jsonb;

COMMENT ON COLUMN public.quotes.payment_method IS
  'Modalità di pagamento (es. Bonifico bancario / Assegno / Finanziamento). Mostrata nel PDF firmato dal cliente.';
COMMENT ON COLUMN public.quotes.payment_phases IS
  'Fasi di pagamento strutturate: [{label,type,percent,amount}]. Firmate dal cliente nel PDF e copiate in order_installments alla conversione in commessa.';
