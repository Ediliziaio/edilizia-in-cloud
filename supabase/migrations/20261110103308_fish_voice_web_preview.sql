ALTER TABLE public.ai_fish_agents
  ADD COLUMN preview_agent_id text,
  ADD COLUMN preview_tool_ids jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN preview_fingerprint text;
COMMENT ON COLUMN public.ai_fish_agents.preview_agent_id IS
  'Private web-only demonstration agent. Client fixture tools, no CRM webhooks, no phone line.';
