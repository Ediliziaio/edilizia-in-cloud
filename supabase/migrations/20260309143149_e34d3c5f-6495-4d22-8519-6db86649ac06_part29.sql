-- Company costs (fixed: cost_created, not cost_added)
DROP TRIGGER IF EXISTS ia_cost_created ON public.company_costs;
CREATE TRIGGER ia_cost_created
  AFTER INSERT ON public.company_costs
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_internal_automations('cost_created', 'cost');
