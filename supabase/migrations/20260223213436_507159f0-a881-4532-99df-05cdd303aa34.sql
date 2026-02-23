
ALTER TABLE public.automation_flows ADD COLUMN IF NOT EXISTS config_json jsonb NOT NULL DEFAULT '{}';
