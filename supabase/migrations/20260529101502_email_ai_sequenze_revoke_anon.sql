-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.

-- MP-13 hardening: i default privileges Supabase rigrantano anon sulle nuove
-- funzioni public. REVOKE FROM PUBLIC non rimuove il grant diretto ad anon.
-- Le RPC controllano comunque is_email_staff_interno() nel corpo (anon → non_autorizzato),
-- ma per coerenza con il resto del sistema togliamo anche l'EXECUTE ad anon.
REVOKE EXECUTE ON FUNCTION public.sequenza_approva_attiva(uuid, boolean) FROM anon;
REVOKE EXECUTE ON FUNCTION public.sequenza_enroll(uuid, text, text, uuid, text, uuid, jsonb, timestamptz, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.sequenza_invio_conferma(uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.sequenza_esecuzione_stato(uuid, text) FROM anon;
