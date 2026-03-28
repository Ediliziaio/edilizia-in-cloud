-- Company costs (fixed: cost_created, not cost_added)
CREATE TRIGGER ia_cost_created
  AFTER INSERT ON public.company_costs
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_internal_automations('cost_created', 'cost');
