-- Pivot agent <-> KB doc
CREATE TABLE IF NOT EXISTS ai_agent_knowledge_v2 (
  agent_id  UUID NOT NULL REFERENCES ai_agents_v2(id) ON DELETE CASCADE,
  doc_id    UUID NOT NULL REFERENCES ai_knowledge_base_v2(id) ON DELETE CASCADE,
  PRIMARY KEY (agent_id, doc_id)
);
