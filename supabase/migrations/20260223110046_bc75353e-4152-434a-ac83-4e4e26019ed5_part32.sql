CREATE TRIGGER update_automation_nodes_updated_at
  BEFORE UPDATE ON public.automation_nodes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
