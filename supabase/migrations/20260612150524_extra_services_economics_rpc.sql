-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.

-- get_extra_services_economics: P&L unificato dei servizi extra rivenduti
-- (SMS, WhatsApp, Email, AI, Render) per il tab "Servizi Extra" del
-- Revenue Platform super admin.
--
-- Fonti per servizio (ricavo = incassato dalle aziende, costo = provider):
--   sms      → ricavo: sms_wallet_transazioni (addebito_*, fonte monetaria
--              unica — sms_log.costo_cliente duplicherebbe);
--              costo: sms_log.costo_wholesale + transazionali × wholesale
--   whatsapp → ricavo: whatsapp_credits_log (importi negativi = consumo);
--              costo Meta: non tracciato a DB (fatturazione diretta Meta) → null
--   email    → ricavo: email_credits_log (importi negativi);
--              costo provider: incluso nel piano Resend → null
--   ai       → ai_model_usage_log: cost_billed_eur vs cost_real_eur (precisi)
--   render   → render_sessions completed: revenue_eur/cost_billed vs
--              cost_real_total/cost_real (precisi)

CREATE OR REPLACE FUNCTION public.get_extra_services_economics(
  _from timestamptz,
  _to   timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v jsonb;
  v_wholesale numeric := COALESCE(
    (SELECT costo_wholesale_sms FROM sms_pricing_config LIMIT 1), 0.008);
BEGIN
  IF NOT is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden: super_admin only';
  END IF;

  WITH sms_rev AS (
    SELECT COALESCE(sum(-importo), 0) AS revenue, count(*) AS n
    FROM sms_wallet_transazioni
    WHERE tipo LIKE 'addebito%' AND created_at >= _from AND created_at < _to
  ),
  sms_cost AS (
    SELECT
      COALESCE((SELECT sum(costo_wholesale) FROM sms_log
        WHERE stato <> 'fallito' AND created_at >= _from AND created_at < _to), 0)
      +
      COALESCE((SELECT count(*) FROM sms_messages
        WHERE direction = 'outbound' AND status <> 'failed'
          AND created_at >= _from AND created_at < _to), 0) * v_wholesale
      AS cost
  ),
  wa AS (
    SELECT COALESCE(sum(CASE WHEN amount_eur < 0 THEN -amount_eur ELSE 0 END), 0) AS revenue,
           count(*) FILTER (WHERE amount_eur < 0) AS n
    FROM whatsapp_credits_log
    WHERE created_at >= _from AND created_at < _to
  ),
  em AS (
    SELECT COALESCE(sum(CASE WHEN amount_eur < 0 THEN -amount_eur ELSE 0 END), 0) AS revenue,
           count(*) FILTER (WHERE amount_eur < 0) AS n
    FROM email_credits_log
    WHERE created_at >= _from AND created_at < _to
  ),
  ai AS (
    SELECT COALESCE(sum(cost_billed_eur), 0) AS revenue,
           COALESCE(sum(cost_real_eur), 0)   AS cost,
           count(*) AS n
    FROM ai_model_usage_log
    WHERE ok IS NOT FALSE AND ts >= _from AND ts < _to
  ),
  rend AS (
    SELECT COALESCE(sum(COALESCE(revenue_eur, cost_billed, 0)), 0)        AS revenue,
           COALESCE(sum(COALESCE(cost_real_total, cost_real, 0)), 0)      AS cost,
           count(*) AS n
    FROM render_sessions
    WHERE status = 'completed' AND created_at >= _from AND created_at < _to
  )
  SELECT jsonb_build_object(
    'periodo', jsonb_build_object('from', _from, 'to', _to),
    'servizi', jsonb_build_array(
      jsonb_build_object('key','sms','label','SMS',
        'revenue', (SELECT revenue FROM sms_rev),
        'cost',    (SELECT cost FROM sms_cost),
        'cost_tracked', true,
        'n_operazioni', (SELECT n FROM sms_rev)),
      jsonb_build_object('key','whatsapp','label','WhatsApp',
        'revenue', (SELECT revenue FROM wa),
        'cost',    null,
        'cost_tracked', false,
        'cost_note', 'Fatturazione Meta diretta (non tracciata a DB)',
        'n_operazioni', (SELECT n FROM wa)),
      jsonb_build_object('key','email','label','Email',
        'revenue', (SELECT revenue FROM em),
        'cost',    null,
        'cost_tracked', false,
        'cost_note', 'Incluso nel piano del provider (Resend/Elastic)',
        'n_operazioni', (SELECT n FROM em)),
      jsonb_build_object('key','ai','label','AI',
        'revenue', (SELECT revenue FROM ai),
        'cost',    (SELECT cost FROM ai),
        'cost_tracked', true,
        'n_operazioni', (SELECT n FROM ai)),
      jsonb_build_object('key','render','label','Render',
        'revenue', (SELECT revenue FROM rend),
        'cost',    (SELECT cost FROM rend),
        'cost_tracked', true,
        'n_operazioni', (SELECT n FROM rend))
    ),
    'totals', jsonb_build_object(
      'revenue',
        (SELECT revenue FROM sms_rev) + (SELECT revenue FROM wa) +
        (SELECT revenue FROM em) + (SELECT revenue FROM ai) + (SELECT revenue FROM rend),
      'cost_tracked',
        (SELECT cost FROM sms_cost) + (SELECT cost FROM ai) + (SELECT cost FROM rend),
      'margin_tracked',
        ((SELECT revenue FROM sms_rev) - (SELECT cost FROM sms_cost)) +
        ((SELECT revenue FROM ai)  - (SELECT cost FROM ai)) +
        ((SELECT revenue FROM rend) - (SELECT cost FROM rend))
    )
  ) INTO v;

  RETURN v;
END;
$$;

REVOKE ALL ON FUNCTION public.get_extra_services_economics(timestamptz, timestamptz) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.get_extra_services_economics(timestamptz, timestamptz) TO authenticated;
