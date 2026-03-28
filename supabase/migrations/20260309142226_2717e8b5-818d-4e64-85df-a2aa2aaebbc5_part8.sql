CREATE OR REPLACE TRIGGER internal_auto_cost_added
  AFTER INSERT ON public.company_costs
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_internal_automations('cost_added', 'cost');
