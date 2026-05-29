-- ════════════════════════════════════════════════════════════════════════════
-- MP-EMAIL-AI-13 · Hardening — togli EXECUTE ad anon sulle RPC sequenze
-- ────────────────────────────────────────────────────────────────────────────
-- I default privileges di Supabase rigrantano automaticamente EXECUTE ad `anon`
-- sulle nuove funzioni in public: REVOKE ... FROM PUBLIC non rimuove quel grant
-- diretto. Le RPC controllano comunque is_email_staff_interno() nel corpo (un
-- chiamante anon → 'non_autorizzato'), ma per coerenza con il resto del sistema
-- email-AI togliamo esplicitamente l'EXECUTE ad anon.
-- ════════════════════════════════════════════════════════════════════════════

REVOKE EXECUTE ON FUNCTION public.sequenza_approva_attiva(uuid, boolean) FROM anon;
REVOKE EXECUTE ON FUNCTION public.sequenza_enroll(uuid, text, text, uuid, text, uuid, jsonb, timestamptz, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.sequenza_invio_conferma(uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.sequenza_esecuzione_stato(uuid, text) FROM anon;
