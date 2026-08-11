-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.

ALTER TABLE public.companies DROP CONSTRAINT IF EXISTS companies_vertical_check;
ALTER TABLE public.companies ADD CONSTRAINT companies_vertical_check
  CHECK (
    vertical IS NULL OR vertical = ANY (ARRAY[
      'serramentista','fotovoltaico','tetti','bagno','ristrutturazione',
      'tende_da_sole','vetrate','caldaie','clima','generico'
    ]::text[])
  );
