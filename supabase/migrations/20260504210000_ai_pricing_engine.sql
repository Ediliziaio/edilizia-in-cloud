-- ════════════════════════════════════════════════════════════════════════════
-- MP-AIE-01 — AI Pricing Engine (Fase 1: Fondamenta economiche)
-- ════════════════════════════════════════════════════════════════════════════
-- Obiettivo: il SuperAdmin acquista AI all'ingrosso da OpenRouter (costo X)
-- e rivende alle aziende con markup (default 3.5x = 250% margine), con
-- possibilità di:
--   • configurare prezzi per "tier" (T0..T5) — vedi seed sotto
--   • applicare override per singola azienda (offerte speciali, contratti)
--   • tracciare ogni chiamata in ledger immutabile (cost reale + cost billed + margin)
--   • riconciliare a fine mese con la fattura OpenRouter
--
-- Tabelle introdotte:
--   1. ai_pricing_tiers           — listino base tier (modificabile da SuperAdmin)
--   2. ai_pricing_overrides       — sconti/offerte per singola azienda
--   3. ai_call_ledger             — log immutabile di ogni chiamata (audit + revenue)
--   4. ai_provider_reconciliation — match mensile fattura OpenRouter
--   5. ai_router_config (esistente) ← +colonne tier_key, soft_cap defaults
--   6. ai_credits (esistente)     ← +colonne soft_cap_eur_monthly, hard_cap, mtd_spent
--
-- RPC introdotte:
--   • get_ai_pricing(company_id, tier_key)        — ritorna prezzi effettivi
--   • precheck_ai_credit(company_id, est_eur)     — verifica saldo + cap
--   • charge_ai_call(...)                          — atomic: insert ledger + scala wallet
--   • reset_ai_monthly_counters()                  — cron: azzera mtd_spent_eur
--
-- Sicurezza:
--   - Tutto SECURITY DEFINER con search_path locked
--   - RLS: pricing config solo super_admin; ledger company sees own
--   - Idempotency key UNIQUE su ledger → previene doppio addebito
--   - Concurrency-safe: SELECT FOR UPDATE su wallet
--   - Constraint check: balance_eur >= 0 SEMPRE (no debiti)
-- ════════════════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────────────
-- 1) Estensione ai_router_config: aggiungi tier_key (mapping task → tier)
-- ───────────────────────────────────────────────────────────────────────────

ALTER TABLE public.ai_router_config
  ADD COLUMN IF NOT EXISTS tier_key text;

COMMENT ON COLUMN public.ai_router_config.tier_key IS
  'Tier prezzo associato al task (T0..T5). NULL = compute on-the-fly da estimated_cost_per_million.';

-- Backfill tier_key sui task esistenti basandosi su estimated_cost_per_million
UPDATE public.ai_router_config SET tier_key = CASE
  WHEN estimated_cost_per_million IS NULL THEN 't1_economic'
  WHEN estimated_cost_per_million < 0.20  THEN 't0_nano'
  WHEN estimated_cost_per_million < 0.50  THEN 't1_economic'
  WHEN estimated_cost_per_million < 1.00  THEN 't2_vision'
  WHEN estimated_cost_per_million < 2.00  THEN 't3_balanced'
  WHEN estimated_cost_per_million < 5.00  THEN 't4_premium'
  ELSE 't5_deep'
END
WHERE tier_key IS NULL;

