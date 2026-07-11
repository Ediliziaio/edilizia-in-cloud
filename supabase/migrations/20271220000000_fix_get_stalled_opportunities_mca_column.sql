-- ============================================================
-- FIX: get_stalled_opportunities referenziava mca.opportunity_id
-- ============================================================
-- Bug pre-esistente (non introdotto dall'hardening RBAC del 2026-07-11):
-- il corpo della funzione faceva
--   LEFT JOIN marketing_contact_activities mca
--     ON mca.company_id = p_company_id
--     AND (mca.contact_id = o.contact_id OR mca.opportunity_id = o.id)
-- ma marketing_contact_activities NON ha la colonna opportunity_id
-- (le attività sono legate al contatto via contact_id soltanto).
-- A runtime falliva con: ERROR 42703 column mca.opportunity_id does not exist,
-- rompendo la feature "opportunità in stallo" del modulo Sales OS.
--
-- Fix:
--  * rimosso il disgiunto invalido `OR mca.opportunity_id = o.id`
--  * aggiunto o.last_activity_at (colonna trigger-maintained su
--    marketing_opportunities) alla COALESCE, così l'attività a livello di
--    opportunità continua a contare anche senza join sulle attività contatto.
-- Il guard `PERFORM public.assert_company_access(p_company_id)` (hardening
-- RBAC 2026-07-11) resta invariato in testa.
-- Applicata a prod (rsbrguhkodgnqfomrevo) via Management API il 2026-07-11.
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_stalled_opportunities(p_company_id uuid)
RETURNS TABLE(
  opportunity_id uuid, opportunity_name text, contact_name text,
  stage_name text, assigned_to uuid, last_activity_at timestamptz,
  days_stalled integer, stalled_threshold integer, value numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.assert_company_access(p_company_id);
  RETURN QUERY
  WITH activity AS (
    SELECT
      o.id AS opportunity_id,
      COALESCE(MAX(mca.created_at), o.last_activity_at, o.updated_at, o.created_at) AS last_activity_at
    FROM marketing_opportunities o
    LEFT JOIN marketing_contact_activities mca
      ON mca.company_id = p_company_id
      AND mca.contact_id = o.contact_id
    WHERE o.company_id = p_company_id
      AND o.status = 'open'
    GROUP BY o.id, o.last_activity_at, o.updated_at, o.created_at
  )
  SELECT
    o.id AS opportunity_id,
    o.name AS opportunity_name,
    TRIM(CONCAT(COALESCE(mc.first_name, ''), ' ', COALESCE(mc.last_name, ''))) AS contact_name,
    ps.name AS stage_name,
    o.assigned_to,
    activity.last_activity_at,
    EXTRACT(DAY FROM NOW() - activity.last_activity_at)::INTEGER AS days_stalled,
    COALESCE(ps.stalled_threshold_days, 14) AS stalled_threshold,
    o.value
  FROM marketing_opportunities o
  INNER JOIN activity ON activity.opportunity_id = o.id
  INNER JOIN marketing_pipeline_stages ps ON ps.id = o.stage_id
  LEFT JOIN marketing_contacts mc ON mc.id = o.contact_id
  WHERE EXTRACT(DAY FROM NOW() - activity.last_activity_at)::INTEGER >= COALESCE(ps.stalled_threshold_days, 14)
  ORDER BY days_stalled DESC;
END;
$function$;
