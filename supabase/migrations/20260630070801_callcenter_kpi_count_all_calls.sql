-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.

-- get_callcenter_kpi_per_operatore: conta TUTTE le chiamate registrate nel periodo,
-- anche per operatori senza lead "nuovi" (creati nel periodo). Prima il SELECT era
-- FROM leads_periodo LEFT JOIN chiamate_periodo → un operatore con chiamate ma senza
-- lead del periodo NON compariva e le sue chiamate non venivano contate.
-- Fix: FULL OUTER JOIN + COALESCE sull'operatore. CTE invariati.
CREATE OR REPLACE FUNCTION public.get_callcenter_kpi_per_operatore(p_company_id uuid, p_data_inizio date, p_data_fine date, p_operatore_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(operatore_id uuid, nome_operatore text, email_operatore text, lead_assegnati bigint, lead_lavorati bigint, pct_lead_lavorati numeric, lead_contattati bigint, tasso_contatto numeric, tentativi_totali bigint, tentativi_per_contatto numeric, avg_speed_to_lead_min numeric, median_speed_to_lead_min numeric, pct_entro_5min numeric, pct_entro_1ora numeric, pct_oltre_24ore numeric, appuntamenti_fissati bigint, tasso_app_su_contattati numeric, tasso_app_su_assegnati numeric, show_up_count bigint, tasso_show_up numeric, durata_media_min numeric, chiamate_per_giorno numeric, giorni_lavorati bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_giorni_lavorativi INTEGER := GREATEST((p_data_fine - p_data_inizio)::INTEGER * 5 / 7, 1);
BEGIN
  RETURN QUERY
  WITH
  leads_periodo AS (
    SELECT
      lj.operatore_assegnato AS op_id,
      COUNT(*) AS assegnati,
      COUNT(*) FILTER (WHERE lj.fu_lavorato) AS lavorati,
      COUNT(*) FILTER (WHERE lj.fu_contattato) AS contattati,
      SUM(lj.nr_tentativi) AS tot_tentativi,
      ROUND(AVG(lj.speed_to_lead_minuti) FILTER (WHERE lj.speed_to_lead_minuti >= 0), 1) AS avg_stl,
      ROUND(
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY lj.speed_to_lead_minuti)::NUMERIC, 1
      ) AS median_stl,
      ROUND(100.0 * COUNT(*) FILTER (WHERE lj.speed_to_lead_minuti BETWEEN 0 AND 5)
        / NULLIF(COUNT(*) FILTER (WHERE lj.speed_to_lead_minuti IS NOT NULL), 0), 1) AS pct_5min,
      ROUND(100.0 * COUNT(*) FILTER (WHERE lj.speed_to_lead_minuti BETWEEN 0 AND 60)
        / NULLIF(COUNT(*) FILTER (WHERE lj.speed_to_lead_minuti IS NOT NULL), 0), 1) AS pct_1ora,
      ROUND(100.0 * COUNT(*) FILTER (WHERE lj.speed_to_lead_minuti > 1440)
        / NULLIF(COUNT(*) FILTER (WHERE lj.speed_to_lead_minuti IS NOT NULL), 0), 1) AS pct_24ore,
      SUM(lj.appuntamenti_fissati) AS apt_fissati,
      SUM(lj.appuntamenti_show_up) AS apt_show_up,
      ROUND(AVG(lj.durata_media_chiamata) FILTER (WHERE lj.durata_media_chiamata > 0), 1) AS avg_durata
    FROM callcenter_lead_journey lj
    WHERE lj.company_id = p_company_id
      AND lj.lead_created_at::DATE BETWEEN p_data_inizio AND p_data_fine
      AND (p_operatore_id IS NULL OR lj.operatore_assegnato = p_operatore_id)
    GROUP BY lj.operatore_assegnato
  ),
  chiamate_periodo AS (
    SELECT
      cl.user_id AS op_id,
      COUNT(*) AS nr_chiamate,
      COUNT(DISTINCT cl.started_at::DATE) AS giorni_attivi
    FROM call_logs cl
    WHERE cl.company_id = p_company_id
      AND cl.started_at::DATE BETWEEN p_data_inizio AND p_data_fine
      AND (p_operatore_id IS NULL OR cl.user_id = p_operatore_id)
    GROUP BY cl.user_id
  )
  SELECT
    COALESCE(lp.op_id, cp.op_id),
    (p.first_name || ' ' || p.last_name)::TEXT,
    p.email::TEXT,
    COALESCE(lp.assegnati, 0),
    COALESCE(lp.lavorati, 0),
    ROUND(100.0 * lp.lavorati / NULLIF(lp.assegnati, 0), 1),
    COALESCE(lp.contattati, 0),
    ROUND(100.0 * lp.contattati / NULLIF(lp.lavorati, 0), 1),
    COALESCE(cp.nr_chiamate, 0),
    ROUND(COALESCE(cp.nr_chiamate, 0)::NUMERIC / NULLIF(lp.contattati, 0), 2),
    lp.avg_stl,
    lp.median_stl,
    lp.pct_5min,
    lp.pct_1ora,
    lp.pct_24ore,
    COALESCE(lp.apt_fissati, 0),
    ROUND(100.0 * lp.apt_fissati / NULLIF(lp.contattati, 0), 1),
    ROUND(100.0 * lp.apt_fissati / NULLIF(lp.assegnati, 0), 1),
    COALESCE(lp.apt_show_up, 0),
    ROUND(100.0 * lp.apt_show_up / NULLIF(lp.apt_fissati, 0), 1),
    lp.avg_durata,
    ROUND(COALESCE(cp.nr_chiamate, 0)::NUMERIC / NULLIF(v_giorni_lavorativi, 0), 1),
    COALESCE(cp.giorni_attivi, 0)
  FROM leads_periodo lp
  FULL OUTER JOIN chiamate_periodo cp ON cp.op_id = lp.op_id
  LEFT JOIN profiles p ON p.id = COALESCE(lp.op_id, cp.op_id)
  ORDER BY COALESCE(lp.apt_fissati, 0) DESC, COALESCE(cp.nr_chiamate, 0) DESC;
END;
$function$;
