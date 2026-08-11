-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.

-- MP-EMAIL-AI: il REVOKE FROM anon del precedente hardening era inefficace perché
-- restava il grant implicito a PUBLIC. Revoco da PUBLIC (e anon) e ri-garantisco
-- esplicitamente solo authenticated + service_role. Funzioni comunque company-scoped.
REVOKE EXECUTE ON FUNCTION public.is_email_staff_interno() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_email_staff_interno() TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.email_semantic_search(vector, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.email_semantic_search(vector, int) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.email_structured_search(text, text, date, date, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.email_structured_search(text, text, date, date, int) TO authenticated, service_role;

-- Stesso bug sul resto delle RPC email-ai (hardening precedente): revoco PUBLIC.
REVOKE EXECUTE ON FUNCTION public.registra_correzione_email(uuid, text, public.email_categoria_v2, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registra_correzione_email(uuid, text, public.email_categoria_v2, text, uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.email_learning_dashboard(int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.email_learning_dashboard(int) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.log_email_accesso(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.log_email_accesso(uuid, uuid, text) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.bump_email_regola_match(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bump_email_regola_match(uuid) TO authenticated, service_role;
