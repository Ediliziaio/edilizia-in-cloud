-- ════════════════════════════════════════════════════════════════════════════
-- MP-EMAIL-AI · Fix grant: REVOKE da PUBLIC (non solo anon) sulle RPC SECURITY DEFINER
-- ────────────────────────────────────────────────────────────────────────────
-- L'hardening 20270529130000 revocava solo da `anon`, ma restava il grant
-- implicito a PUBLIC (di cui anon fa parte) → l'advisor segnalava ancora
-- "anon can execute SECURITY DEFINER". Le funzioni sono comunque company-scoped
-- (ritornano nulla senza auth.uid/company), ma per pulizia revoco da PUBLIC e
-- ri-garantisco esplicitamente solo authenticated + service_role.
-- ════════════════════════════════════════════════════════════════════════════

REVOKE EXECUTE ON FUNCTION public.is_email_staff_interno() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_email_staff_interno() TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.email_semantic_search(vector, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.email_semantic_search(vector, int) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.email_structured_search(text, text, date, date, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.email_structured_search(text, text, date, date, int) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.registra_correzione_email(uuid, text, public.email_categoria_v2, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registra_correzione_email(uuid, text, public.email_categoria_v2, text, uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.email_learning_dashboard(int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.email_learning_dashboard(int) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.log_email_accesso(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.log_email_accesso(uuid, uuid, text) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.bump_email_regola_match(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bump_email_regola_match(uuid) TO authenticated, service_role;
