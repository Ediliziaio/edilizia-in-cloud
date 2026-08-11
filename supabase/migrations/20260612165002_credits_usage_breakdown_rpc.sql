-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.

CREATE OR REPLACE FUNCTION public.get_credits_usage_breakdown(
  p_company_id uuid,
  p_from timestamptz,
  p_to timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v jsonb;
BEGIN
  IF NOT (
    public.has_role(auth.uid(), 'super_admin'::public.app_role)
    OR p_company_id IN (SELECT pr.company_id FROM public.profiles pr WHERE pr.id = auth.uid())
  ) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  WITH ops AS (
    SELECT 'email' AS service, created_at AS ts, -amount_eur AS spent
    FROM email_credits_log
    WHERE company_id = p_company_id AND amount_eur < 0
      AND created_at >= p_from AND created_at < p_to
    UNION ALL
    SELECT 'whatsapp', created_at, -amount_eur
    FROM whatsapp_credits_log
    WHERE company_id = p_company_id AND amount_eur < 0
      AND created_at >= p_from AND created_at < p_to
    UNION ALL
    SELECT 'ai', ts, COALESCE(cost_billed_eur, 0)
    FROM ai_model_usage_log
    WHERE company_id = p_company_id AND ok IS NOT FALSE
      AND ts >= p_from AND ts < p_to
    UNION ALL
    SELECT 'sms', created_at, -importo
    FROM sms_wallet_transazioni
    WHERE company_id = p_company_id AND tipo LIKE 'addebito%'
      AND created_at >= p_from AND created_at < p_to
    UNION ALL
    SELECT 'render', created_at, COALESCE(revenue_eur, cost_billed, 0)
    FROM render_sessions
    WHERE company_id = p_company_id AND status = 'completed'
      AND created_at >= p_from AND created_at < p_to
  )
  SELECT jsonb_build_object(
    'servizi', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'service', service,
        'spent_eur', round(spent_sum::numeric, 4),
        'operations', n
      ) ORDER BY spent_sum DESC)
      FROM (
        SELECT service, sum(spent) AS spent_sum, count(*) AS n
        FROM ops GROUP BY service
      ) s
    ), '[]'::jsonb),
    'giorni', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'giorno', giorno,
        'spent_eur', round(spent_sum::numeric, 4)
      ) ORDER BY giorno)
      FROM (
        SELECT date_trunc('day', ts)::date AS giorno, sum(spent) AS spent_sum
        FROM ops GROUP BY 1
      ) g
    ), '[]'::jsonb),
    'totale_eur', COALESCE((SELECT round(sum(spent)::numeric, 4) FROM ops), 0),
    'totale_operazioni', COALESCE((SELECT count(*) FROM ops), 0)
  ) INTO v;

  RETURN v;
END;
$$;

REVOKE ALL ON FUNCTION public.get_credits_usage_breakdown(uuid, timestamptz, timestamptz) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.get_credits_usage_breakdown(uuid, timestamptz, timestamptz) TO authenticated;
