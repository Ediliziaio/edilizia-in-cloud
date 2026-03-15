
-- =====================================================
-- UNIF-AGE-05: Campaigns enhancements, credit transactions, analytics
-- =====================================================

-- 1. ALTER ai_campaigns_v2 — add scheduling, target, settings, stats, metadata columns
ALTER TABLE public.ai_campaigns_v2
  ADD COLUMN IF NOT EXISTS descrizione text,
  ADD COLUMN IF NOT EXISTS data_inizio timestamptz,
  ADD COLUMN IF NOT EXISTS data_fine timestamptz,
  ADD COLUMN IF NOT EXISTS orario_inizio time DEFAULT '09:00',
  ADD COLUMN IF NOT EXISTS orario_fine time DEFAULT '18:00',
  ADD COLUMN IF NOT EXISTS giorni_settimana int[] DEFAULT '{1,2,3,4,5}',
  ADD COLUMN IF NOT EXISTS fuso_orario text DEFAULT 'Europe/Rome',
  ADD COLUMN IF NOT EXISTS contatti_falliti int DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tentativi_max int DEFAULT 3,
  ADD COLUMN IF NOT EXISTS intervallo_tentativi_minuti int DEFAULT 60,
  ADD COLUMN IF NOT EXISTS messaggio_iniziale text,
  ADD COLUMN IF NOT EXISTS durata_media_secondi numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tasso_risposta numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS crediti_utilizzati numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tag text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS aggiornato_il timestamptz DEFAULT now();

-- Trigger updated_at for ai_campaigns_v2
CREATE OR REPLACE FUNCTION public.trg_campaigns_v2_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.aggiornato_il := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_campaigns_v2_updated_at ON public.ai_campaigns_v2;
CREATE TRIGGER set_campaigns_v2_updated_at
  BEFORE UPDATE ON public.ai_campaigns_v2
  FOR EACH ROW EXECUTE FUNCTION public.trg_campaigns_v2_updated_at();

-- 2. ai_campaign_contacts
CREATE TABLE IF NOT EXISTS public.ai_campaign_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.ai_campaigns_v2(id) ON DELETE CASCADE,
  contact_id uuid REFERENCES public.marketing_contacts(id) ON DELETE SET NULL,
  nome text,
  telefono text NOT NULL,
  stato text NOT NULL DEFAULT 'in_coda',
  tentativo_corrente int DEFAULT 0,
  ultimo_tentativo_il timestamptz,
  risposta boolean DEFAULT false,
  durata_secondi int DEFAULT 0,
  note text,
  metadata jsonb DEFAULT '{}',
  creato_il timestamptz DEFAULT now()
);

ALTER TABLE public.ai_campaign_contacts ENABLE ROW LEVEL SECURITY;

-- RLS via campaign join
CREATE POLICY "campaign_contacts_company" ON public.ai_campaign_contacts
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.ai_campaigns_v2 c
      WHERE c.id = ai_campaign_contacts.campaign_id
        AND c.company_id = public.get_my_company_id()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.ai_campaigns_v2 c
      WHERE c.id = ai_campaign_contacts.campaign_id
        AND c.company_id = public.get_my_company_id()
    )
  );

CREATE INDEX IF NOT EXISTS idx_campaign_contacts_campaign ON public.ai_campaign_contacts(campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_contacts_stato ON public.ai_campaign_contacts(stato);

-- 3. ai_credit_transactions
CREATE TABLE IF NOT EXISTS public.ai_credit_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  tipo text NOT NULL DEFAULT 'consumo',
  crediti numeric NOT NULL DEFAULT 0,
  saldo_prima numeric NOT NULL DEFAULT 0,
  saldo_dopo numeric NOT NULL DEFAULT 0,
  descrizione text,
  agent_id uuid REFERENCES public.ai_agents_v2(id) ON DELETE SET NULL,
  conversation_id uuid,
  metadata jsonb DEFAULT '{}',
  creato_il timestamptz DEFAULT now()
);

ALTER TABLE public.ai_credit_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "credit_transactions_company" ON public.ai_credit_transactions
  FOR ALL TO authenticated
  USING (company_id = public.get_my_company_id())
  WITH CHECK (company_id = public.get_my_company_id());

CREATE INDEX IF NOT EXISTS idx_credit_transactions_company ON public.ai_credit_transactions(company_id);
CREATE INDEX IF NOT EXISTS idx_credit_transactions_creato ON public.ai_credit_transactions(creato_il DESC);

-- 4. ALTER companies — add AI credit columns
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS ai_piano text DEFAULT 'base',
  ADD COLUMN IF NOT EXISTS ai_crediti numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ai_crediti_bonus numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ai_crediti_soglia_allerta numeric DEFAULT 10,
  ADD COLUMN IF NOT EXISTS ai_rinnovo_at timestamptz;

