DROP TRIGGER IF EXISTS trg_internal_auto_cost_created ON public.company_costs;
CREATE TRIGGER trg_internal_auto_cost_created
  AFTER INSERT ON public.company_costs
  FOR EACH ROW EXECUTE FUNCTION trigger_internal_automations('cost_created', 'company_cost');
