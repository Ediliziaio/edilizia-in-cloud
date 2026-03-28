-- 7) Employee added
CREATE TRIGGER internal_auto_employee_added
  AFTER INSERT ON employees
  FOR EACH ROW
  EXECUTE FUNCTION trigger_internal_automations('employee_added', 'employee');
