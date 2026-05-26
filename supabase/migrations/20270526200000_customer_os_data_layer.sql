-- ============================================================================
-- Customer OS — Data Layer
-- ============================================================================
-- Foundation per il sistema agentico Customer Success post-acquisizione.
-- Tutti gli agenti (Sofia/Giorgio/Elena/Tommaso/Beatrice/Marco) leggono da qui.
--
-- Componenti:
--   1. product_events       — eventi prodotto streamed (login, feature use, ecc.)
--   2. customer_interactions — omnichannel log (email/chat/whatsapp/phone)
--   3. customer_health_history — snapshot giornaliero health score
--   4. customer_onboarding   — fase + milestone per ogni nuovo cliente
--   5. customer_profile      — VIEW materializzata 50+ campi aggregate
--   6. customer_usage_daily — aggregato eventi per cohort analysis
-- ============================================================================

-- ─── 1) Product events ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.product_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id UUID,  -- nullable (system events)
  -- Tipo evento standardizzato. Esempi:
  --   "login.success", "feature.view", "feature.use",
  --   "cta.click", "error.seen", "onboarding.milestone",
  --   "billing.payment.success", "billing.payment.failed",
  --   "module.first_use", "team.member.invited", "settings.changed"
  event_name TEXT NOT NULL CHECK (length(trim(event_name)) BETWEEN 2 AND 100),
  -- Categoria per query veloci (login/feature/billing/onboarding/error/team)
  category TEXT NOT NULL DEFAULT 'feature' CHECK (category IN (
    'login', 'feature', 'billing', 'onboarding', 'error', 'team',
    'integration', 'settings', 'export', 'support'
  )),
  -- Properties strutturate (JSONB per query rapide)
  properties JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- Session tracking
  session_id TEXT,
  -- Device + context
  user_agent TEXT,
  page_url TEXT,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.product_events IS
  'Streaming eventi prodotto: ogni interazione utente significativa per Customer OS analytics.';

