-- Fix search_path on trigger functions
ALTER FUNCTION public.validate_kb_sync_status() SET search_path = public;
