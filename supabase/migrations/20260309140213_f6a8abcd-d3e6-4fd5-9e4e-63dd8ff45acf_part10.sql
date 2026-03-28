-- 9) Cost added
CREATE TRIGGER internal_auto_cost_added
  AFTER INSERT ON company_costs
  FOR EACH ROW
  EXECUTE FUNCTION trigger_internal_automations('cost_created', 'cost');
