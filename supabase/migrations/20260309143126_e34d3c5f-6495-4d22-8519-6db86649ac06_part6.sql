-- From migration 2/3 (internal_auto_*)
DROP TRIGGER IF EXISTS internal_auto_order_created ON public.orders;
