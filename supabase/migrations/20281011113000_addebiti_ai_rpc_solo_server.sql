SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='60s';
-- Cost and consumption come from trusted provider accounting, never from a
-- browser-supplied amount. Tenant assertions alone cannot validate a debit.
REVOKE ALL ON FUNCTION public.consume_ai_credits(uuid,numeric,text,uuid,uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.deduct_ai_credits_with_markup(uuid,text,text,numeric,integer,integer,uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.consume_ai_credits(uuid,numeric,text,uuid,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.deduct_ai_credits_with_markup(uuid,text,text,numeric,integer,integer,uuid,jsonb) TO service_role;
