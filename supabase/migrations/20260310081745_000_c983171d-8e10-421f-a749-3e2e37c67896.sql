-- Fix SECURITY DEFINER views: recreate as SECURITY INVOKER (default)
DROP VIEW IF EXISTS public.order_payment_summary;
