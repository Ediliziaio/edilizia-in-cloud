-- I rimborsi vengono decisi dai motori server, mai da una chiamata del browser.
-- Non esistono chiamanti v1 nelle pagine: si mantiene la compatibilità delle edge.
REVOKE ALL ON FUNCTION public.refund_render_credit_v1(uuid, uuid, uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refund_render_credit_v1(uuid, uuid, uuid, jsonb) TO service_role;
