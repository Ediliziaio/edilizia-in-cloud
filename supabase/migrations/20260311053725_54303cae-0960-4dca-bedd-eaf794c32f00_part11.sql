DROP TRIGGER IF EXISTS trg_validate_lead_score_fields ON public.marketing_contacts;
CREATE TRIGGER trg_validate_lead_score_fields
  BEFORE INSERT OR UPDATE ON marketing_contacts
  FOR EACH ROW EXECUTE FUNCTION validate_lead_score_fields();
