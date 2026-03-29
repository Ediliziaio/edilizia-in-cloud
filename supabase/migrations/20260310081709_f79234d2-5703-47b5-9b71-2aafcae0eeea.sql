-- Fix search_path: get_attribution_report has two overloads
ALTER FUNCTION public.get_attribution_report(uuid, timestamptz, timestamptz, text) SET search_path = public;
