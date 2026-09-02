-- Centralino AI: la UI crea agenti e numeri nel modello v2 (ai_agents_v2,
-- ai_phone_numbers_v2), ma le tabelle di runtime — conversazioni e consumo
-- crediti — hanno la chiave esterna su ai_agents (v1). Con un agente v2 ogni
-- insert di conversazione e di consumo fallisce per FK: la chiamata parte, i
-- crediti vengono scalati, ma non resta traccia della conversazione ne' del
-- consumo. Qui si aggiunge il riferimento v2 accanto a quello legacy: una
-- riga porta l'uno o l'altro, mai nessuno dei due.

ALTER TABLE public.ai_agent_conversations
  ALTER COLUMN agent_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS agent_v2_id uuid REFERENCES public.ai_agents_v2(id) ON DELETE SET NULL;

ALTER TABLE public.ai_agent_conversations
  DROP CONSTRAINT IF EXISTS ai_agent_conversations_un_agente,
  ADD CONSTRAINT ai_agent_conversations_un_agente
    CHECK (agent_id IS NOT NULL OR agent_v2_id IS NOT NULL);

CREATE INDEX IF NOT EXISTS idx_ai_agent_conversations_agent_v2
  ON public.ai_agent_conversations (agent_v2_id) WHERE agent_v2_id IS NOT NULL;

ALTER TABLE public.ai_credit_usage
  ADD COLUMN IF NOT EXISTS agent_v2_id uuid REFERENCES public.ai_agents_v2(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_ai_credit_usage_agent_v2
  ON public.ai_credit_usage (agent_v2_id) WHERE agent_v2_id IS NOT NULL;

COMMENT ON COLUMN public.ai_agent_conversations.agent_v2_id IS
  'Agente del modello v2 (quello creato dalla UI). Alternativo ad agent_id (legacy).';

-- I 12 template erano tutti doppi: un seed girato due volte senza vincolo.
-- Si tiene la riga piu' vecchia di ogni nome e si mette il vincolo che
-- avrebbe impedito il doppione.
DELETE FROM public.ai_agent_templates t
USING public.ai_agent_templates piu_vecchio
WHERE t.name = piu_vecchio.name
  AND t.created_at > piu_vecchio.created_at;

DELETE FROM public.ai_agent_templates t
USING public.ai_agent_templates altro
WHERE t.name = altro.name AND t.created_at = altro.created_at AND t.id > altro.id;

ALTER TABLE public.ai_agent_templates
  DROP CONSTRAINT IF EXISTS ai_agent_templates_name_unico,
  ADD CONSTRAINT ai_agent_templates_name_unico UNIQUE (name);

NOTIFY pgrst, 'reload schema';
