-- M5: AI Advanced LLM fields for ai_agents table
-- Thinking budget + Backup LLM support

ALTER TABLE ai_agents
  ADD COLUMN IF NOT EXISTS thinking_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS thinking_budget_tokens INTEGER NOT NULL DEFAULT 4096,
  ADD COLUMN IF NOT EXISTS backup_llm TEXT NOT NULL DEFAULT 'none';

COMMENT ON COLUMN ai_agents.thinking_enabled IS 'Abilita il ragionamento esteso (extended thinking) per modelli compatibili';
COMMENT ON COLUMN ai_agents.thinking_budget_tokens IS 'Budget massimo token per il thinking esteso';
COMMENT ON COLUMN ai_agents.backup_llm IS 'Modello LLM di fallback usato se il primario fallisce (none = nessun backup)';
