CREATE TRIGGER trg_validate_kb_sync_status
  BEFORE INSERT OR UPDATE ON public.ai_knowledge_base_v2
  FOR EACH ROW EXECUTE FUNCTION public.validate_kb_sync_status();
