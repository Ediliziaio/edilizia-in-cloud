CREATE TRIGGER trg_sync_installments_to_orders
AFTER INSERT OR UPDATE OR DELETE ON public.order_installments
FOR EACH ROW
EXECUTE FUNCTION public.sync_installments_to_order_columns();
