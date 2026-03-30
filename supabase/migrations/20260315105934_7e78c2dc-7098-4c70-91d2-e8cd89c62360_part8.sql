DROP TRIGGER IF EXISTS trg_kb_updated_at ON public.ai_knowledge_base_v2;
CREATE TRIGGER trg_kb_updated_at
  BEFORE UPDATE ON public.ai_knowledge_base_v2
  FOR EACH ROW EXECUTE FUNCTION public.set_kb_updated_at();
