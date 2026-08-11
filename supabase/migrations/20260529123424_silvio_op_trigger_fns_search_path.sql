-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.

-- zero criticità: search_path esplicito anche sulle trigger function (advisory Supabase)
ALTER FUNCTION public.sequenze_touch_updated() SET search_path = public;
ALTER FUNCTION public.silvio_audit_no_mutate() SET search_path = public;
