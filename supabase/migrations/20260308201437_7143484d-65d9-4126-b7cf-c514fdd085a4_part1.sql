-- Attach trigger to orders table (only on UPDATE to avoid blocking creation)
DROP TRIGGER IF EXISTS trg_validate_order_total ON public.orders;
