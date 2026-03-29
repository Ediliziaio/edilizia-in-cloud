-- Fix 3: Add meta_page_tokens column to integration_credentials for secure page token storage
ALTER TABLE public.integration_credentials 
ADD COLUMN IF NOT EXISTS meta_page_tokens jsonb DEFAULT '{}'::jsonb;
