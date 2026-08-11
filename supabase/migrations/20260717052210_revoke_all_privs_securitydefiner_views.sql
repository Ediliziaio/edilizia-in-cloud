-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.

-- Pulizia: le 3 viste sensibili avevano GRANT ALL (INSERT/UPDATE/DELETE/TRUNCATE/
-- REFERENCES/TRIGGER) per anon/authenticated — residui inerti (viste aggregate
-- non-updatable) ma superficie inutile. Azzeriamo ogni privilegio: l'app le usa
-- solo via RPC SECURITY DEFINER, che non richiede grant al chiamante.
REVOKE ALL ON public.v_conversazioni_messaggi FROM anon, authenticated;
REVOKE ALL ON public.v_subappaltatori_dashboard FROM anon, authenticated;
REVOKE ALL ON public.v_fv_progetti_dashboard FROM anon, authenticated;
