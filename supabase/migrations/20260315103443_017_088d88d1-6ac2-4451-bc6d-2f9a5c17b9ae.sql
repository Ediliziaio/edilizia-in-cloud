CREATE TRIGGER trg_validate_ai_conversation_v2
  BEFORE INSERT OR UPDATE ON ai_conversations_v2
  FOR EACH ROW EXECUTE FUNCTION validate_ai_conversation_v2();
