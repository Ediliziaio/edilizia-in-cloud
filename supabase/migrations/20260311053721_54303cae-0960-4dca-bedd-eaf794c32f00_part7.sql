DROP TRIGGER IF EXISTS trg_validate_win_probability ON public.marketing_pipeline_stages;
CREATE TRIGGER trg_validate_win_probability
  BEFORE INSERT OR UPDATE ON marketing_pipeline_stages
  FOR EACH ROW EXECUTE FUNCTION validate_win_probability();
