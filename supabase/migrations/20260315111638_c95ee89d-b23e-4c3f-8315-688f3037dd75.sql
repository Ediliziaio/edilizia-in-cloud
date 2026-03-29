-- Fix: recreate view with SECURITY INVOKER to respect RLS of querying user
DROP VIEW IF EXISTS public.ai_elevenlabs_config_safe;
