-- Employees
DROP TRIGGER IF EXISTS ia_employee_added ON public.employees;
CREATE TRIGGER ia_employee_added
  AFTER INSERT ON public.employees
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_internal_automations('employee_added', 'employee');
