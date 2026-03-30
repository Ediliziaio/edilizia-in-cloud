
CREATE OR REPLACE FUNCTION public.get_marketing_dashboard_stats(p_company_id uuid, p_date_from timestamp with time zone DEFAULT NULL::timestamp with time zone, p_date_to timestamp with time zone DEFAULT NULL::timestamp with time zone, p_assigned_user_ids uuid[] DEFAULT NULL::uuid[], p_sources text[] DEFAULT NULL::text[], p_pipeline_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  result jsonb;
  v_date_from timestamptz := COALESCE(p_date_from, now() - interval '30 days');
  v_date_to timestamptz := COALESCE(p_date_to, now());
  v_period_length interval := v_date_to - v_date_from;
  v_prev_from timestamptz := v_date_from - v_period_length;
  v_prev_to timestamptz := v_date_from;
  -- Current KPIs
  v_leads_total bigint;
  v_leads_new bigint;
  v_contacts_worked bigint;
  v_appointments_set bigint;
  v_appointments_done bigint;
  v_contracts_won bigint;
  v_revenue numeric;
  v_contracts_lost bigint;
  v_revenue_lost numeric;
  v_total_spend numeric;
  v_calls_total bigint;
  v_calls_answered bigint;
  -- Previous KPIs
  v_prev_leads_total bigint;
  v_prev_leads_new bigint;
  v_prev_contacts_worked bigint;
  v_prev_appointments_set bigint;
  v_prev_appointments_done bigint;
  v_prev_contracts_won bigint;
  v_prev_revenue numeric;
  v_prev_contracts_lost bigint;
  v_prev_revenue_lost numeric;
  v_prev_total_spend numeric;
  v_prev_calls_total bigint;
  v_prev_calls_answered bigint;
  -- Enterprise fields
  v_pipeline_active_value numeric;
  v_avg_time_to_first_contact numeric;
  v_avg_time_to_close numeric;
  v_forecast_30d numeric;
  v_prev_pipeline_active_value numeric;
  v_open_opps_advanced bigint;
  -- NEW: Statistical KPIs
  v_avg_lead_to_won_days numeric;
  v_median_lead_to_won_days numeric;
  v_sales_velocity numeric;
  v_rpl numeric;
  v_weighted_pipeline numeric;
  v_open_opps_count bigint;
  v_prev_avg_lead_to_won_days numeric;
  v_prev_sales_velocity numeric;
  v_prev_rpl numeric;
  -- Sections
  v_funnel jsonb;
  v_sales jsonb;
  v_sources jsonb;
  v_alerts jsonb;
  v_trend jsonb;
  v_call_center jsonb;
  v_show_rate numeric;
  v_close_rate numeric;
  v_avg_ticket numeric;
BEGIN
  -- CURRENT PERIOD KPIs
  SELECT COUNT(*) INTO v_leads_total
  FROM marketing_contacts mc
  WHERE mc.company_id = p_company_id AND mc.created_at <= v_date_to
    AND (p_assigned_user_ids IS NULL OR mc.assigned_to = ANY(p_assigned_user_ids))
    AND (p_sources IS NULL OR mc.source = ANY(p_sources));

  SELECT COUNT(*) INTO v_leads_new
  FROM marketing_contacts mc
  WHERE mc.company_id = p_company_id AND mc.created_at >= v_date_from AND mc.created_at <= v_date_to
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
  WHERE a.company_id = p_company_id AND a.appointment_date >= v_date_from::date AND a.appointment_date <= v_date_to::date
    AND a.is_blocked_slot = false
    AND (p_assigned_user_ids IS NULL OR a.assigned_to = ANY(p_assigned_user_ids));

  SELECT COUNT(*) INTO v_appointments_done
  FROM appointments a
  WHERE a.company_id = p_company_id AND a.appointment_date >= v_date_from::date AND a.appointment_date <= v_date_to::date
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

  SELECT COUNT(*), COALESCE(SUM(mo.value), 0)
  INTO v_contracts_lost, v_revenue_lost
  FROM marketing_opportunities mo
  WHERE mo.company_id = p_company_id AND mo.status = 'lost'
    AND mo.updated_at >= v_date_from AND mo.updated_at <= v_date_to
    AND (p_assigned_user_ids IS NULL OR mo.assigned_to = ANY(p_assigned_user_ids))
    AND (p_sources IS NULL OR mo.source = ANY(p_sources))
    AND (p_pipeline_id IS NULL OR mo.pipeline_id = p_pipeline_id);

  SELECT COALESCE(SUM(cc.spend_amount), 0) INTO v_total_spend
  FROM campaign_costs cc
  WHERE cc.company_id = p_company_id AND cc.date >= v_date_from::date AND cc.date <= v_date_to::date
    AND (p_sources IS NULL OR cc.source = ANY(p_sources));

  SELECT COUNT(*), COUNT(*) FILTER (WHERE cl.outcome = 'answered')
  INTO v_calls_total, v_calls_answered
  FROM call_logs cl
  WHERE cl.company_id = p_company_id AND cl.started_at >= v_date_from AND cl.started_at <= v_date_to
    AND (p_assigned_user_ids IS NULL OR cl.user_id = ANY(p_assigned_user_ids));

  v_show_rate := CASE WHEN v_appointments_set > 0 THEN ROUND((v_appointments_done::numeric / v_appointments_set) * 100, 1) ELSE 0 END;
  v_close_rate := CASE WHEN v_appointments_done > 0 THEN ROUND((v_contracts_won::numeric / v_appointments_done) * 100, 1) ELSE 0 END;
  v_avg_ticket := CASE WHEN v_contracts_won > 0 THEN ROUND(v_revenue / v_contracts_won, 2) ELSE 0 END;

  -- ENTERPRISE: Pipeline Active Value
  SELECT COALESCE(SUM(mo.value), 0) INTO v_pipeline_active_value
  FROM marketing_opportunities mo
  WHERE mo.company_id = p_company_id AND mo.status = 'open'
    AND (p_assigned_user_ids IS NULL OR mo.assigned_to = ANY(p_assigned_user_ids))
    AND (p_sources IS NULL OR mo.source = ANY(p_sources))
    AND (p_pipeline_id IS NULL OR mo.pipeline_id = p_pipeline_id);

  SELECT COALESCE(SUM(mo.value), 0) INTO v_prev_pipeline_active_value
  FROM marketing_opportunities mo
  WHERE mo.company_id = p_company_id AND mo.status = 'open'
    AND mo.created_at <= v_prev_to
    AND (p_assigned_user_ids IS NULL OR mo.assigned_to = ANY(p_assigned_user_ids))
    AND (p_sources IS NULL OR mo.source = ANY(p_sources))
    AND (p_pipeline_id IS NULL OR mo.pipeline_id = p_pipeline_id);

  -- ENTERPRISE: Avg time to first contact (hours)
  SELECT COALESCE(ROUND(AVG(EXTRACT(EPOCH FROM (mca.created_at - mc.created_at)) / 3600)::numeric, 1), 0)
  INTO v_avg_time_to_first_contact
  FROM marketing_contacts mc
  JOIN LATERAL (
    SELECT MIN(mca2.created_at) AS created_at
    FROM marketing_contact_activities mca2
    WHERE mca2.contact_id = mc.id
  ) mca ON true
  WHERE mc.company_id = p_company_id AND mc.created_at >= v_date_from AND mc.created_at <= v_date_to
    AND mca.created_at IS NOT NULL
    AND (p_assigned_user_ids IS NULL OR mc.assigned_to = ANY(p_assigned_user_ids))
    AND (p_sources IS NULL OR mc.source = ANY(p_sources));

  -- ENTERPRISE: Avg time to close (days) - opportunity created → won
  SELECT COALESCE(ROUND(AVG(EXTRACT(EPOCH FROM (mo.updated_at - mo.created_at)) / 86400)::numeric, 1), 0)
  INTO v_avg_time_to_close
  FROM marketing_opportunities mo
  WHERE mo.company_id = p_company_id AND mo.status = 'won'
    AND mo.updated_at >= v_date_from AND mo.updated_at <= v_date_to
    AND (p_assigned_user_ids IS NULL OR mo.assigned_to = ANY(p_assigned_user_ids))
    AND (p_sources IS NULL OR mo.source = ANY(p_sources))
    AND (p_pipeline_id IS NULL OR mo.pipeline_id = p_pipeline_id);

  -- NEW: Avg lead-to-won days (contact created → opportunity won)
  SELECT COALESCE(ROUND(AVG(EXTRACT(EPOCH FROM (mo.updated_at - mc.created_at)) / 86400)::numeric, 1), 0)
  INTO v_avg_lead_to_won_days
  FROM marketing_opportunities mo
  JOIN marketing_contacts mc ON mc.id = mo.contact_id
  WHERE mo.company_id = p_company_id AND mo.status = 'won'
    AND mo.updated_at >= v_date_from AND mo.updated_at <= v_date_to
    AND (p_assigned_user_ids IS NULL OR mo.assigned_to = ANY(p_assigned_user_ids))
    AND (p_sources IS NULL OR mo.source = ANY(p_sources))
    AND (p_pipeline_id IS NULL OR mo.pipeline_id = p_pipeline_id);

  -- NEW: Median lead-to-won days
  SELECT COALESCE(ROUND(percentile_cont(0.5) WITHIN GROUP (
    ORDER BY EXTRACT(EPOCH FROM (mo.updated_at - mc.created_at)) / 86400
  )::numeric, 1), 0)
  INTO v_median_lead_to_won_days
  FROM marketing_opportunities mo
  JOIN marketing_contacts mc ON mc.id = mo.contact_id
  WHERE mo.company_id = p_company_id AND mo.status = 'won'
    AND mo.updated_at >= v_date_from AND mo.updated_at <= v_date_to
    AND (p_assigned_user_ids IS NULL OR mo.assigned_to = ANY(p_assigned_user_ids))
    AND (p_sources IS NULL OR mo.source = ANY(p_sources))
    AND (p_pipeline_id IS NULL OR mo.pipeline_id = p_pipeline_id);

  -- NEW: Count open opportunities for velocity
  SELECT COUNT(*) INTO v_open_opps_count
  FROM marketing_opportunities mo
  WHERE mo.company_id = p_company_id AND mo.status = 'open'
    AND (p_assigned_user_ids IS NULL OR mo.assigned_to = ANY(p_assigned_user_ids))
    AND (p_sources IS NULL OR mo.source = ANY(p_sources))
    AND (p_pipeline_id IS NULL OR mo.pipeline_id = p_pipeline_id);

  -- NEW: Sales Velocity = (open_opps × win_rate × avg_ticket) / cycle_days
  v_sales_velocity := CASE
    WHEN v_avg_lead_to_won_days > 0 AND v_close_rate > 0 AND v_avg_ticket > 0
    THEN ROUND((v_open_opps_count * (v_close_rate / 100.0) * v_avg_ticket) / v_avg_lead_to_won_days, 2)
    ELSE 0
  END;

  -- NEW: Revenue per Lead
  v_rpl := CASE WHEN v_leads_new > 0 THEN ROUND(v_revenue / v_leads_new, 2) ELSE 0 END;

  -- NEW: Weighted Pipeline (based on stage position probability)
  SELECT COALESCE(SUM(
    mo.value * (
      CASE
        WHEN max_pos.max_position > 0
        THEN (0.1 + 0.8 * (mps.position::numeric / max_pos.max_position))
        ELSE 0.5
      END
    )
  ), 0)
  INTO v_weighted_pipeline
  FROM marketing_opportunities mo
  JOIN marketing_pipeline_stages mps ON mps.id = mo.stage_id
  CROSS JOIN (
    SELECT COALESCE(MAX(mps2.position), 1) AS max_position
    FROM marketing_pipeline_stages mps2
    WHERE mps2.company_id = p_company_id AND (p_pipeline_id IS NULL OR mps2.pipeline_id = p_pipeline_id)
  ) max_pos
  WHERE mo.company_id = p_company_id AND mo.status = 'open'
    AND (p_assigned_user_ids IS NULL OR mo.assigned_to = ANY(p_assigned_user_ids))
    AND (p_sources IS NULL OR mo.source = ANY(p_sources))
    AND (p_pipeline_id IS NULL OR mo.pipeline_id = p_pipeline_id);

  -- ENTERPRISE: Forecast 30d
  SELECT COUNT(*) INTO v_open_opps_advanced
  FROM marketing_opportunities mo
  JOIN marketing_pipeline_stages mps ON mps.id = mo.stage_id
  WHERE mo.company_id = p_company_id AND mo.status = 'open'
    AND (p_pipeline_id IS NULL OR mo.pipeline_id = p_pipeline_id)
    AND mps.position >= (
      SELECT COALESCE(MAX(mps2.position), 0) / 2
      FROM marketing_pipeline_stages mps2
      WHERE mps2.company_id = p_company_id AND (p_pipeline_id IS NULL OR mps2.pipeline_id = p_pipeline_id)
    );

  v_forecast_30d := CASE
    WHEN v_close_rate > 0 AND v_avg_ticket > 0
    THEN ROUND((v_close_rate / 100.0) * v_avg_ticket * v_open_opps_advanced, 2)
    ELSE 0
  END;

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

  SELECT COUNT(*), COALESCE(SUM(mo.value), 0)
  INTO v_prev_contracts_lost, v_prev_revenue_lost
  FROM marketing_opportunities mo
  WHERE mo.company_id = p_company_id AND mo.status = 'lost'
    AND mo.updated_at >= v_prev_from AND mo.updated_at <= v_prev_to
    AND (p_assigned_user_ids IS NULL OR mo.assigned_to = ANY(p_assigned_user_ids))
    AND (p_sources IS NULL OR mo.source = ANY(p_sources))
    AND (p_pipeline_id IS NULL OR mo.pipeline_id = p_pipeline_id);

  SELECT COALESCE(SUM(cc.spend_amount), 0) INTO v_prev_total_spend
  FROM campaign_costs cc
  WHERE cc.company_id = p_company_id AND cc.date >= v_prev_from::date AND cc.date <= v_prev_to::date
    AND (p_sources IS NULL OR cc.source = ANY(p_sources));

  SELECT COUNT(*), COUNT(*) FILTER (WHERE cl.outcome = 'answered')
  INTO v_prev_calls_total, v_prev_calls_answered
  FROM call_logs cl
  WHERE cl.company_id = p_company_id AND cl.started_at >= v_prev_from AND cl.started_at <= v_prev_to
    AND (p_assigned_user_ids IS NULL OR cl.user_id = ANY(p_assigned_user_ids));

  -- PREV: avg_lead_to_won_days
  SELECT COALESCE(ROUND(AVG(EXTRACT(EPOCH FROM (mo.updated_at - mc.created_at)) / 86400)::numeric, 1), 0)
  INTO v_prev_avg_lead_to_won_days
  FROM marketing_opportunities mo
  JOIN marketing_contacts mc ON mc.id = mo.contact_id
  WHERE mo.company_id = p_company_id AND mo.status = 'won'
    AND mo.updated_at >= v_prev_from AND mo.updated_at <= v_prev_to
    AND (p_assigned_user_ids IS NULL OR mo.assigned_to = ANY(p_assigned_user_ids))
    AND (p_sources IS NULL OR mo.source = ANY(p_sources))
    AND (p_pipeline_id IS NULL OR mo.pipeline_id = p_pipeline_id);

  -- PREV: Sales Velocity
  v_prev_sales_velocity := CASE
    WHEN v_prev_avg_lead_to_won_days > 0 AND v_prev_contracts_won > 0 AND v_prev_appointments_done > 0
    THEN ROUND(
      (v_open_opps_count * (ROUND((v_prev_contracts_won::numeric / v_prev_appointments_done) * 100, 1) / 100.0) *
       CASE WHEN v_prev_contracts_won > 0 THEN ROUND(v_prev_revenue / v_prev_contracts_won, 2) ELSE 0 END
      ) / v_prev_avg_lead_to_won_days, 2)
    ELSE 0
  END;

  -- PREV: RPL
  v_prev_rpl := CASE WHEN v_prev_leads_new > 0 THEN ROUND(v_prev_revenue / v_prev_leads_new, 2) ELSE 0 END;

  -- FUNNEL
  SELECT COALESCE(jsonb_agg(row_to_json(f) ORDER BY f.position), '[]'::jsonb)
  INTO v_funnel
  FROM (
    SELECT mps.id AS stage_id, mps.name, mps.position,
      COUNT(mo.id) AS count, COALESCE(SUM(mo.value), 0) AS total_value,
      COALESCE(ROUND(AVG(
        CASE WHEN mo.id IS NOT NULL THEN EXTRACT(EPOCH FROM (LEAST(mo.updated_at, v_date_to) - mo.created_at)) / 86400 END
      )::numeric, 1), 0) AS avg_days_in_stage
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

  -- SALES PERFORMANCE
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
    WHERE a3.company_id = p_company_id AND a3.appointment_date >= v_date_from::date AND a3.appointment_date <= v_date_to::date AND a3.is_blocked_slot = false
    GROUP BY a3.assigned_to
  ),
  apt_done_counts AS (
    SELECT a4.assigned_to AS user_id, COUNT(*) AS cnt
    FROM appointments a4
    WHERE a4.company_id = p_company_id AND a4.appointment_date >= v_date_from::date AND a4.appointment_date <= v_date_to::date AND a4.is_blocked_slot = false AND a4.is_completed = true
    GROUP BY a4.assigned_to
  ),
  opp_won_counts AS (
    SELECT mo3.assigned_to AS user_id, COUNT(*) AS cnt, COALESCE(SUM(mo3.value), 0) AS total_value
    FROM marketing_opportunities mo3
    WHERE mo3.company_id = p_company_id AND mo3.status = 'won' AND mo3.updated_at >= v_date_from AND mo3.updated_at <= v_date_to
      AND (p_pipeline_id IS NULL OR mo3.pipeline_id = p_pipeline_id)
    GROUP BY mo3.assigned_to
  )
  SELECT COALESCE(jsonb_agg(row_to_json(s) ORDER BY s.revenue DESC), '[]'::jsonb)
  INTO v_sales
  FROM (
    SELECT su.user_id, su.first_name || ' ' || su.last_name AS name,
      COALESCE(asc2.cnt, 0) AS appointments_set, COALESCE(adc.cnt, 0) AS appointments_done,
      COALESCE(owc.cnt, 0) AS contracts_won, COALESCE(owc.total_value, 0) AS revenue,
      CASE WHEN COALESCE(asc2.cnt, 0) > 0 THEN ROUND((COALESCE(adc.cnt, 0)::numeric / asc2.cnt) * 100, 1) ELSE 0 END AS show_rate
    FROM sales_users su
    LEFT JOIN apt_set_counts asc2 ON asc2.user_id = su.user_id
    LEFT JOIN apt_done_counts adc ON adc.user_id = su.user_id
    LEFT JOIN opp_won_counts owc ON owc.user_id = su.user_id
  ) s;

  -- SOURCES
  SELECT COALESCE(jsonb_agg(row_to_json(src) ORDER BY src.roi_pct DESC NULLS LAST), '[]'::jsonb)
  INTO v_sources
  FROM (
    SELECT COALESCE(mc.source, 'Non specificata') AS source,
      COUNT(DISTINCT mc.id) AS leads,
      COUNT(DISTINCT CASE WHEN mo.status = 'won' THEN mo.id END) AS contracts_won,
      COALESCE(SUM(CASE WHEN mo.status = 'won' THEN mo.value ELSE 0 END), 0) AS revenue,
      COALESCE(src_costs.spend, 0) AS spend,
      CASE WHEN COALESCE(src_costs.spend, 0) > 0
        THEN ROUND(((COALESCE(SUM(CASE WHEN mo.status = 'won' THEN mo.value ELSE 0 END), 0) - src_costs.spend) / src_costs.spend) * 100, 1)
        ELSE NULL
      END AS roi_pct
    FROM marketing_contacts mc
    LEFT JOIN marketing_opportunities mo ON mo.contact_id = mc.id AND mo.company_id = p_company_id
      AND mo.updated_at >= v_date_from AND mo.updated_at <= v_date_to
    LEFT JOIN (
      SELECT cc.source, SUM(cc.spend_amount) AS spend
      FROM campaign_costs cc
      WHERE cc.company_id = p_company_id AND cc.date >= v_date_from::date AND cc.date <= v_date_to::date
      GROUP BY cc.source
    ) src_costs ON src_costs.source = mc.source
    WHERE mc.company_id = p_company_id AND mc.created_at >= v_date_from AND mc.created_at <= v_date_to
      AND (p_assigned_user_ids IS NULL OR mc.assigned_to = ANY(p_assigned_user_ids))
    GROUP BY mc.source, src_costs.spend
  ) src;

  -- CALL CENTER
  SELECT COALESCE(jsonb_agg(row_to_json(cc_row) ORDER BY cc_row.calls_total DESC), '[]'::jsonb)
  INTO v_call_center
  FROM (
    SELECT cl.user_id, p.first_name || ' ' || p.last_name AS name,
      COUNT(*) AS calls_total,
      COUNT(*) FILTER (WHERE cl.outcome = 'answered') AS calls_answered,
      ROUND(AVG(cl.duration_sec)) AS avg_duration_sec,
      COALESCE(apt_cc.cnt, 0) AS appointments_set
    FROM call_logs cl
    JOIN profiles p ON p.id = cl.user_id
    LEFT JOIN (
      SELECT a5.assigned_to AS user_id, COUNT(*) AS cnt
      FROM appointments a5
      WHERE a5.company_id = p_company_id AND a5.appointment_date >= v_date_from::date AND a5.appointment_date <= v_date_to::date AND a5.is_blocked_slot = false
      GROUP BY a5.assigned_to
    ) apt_cc ON apt_cc.user_id = cl.user_id
    WHERE cl.company_id = p_company_id AND cl.started_at >= v_date_from AND cl.started_at <= v_date_to
      AND (p_assigned_user_ids IS NULL OR cl.user_id = ANY(p_assigned_user_ids))
    GROUP BY cl.user_id, p.first_name, p.last_name, apt_cc.cnt
  ) cc_row;

  -- ALERTS
  SELECT jsonb_build_object(
    'stale_leads', (SELECT COUNT(*) FROM marketing_contacts mc WHERE mc.company_id = p_company_id AND mc.created_at >= v_date_from AND mc.last_activity_at IS NULL AND mc.created_at < now() - interval '48 hours'),
    'stale_leads_2h', (SELECT COUNT(*) FROM marketing_contacts mc WHERE mc.company_id = p_company_id AND mc.created_at >= v_date_from AND mc.last_activity_at IS NULL AND mc.created_at < now() - interval '2 hours' AND mc.created_at >= now() - interval '48 hours'),
    'stale_opportunities', (SELECT COUNT(*) FROM marketing_opportunities mo WHERE mo.company_id = p_company_id AND mo.status = 'open' AND mo.updated_at < now() - interval '7 days'),
    'pending_appointments', (SELECT COUNT(*) FROM appointments a WHERE a.company_id = p_company_id AND a.appointment_date < now()::date AND a.is_completed = false AND a.is_blocked_slot = false AND a.status NOT IN ('cancelled', 'canceled')),
    'show_rate_below_threshold', (v_show_rate < 60 AND v_appointments_set >= 5),
    'pipeline_declining', (v_pipeline_active_value < v_prev_pipeline_active_value * 0.8 AND v_prev_pipeline_active_value > 0)
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
      'show_rate', v_show_rate,
      'contracts_won', v_contracts_won, 'revenue', v_revenue,
      'contracts_lost', v_contracts_lost, 'revenue_lost', v_revenue_lost,
      'avg_ticket', v_avg_ticket,
      'close_rate', v_close_rate,
      'total_spend', v_total_spend,
      'cpl', CASE WHEN v_leads_new > 0 THEN ROUND(v_total_spend / v_leads_new, 2) ELSE 0 END,
      'cpa', CASE WHEN v_contracts_won > 0 THEN ROUND(v_total_spend / v_contracts_won, 2) ELSE 0 END,
      'calls_total', v_calls_total,
      'calls_answered', v_calls_answered,
      'contact_rate', CASE WHEN v_calls_total > 0 THEN ROUND((v_calls_answered::numeric / v_calls_total) * 100, 1) ELSE 0 END,
      'pipeline_active_value', v_pipeline_active_value,
      'avg_time_to_first_contact', v_avg_time_to_first_contact,
      'avg_time_to_close', v_avg_time_to_close,
      'avg_lead_to_won_days', v_avg_lead_to_won_days,
      'median_lead_to_won_days', v_median_lead_to_won_days,
      'sales_velocity', v_sales_velocity,
      'rpl', v_rpl,
      'weighted_pipeline', ROUND(v_weighted_pipeline, 2),
      'lead_to_appointment_rate', CASE WHEN v_leads_new > 0 THEN ROUND((v_appointments_set::numeric / v_leads_new) * 100, 1) ELSE 0 END,
      'appointment_to_contract_rate', CASE WHEN v_appointments_done > 0 THEN ROUND((v_contracts_won::numeric / v_appointments_done) * 100, 1) ELSE 0 END,
      'lead_to_contract_rate', CASE WHEN v_leads_new > 0 THEN ROUND((v_contracts_won::numeric / v_leads_new) * 100, 1) ELSE 0 END,
      'forecast_30d', v_forecast_30d,
      'forecast_min', ROUND(v_forecast_30d * 0.8, 2),
      'forecast_max', ROUND(v_forecast_30d * 1.2, 2)
    ),
    'kpi_prev', jsonb_build_object(
      'leads_total', v_prev_leads_total, 'leads_new', v_prev_leads_new,
      'contacts_worked', v_prev_contacts_worked,
      'appointments_set', v_prev_appointments_set, 'appointments_done', v_prev_appointments_done,
      'show_rate', CASE WHEN v_prev_appointments_set > 0 THEN ROUND((v_prev_appointments_done::numeric / v_prev_appointments_set) * 100, 1) ELSE 0 END,
      'contracts_won', v_prev_contracts_won, 'revenue', v_prev_revenue,
      'contracts_lost', v_prev_contracts_lost, 'revenue_lost', v_prev_revenue_lost,
      'avg_ticket', CASE WHEN v_prev_contracts_won > 0 THEN ROUND(v_prev_revenue / v_prev_contracts_won, 2) ELSE 0 END,
      'close_rate', CASE WHEN v_prev_appointments_done > 0 THEN ROUND((v_prev_contracts_won::numeric / v_prev_appointments_done) * 100, 1) ELSE 0 END,
      'total_spend', v_prev_total_spend,
      'cpl', CASE WHEN v_prev_leads_new > 0 THEN ROUND(v_prev_total_spend / v_prev_leads_new, 2) ELSE 0 END,
      'cpa', CASE WHEN v_prev_contracts_won > 0 THEN ROUND(v_prev_total_spend / v_prev_contracts_won, 2) ELSE 0 END,
      'calls_total', v_prev_calls_total,
      'calls_answered', v_prev_calls_answered,
      'contact_rate', CASE WHEN v_prev_calls_total > 0 THEN ROUND((v_prev_calls_answered::numeric / v_prev_calls_total) * 100, 1) ELSE 0 END,
      'pipeline_active_value', v_prev_pipeline_active_value,
      'avg_time_to_first_contact', 0,
      'avg_time_to_close', 0,
      'avg_lead_to_won_days', v_prev_avg_lead_to_won_days,
      'median_lead_to_won_days', 0,
      'sales_velocity', v_prev_sales_velocity,
      'rpl', v_prev_rpl,
      'weighted_pipeline', 0,
      'lead_to_appointment_rate', CASE WHEN v_prev_leads_new > 0 THEN ROUND((v_prev_appointments_set::numeric / v_prev_leads_new) * 100, 1) ELSE 0 END,
      'appointment_to_contract_rate', CASE WHEN v_prev_appointments_done > 0 THEN ROUND((v_prev_contracts_won::numeric / v_prev_appointments_done) * 100, 1) ELSE 0 END,
      'lead_to_contract_rate', CASE WHEN v_prev_leads_new > 0 THEN ROUND((v_prev_contracts_won::numeric / v_prev_leads_new) * 100, 1) ELSE 0 END,
      'forecast_30d', 0, 'forecast_min', 0, 'forecast_max', 0
    ),
    'funnel', v_funnel,
    'sales_performance', v_sales,
    'sources', v_sources,
    'call_center', v_call_center,
    'alerts', v_alerts,
    'trend', v_trend
  );

  RETURN result;
END;
$function$;
