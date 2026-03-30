-- Trigger per updated_at
DROP TRIGGER IF EXISTS update_automation_flows_updated_at ON public.automation_flows;
CREATE TRIGGER update_automation_flows_updated_at
  BEFORE UPDATE ON public.automation_flows
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
