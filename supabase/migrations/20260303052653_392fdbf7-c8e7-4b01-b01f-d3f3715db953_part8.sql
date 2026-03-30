-- Updated_at trigger
DROP TRIGGER IF EXISTS update_sales_targets_updated_at ON public.sales_targets;
CREATE TRIGGER update_sales_targets_updated_at
BEFORE UPDATE ON public.sales_targets
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