-- 5. RPC consume_ai_credits (atomic, uses bonus first)
CREATE OR REPLACE FUNCTION public.consume_ai_credits(
  p_company_id uuid,
  p_amount numeric,
  p_descrizione text DEFAULT 'Consumo agente AI',
  p_agent_id uuid DEFAULT NULL,
  p_conversation_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_bonus numeric;
  v_crediti numeric;
  v_from_bonus numeric;
  v_from_crediti numeric;
  v_remaining numeric;
  v_saldo_prima numeric;
  v_saldo_dopo numeric;
BEGIN
  -- Lock the row
  SELECT ai_crediti, ai_crediti_bonus INTO v_crediti, v_bonus
  FROM companies WHERE id = p_company_id FOR UPDATE;

  IF v_crediti IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'company_not_found');
  END IF;

  v_saldo_prima := COALESCE(v_crediti, 0) + COALESCE(v_bonus, 0);
  v_remaining := p_amount;

  -- Deduct from bonus first
  IF COALESCE(v_bonus, 0) > 0 THEN
    v_from_bonus := LEAST(v_bonus, v_remaining);
    v_remaining := v_remaining - v_from_bonus;
  ELSE
    v_from_bonus := 0;
  END IF;

  -- Then from crediti
  v_from_crediti := v_remaining;

  -- Check sufficient balance
  IF (COALESCE(v_crediti, 0) - v_from_crediti) < 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'insufficient_credits', 'saldo', v_saldo_prima);
  END IF;

  -- Update
  UPDATE companies SET
    ai_crediti = COALESCE(ai_crediti, 0) - v_from_crediti,
    ai_crediti_bonus = COALESCE(ai_crediti_bonus, 0) - v_from_bonus
  WHERE id = p_company_id;

  v_saldo_dopo := v_saldo_prima - p_amount;

  -- Log transaction
  INSERT INTO ai_credit_transactions (company_id, tipo, crediti, saldo_prima, saldo_dopo, descrizione, agent_id, conversation_id)
  VALUES (p_company_id, 'consumo', -p_amount, v_saldo_prima, v_saldo_dopo, p_descrizione, p_agent_id, p_conversation_id);

  RETURN jsonb_build_object('success', true, 'saldo_dopo', v_saldo_dopo, 'scalato_bonus', v_from_bonus, 'scalato_crediti', v_from_crediti);
END;
$$;

-- 6. RPC get_ai_analytics
CREATE OR REPLACE FUNCTION public.get_ai_analytics(
  p_company_id uuid,
  p_giorni int DEFAULT 30
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_from timestamptz := now() - (p_giorni || ' days')::interval;
  v_calls jsonb;
  v_chats jsonb;
  v_agents jsonb;
  v_credits jsonb;
  v_daily_calls jsonb;
  v_daily_chats jsonb;
BEGIN
  -- Call stats from ai_conversations_v2
  SELECT jsonb_build_object(
    'totali', COUNT(*),
    'completate', COUNT(*) FILTER (WHERE stato = 'completata'),
    'durata_media_sec', COALESCE(AVG(durata_secondi), 0),
    'tasso_risposta', CASE WHEN COUNT(*) > 0 THEN ROUND((COUNT(*) FILTER (WHERE stato = 'completata'))::numeric / COUNT(*) * 100, 1) ELSE 0 END
  ) INTO v_calls
  FROM ai_conversations_v2
  WHERE company_id = p_company_id AND creato_il >= v_from;

  -- Chat stats from ai_chat_sessions
  SELECT jsonb_build_object(
    'totali', COUNT(*),
    'messaggi_totali', COALESCE(SUM(messaggi_totali), 0),
    'durata_media_sec', COALESCE(AVG(durata_secondi), 0)
  ) INTO v_chats
  FROM ai_chat_sessions
  WHERE company_id = p_company_id AND iniziata_il >= v_from;

  -- Agent distribution
  SELECT COALESCE(jsonb_agg(jsonb_build_object('tipo', tipo, 'count', cnt)), '[]'::jsonb) INTO v_agents
  FROM (
    SELECT tipo, COUNT(*) as cnt FROM ai_agents_v2
    WHERE company_id = p_company_id AND stato = 'attivo'
    GROUP BY tipo
  ) sub;

  -- Credit consumption
  SELECT jsonb_build_object(
    'totale_consumato', COALESCE(SUM(ABS(crediti)), 0),
    'transazioni', COUNT(*)
  ) INTO v_credits
  FROM ai_credit_transactions
  WHERE company_id = p_company_id AND creato_il >= v_from AND tipo = 'consumo';

  -- Daily call series (last N days)
  SELECT COALESCE(jsonb_agg(jsonb_build_object('data', d, 'count', cnt) ORDER BY d), '[]'::jsonb) INTO v_daily_calls
  FROM (
    SELECT DATE(creato_il) as d, COUNT(*) as cnt
    FROM ai_conversations_v2
    WHERE company_id = p_company_id AND creato_il >= v_from
    GROUP BY DATE(creato_il)
  ) sub;

  -- Daily chat series
  SELECT COALESCE(jsonb_agg(jsonb_build_object('data', d, 'count', cnt) ORDER BY d), '[]'::jsonb) INTO v_daily_chats
  FROM (
    SELECT DATE(iniziata_il) as d, COUNT(*) as cnt
    FROM ai_chat_sessions
    WHERE company_id = p_company_id AND iniziata_il >= v_from
    GROUP BY DATE(iniziata_il)
  ) sub;

  RETURN jsonb_build_object(
    'chiamate', v_calls,
    'chat', v_chats,
    'agenti', v_agents,
    'crediti', v_credits,
    'serie_chiamate', v_daily_calls,
    'serie_chat', v_daily_chats
  );
END;
$$;