-- Index per query rapide (per cliente, per range temporale, per evento)
CREATE INDEX IF NOT EXISTS idx_product_events_company_time
  ON public.product_events(company_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_product_events_company_event
  ON public.product_events(company_id, event_name, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_product_events_category
  ON public.product_events(company_id, category, occurred_at DESC);

ALTER TABLE public.product_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "product_events_company_select" ON public.product_events;
CREATE POLICY "product_events_company_select" ON public.product_events
  FOR SELECT TO authenticated
  USING (
    company_id IN (
      SELECT company_id FROM public.profiles WHERE id = auth.uid()
      UNION
      SELECT company_id FROM public.multi_company_access WHERE user_id = auth.uid()
    )
    OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
  );

DROP POLICY IF EXISTS "product_events_insert_self" ON public.product_events;
CREATE POLICY "product_events_insert_self" ON public.product_events
  FOR INSERT TO authenticated
  WITH CHECK (
    company_id IN (
      SELECT company_id FROM public.profiles WHERE id = auth.uid()
      UNION
      SELECT company_id FROM public.multi_company_access WHERE user_id = auth.uid()
    )
    OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
  );

-- ─── 2) Customer interactions (omnichannel) ──────────────────────────────
CREATE TABLE IF NOT EXISTS public.customer_interactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  -- Canale
  channel TEXT NOT NULL CHECK (channel IN (
    'email_inbound', 'email_outbound',
    'chat_inbound', 'chat_outbound',
    'whatsapp_inbound', 'whatsapp_outbound',
    'phone_call_inbound', 'phone_call_outbound',
    'ticket_created', 'ticket_replied', 'ticket_resolved',
    'nps_submitted', 'demo_completed',
    'in_app_chat_inbound', 'in_app_chat_outbound'
  )),
  -- Direction derivata (inbound = da cliente, outbound = noi → cliente)
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  -- Chi (utente del cliente o membro team noi)
  contact_user_id UUID,  -- null se ignoto / interlocutore esterno
  staff_user_id UUID,    -- staff member nostro che ha risposto (null se AI auto)
  -- Quale persona AI (se applicable): sofia/giorgio/elena/tommaso/beatrice/marco
  ai_persona_key TEXT,
  -- Contenuto
  subject TEXT,
  body TEXT,
  -- Sentiment analysis (popolato async da gpt-4o-mini)
  sentiment TEXT CHECK (sentiment IN ('positive', 'neutral', 'frustrated', 'angry', 'unknown')),
  sentiment_confidence NUMERIC(3,2) CHECK (sentiment_confidence BETWEEN 0 AND 1),
  -- Riferimenti esterni (per de-dup + sync)
  external_thread_id TEXT,
  external_message_id TEXT,
  -- Related ticket (se applicabile)
  related_ticket_id UUID,
  -- Metadata
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.customer_interactions IS
  'Log omnichannel di OGNI interazione tra noi e i clienti. Single source of truth per Giorgio Support, Elena CS, Marco Sales-Enable.';

CREATE INDEX IF NOT EXISTS idx_interactions_company_time
  ON public.customer_interactions(company_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_interactions_company_channel
  ON public.customer_interactions(company_id, channel, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_interactions_sentiment
  ON public.customer_interactions(company_id, sentiment, occurred_at DESC)
  WHERE sentiment IN ('frustrated', 'angry');

ALTER TABLE public.customer_interactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "interactions_company_select" ON public.customer_interactions;
CREATE POLICY "interactions_company_select" ON public.customer_interactions
  FOR SELECT TO authenticated
  USING (
    company_id IN (
      SELECT company_id FROM public.profiles WHERE id = auth.uid()
      UNION
      SELECT company_id FROM public.multi_company_access WHERE user_id = auth.uid()
    )
    OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
  );

-- INSERT solo via service_role (edge functions) — niente client direct
-- per evitare spam / falsificazione

-- ─── 3) Customer health history ──────────────────────────────────────────
-- Snapshot giornaliero per cohort analysis e trend (chi sta declinando?)
CREATE TABLE IF NOT EXISTS public.customer_health_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  snapshot_date DATE NOT NULL DEFAULT CURRENT_DATE,
  -- Health score numerico 0-100
  health_score INT NOT NULL CHECK (health_score BETWEEN 0 AND 100),
  -- Etichetta derivata
  health_label TEXT NOT NULL CHECK (health_label IN (
    'champion',    -- 90-100: power user, candidato upsell
    'engaged',     -- 70-89: usa regolarmente
    'sleeping',    -- 40-69: usa poco, da risvegliare
    'at_risk',     -- 20-39: rischio churn, intervieni
    'churned'      -- 0-19: ha smesso, considerato perso
  )),
  -- Componenti dello score (per spiegabilità)
  login_freq_30d INT NOT NULL DEFAULT 0,
  features_used_30d INT NOT NULL DEFAULT 0,
  tickets_open INT NOT NULL DEFAULT 0,
  tickets_resolved_avg_hours NUMERIC,
  nps_last NUMERIC(3,1),
  mrr_current NUMERIC(10,2) NOT NULL DEFAULT 0,
  payment_status TEXT,  -- active/past_due/canceled
  -- Trend rispetto a snapshot precedente
  score_delta_7d INT,
  score_delta_30d INT,
  -- Note generate da Elena CS
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, snapshot_date)
);

COMMENT ON TABLE public.customer_health_history IS
  'Snapshot giornaliero health score per cohort analysis e churn prediction. Compilato da Elena CS via daily cron.';

CREATE INDEX IF NOT EXISTS idx_health_company_date
  ON public.customer_health_history(company_id, snapshot_date DESC);
CREATE INDEX IF NOT EXISTS idx_health_label_date
  ON public.customer_health_history(health_label, snapshot_date DESC);

