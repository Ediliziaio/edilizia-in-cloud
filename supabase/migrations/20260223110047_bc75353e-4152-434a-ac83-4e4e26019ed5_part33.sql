DROP TRIGGER IF EXISTS update_automation_enrollments_updated_at ON public.automation_enrollments;
CREATE TRIGGER update_automation_enrollments_updated_at
  BEFORE UPDATE ON public.automation_enrollments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
