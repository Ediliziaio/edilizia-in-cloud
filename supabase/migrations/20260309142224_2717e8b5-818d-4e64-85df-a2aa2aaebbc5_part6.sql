CREATE OR REPLACE TRIGGER internal_auto_employee_added
  AFTER INSERT ON public.employees
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_internal_automations('employee_added', 'employee');