ALTER TABLE public.customer_health_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "health_super_admin_all" ON public.customer_health_history;
CREATE POLICY "health_super_admin_all" ON public.customer_health_history
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::public.app_role));

DROP POLICY IF EXISTS "health_company_read_own" ON public.customer_health_history;
CREATE POLICY "health_company_read_own" ON public.customer_health_history
  FOR SELECT TO authenticated
  USING (
    company_id IN (
      SELECT company_id FROM public.profiles WHERE id = auth.uid()
    )
  );

-- ─── 4) Customer onboarding ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.customer_onboarding (
  company_id UUID PRIMARY KEY REFERENCES public.companies(id) ON DELETE CASCADE,
  -- Fase corrente
  current_phase TEXT NOT NULL DEFAULT 'kickoff' CHECK (current_phase IN (
    'kickoff',           -- giorno 0: appena firmato
    'first_login',       -- ha fatto il primo login
    'first_value',       -- ha completato setup minimo (es. prima commessa)
    'team_invited',      -- ha invitato il team
    'integrated',        -- ha collegato almeno 1 integrazione (email/banca/calendario)
    'graduated',         -- giorno 30+ con engagement attivo
    'stalled'            -- onboarding bloccato (no progress da X giorni)
  )),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Milestones (JSON array di { milestone: string, achieved_at: timestamp })
  milestones JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- Blockers attivi
  current_blockers JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- Persona di Florin assegnata per check-in manuale (high-MRR)
  florin_check_in_due TIMESTAMPTZ,
  -- Phase 30+ graduation
  graduated_at TIMESTAMPTZ,
  -- Eventuale churn precoce
  churned_at TIMESTAMPTZ,
  churn_reason TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.customer_onboarding IS
  'Phase tracking onboarding per ogni nuova azienda cliente. Sofia legge da qui per adattare le email scaglionate.';

CREATE INDEX IF NOT EXISTS idx_onboarding_phase
  ON public.customer_onboarding(current_phase, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_onboarding_stalled
  ON public.customer_onboarding(current_phase, updated_at)
  WHERE current_phase = 'stalled';

ALTER TABLE public.customer_onboarding ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "onboarding_super_admin_all" ON public.customer_onboarding;
CREATE POLICY "onboarding_super_admin_all" ON public.customer_onboarding
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::public.app_role));

DROP POLICY IF EXISTS "onboarding_company_read_own" ON public.customer_onboarding;
CREATE POLICY "onboarding_company_read_own" ON public.customer_onboarding
  FOR SELECT TO authenticated
  USING (
    company_id IN (
      SELECT company_id FROM public.profiles WHERE id = auth.uid()
    )
  );

DROP TRIGGER IF EXISTS trg_onboarding_updated_at ON public.customer_onboarding;
CREATE TRIGGER trg_onboarding_updated_at
  BEFORE UPDATE ON public.customer_onboarding
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─── 5) Customer usage daily (cohort + insight materializzato) ──────────
CREATE TABLE IF NOT EXISTS public.customer_usage_daily (
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  usage_date DATE NOT NULL DEFAULT CURRENT_DATE,
  -- Counters
  login_count INT NOT NULL DEFAULT 0,
  unique_users_active INT NOT NULL DEFAULT 0,
  features_used JSONB NOT NULL DEFAULT '{}'::jsonb,  -- { "commesse": 12, "oda": 4, ... }
  modules_used JSONB NOT NULL DEFAULT '{}'::jsonb,
  errors_count INT NOT NULL DEFAULT 0,
  -- Time signals
  first_login_at TIMESTAMPTZ,
  last_login_at TIMESTAMPTZ,
  total_session_minutes INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (company_id, usage_date)
);

COMMENT ON TABLE public.customer_usage_daily IS
  'Aggregato giornaliero feature usage per cliente. Popolato da cron che processa product_events. Usato da Tommaso Insight.';

CREATE INDEX IF NOT EXISTS idx_usage_date_company
  ON public.customer_usage_daily(usage_date DESC, company_id);

