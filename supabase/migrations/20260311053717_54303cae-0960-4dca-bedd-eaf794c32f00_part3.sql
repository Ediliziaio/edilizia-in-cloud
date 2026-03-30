DROP TRIGGER IF EXISTS trg_validate_lost_reason_category ON public.marketing_opportunities;
CREATE TRIGGER trg_validate_lost_reason_category
  BEFORE INSERT OR UPDATE ON marketing_opportunities
  FOR EACH ROW EXECUTE FUNCTION validate_lost_reason_category();
