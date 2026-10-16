-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.

-- Anteprima vuota: completa questa estensione nella fondazione della tabella.
DO $fv_project_dependency$
BEGIN
 IF to_regclass('public.fv_progetti') IS NOT NULL THEN
ALTER TABLE public.fv_progetti
  ADD COLUMN IF NOT EXISTS modalita_pagamento jsonb;

COMMENT ON COLUMN public.fv_progetti.modalita_pagamento IS
  'Schema pagamento diretto: {"tranche":[{"label","pct"}],"note":string|null}. Le % sommano a 100; gli importi € si ricalcolano sul prezzo di vendita IVA inclusa.';
 END IF;
END $fv_project_dependency$;