ALTER TABLE public.customer_usage_daily ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "usage_super_admin_all" ON public.customer_usage_daily;
CREATE POLICY "usage_super_admin_all" ON public.customer_usage_daily
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::public.app_role));

-- ─── 6) Customer profile VIEW (50+ campi aggregati real-time) ───────────
-- Lettura unica per gli agenti: invece di joinare 10 tabelle, legge questa view.
-- Refresh real-time (no materialized view) per garantire freschezza.
CREATE OR REPLACE VIEW public.customer_profile AS
SELECT
  c.id AS company_id,
  c.name,
  c.email,
  c.phone,
  c.status AS company_status,
  c.created_at AS company_created_at,
  -- Plan + MRR
  c.subscription_plan_id,
  sp.name AS plan_name,
  sp.price_monthly AS plan_price_monthly,
  c.stripe_subscription_status,
  c.payment_method,
  -- Onboarding
  ob.current_phase AS onboarding_phase,
  ob.started_at AS onboarding_started_at,
  ob.graduated_at AS onboarding_graduated_at,
  EXTRACT(DAY FROM (now() - c.created_at))::INT AS days_since_signup,
  -- Last health snapshot
  hh.health_score AS health_score_latest,
  hh.health_label AS health_label_latest,
  hh.score_delta_7d AS health_delta_7d,
  hh.score_delta_30d AS health_delta_30d,
  hh.snapshot_date AS health_snapshot_date,
  -- Usage last 30d
  COALESCE(usage_30d.login_count_30d, 0) AS login_count_30d,
  COALESCE(usage_30d.unique_users_30d, 0) AS unique_users_30d,
  COALESCE(usage_30d.session_minutes_30d, 0) AS session_minutes_30d,
  COALESCE(usage_30d.errors_30d, 0) AS errors_30d,
  usage_30d.last_login_at,
  COALESCE(features_30d.features_count_distinct, 0) AS features_used_30d_count,
  -- Interactions last 30d
  COALESCE(interactions_30d.tickets_opened_30d, 0) AS tickets_opened_30d,
  COALESCE(interactions_30d.emails_received_30d, 0) AS emails_received_30d,
  COALESCE(interactions_30d.angry_msgs_30d, 0) AS angry_msgs_30d,
  COALESCE(interactions_30d.last_interaction_at, c.created_at) AS last_interaction_at,
  -- Sentiment avg
  interactions_30d.sentiment_avg_30d,
  -- NPS
  nps.last_nps_score,
  nps.last_nps_date,
  -- Team
  COALESCE(team.team_size, 0) AS team_size,
  -- Computed signals
  CASE
    WHEN hh.health_label = 'at_risk' OR hh.health_label = 'churned' THEN true
    WHEN COALESCE(interactions_30d.angry_msgs_30d, 0) >= 2 THEN true
    WHEN c.stripe_subscription_status IN ('past_due', 'canceled', 'unpaid') THEN true
    ELSE false
  END AS is_at_risk,
  CASE
    WHEN hh.health_label = 'champion' AND ob.current_phase = 'graduated' THEN true
    WHEN COALESCE(usage_30d.login_count_30d, 0) > 60 AND sp.price_monthly < 400 THEN true
    ELSE false
  END AS is_upsell_candidate
