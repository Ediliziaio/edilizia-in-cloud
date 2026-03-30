DROP TRIGGER IF EXISTS trg_validate_ai_agent_v2 ON public.ai_agents_v2;
CREATE TRIGGER trg_validate_ai_agent_v2
  BEFORE INSERT OR UPDATE ON ai_agents_v2
  FOR EACH ROW EXECUTE FUNCTION validate_ai_agent_v2_stato();
