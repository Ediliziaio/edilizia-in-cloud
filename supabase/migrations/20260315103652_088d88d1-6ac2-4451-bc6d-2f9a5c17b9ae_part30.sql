-- 7. Campaigns
CREATE TABLE IF NOT EXISTS ai_campaigns_v2 (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id            UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  agent_id              UUID NOT NULL REFERENCES ai_agents_v2(id) ON DELETE CASCADE,
  nome                  TEXT NOT NULL,
  tipo                  TEXT NOT NULL DEFAULT 'chiamata',
  stato                 TEXT NOT NULL DEFAULT 'bozza',
  totale_contatti       INTEGER NOT NULL DEFAULT 0,
  chiamate_effettuate   INTEGER NOT NULL DEFAULT 0,
  chiamate_completate   INTEGER NOT NULL DEFAULT 0,
  chiamate_no_risposta  INTEGER NOT NULL DEFAULT 0,
  schedulata_il         TIMESTAMPTZ,
  completata_il         TIMESTAMPTZ,
  creato_il             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