FROM public.companies c
LEFT JOIN public.subscription_plans sp ON sp.id = c.subscription_plan_id
LEFT JOIN public.customer_onboarding ob ON ob.company_id = c.id
LEFT JOIN LATERAL (
  SELECT health_score, health_label, score_delta_7d, score_delta_30d, snapshot_date
  FROM public.customer_health_history h
  WHERE h.company_id = c.id
  ORDER BY h.snapshot_date DESC
  LIMIT 1
) hh ON true
LEFT JOIN LATERAL (
  SELECT
    SUM(login_count) AS login_count_30d,
    MAX(unique_users_active) AS unique_users_30d,
    SUM(total_session_minutes) AS session_minutes_30d,
    SUM(errors_count) AS errors_30d,
    MAX(last_login_at) AS last_login_at
  FROM public.customer_usage_daily u
  WHERE u.company_id = c.id
    AND u.usage_date >= CURRENT_DATE - INTERVAL '30 days'
) usage_30d ON true
LEFT JOIN LATERAL (
  SELECT COUNT(DISTINCT event_name) AS features_count_distinct
  FROM public.product_events pe
  WHERE pe.company_id = c.id
    AND pe.category = 'feature'
    AND pe.occurred_at >= now() - INTERVAL '30 days'
) features_30d ON true
LEFT JOIN LATERAL (
  SELECT
    COUNT(*) FILTER (WHERE channel = 'ticket_created') AS tickets_opened_30d,
    COUNT(*) FILTER (WHERE channel = 'email_inbound') AS emails_received_30d,
    COUNT(*) FILTER (WHERE sentiment IN ('angry', 'frustrated')) AS angry_msgs_30d,
    MAX(occurred_at) AS last_interaction_at,
    AVG(
      CASE sentiment
        WHEN 'positive' THEN 5
        WHEN 'neutral' THEN 3
        WHEN 'frustrated' THEN 2
        WHEN 'angry' THEN 1
      END
    )::NUMERIC(3,2) AS sentiment_avg_30d
  FROM public.customer_interactions ci
  WHERE ci.company_id = c.id
    AND ci.occurred_at >= now() - INTERVAL '30 days'
) interactions_30d ON true
LEFT JOIN LATERAL (
  SELECT score AS last_nps_score, created_at::DATE AS last_nps_date
  FROM public.nps_responses np
  WHERE np.company_id = c.id
  ORDER BY np.created_at DESC
  LIMIT 1
) nps ON true
LEFT JOIN LATERAL (
  SELECT COUNT(*) AS team_size
  FROM public.profiles p
  WHERE p.company_id = c.id
) team ON true
WHERE c.is_platform_admin_company = false;

COMMENT ON VIEW public.customer_profile IS
  '50+ campi aggregati per cliente: profilo unico letto da TUTTI gli agenti AI prima di rispondere. Refresh on-read (no MV).';

GRANT SELECT ON public.customer_profile TO authenticated;

-- ─── 7) NPS responses (se non esiste già) ────────────────────────────────
CREATE TABLE IF NOT EXISTS public.nps_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id UUID,
  score INT NOT NULL CHECK (score BETWEEN 0 AND 10),
  comment TEXT,
  triggered_at_phase TEXT,  -- 'onboarding_30d' / 'month_6' / 'annual'
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_nps_company_date
  ON public.nps_responses(company_id, created_at DESC);

ALTER TABLE public.nps_responses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "nps_company_select" ON public.nps_responses;
CREATE POLICY "nps_company_select" ON public.nps_responses
  FOR SELECT TO authenticated
  USING (
    company_id IN (
      SELECT company_id FROM public.profiles WHERE id = auth.uid()
    )
    OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
  );

DROP POLICY IF EXISTS "nps_insert_self" ON public.nps_responses;
CREATE POLICY "nps_insert_self" ON public.nps_responses
  FOR INSERT TO authenticated
  WITH CHECK (
    company_id IN (
      SELECT company_id FROM public.profiles WHERE id = auth.uid()
    )
    AND user_id = auth.uid()
  );

