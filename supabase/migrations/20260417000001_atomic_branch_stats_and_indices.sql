-- ────────────────────────────────────────────────────────────────────────────
-- Fix: race condition su ai_agent_branches stats + indici mancanti
-- ────────────────────────────────────────────────────────────────────────────
-- elevenlabs-webhook faceva SELECT-then-UPDATE per aggiornare i contatori del
-- branch. Due webhook concorrenti sullo stesso branch leggevano gli stessi
-- valori, scrivevano sopra — un incremento perso. Rimpiazziamo con RPC atomica
-- che usa UPDATE con media incrementale in un singolo statement.

CREATE OR REPLACE FUNCTION public.increment_branch_stats(
  p_branch_id uuid,
  p_duration_seconds integer,
  p_appointment_created boolean
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.ai_agent_branches
  SET
    conversations_count = conversations_count + 1,
    appointments_count  = appointments_count + (CASE WHEN p_appointment_created THEN 1 ELSE 0 END),
    -- media incrementale numericamente stabile: new_avg = old_avg + (x - old_avg) / (n+1)
    avg_duration_seconds = ROUND(
      (avg_duration_seconds + (p_duration_seconds - avg_duration_seconds) / (conversations_count + 1))::numeric,
      2
    ),
    updated_at = NOW()
  WHERE id = p_branch_id;
$$;

COMMENT ON FUNCTION public.increment_branch_stats IS
  'Aggiorna atomicamente i contatori di un branch. Usata da elevenlabs-webhook per evitare race condition.';

-- ────────────────────────────────────────────────────────────────────────────
-- Indici: query comuni in webhook / monitoring
-- ────────────────────────────────────────────────────────────────────────────

-- Lookup conversation per idempotency check (elevenlabs-webhook)
CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_agent_conversations_el_conv_id
  ON public.ai_agent_conversations(elevenlabs_conversation_id)
  WHERE elevenlabs_conversation_id IS NOT NULL;

-- Lookup welcome bonus (stripe-webhook)
CREATE INDEX IF NOT EXISTS idx_ai_credit_topups_company_type
  ON public.ai_credit_topups(company_id, type);

-- Lookup agente per elevenlabs_agent_id (ownership checks in elevenlabs-proxy)
CREATE INDEX IF NOT EXISTS idx_ai_agents_elevenlabs_agent_id
  ON public.ai_agents(elevenlabs_agent_id)
  WHERE elevenlabs_agent_id IS NOT NULL;

-- Unique constraint su referral_companies (stripe-webhook evita doppia attribuzione)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'referral_companies_referrer_company_unique'
  ) THEN
    ALTER TABLE public.referral_companies
      ADD CONSTRAINT referral_companies_referrer_company_unique
      UNIQUE (referrer_id, company_id);
  END IF;
EXCEPTION WHEN undefined_table THEN
  -- se la tabella non esiste in questo env, skip
  NULL;
END$$;
