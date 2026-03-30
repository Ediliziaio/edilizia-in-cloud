-- 7) Employee added
DROP TRIGGER IF EXISTS internal_auto_employee_added ON public.employees;
CREATE TRIGGER internal_auto_employee_added
  AFTER INSERT ON employees
  FOR EACH ROW
  EXECUTE FUNCTION trigger_internal_automations('employee_added', 'employee');