-- ─── 8) Helper RPC: ricava customer_profile snapshot ────────────────────
-- Tool che ogni agente AI chiama PRIMA di rispondere/agire.
-- Ritorna JSON compatto + metadata "freshness" per evitare staleness.
CREATE OR REPLACE FUNCTION public.get_customer_context(p_company_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile JSONB;
  v_recent_interactions JSONB;
  v_recent_events JSONB;
BEGIN
  -- Solo super_admin o membri company stessa
  IF NOT (
    public.has_role(auth.uid(), 'super_admin'::public.app_role)
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND company_id = p_company_id)
    OR EXISTS (SELECT 1 FROM public.multi_company_access WHERE user_id = auth.uid() AND company_id = p_company_id)
  ) THEN
    RAISE EXCEPTION 'permission_denied';
  END IF;

  -- Profile aggregato
  SELECT row_to_json(cp.*)::JSONB INTO v_profile
  FROM public.customer_profile cp
  WHERE cp.company_id = p_company_id;

  -- Ultime 10 interazioni
  SELECT COALESCE(jsonb_agg(row_to_json(t.*) ORDER BY t.occurred_at DESC), '[]'::jsonb)
    INTO v_recent_interactions
  FROM (
    SELECT id, channel, direction, subject,
           LEFT(COALESCE(body, ''), 200) AS body_preview,
           sentiment, ai_persona_key, occurred_at
    FROM public.customer_interactions
    WHERE company_id = p_company_id
    ORDER BY occurred_at DESC
    LIMIT 10
  ) t;

  -- Ultimi 20 eventi prodotto
  SELECT COALESCE(jsonb_agg(row_to_json(t.*) ORDER BY t.occurred_at DESC), '[]'::jsonb)
    INTO v_recent_events
  FROM (
    SELECT event_name, category, occurred_at, properties
    FROM public.product_events
    WHERE company_id = p_company_id
    ORDER BY occurred_at DESC
    LIMIT 20
  ) t;

  RETURN jsonb_build_object(
    'profile', v_profile,
    'recent_interactions', v_recent_interactions,
    'recent_events', v_recent_events,
    'fetched_at', now()
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_customer_context(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_customer_context(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_customer_context(UUID) TO service_role;

COMMENT ON FUNCTION public.get_customer_context IS
  'Snapshot completo cliente per agenti AI. Chiamato come tool prima di ogni risposta/azione.';

-- ─── 9) Helper RPC: classifica sentiment messaggio ───────────────────────
-- NB: la vera classificazione avviene via edge function (chiamata a gpt-4o-mini).
-- Questa RPC è il punto di UPDATE finale, chiamata dall'edge function.
CREATE OR REPLACE FUNCTION public.update_interaction_sentiment(
  p_interaction_id UUID,
  p_sentiment TEXT,
  p_confidence NUMERIC
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_sentiment NOT IN ('positive', 'neutral', 'frustrated', 'angry', 'unknown') THEN
    RAISE EXCEPTION 'invalid_sentiment: %', p_sentiment;
  END IF;

  UPDATE public.customer_interactions
     SET sentiment = p_sentiment,
         sentiment_confidence = p_confidence
   WHERE id = p_interaction_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_interaction_sentiment(UUID, TEXT, NUMERIC) TO service_role;

-- ─── 10) Trigger: onboarding row su nuova azienda ────────────────────────
CREATE OR REPLACE FUNCTION public.bootstrap_customer_onboarding()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.is_platform_admin_company IS NOT TRUE THEN
    INSERT INTO public.customer_onboarding (company_id, current_phase, started_at)
    VALUES (NEW.id, 'kickoff', NEW.created_at)
    ON CONFLICT (company_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_bootstrap_customer_onboarding ON public.companies;
CREATE TRIGGER trg_bootstrap_customer_onboarding
  AFTER INSERT ON public.companies
  FOR EACH ROW EXECUTE FUNCTION public.bootstrap_customer_onboarding();

-- ─── 11) Backfill onboarding per aziende esistenti ──────────────────────
INSERT INTO public.customer_onboarding (company_id, current_phase, started_at)
SELECT c.id, 'graduated', c.created_at
FROM public.companies c
WHERE c.is_platform_admin_company = false
  AND NOT EXISTS (SELECT 1 FROM public.customer_onboarding WHERE company_id = c.id)
ON CONFLICT (company_id) DO NOTHING;
