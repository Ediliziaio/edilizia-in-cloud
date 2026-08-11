-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.

CREATE OR REPLACE FUNCTION public.sms_admin_overview()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
  v_mese_inizio timestamptz := date_trunc('month', now());
  v_sei_mesi   timestamptz := date_trunc('month', now()) - interval '5 months';
  v_wholesale  numeric := COALESCE(
    (SELECT costo_wholesale_sms FROM sms_pricing_config LIMIT 1), 0.008);
BEGIN
  IF NOT is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden: super_admin only';
  END IF;

  WITH camp AS (
    SELECT company_id,
      count(*) FILTER (WHERE created_at >= v_mese_inizio) AS sms_mese,
      count(*) AS sms_totali,
      COALESCE(sum(costo_cliente)   FILTER (WHERE created_at >= v_mese_inizio), 0) AS fatt_mese,
      COALESCE(sum(costo_wholesale) FILTER (WHERE created_at >= v_mese_inizio), 0) AS cost_mese
    FROM sms_log
    WHERE stato <> 'fallito'
    GROUP BY company_id
  ),
  trans AS (
    SELECT company_id,
      count(*) FILTER (WHERE created_at >= v_mese_inizio) AS sms_mese,
      count(*) AS sms_totali
    FROM sms_messages
    WHERE direction = 'outbound' AND status <> 'failed'
    GROUP BY company_id
  ),
  trans_fatt AS (
    SELECT company_id,
      COALESCE(sum(importo) FILTER (WHERE created_at >= v_mese_inizio), 0) AS fatt_mese
    FROM sms_wallet_transazioni
    WHERE tipo = 'addebito_sms'
    GROUP BY company_id
  ),
  -- Base tenant: qualsiasi azienda con account Telnyx attivo, wallet SMS
  -- o attività di invio (campagne/transazionali). Prima il filtro era solo
  -- sull'account attivo e le aziende che inviavano col mittente
  -- alfanumerico senza account risultavano invisibili.
  base AS (
    SELECT company_id FROM sms_telnyx_accounts WHERE stato = 'attivo'
    UNION SELECT company_id FROM sms_wallet
    UNION SELECT company_id FROM camp
    UNION SELECT company_id FROM trans
  ),
  tenants AS (
    SELECT
      b.company_id,
      c.name AS company_name,
      n.numero_e164,
      n.stato AS numero_stato,
      (a.company_id IS NOT NULL) AS account_attivo,
      COALESCE(w.crediti, 0)::numeric AS crediti_wallet,
      (COALESCE(camp.sms_mese, 0)   + COALESCE(trans.sms_mese, 0))::int   AS sms_mese,
      (COALESCE(camp.sms_totali, 0) + COALESCE(trans.sms_totali, 0))::int AS sms_totali,
      (COALESCE(camp.fatt_mese, 0)  + COALESCE(tf.fatt_mese, 0))::numeric AS fatturato_mese,
      (COALESCE(camp.cost_mese, 0)  + COALESCE(trans.sms_mese, 0) * v_wholesale)::numeric AS costo_wholesale_mese
    FROM base b
    JOIN companies c            ON c.id = b.company_id
    LEFT JOIN sms_telnyx_accounts a ON a.company_id = b.company_id AND a.stato = 'attivo'
    LEFT JOIN sms_telnyx_numbers n  ON n.company_id = b.company_id AND n.stato = 'attivo'
    LEFT JOIN sms_wallet w          ON w.company_id = b.company_id
    LEFT JOIN camp                  ON camp.company_id = b.company_id
    LEFT JOIN trans                 ON trans.company_id = b.company_id
    LEFT JOIN trans_fatt tf         ON tf.company_id = b.company_id
  ),
  trend AS (
    SELECT
      to_char(date_trunc('month', created_at), 'YYYY-MM') AS mese,
      COALESCE(sum(costo_cliente), 0)::numeric   AS fatturato,
      COALESCE(sum(costo_wholesale), 0)::numeric AS costo_wholesale
    FROM sms_log
    WHERE created_at >= v_sei_mesi AND stato <> 'fallito'
    GROUP BY 1
  )
  SELECT jsonb_build_object(
    'tenants', COALESCE((
      SELECT jsonb_agg(
        to_jsonb(t) || jsonb_build_object(
          'margine_mese', t.fatturato_mese - t.costo_wholesale_mese,
          'margine_percentuale', CASE WHEN t.fatturato_mese > 0
            THEN round((t.fatturato_mese - t.costo_wholesale_mese) / t.fatturato_mese * 100, 1)
            ELSE 0 END
        )
        ORDER BY t.fatturato_mese DESC, t.company_name
      ) FROM tenants t), '[]'::jsonb),
    'totals', (
      SELECT jsonb_build_object(
        'tenant_attivi',        count(*),
        'sms_mese',             COALESCE(sum(sms_mese), 0),
        'sms_totali',           COALESCE(sum(sms_totali), 0),
        'fatturato_mese',       COALESCE(sum(fatturato_mese), 0),
        'costo_wholesale_mese', COALESCE(sum(costo_wholesale_mese), 0),
        'margine_mese',         COALESCE(sum(fatturato_mese - costo_wholesale_mese), 0)
      ) FROM tenants),
    'trend', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'mese', mese,
        'fatturato', fatturato,
        'costo_wholesale', costo_wholesale,
        'margine', fatturato - costo_wholesale
      ) ORDER BY mese)
      FROM trend), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.sms_admin_overview() FROM anon, public;
GRANT EXECUTE ON FUNCTION public.sms_admin_overview() TO authenticated;
