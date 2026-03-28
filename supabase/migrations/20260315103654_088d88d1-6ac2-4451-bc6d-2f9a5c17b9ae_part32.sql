CREATE TRIGGER trg_validate_ai_campaign_v2
  BEFORE INSERT OR UPDATE ON ai_campaigns_v2
  FOR EACH ROW EXECUTE FUNCTION validate_ai_campaign_v2();
