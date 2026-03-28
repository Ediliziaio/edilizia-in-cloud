-- Validation triggers for lead_score, icp_score, icp_tier
CREATE OR REPLACE FUNCTION validate_lead_score_fields()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.lead_score IS NOT NULL AND (NEW.lead_score < 0 OR NEW.lead_score > 100) THEN
    RAISE EXCEPTION 'lead_score must be between 0 and 100';
  END IF;
  IF NEW.icp_score IS NOT NULL AND (NEW.icp_score < 0 OR NEW.icp_score > 100) THEN
    RAISE EXCEPTION 'icp_score must be between 0 and 100';
  END IF;
  IF NEW.icp_tier IS NOT NULL AND NEW.icp_tier NOT IN ('A', 'B', 'C', 'D') THEN
    RAISE EXCEPTION 'icp_tier must be A, B, C, or D';
  END IF;
  RETURN NEW;
END;
$$;
