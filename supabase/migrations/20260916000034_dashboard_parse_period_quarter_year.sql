-- ════════════════════════════════════════════════════════════════
-- FIX: _dashboard_parse_period supporta quarter/last_year/last_90_days
--
-- BUG: il frontend (CruscottoDashboardPage) esponeva i preset
-- `this_quarter`, `last_quarter`, `last_year`, `last_90_days`, ma la
-- funzione Postgres li faceva ricadere nel ramo ELSE che ritorna
-- "this_month": selezionando uno di quei preset si vedevano i dati
-- del mese corrente senza alcun indizio visivo di errore.
--
-- Aggiunti i 4 case mancanti con semantica coerente col resto.
-- ════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public._dashboard_parse_period(p_filters JSONB)
RETURNS TABLE(from_ts TIMESTAMPTZ, to_ts TIMESTAMPTZ)
LANGUAGE plpgsql IMMUTABLE
AS $$
DECLARE
  v_period TEXT := COALESCE(p_filters->>'period', 'this_month');
  v_now TIMESTAMPTZ := NOW();
BEGIN
  CASE v_period
    WHEN 'today'        THEN from_ts := date_trunc('day', v_now);  to_ts := v_now;
    WHEN 'yesterday'    THEN from_ts := date_trunc('day', v_now - INTERVAL '1 day'); to_ts := date_trunc('day', v_now);
    WHEN 'last_7_days'  THEN from_ts := v_now - INTERVAL '7 days';  to_ts := v_now;
    WHEN 'last_30_days' THEN from_ts := v_now - INTERVAL '30 days'; to_ts := v_now;
    WHEN 'last_90_days' THEN from_ts := v_now - INTERVAL '90 days'; to_ts := v_now;
    WHEN 'this_week'    THEN from_ts := date_trunc('week', v_now);  to_ts := v_now;
    WHEN 'this_month'   THEN from_ts := date_trunc('month', v_now); to_ts := v_now;
    WHEN 'last_month'   THEN from_ts := date_trunc('month', v_now) - INTERVAL '1 month';
                             to_ts   := date_trunc('month', v_now);
    WHEN 'this_quarter' THEN from_ts := date_trunc('quarter', v_now); to_ts := v_now;
    WHEN 'last_quarter' THEN from_ts := date_trunc('quarter', v_now) - INTERVAL '3 months';
                             to_ts   := date_trunc('quarter', v_now);
    WHEN 'this_year'    THEN from_ts := date_trunc('year', v_now);  to_ts := v_now;
    WHEN 'ytd'          THEN from_ts := date_trunc('year', v_now);  to_ts := v_now;
    WHEN 'last_year'    THEN from_ts := date_trunc('year', v_now) - INTERVAL '1 year';
                             to_ts   := date_trunc('year', v_now);
    WHEN 'custom'       THEN
      from_ts := COALESCE((p_filters->>'from')::TIMESTAMPTZ, date_trunc('month', v_now));
      to_ts   := COALESCE((p_filters->>'to')::TIMESTAMPTZ, v_now);
    ELSE from_ts := date_trunc('month', v_now); to_ts := v_now;
  END CASE;
  RETURN NEXT;
END $$;

GRANT EXECUTE ON FUNCTION public._dashboard_parse_period(JSONB) TO authenticated;
