CREATE TRIGGER trg_validate_lead_score_fields
  BEFORE INSERT OR UPDATE ON marketing_contacts
  FOR EACH ROW EXECUTE FUNCTION validate_lead_score_fields();
