-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.

-- Hardening (advisor function_search_path_mutable): il trigger su
-- multi_company_access — tabella di controllo accessi — girava senza
-- search_path fisso. Aggiungiamo SET search_path='' (usa now() built-in,
-- non tocca oggetti applicativi) per chiudere il vettore di search-path injection.
CREATE OR REPLACE FUNCTION public.mca_touch_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN NEW.updated_at := now(); RETURN NEW; END;
$function$;
