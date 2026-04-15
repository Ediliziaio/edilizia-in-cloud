-- ════════════════════════════════════════════════════════════════
-- Sprint 1.17 — Chiusura falla: revoke EXECUTE da PUBLIC su get_metric
-- ════════════════════════════════════════════════════════════════
-- Le RPC del dashboard builder devono essere eseguibili SOLO da utenti
-- autenticati. get_metric era rimasta con grant implicito a PUBLIC.
-- ════════════════════════════════════════════════════════════════

REVOKE ALL ON FUNCTION public.get_metric(TEXT, JSONB, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_metric(TEXT, JSONB, TEXT, TEXT) TO authenticated;

-- Anche helper interni: lock down
REVOKE ALL ON FUNCTION public._dashboard_parse_period(JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public._dashboard_parse_period(JSONB) TO authenticated;
