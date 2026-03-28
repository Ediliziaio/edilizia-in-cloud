-- 10. Migrate existing data from ai_agents to ai_agents_v2
INSERT INTO ai_agents_v2 (
  id, company_id, nome, descrizione, tipo, stato,
  system_prompt, primo_messaggio, lingua,
  elevenlabs_agent_id, elevenlabs_voice_id,
  llm_model, tools_config, creato_il, aggiornato_il, creato_da
)
SELECT
  id, company_id, name, NULL, 'vocale'::tipo_agente_enum,
  CASE status WHEN 'active' THEN 'attivo' WHEN 'draft' THEN 'bozza' WHEN 'archived' THEN 'archiviato' ELSE 'bozza' END,
  system_prompt, first_message, language,
  elevenlabs_agent_id, voice_id,
  llm_model, tools_config, created_at, updated_at, created_by
FROM ai_agents
ON CONFLICT (id) DO NOTHING;
