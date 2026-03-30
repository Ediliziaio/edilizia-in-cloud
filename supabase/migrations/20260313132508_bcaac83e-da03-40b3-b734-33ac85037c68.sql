-- Template gallery for AI agent quick-creation
CREATE TABLE IF NOT EXISTS public.ai_agent_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  categoria text NOT NULL DEFAULT 'generale',
  icona text DEFAULT '🤖',
  system_prompt text NOT NULL DEFAULT '',
  first_message text NOT NULL DEFAULT '',
  agent_type text NOT NULL DEFAULT 'business',
  objective text,
  suggested_voice text,
  is_active boolean NOT NULL DEFAULT true,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
