
-- Fix search_path on validation trigger functions
CREATE OR REPLACE FUNCTION validate_lost_reason_category()
RETURNS TRIGGER LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.lost_reason_category IS NOT NULL AND NEW.lost_reason_category NOT IN (
    'prezzo', 'concorrente', 'budget_non_disponibile', 'timing',
    'prodotto_non_adatto', 'nessuna_risposta', 'altro'
  ) THEN
    RAISE EXCEPTION 'Invalid lost_reason_category: %', NEW.lost_reason_category;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION validate_win_probability()
RETURNS TRIGGER LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.win_probability IS NOT NULL AND (NEW.win_probability < 0 OR NEW.win_probability > 100) THEN
    RAISE EXCEPTION 'win_probability must be between 0 and 100';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION validate_lead_score_fields()
RETURNS TRIGGER LANGUAGE plpgsql
SET search_path = public
AS $$
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