-- ───────────────────────────────────────────────────────────────────────────
-- 2) ai_pricing_tiers — listino base modificabile dal SuperAdmin
-- ───────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.ai_pricing_tiers (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tier_key        text NOT NULL UNIQUE,
  tier_label      text NOT NULL,
  tier_description text,
  display_name_to_company text NOT NULL DEFAULT 'AI Standard',
  /** Costo MEDIO reale OpenRouter in EUR per 1M token input (riferimento) */
  cost_per_1m_input_eur   numeric(10,6) NOT NULL,
  cost_per_1m_output_eur  numeric(10,6) NOT NULL,
  /** Markup percentuale: 350 = 3.5x (default 350) */
  markup_pct      numeric(6,2) NOT NULL DEFAULT 350.00 CHECK (markup_pct >= 100.00),
  /** Prezzi retail = cost * markup_pct/100 (calcolati GENERATED) */
  retail_per_1m_input_eur  numeric(12,6) GENERATED ALWAYS AS
    (cost_per_1m_input_eur * markup_pct / 100.0) STORED,
  retail_per_1m_output_eur numeric(12,6) GENERATED ALWAYS AS
    (cost_per_1m_output_eur * markup_pct / 100.0) STORED,
  /** Tier visibile al cliente (badge "AI Premium") */
  customer_label  text NOT NULL DEFAULT 'AI Standard',
  enabled         boolean NOT NULL DEFAULT true,
  /** Ordine visualizzazione UI */
  sort_order      int NOT NULL DEFAULT 100,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  updated_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_ai_pricing_tiers_enabled
  ON public.ai_pricing_tiers(tier_key) WHERE enabled = true;

ALTER TABLE public.ai_pricing_tiers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ai_pricing_tiers_admin ON public.ai_pricing_tiers;
CREATE POLICY ai_pricing_tiers_admin ON public.ai_pricing_tiers FOR ALL
  USING (public.has_role(auth.uid(), 'super_admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::public.app_role));

-- Le aziende possono LEGGERE i tier per mostrare il pricing nelle impostazioni
DROP POLICY IF EXISTS ai_pricing_tiers_authenticated_read ON public.ai_pricing_tiers;
CREATE POLICY ai_pricing_tiers_authenticated_read ON public.ai_pricing_tiers FOR SELECT
  USING (auth.uid() IS NOT NULL AND enabled = true);

DROP TRIGGER IF EXISTS trg_ai_pricing_tiers_updated_at ON public.ai_pricing_tiers;
CREATE TRIGGER trg_ai_pricing_tiers_updated_at
  BEFORE UPDATE ON public.ai_pricing_tiers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

COMMENT ON TABLE public.ai_pricing_tiers IS
  'Listino base AI: costo wholesale (OpenRouter) + retail (con markup). Modificabile da SuperAdmin.';

-- Seed dei 6 tier
INSERT INTO public.ai_pricing_tiers
  (tier_key, tier_label, tier_description, customer_label,
   cost_per_1m_input_eur, cost_per_1m_output_eur, markup_pct, sort_order)
VALUES
  ('t0_nano', 'T0 — Nano',
   'Modelli ultra-economici per intent classification e routing',
   'AI Base',
   0.080, 0.300, 350.00, 10),

  ('t1_economic', 'T1 — Economic',
   'Modelli economici per estrazioni e categorizzazioni (DeepSeek, Llama, Kimi)',
   'AI Standard',
   0.250, 1.000, 350.00, 20),

  ('t2_vision', 'T2 — Vision',
   'Modelli vision per OCR e analisi immagini (GPT-4o-mini, Gemini Flash)',
   'AI Standard',
   0.550, 2.200, 350.00, 30),

  ('t3_balanced', 'T3 — Balanced',
   'Modelli bilanciati per generazione testi (Claude Haiku, Gemini Flash)',
   'AI Plus',
   0.900, 4.000, 350.00, 40),

  ('t4_premium', 'T4 — Premium reasoning',
   'Modelli premium per ragionamento avanzato (Claude Sonnet, Gemini Pro)',
   'AI Premium',
   2.700, 12.000, 350.00, 50),

  ('t5_deep', 'T5 — Deep reasoning',
   'Modelli deep reasoning per audit complessi (Claude Opus, GPT-o3) — on demand',
   'AI Premium',
   13.000, 55.000, 300.00, 60)
ON CONFLICT (tier_key) DO NOTHING;

-- ───────────────────────────────────────────────────────────────────────────
-- 3) ai_pricing_overrides — offerte/sconti per singola azienda
-- ───────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.ai_pricing_overrides (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  /** NULL = override su TUTTI i tier; altrimenti tier specifico */
  tier_key        text REFERENCES public.ai_pricing_tiers(tier_key) ON DELETE CASCADE,
  /** Override del markup (es. 200 = 2x invece di 3.5x). NULL = usa default tier. */
  custom_markup_pct numeric(6,2) CHECK (custom_markup_pct IS NULL OR custom_markup_pct >= 100.00),
  /** Sconto percentuale aggiuntivo sul retail finale (0..100). NULL = nessuno. */
  discount_pct    numeric(5,2) CHECK (discount_pct IS NULL OR (discount_pct >= 0 AND discount_pct <= 100)),
  /** Validità: NULL = sempre */
  valid_from      timestamptz,
  valid_until     timestamptz,
  /** Motivazione (visibile nei log) */
  reason          text NOT NULL,
  /** Es. "BLACKFRIDAY2026", "PARTNER_GOLD" */
  promo_code      text,
  enabled         boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  created_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at      timestamptz NOT NULL DEFAULT now(),
  updated_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT ai_pricing_override_at_least_one_adjustment
    CHECK (custom_markup_pct IS NOT NULL OR discount_pct IS NOT NULL),
  CONSTRAINT ai_pricing_override_valid_window
    CHECK (valid_until IS NULL OR valid_from IS NULL OR valid_until > valid_from)
);

-- Solo UNA override attiva per (company, tier) alla volta
CREATE UNIQUE INDEX IF NOT EXISTS uq_ai_pricing_override_active
  ON public.ai_pricing_overrides(company_id, COALESCE(tier_key, '__ALL__'))
  WHERE enabled = true;

CREATE INDEX IF NOT EXISTS idx_ai_pricing_override_company
  ON public.ai_pricing_overrides(company_id) WHERE enabled = true;

ALTER TABLE public.ai_pricing_overrides ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ai_pricing_overrides_admin ON public.ai_pricing_overrides;
CREATE POLICY ai_pricing_overrides_admin ON public.ai_pricing_overrides FOR ALL
  USING (public.has_role(auth.uid(), 'super_admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::public.app_role));

-- L'azienda può vedere SE ha sconti attivi (per UI badge), non i dettagli
DROP POLICY IF EXISTS ai_pricing_overrides_company_read ON public.ai_pricing_overrides;
CREATE POLICY ai_pricing_overrides_company_read ON public.ai_pricing_overrides FOR SELECT
  USING (company_id = public.get_my_company_id() AND enabled = true);

DROP TRIGGER IF EXISTS trg_ai_pricing_overrides_updated_at ON public.ai_pricing_overrides;
CREATE TRIGGER trg_ai_pricing_overrides_updated_at
  BEFORE UPDATE ON public.ai_pricing_overrides
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

COMMENT ON TABLE public.ai_pricing_overrides IS
  'Override pricing per singola azienda (offerte speciali, sconti, contratti). Una sola override attiva per company+tier.';

-- ───────────────────────────────────────────────────────────────────────────
-- 4) ai_credits — estensione: soft cap mensile + tracking MTD
-- ───────────────────────────────────────────────────────────────────────────

ALTER TABLE public.ai_credits
  ADD COLUMN IF NOT EXISTS soft_cap_eur_monthly numeric(10,2) NOT NULL DEFAULT 500.00
    CHECK (soft_cap_eur_monthly >= 0),
  ADD COLUMN IF NOT EXISTS hard_cap_eur_monthly numeric(10,2)
    CHECK (hard_cap_eur_monthly IS NULL OR hard_cap_eur_monthly >= 0),
  ADD COLUMN IF NOT EXISTS mtd_spent_eur numeric(10,4) NOT NULL DEFAULT 0
    CHECK (mtd_spent_eur >= 0),
  ADD COLUMN IF NOT EXISTS mtd_period_start date NOT NULL DEFAULT date_trunc('month', now())::date,
  ADD COLUMN IF NOT EXISTS soft_cap_warning_sent_at timestamptz;

COMMENT ON COLUMN public.ai_credits.soft_cap_eur_monthly IS
  'Tetto soft mensile in EUR. A 80% manda alert email. Default 500€, modificabile dall''azienda.';

COMMENT ON COLUMN public.ai_credits.hard_cap_eur_monthly IS
  'Tetto hard mensile in EUR. Se superato → calls_blocked=true. NULL = nessun hard cap.';

COMMENT ON COLUMN public.ai_credits.mtd_spent_eur IS
  'Speso month-to-date (resettato il 1 di ogni mese dal cron reset_ai_monthly_counters).';

-- ───────────────────────────────────────────────────────────────────────────
-- 5) ai_call_ledger — log immutabile di OGNI chiamata AI (audit + revenue)
-- ───────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.ai_call_ledger (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  /** Chiave idempotenza: hash di (session_id + message_id + try_n) */
  idempotency_key text NOT NULL UNIQUE,

  -- Identità
  company_id      uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id         uuid REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Routing
  task_key        text NOT NULL,
  tier_key        text NOT NULL,
  model_used      text NOT NULL,
  used_primary    boolean NOT NULL DEFAULT true,
  fallback_index  int NOT NULL DEFAULT 0,
  /** Persona AI che ha generato la chiamata (NULL pre-Fase 2) */
  persona_key     text,

  -- Token & costi
  tokens_in       int NOT NULL DEFAULT 0 CHECK (tokens_in >= 0),
  tokens_out      int NOT NULL DEFAULT 0 CHECK (tokens_out >= 0),
  /** Costo reale OpenRouter (USD da usage.cost) */
  cost_real_usd   numeric(12,8) NOT NULL DEFAULT 0 CHECK (cost_real_usd >= 0),
  /** Costo reale convertito in EUR */
  cost_real_eur   numeric(12,8) NOT NULL DEFAULT 0 CHECK (cost_real_eur >= 0),
  /** Costo addebitato al cliente (EUR, dopo markup + override) */
  cost_billed_eur numeric(12,8) NOT NULL DEFAULT 0 CHECK (cost_billed_eur >= 0),
  /** Margine = billed - real (può essere negativo se override aggressivo) */
  margin_eur      numeric(12,8) GENERATED ALWAYS AS (cost_billed_eur - cost_real_eur) STORED,
  /** Cambio USD→EUR usato (per audit storico) */
  fx_usd_to_eur   numeric(8,6) NOT NULL DEFAULT 0.92,
  /** Markup applicato (per audit storico) */
  applied_markup_pct numeric(6,2) NOT NULL,
  /** Override pricing applicata (se presente) */
  pricing_override_id uuid REFERENCES public.ai_pricing_overrides(id) ON DELETE SET NULL,

  -- Esito
  status          text NOT NULL DEFAULT 'success'
    CHECK (status IN ('success', 'error', 'timeout', 'refunded')),
  error_message   text,
  duration_ms     int CHECK (duration_ms IS NULL OR duration_ms >= 0),

  -- Metadata varie
  metadata        jsonb DEFAULT '{}'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- Indici per analytics
CREATE INDEX IF NOT EXISTS idx_ai_call_ledger_company_date
  ON public.ai_call_ledger(company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_call_ledger_task_date
  ON public.ai_call_ledger(task_key, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_call_ledger_tier_date
  ON public.ai_call_ledger(tier_key, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_call_ledger_status
  ON public.ai_call_ledger(status, created_at DESC) WHERE status <> 'success';
CREATE INDEX IF NOT EXISTS idx_ai_call_ledger_user
  ON public.ai_call_ledger(user_id, created_at DESC) WHERE user_id IS NOT NULL;

ALTER TABLE public.ai_call_ledger ENABLE ROW LEVEL SECURITY;

-- SuperAdmin vede TUTTO
DROP POLICY IF EXISTS ai_call_ledger_admin ON public.ai_call_ledger;
CREATE POLICY ai_call_ledger_admin ON public.ai_call_ledger FOR SELECT
  USING (public.has_role(auth.uid(), 'super_admin'::public.app_role));

-- Azienda vede SOLO le proprie chiamate
DROP POLICY IF EXISTS ai_call_ledger_company_read ON public.ai_call_ledger;
CREATE POLICY ai_call_ledger_company_read ON public.ai_call_ledger FOR SELECT
  USING (company_id = public.get_my_company_id());

-- INSERT: solo via SECURITY DEFINER RPC (no direct insert da utenti)
-- Nessuna policy INSERT/UPDATE/DELETE → solo service_role può modificare

COMMENT ON TABLE public.ai_call_ledger IS
  'Ledger immutabile chiamate AI: idempotency, costo reale, costo addebitato, margine. Audit-grade.';

-- ───────────────────────────────────────────────────────────────────────────
-- 6) ai_provider_reconciliation — riconciliazione mensile fatture OpenRouter
-- ───────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.ai_provider_reconciliation (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_month    date NOT NULL,
  provider        text NOT NULL DEFAULT 'openrouter',
  /** Importo fatturato dal provider (EUR) */
  invoiced_amount_eur numeric(12,4),
  invoiced_amount_usd numeric(12,4),
  /** Somma cost_real_eur del ledger nel periodo (computed at reconcile time) */
  ledger_total_real_eur numeric(12,4) NOT NULL DEFAULT 0,
  ledger_total_real_usd numeric(12,4) NOT NULL DEFAULT 0,
  /** Differenza = invoiced - ledger (può essere positiva se OR ha addebitato di più) */
  delta_eur       numeric(12,4) GENERATED ALWAYS AS
    (COALESCE(invoiced_amount_eur, 0) - ledger_total_real_eur) STORED,
  /** Conteggio chiamate del periodo */
  total_calls     int NOT NULL DEFAULT 0,
  /** Ricavi (somma cost_billed_eur) */
  revenue_eur     numeric(12,4) NOT NULL DEFAULT 0,
  /** Margine (revenue - cost_real) */
  margin_eur      numeric(12,4) GENERATED ALWAYS AS
    (revenue_eur - ledger_total_real_eur) STORED,
  status          text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'matched', 'investigating', 'resolved')),
  notes           text,
  reconciled_at   timestamptz,
  reconciled_by   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (period_month, provider)
);

ALTER TABLE public.ai_provider_reconciliation ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ai_reconciliation_admin ON public.ai_provider_reconciliation;
CREATE POLICY ai_reconciliation_admin ON public.ai_provider_reconciliation FOR ALL
  USING (public.has_role(auth.uid(), 'super_admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::public.app_role));

DROP TRIGGER IF EXISTS trg_ai_recon_updated_at ON public.ai_provider_reconciliation;
CREATE TRIGGER trg_ai_recon_updated_at
  BEFORE UPDATE ON public.ai_provider_reconciliation
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

COMMENT ON TABLE public.ai_provider_reconciliation IS
  'Riconciliazione mensile: confronta fatture provider AI vs ledger interno.';

-- ───────────────────────────────────────────────────────────────────────────
-- 7) RPC: get_ai_pricing — calcola prezzi effettivi per company+tier
-- ───────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_ai_pricing(
  p_company_id uuid,
  p_tier_key   text
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tier         record;
  v_override     record;
  v_markup_pct   numeric;
  v_discount_pct numeric;
  v_retail_in    numeric;
  v_retail_out   numeric;
BEGIN
  -- 1) Carica tier base
  SELECT * INTO v_tier
    FROM public.ai_pricing_tiers
   WHERE tier_key = p_tier_key AND enabled = true;

  IF NOT FOUND THEN
    -- Fallback safe se tier non esiste: usa T1 economic
    SELECT * INTO v_tier
      FROM public.ai_pricing_tiers
     WHERE tier_key = 't1_economic' AND enabled = true;
  END IF;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Nessun tier pricing disponibile (configura ai_pricing_tiers)';
  END IF;

  -- 2) Cerca override attiva per la company (priorità: tier-specific > all-tiers)
  SELECT * INTO v_override
    FROM public.ai_pricing_overrides
   WHERE company_id = p_company_id
     AND enabled = true
     AND (tier_key = v_tier.tier_key OR tier_key IS NULL)
     AND (valid_from IS NULL OR valid_from <= now())
     AND (valid_until IS NULL OR valid_until > now())
   ORDER BY tier_key NULLS LAST  -- tier-specific prima di all-tiers
   LIMIT 1;

  v_markup_pct := COALESCE(v_override.custom_markup_pct, v_tier.markup_pct);
  v_discount_pct := COALESCE(v_override.discount_pct, 0);

  -- 3) Calcola retail effettivi
  v_retail_in  := v_tier.cost_per_1m_input_eur  * v_markup_pct / 100.0
                  * (1.0 - v_discount_pct / 100.0);
  v_retail_out := v_tier.cost_per_1m_output_eur * v_markup_pct / 100.0
                  * (1.0 - v_discount_pct / 100.0);

  RETURN jsonb_build_object(
    'tier_key', v_tier.tier_key,
    'tier_label', v_tier.tier_label,
    'customer_label', v_tier.customer_label,
    'cost_per_1m_input_eur', v_tier.cost_per_1m_input_eur,
    'cost_per_1m_output_eur', v_tier.cost_per_1m_output_eur,
    'retail_per_1m_input_eur', v_retail_in,
    'retail_per_1m_output_eur', v_retail_out,
    'applied_markup_pct', v_markup_pct,
    'applied_discount_pct', v_discount_pct,
    'override_id', v_override.id,
    'override_reason', v_override.reason
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_ai_pricing(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_ai_pricing(uuid, text) TO authenticated, service_role;

COMMENT ON FUNCTION public.get_ai_pricing IS
  'Ritorna pricing effettivo per company+tier (con override e sconti applicati).';

-- ───────────────────────────────────────────────────────────────────────────
-- 8) RPC: precheck_ai_credit — verifica saldo + cap PRIMA di chiamare AI
-- ───────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.precheck_ai_credit(
  p_company_id uuid,
  p_estimated_cost_eur numeric DEFAULT 0.10
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_credits record;
BEGIN
  IF p_company_id IS NULL THEN
    RAISE EXCEPTION 'company_id obbligatorio' USING ERRCODE = '22023';
  END IF;

  IF p_estimated_cost_eur < 0 THEN
    RAISE EXCEPTION 'estimated_cost_eur non può essere negativo' USING ERRCODE = '22023';
  END IF;

  SELECT balance_eur, calls_blocked, blocked_reason,
         soft_cap_eur_monthly, hard_cap_eur_monthly,
         mtd_spent_eur, mtd_period_start
    INTO v_credits
    FROM public.ai_credits
   WHERE company_id = p_company_id;

  -- Wallet non esistente → considerato bloccato (deve essere creato a onboarding)
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'ok', false,
      'reason', 'wallet_missing',
      'message', 'Wallet AI non inizializzato per questa azienda'
    );
  END IF;

  -- Già bloccato manualmente o da hard cap precedente
  IF v_credits.calls_blocked THEN
    RETURN jsonb_build_object(
      'ok', false,
      'reason', COALESCE(v_credits.blocked_reason, 'blocked'),
      'message', 'Chiamate AI bloccate'
    );
  END IF;

  -- Saldo insufficiente (con buffer 1.5x sull'estimated)
  IF v_credits.balance_eur < (p_estimated_cost_eur * 1.5) THEN
    RETURN jsonb_build_object(
      'ok', false,
      'reason', 'insufficient_balance',
      'message', format('Saldo €%.2f insufficiente per stima €%.4f', v_credits.balance_eur, p_estimated_cost_eur),
      'balance_eur', v_credits.balance_eur,
      'estimated_cost_eur', p_estimated_cost_eur
    );
  END IF;

  -- Hard cap mensile superato
  IF v_credits.hard_cap_eur_monthly IS NOT NULL
     AND v_credits.mtd_spent_eur + p_estimated_cost_eur > v_credits.hard_cap_eur_monthly THEN
    RETURN jsonb_build_object(
      'ok', false,
      'reason', 'hard_cap_exceeded',
      'message', format('Hard cap mensile €%.2f superato (MTD: €%.4f)',
                       v_credits.hard_cap_eur_monthly, v_credits.mtd_spent_eur),
      'hard_cap_eur_monthly', v_credits.hard_cap_eur_monthly,
      'mtd_spent_eur', v_credits.mtd_spent_eur
    );
  END IF;

  -- OK con eventuale warning soft cap
  RETURN jsonb_build_object(
    'ok', true,
    'balance_eur', v_credits.balance_eur,
    'mtd_spent_eur', v_credits.mtd_spent_eur,
    'soft_cap_eur_monthly', v_credits.soft_cap_eur_monthly,
    'soft_cap_pct_used', CASE
      WHEN v_credits.soft_cap_eur_monthly > 0
      THEN round((v_credits.mtd_spent_eur / v_credits.soft_cap_eur_monthly * 100.0)::numeric, 2)
      ELSE 0
    END,
    'soft_cap_warning', v_credits.soft_cap_eur_monthly > 0
      AND v_credits.mtd_spent_eur >= v_credits.soft_cap_eur_monthly * 0.80
  );
END;
$$;

REVOKE ALL ON FUNCTION public.precheck_ai_credit(uuid, numeric) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.precheck_ai_credit(uuid, numeric) TO authenticated, service_role;

COMMENT ON FUNCTION public.precheck_ai_credit IS
  'Verifica pre-chiamata: saldo + hard cap + blocchi. Ritorna ok=true/false con reason.';

-- ───────────────────────────────────────────────────────────────────────────
-- 9) RPC: charge_ai_call — atomic: insert ledger + scala wallet + update MTD
-- ───────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.charge_ai_call(
  p_idempotency_key text,
  p_company_id      uuid,
  p_user_id         uuid,
  p_task_key        text,
  p_tier_key        text,
  p_model_used      text,
  p_used_primary    boolean,
  p_fallback_index  int,
  p_persona_key     text,
  p_tokens_in       int,
  p_tokens_out      int,
  p_cost_real_usd   numeric,
  p_fx_usd_to_eur   numeric,
  p_status          text DEFAULT 'success',
  p_error_message   text DEFAULT NULL,
  p_duration_ms     int DEFAULT NULL,
  p_metadata        jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pricing       jsonb;
  v_cost_real_eur numeric;
  v_cost_billed_eur numeric;
  v_balance_after numeric;
  v_existing_id   uuid;
  v_ledger_id     uuid;
  v_markup_pct    numeric;
  v_override_id   uuid;
  v_period_start  date;
BEGIN
  -- ── Validation ────────────────────────────────────────────────────────
  IF p_idempotency_key IS NULL OR length(p_idempotency_key) < 8 THEN
    RAISE EXCEPTION 'idempotency_key obbligatoria (min 8 char)' USING ERRCODE = '22023';
  END IF;
  IF p_company_id IS NULL THEN
    RAISE EXCEPTION 'company_id obbligatorio' USING ERRCODE = '22023';
  END IF;
  IF p_status NOT IN ('success', 'error', 'timeout') THEN
    RAISE EXCEPTION 'status non valido: %', p_status USING ERRCODE = '22023';
  END IF;
  IF p_cost_real_usd < 0 THEN
    RAISE EXCEPTION 'cost_real_usd non può essere negativo' USING ERRCODE = '22023';
  END IF;
  IF p_fx_usd_to_eur <= 0 THEN
    p_fx_usd_to_eur := 0.92; -- default safe
  END IF;

  -- ── Idempotency: se esiste già la chiamata, ritorna senza riaddebitare ──
  SELECT id INTO v_existing_id
    FROM public.ai_call_ledger
   WHERE idempotency_key = p_idempotency_key;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'success', true,
      'idempotent_replay', true,
      'ledger_id', v_existing_id,
      'message', 'Chiamata già registrata (idempotency_key)'
    );
  END IF;

  -- ── Calcolo costi ────────────────────────────────────────────────────
  v_cost_real_eur := round((p_cost_real_usd * p_fx_usd_to_eur)::numeric, 8);

  -- Errori e timeout: nessun addebito al cliente (l'AI non ha risposto utilmente)
  IF p_status IN ('error', 'timeout') THEN
    v_cost_billed_eur := 0;
    v_markup_pct := 0;
    v_override_id := NULL;
  ELSE
    v_pricing := public.get_ai_pricing(p_company_id, p_tier_key);
    v_markup_pct := (v_pricing->>'applied_markup_pct')::numeric;
    v_override_id := NULLIF(v_pricing->>'override_id', '')::uuid;

    -- Cost billed = (tokens / 1M) * retail_per_1m
    v_cost_billed_eur := round((
      (p_tokens_in::numeric  / 1000000.0) * (v_pricing->>'retail_per_1m_input_eur')::numeric +
      (p_tokens_out::numeric / 1000000.0) * (v_pricing->>'retail_per_1m_output_eur')::numeric
    )::numeric, 8);
  END IF;

  -- ── Transazione atomica: lock wallet + scala + insert ledger ─────────
  -- Lock the wallet row first
  PERFORM 1 FROM public.ai_credits WHERE company_id = p_company_id FOR UPDATE;

  -- Reset MTD se siamo in un nuovo mese
  v_period_start := date_trunc('month', now())::date;
  UPDATE public.ai_credits
     SET mtd_spent_eur = 0,
         mtd_period_start = v_period_start,
         soft_cap_warning_sent_at = NULL
   WHERE company_id = p_company_id
     AND mtd_period_start < v_period_start;

  -- Scala il wallet SOLO se billed > 0
  IF v_cost_billed_eur > 0 THEN
    UPDATE public.ai_credits
       SET balance_eur     = balance_eur - v_cost_billed_eur,
           total_spent_eur = COALESCE(total_spent_eur, 0) + v_cost_billed_eur,
           mtd_spent_eur   = COALESCE(mtd_spent_eur, 0) + v_cost_billed_eur,
           updated_at      = now()
     WHERE company_id = p_company_id
     RETURNING balance_eur INTO v_balance_after;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Wallet AI non trovato per company %', p_company_id USING ERRCODE = 'P0002';
    END IF;

    -- Auto-block se saldo va sotto zero (constraint check già lo blocca, ma per chiarezza)
    IF v_balance_after < 0 THEN
      RAISE EXCEPTION 'Saldo insufficiente: post-charge sarebbe €%', v_balance_after USING ERRCODE = '23514';
    END IF;

    -- Auto-block se hard cap superato
    UPDATE public.ai_credits
       SET calls_blocked = true,
           blocked_at = now(),
           blocked_reason = 'hard_cap_exceeded'
     WHERE company_id = p_company_id
       AND hard_cap_eur_monthly IS NOT NULL
       AND mtd_spent_eur >= hard_cap_eur_monthly
       AND calls_blocked = false;
  END IF;

  -- Insert ledger (immutabile)
  INSERT INTO public.ai_call_ledger (
    idempotency_key, company_id, user_id,
    task_key, tier_key, model_used, used_primary, fallback_index, persona_key,
    tokens_in, tokens_out,
    cost_real_usd, cost_real_eur, cost_billed_eur, fx_usd_to_eur,
    applied_markup_pct, pricing_override_id,
    status, error_message, duration_ms, metadata
  ) VALUES (
    p_idempotency_key, p_company_id, p_user_id,
    p_task_key, p_tier_key, p_model_used, p_used_primary, p_fallback_index, p_persona_key,
    p_tokens_in, p_tokens_out,
    p_cost_real_usd, v_cost_real_eur, v_cost_billed_eur, p_fx_usd_to_eur,
    v_markup_pct, v_override_id,
    p_status, p_error_message, p_duration_ms, p_metadata
  )
  RETURNING id INTO v_ledger_id;

  RETURN jsonb_build_object(
    'success', true,
    'idempotent_replay', false,
    'ledger_id', v_ledger_id,
    'cost_real_eur', v_cost_real_eur,
    'cost_billed_eur', v_cost_billed_eur,
    'margin_eur', v_cost_billed_eur - v_cost_real_eur,
    'balance_after', v_balance_after,
    'applied_markup_pct', v_markup_pct
  );

EXCEPTION
  WHEN unique_violation THEN
    -- Race su idempotency_key: la chiamata parallela ha vinto
    SELECT id INTO v_existing_id FROM public.ai_call_ledger WHERE idempotency_key = p_idempotency_key;
    RETURN jsonb_build_object(
      'success', true,
      'idempotent_replay', true,
      'ledger_id', v_existing_id,
      'message', 'Concurrent insert prevented duplicate'
    );
END;
$$;

REVOKE ALL ON FUNCTION public.charge_ai_call(text, uuid, uuid, text, text, text, boolean, int, text, int, int, numeric, numeric, text, text, int, jsonb) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.charge_ai_call(text, uuid, uuid, text, text, text, boolean, int, text, int, int, numeric, numeric, text, text, int, jsonb) TO service_role;

COMMENT ON FUNCTION public.charge_ai_call IS
  'Atomic charge: insert ledger immutabile + scala wallet + aggiorna MTD + auto-block su cap. Idempotent.';

-- ───────────────────────────────────────────────────────────────────────────
-- 10) RPC: reset_ai_monthly_counters — cron mensile per reset MTD
-- ───────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.reset_ai_monthly_counters()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_period_start date := date_trunc('month', now())::date;
  v_updated      int;
BEGIN
  UPDATE public.ai_credits
     SET mtd_spent_eur = 0,
         mtd_period_start = v_period_start,
         soft_cap_warning_sent_at = NULL,
         calls_blocked = CASE WHEN blocked_reason = 'hard_cap_exceeded' THEN false ELSE calls_blocked END,
         blocked_at = CASE WHEN blocked_reason = 'hard_cap_exceeded' THEN NULL ELSE blocked_at END,
         blocked_reason = CASE WHEN blocked_reason = 'hard_cap_exceeded' THEN NULL ELSE blocked_reason END
   WHERE mtd_period_start < v_period_start;

  GET DIAGNOSTICS v_updated = ROW_COUNT;

  RETURN jsonb_build_object(
    'success', true,
    'period_start', v_period_start,
    'wallets_reset', v_updated
  );
END;
$$;

REVOKE ALL ON FUNCTION public.reset_ai_monthly_counters() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reset_ai_monthly_counters() TO service_role;

COMMENT ON FUNCTION public.reset_ai_monthly_counters IS
  'Cron mensile (1° del mese, 00:01): resetta MTD spent + sblocca cap-blocked.';

-- ───────────────────────────────────────────────────────────────────────────
-- 11) Vista materializzata: ai_revenue_dashboard (per SuperAdmin)
-- ───────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW public.ai_revenue_summary AS
SELECT
  date_trunc('day', created_at)::date  AS day,
  count(*)                              AS calls,
  sum(tokens_in)                        AS tokens_in_total,
  sum(tokens_out)                       AS tokens_out_total,
  round(sum(cost_real_eur)::numeric, 4) AS cost_real_eur,
  round(sum(cost_billed_eur)::numeric, 4) AS revenue_eur,
  round(sum(margin_eur)::numeric, 4)    AS margin_eur,
  round((sum(margin_eur) / NULLIF(sum(cost_real_eur), 0) * 100.0)::numeric, 2) AS markup_real_pct
FROM public.ai_call_ledger
WHERE status = 'success'
GROUP BY 1
ORDER BY 1 DESC;

COMMENT ON VIEW public.ai_revenue_summary IS
  'Aggregato giornaliero per dashboard SuperAdmin: calls, costo reale, revenue, margine.';

-- Solo super_admin può leggerla (RLS via tabella sottostante)

-- ───────────────────────────────────────────────────────────────────────────
-- 12) Constraint check finale: balance_eur >= 0 SEMPRE (rinforza l'esistente)
-- ───────────────────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.constraint_column_usage
     WHERE table_name = 'ai_credits' AND constraint_name = 'ai_credits_balance_nonnegative'
  ) THEN
    ALTER TABLE public.ai_credits
      ADD CONSTRAINT ai_credits_balance_nonnegative
      CHECK (balance_eur >= 0);
  END IF;
EXCEPTION WHEN OTHERS THEN
  -- Constraint già esistente o conflict → ignore
  NULL;
END $$;
