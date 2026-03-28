-- Fix: Make the view SECURITY INVOKER (default, safe) instead of SECURITY DEFINER
DROP VIEW IF EXISTS public.callcenter_lead_journey;
