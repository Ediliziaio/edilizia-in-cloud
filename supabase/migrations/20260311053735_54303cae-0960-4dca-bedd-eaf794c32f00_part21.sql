-- ============================================================
-- 8. RPC: get_stalled_opportunities
-- ============================================================
CREATE OR REPLACE FUNCTION get_stalled_opportunities(p_company_id UUID)
RETURNS TABLE (
  opportunity_id UUID,
  opportunity_name TEXT,
  contact_name TEXT,
  stage_name TEXT,
  assigned_to UUID,
  last_activity_at TIMESTAMPTZ,
  days_stalled INTEGER,
  stalled_threshold INTEGER,
  value DECIMAL
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    o.id AS opportunity_id,
    o.name AS opportunity_name,
    mc.full_name AS contact_name,
    ps.name AS stage_name,
    o.assigned_to,
    COALESCE(
      (SELECT MAX(mca.created_at)
       FROM marketing_contact_activities mca
       WHERE mca.company_id = p_company_id
         AND (mca.contact_id = o.contact_id OR mca.opportunity_id = o.id)),
      o.updated_at,
      o.created_at
    ) AS last_activity_at,
    EXTRACT(DAY FROM NOW() - COALESCE(
      (SELECT MAX(mca.created_at)
       FROM marketing_contact_activities mca
       WHERE mca.company_id = p_company_id
         AND (mca.contact_id = o.contact_id OR mca.opportunity_id = o.id)),
      o.updated_at,
      o.created_at
    ))::INTEGER AS days_stalled,
    COALESCE(ps.stalled_threshold_days, 14) AS stalled_threshold,
    o.value
  FROM marketing_opportunities o
  INNER JOIN marketing_pipeline_stages ps ON ps.id = o.stage_id
  LEFT JOIN marketing_contacts mc ON mc.id = o.contact_id
  WHERE o.company_id = p_company_id
    AND o.status = 'open'
    AND EXTRACT(DAY FROM NOW() - COALESCE(
      (SELECT MAX(mca.created_at)
       FROM marketing_contact_activities mca
       WHERE mca.company_id = p_company_id
         AND (mca.contact_id = o.contact_id OR mca.opportunity_id = o.id)),
      o.updated_at,
      o.created_at
    )) >= COALESCE(ps.stalled_threshold_days, 14)
  ORDER BY days_stalled DESC;
END;
$$;
