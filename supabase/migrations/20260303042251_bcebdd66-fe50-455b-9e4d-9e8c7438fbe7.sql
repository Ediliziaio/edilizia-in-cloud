
CREATE OR REPLACE FUNCTION public.get_marketing_dashboard_stats(
  p_company_id uuid,
  p_date_from timestamptz DEFAULT NULL,
  p_date_to timestamptz DEFAULT NULL,
  p_assigned_user_ids uuid[] DEFAULT NULL,
  p_sources text[] DEFAULT NULL,
  p_pipeline_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  result jsonb;
  v_date_from timestamptz := COALESCE(p_date_from, now() - interval '30 days');
  v_date_to timestamptz := COALESCE(p_date_to, now());
  v_period_length interval := v_date_to - v_date_from;
  v_prev_from timestamptz := v_date_from - v_period_length;
  v_prev_to timestamptz := v_date_from;
  v_leads_total bigint;
  v_leads_new bigint;
  v_contacts_worked bigint;
  v_appointments_set bigint;
  v_appointments_done bigint;
  v_contracts_won bigint;
  v_revenue numeric;
  v_prev_leads_total bigint;
  v_prev_leads_new bigint;
  v_prev_contacts_worked bigint;
  v_prev_appointments_set bigint;
  v_prev_appointments_done bigint;
  v_prev_contracts_won bigint;
  v_prev_revenue numeric;
  v_funnel jsonb;
  v_sales jsonb;
  v_sources jsonb;
  v_alerts jsonb;
  v_trend jsonb;
BEGIN
  -- CURRENT PERIOD KPIs
  SELECT COUNT(*) INTO v_leads_total
  FROM marketing_contacts mc
  WHERE mc.company_id = p_company_id
    AND mc.created_at <= v_date_to
    AND (p_assigned_user_ids IS NULL OR mc.assigned_to = ANY(p_assigned_user_ids))
    AND (p_sources IS NULL OR mc.source = ANY(p_sources));

  SELECT COUNT(*) INTO v_leads_new
  FROM marketing_contacts mc
  WHERE mc.company_id = p_company_id
    AND mc.created_at >= v_date_from AND mc.created_at <= v_date_to
    AND (p_assigned_user_ids IS NULL OR mc.assigned_to = ANY(p_assigned_user_ids))
    AND (p_sources IS NULL OR mc.source = ANY(p_sources));

  SELECT COUNT(DISTINCT mc.id) INTO v_contacts_worked
  FROM marketing_contacts mc
  WHERE mc.company_id = p_company_id
    AND (p_assigned_user_ids IS NULL OR mc.assigned_to = ANY(p_assigned_user_ids))
    AND (p_sources IS NULL OR mc.source = ANY(p_sources))
    AND (
      EXISTS (SELECT 1 FROM marketing_contact_activities mca WHERE mca.contact_id = mc.id AND mca.created_at >= v_date_from AND mca.created_at <= v_date_to)
      OR EXISTS (SELECT 1 FROM marketing_opportunities mo WHERE mo.contact_id = mc.id AND mo.created_at >= v_date_from AND mo.created_at <= v_date_to)
    );

  SELECT COUNT(*) INTO v_appointments_set
  FROM appointments a
  WHERE a.company_id = p_company_id
    AND a.appointment_date >= v_date_from::date AND a.appointment_date <= v_date_to::date
    AND a.is_blocked_slot = false
    AND (p_assigned_user_ids IS NULL OR a.assigned_to = ANY(p_assigned_user_ids));

  SELECT COUNT(*) INTO v_appointments_done
  FROM appointments a
  WHERE a.company_id = p_company_id
    AND a.appointment_date >= v_date_from::date AND a.appointment_date <= v_date_to::date
    AND a.is_blocked_slot = false AND a.is_completed = true
    AND (p_assigned_user_ids IS NULL OR a.assigned_to = ANY(p_assigned_user_ids));

  SELECT COUNT(*), COALESCE(SUM(mo.value), 0)
  INTO v_contracts_won, v_revenue
  FROM marketing_opportunities mo
  WHERE mo.company_id = p_company_id AND mo.status = 'won'
    AND mo.updated_at >= v_date_from AND mo.updated_at <= v_date_to
    AND (p_assigned_user_ids IS NULL OR mo.assigned_to = ANY(p_assigned_user_ids))
    AND (p_sources IS NULL OR mo.source = ANY(p_sources))
    AND (p_pipeline_id IS NULL OR mo.pipeline_id = p_pipeline_id);

  -- PREVIOUS PERIOD KPIs
  SELECT COUNT(*) INTO v_prev_leads_total
  FROM marketing_contacts mc
  WHERE mc.company_id = p_company_id AND mc.created_at <= v_prev_to
    AND (p_assigned_user_ids IS NULL OR mc.assigned_to = ANY(p_assigned_user_ids))
    AND (p_sources IS NULL OR mc.source = ANY(p_sources));

  SELECT COUNT(*) INTO v_prev_leads_new
  FROM marketing_contacts mc
  WHERE mc.company_id = p_company_id AND mc.created_at >= v_prev_from AND mc.created_at <= v_prev_to
    AND (p_assigned_user_ids IS NULL OR mc.assigned_to = ANY(p_assigned_user_ids))
    AND (p_sources IS NULL OR mc.source = ANY(p_sources));

  SELECT COUNT(DISTINCT mc.id) INTO v_prev_contacts_worked
  FROM marketing_contacts mc
  WHERE mc.company_id = p_company_id
    AND (p_assigned_user_ids IS NULL OR mc.assigned_to = ANY(p_assigned_user_ids))
    AND (p_sources IS NULL OR mc.source = ANY(p_sources))
    AND (
      EXISTS (SELECT 1 FROM marketing_contact_activities mca WHERE mca.contact_id = mc.id AND mca.created_at >= v_prev_from AND mca.created_at <= v_prev_to)
      OR EXISTS (SELECT 1 FROM marketing_opportunities mo WHERE mo.contact_id = mc.id AND mo.created_at >= v_prev_from AND mo.created_at <= v_prev_to)
    );

  SELECT COUNT(*) INTO v_prev_appointments_set
  FROM appointments a
  WHERE a.company_id = p_company_id AND a.appointment_date >= v_prev_from::date AND a.appointment_date <= v_prev_to::date
    AND a.is_blocked_slot = false
    AND (p_assigned_user_ids IS NULL OR a.assigned_to = ANY(p_assigned_user_ids));

  SELECT COUNT(*) INTO v_prev_appointments_done
  FROM appointments a
  WHERE a.company_id = p_company_id AND a.appointment_date >= v_prev_from::date AND a.appointment_date <= v_prev_to::date
    AND a.is_blocked_slot = false AND a.is_completed = true
    AND (p_assigned_user_ids IS NULL OR a.assigned_to = ANY(p_assigned_user_ids));

  SELECT COUNT(*), COALESCE(SUM(mo.value), 0)
  INTO v_prev_contracts_won, v_prev_revenue
  FROM marketing_opportunities mo
  WHERE mo.company_id = p_company_id AND mo.status = 'won'
    AND mo.updated_at >= v_prev_from AND mo.updated_at <= v_prev_to
    AND (p_assigned_user_ids IS NULL OR mo.assigned_to = ANY(p_assigned_user_ids))
    AND (p_sources IS NULL OR mo.source = ANY(p_sources))
    AND (p_pipeline_id IS NULL OR mo.pipeline_id = p_pipeline_id);

  -- FUNNEL
  SELECT COALESCE(jsonb_agg(row_to_json(f) ORDER BY f.position), '[]'::jsonb)
  INTO v_funnel
  FROM (
    SELECT mps.id AS stage_id, mps.name, mps.position,
      COUNT(mo.id) AS count, COALESCE(SUM(mo.value), 0) AS total_value
    FROM marketing_pipeline_stages mps
    LEFT JOIN marketing_opportunities mo ON mo.stage_id = mps.id
      AND mo.company_id = p_company_id
      AND mo.created_at >= v_date_from AND mo.created_at <= v_date_to
      AND (p_assigned_user_ids IS NULL OR mo.assigned_to = ANY(p_assigned_user_ids))
      AND (p_sources IS NULL OR mo.source = ANY(p_sources))
    WHERE mps.company_id = p_company_id
      AND (p_pipeline_id IS NULL OR mps.pipeline_id = p_pipeline_id)
    GROUP BY mps.id, mps.name, mps.position
  ) f;

  -- SALES PERFORMANCE (restructured to avoid parser issue)
  WITH sales_users AS (
    SELECT DISTINCT p.id AS user_id, p.first_name, p.last_name
    FROM profiles p
    WHERE p.company_id = p_company_id
      AND (
        EXISTS (SELECT 1 FROM marketing_opportunities mo2 WHERE mo2.assigned_to = p.id AND mo2.company_id = p_company_id)
        OR EXISTS (SELECT 1 FROM appointments a2 WHERE a2.assigned_to = p.id AND a2.company_id = p_company_id)
      )
  ),
  apt_set_counts AS (
    SELECT a3.assigned_to AS user_id, COUNT(*) AS cnt
    FROM appointments a3
    WHERE a3.company_id = p_company_id
      AND a3.appointment_date >= v_date_from::date AND a3.appointment_date <= v_date_to::date
      AND a3.is_blocked_slot = false
    GROUP BY a3.assigned_to
  ),
  apt_done_counts AS (
    SELECT a4.assigned_to AS user_id, COUNT(*) AS cnt
    FROM appointments a4
    WHERE a4.company_id = p_company_id
      AND a4.appointment_date >= v_date_from::date AND a4.appointment_date <= v_date_to::date
      AND a4.is_blocked_slot = false AND a4.is_completed = true
    GROUP BY a4.assigned_to
  ),
  opp_won_counts AS (
    SELECT mo3.assigned_to AS user_id, COUNT(*) AS cnt, COALESCE(SUM(mo3.value), 0) AS total_value
    FROM marketing_opportunities mo3
    WHERE mo3.company_id = p_company_id AND mo3.status = 'won'
      AND mo3.updated_at >= v_date_from AND mo3.updated_at <= v_date_to
      AND (p_pipeline_id IS NULL OR mo3.pipeline_id = p_pipeline_id)
    GROUP BY mo3.assigned_to
  )
  SELECT COALESCE(jsonb_agg(row_to_json(s) ORDER BY s.revenue DESC), '[]'::jsonb)
  INTO v_sales
  FROM (
    SELECT su.user_id, su.first_name || ' ' || su.last_name AS name,
      COALESCE(asc2.cnt, 0) AS appointments_set,
      COALESCE(adc.cnt, 0) AS appointments_done,
      COALESCE(owc.cnt, 0) AS contracts_won,
      COALESCE(owc.total_value, 0) AS revenue
    FROM sales_users su
    LEFT JOIN apt_set_counts asc2 ON asc2.user_id = su.user_id
    LEFT JOIN apt_done_counts adc ON adc.user_id = su.user_id
    LEFT JOIN opp_won_counts owc ON owc.user_id = su.user_id
  ) s;

  -- SOURCES
  SELECT COALESCE(jsonb_agg(row_to_json(src) ORDER BY src.leads DESC), '[]'::jsonb)
  INTO v_sources
  FROM (
    SELECT COALESCE(mc.source, 'Non specificata') AS source,
      COUNT(DISTINCT mc.id) AS leads,
      COUNT(DISTINCT CASE WHEN mo.status = 'won' THEN mo.id END) AS contracts_won,
      COALESCE(SUM(CASE WHEN mo.status = 'won' THEN mo.value ELSE 0 END), 0) AS revenue
    FROM marketing_contacts mc
    LEFT JOIN marketing_opportunities mo ON mo.contact_id = mc.id
      AND mo.company_id = p_company_id
      AND mo.updated_at >= v_date_from AND mo.updated_at <= v_date_to
    WHERE mc.company_id = p_company_id
      AND mc.created_at >= v_date_from AND mc.created_at <= v_date_to
      AND (p_assigned_user_ids IS NULL OR mc.assigned_to = ANY(p_assigned_user_ids))
    GROUP BY mc.source
  ) src;

  -- ALERTS
  SELECT jsonb_build_object(
    'stale_leads', (
      SELECT COUNT(*) FROM marketing_contacts mc
      WHERE mc.company_id = p_company_id AND mc.created_at >= v_date_from
        AND mc.last_activity_at IS NULL AND mc.created_at < now() - interval '48 hours'
    ),
    'stale_opportunities', (
      SELECT COUNT(*) FROM marketing_opportunities mo
      WHERE mo.company_id = p_company_id AND mo.status = 'open'
        AND mo.updated_at < now() - interval '7 days'
    ),
    'pending_appointments', (
      SELECT COUNT(*) FROM appointments a
      WHERE a.company_id = p_company_id AND a.appointment_date < now()::date
        AND a.is_completed = false AND a.is_blocked_slot = false
        AND a.status NOT IN ('cancelled', 'canceled')
    )
  ) INTO v_alerts;

  -- TREND
  SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.day), '[]'::jsonb)
  INTO v_trend
  FROM (
    SELECT d.day::date AS day,
      (SELECT COUNT(*) FROM marketing_contacts mc WHERE mc.company_id = p_company_id AND mc.created_at::date = d.day
        AND (p_assigned_user_ids IS NULL OR mc.assigned_to = ANY(p_assigned_user_ids))
        AND (p_sources IS NULL OR mc.source = ANY(p_sources))) AS leads,
      (SELECT COUNT(*) FROM appointments a WHERE a.company_id = p_company_id AND a.appointment_date = d.day
        AND a.is_blocked_slot = false
        AND (p_assigned_user_ids IS NULL OR a.assigned_to = ANY(p_assigned_user_ids))) AS appointments,
      (SELECT COUNT(*) FROM marketing_opportunities mo WHERE mo.company_id = p_company_id AND mo.status = 'won' AND mo.updated_at::date = d.day
        AND (p_assigned_user_ids IS NULL OR mo.assigned_to = ANY(p_assigned_user_ids))
        AND (p_sources IS NULL OR mo.source = ANY(p_sources))
        AND (p_pipeline_id IS NULL OR mo.pipeline_id = p_pipeline_id)) AS won
    FROM generate_series(v_date_from::date, v_date_to::date, '1 day'::interval) d(day)
  ) t;

  -- BUILD RESULT
  result := jsonb_build_object(
    'kpi', jsonb_build_object(
      'leads_total', v_leads_total, 'leads_new', v_leads_new,
      'contacts_worked', v_contacts_worked,
      'appointments_set', v_appointments_set, 'appointments_done', v_appointments_done,
      'show_rate', CASE WHEN v_appointments_set > 0 THEN ROUND((v_appointments_done::numeric / v_appointments_set) * 100, 1) ELSE 0 END,
      'contracts_won', v_contracts_won, 'revenue', v_revenue,
      'avg_ticket', CASE WHEN v_contracts_won > 0 THEN ROUND(v_revenue / v_contracts_won, 2) ELSE 0 END,
      'close_rate', CASE WHEN v_appointments_done > 0 THEN ROUND((v_contracts_won::numeric / v_appointments_done) * 100, 1) ELSE 0 END
    ),
    'kpi_prev', jsonb_build_object(
      'leads_total', v_prev_leads_total, 'leads_new', v_prev_leads_new,
      'contacts_worked', v_prev_contacts_worked,
      'appointments_set', v_prev_appointments_set, 'appointments_done', v_prev_appointments_done,
      'show_rate', CASE WHEN v_prev_appointments_set > 0 THEN ROUND((v_prev_appointments_done::numeric / v_prev_appointments_set) * 100, 1) ELSE 0 END,
      'contracts_won', v_prev_contracts_won, 'revenue', v_prev_revenue,
      'avg_ticket', CASE WHEN v_prev_contracts_won > 0 THEN ROUND(v_prev_revenue / v_prev_contracts_won, 2) ELSE 0 END,
      'close_rate', CASE WHEN v_prev_appointments_done > 0 THEN ROUND((v_prev_contracts_won::numeric / v_prev_appointments_done) * 100, 1) ELSE 0 END
    ),
    'funnel', v_funnel,
    'sales_performance', v_sales,
    'sources', v_sources,
    'alerts', v_alerts,
    'trend', v_trend
  );

  RETURN result;
END;
$function$;
