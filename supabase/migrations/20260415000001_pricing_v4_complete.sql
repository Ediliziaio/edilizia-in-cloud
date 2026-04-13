-- ============================================================
-- Pricing V4 Complete Migration
-- Idempotent: safe to re-run. Uses IF NOT EXISTS / DO $$ blocks.
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. subscription_plans: add trial_days (override old default)
-- ────────────────────────────────────────────────────────────
ALTER TABLE public.subscription_plans
  ADD COLUMN IF NOT EXISTS trial_days integer NOT NULL DEFAULT 31;

-- Update existing default from 14 → 31
UPDATE public.subscription_plans SET trial_days = 31 WHERE trial_days <> 31;

-- ────────────────────────────────────────────────────────────
-- 2. UPSERT 3 plans
-- ────────────────────────────────────────────────────────────
INSERT INTO public.subscription_plans (
  name, slug, description, price_monthly, price_yearly,
  max_orders, max_users, max_storage_mb, trial_days, position, is_active, features
) VALUES
(
  'Starter', 'starter',
  'Gestionale base per artigiani e piccole imprese. Commesse illimitate, fatturazione SDI, DDT, Note di Credito, Proforma, app operai mobile.',
  127, 1188, -1, -1, 10240, 31, 1, true,
  '["Commesse illimitate + SAL","Fatturazione SDI FatturaPA 1.2","CassettoSDI + Prima Nota + Registro Incassi","DDT (Documenti di Trasporto)","Note di Credito","Proforma e acconti","Previsionale cassa 60 giorni","App operai mobile: timbratura GPS + rapportino","Tesserino QR digitale operai","Self-service: ferie, timbrature, cedolini","Utenti illimitati","Storage 10 GB","Trial 31 giorni senza carta","Supporto email/chat 24h"]'::jsonb
),
(
  'Pro', 'pro',
  'Imprese strutturate con pieno controllo: cantieri, cassa, squadre, clienti. Preventivi e fatture personalizzabili.',
  247, 2364, -1, -1, 30720, 31, 2, true,
  '["Tutto di Starter +","Giornale dei Lavori + ODA fornitori + Verifica OdA AI","Sicurezza Cantiere D.Lgs 81/2008","Subappalti + SAL sub + Gantt multi-cantiere","Ritenute di garanzia","Preventivi personalizzabili (template, logo, colori)","Fatture personalizzabili (intestazione, layout)","Scadenzario + Tesoreria + Registro IVA","Banca PSD2 (1 conto incluso)","Previsionale cassa 90 giorni","Report P&L e cash flow","CRM illimitato + Pipeline + OpportunityDialog","Email marketing 5.000/mese","Facebook Lead Ads sync + WhatsApp marketing","Flow Builder automazioni 25+ template","SMS Marketing bulk","Portale cliente standard","Computo Metrico AI (PDF/xlsx/xpwe)","HR completo + Cedolini strutturati","Timbratura Kiosk + GPS FleetTrack","Employees Area (cantiere/commerciale/amm./tecnico)","Magazzino + barcode scanner","Manutenzione programmata + listino","Dashboard Salute Operativa (score 0-100)","Marketing Dashboard funnel + KPI","CreateUserWizard + PermissionsDialog granulare","PWA installabile","9 ruoli + permessi granulari per sezione","Storage 30 GB","Onboarding 2 sessioni + WhatsApp/Tel 4h","1 call/mese consulente EiC"]'::jsonb
),
(
  'Enterprise', 'enterprise',
  'Imprese complesse, multi-sede, AI-first. White label, API REST, agenti AI, Render AI, Verifica OdA AI.',
  547, 5244, -1, -1, 102400, 31, 3, true,
  '["Tutto di Pro +","Multi-sede (gestione separata per location)","Banca PSD2 (3 conti inclusi)","Previsionale cassa 365 giorni","Export XBRL/CSV per commercialista","Archiviazione sostitutiva 10 anni","Email marketing 20.000/mese","WhatsApp avanzato + automazioni AI","Portale cliente branded white label","Firma preventivi/SAL dal portale cliente","Agenti AI personalizzati (knowledge base azienda)","AI Preventivo (Claude API) — add-on €39 come tutti","Agente Vocale AI 200 min/mese inclusi","WhatsApp Bot AI H24 incluso","Render AI (categoria scelta dall''azienda): 20 render/mese inclusi","Verifica OdA AI (confidence score + discrepanze)","Computo Metrico AI avanzato","Report AI settimanale su KPI azienda","Chat AI interna sui dati aziendali","AI categorizzazione movimenti bancari","Dominio personalizzato","Email da dominio custom + PDF branded","API REST completa + Webhook personalizzati","Firma FEA avanzata","Audit log completo","IP Allowlist + 2FA obbligatorio","Storage 100 GB","SLA uptime 99.9%","Onboarding premium 4 sessioni","Telefono dedicato entro 1h","2 call/mese consulente + SLA contrattuale"]'::jsonb
)
ON CONFLICT (slug) DO UPDATE SET
  name            = EXCLUDED.name,
  description     = EXCLUDED.description,
  price_monthly   = EXCLUDED.price_monthly,
  price_yearly    = EXCLUDED.price_yearly,
  max_orders      = EXCLUDED.max_orders,
  max_users       = EXCLUDED.max_users,
  max_storage_mb  = EXCLUDED.max_storage_mb,
  trial_days      = EXCLUDED.trial_days,
  position        = EXCLUDED.position,
  is_active       = EXCLUDED.is_active,
  features        = EXCLUDED.features;

-- ────────────────────────────────────────────────────────────
-- 3. UPSERT 9 add-ons into platform_feature_flags
-- ────────────────────────────────────────────────────────────
INSERT INTO public.platform_feature_flags (key, name, category, price_per_month, plans_included, icon, sort_order)
VALUES
  ('ai_preventivo',    'AI Preventivo',           'addon', 39,   '{starter,pro,enterprise}', 'Bot',           10),
  ('agente_vocale',    'Agente Vocale AI',        'addon', 89,   '{starter,pro,enterprise}', 'Phone',         11),
  ('render_ai',        'Render AI',               'addon', NULL, '{starter,pro,enterprise}', 'Image',         12),
  ('whatsapp_bot_ai',  'WhatsApp Bot AI',         'addon', 39,   '{pro}',                    'MessageCircle', 13),
  ('firma_fea',        'Firma Elettronica FEA',   'addon', 29,   '{starter,pro,enterprise}', 'FileSignature', 14),
  ('sms_marketing',    'SMS Marketing',           'addon', NULL, '{starter,pro,enterprise}', 'MessageSquare', 15),
  ('banca_extra',      'Banca PSD2 Extra',        'addon', 6,    '{pro,enterprise}',         'Landmark',      16),
  ('storage_extra',    'Storage Extra',           'addon', NULL, '{starter,pro,enterprise}', 'Cloud',         17),
  ('email_extra',      'Email Extra',             'addon', NULL, '{pro,enterprise}',         'Mail',          18)
ON CONFLICT (key) DO UPDATE SET
  name            = EXCLUDED.name,
  category        = EXCLUDED.category,
  price_per_month = EXCLUDED.price_per_month,
  plans_included  = EXCLUDED.plans_included,
  icon            = EXCLUDED.icon,
  sort_order      = EXCLUDED.sort_order;

-- ────────────────────────────────────────────────────────────
-- 4. referral_tiers: add commission_addon_pct & commission_plan_pct
-- ────────────────────────────────────────────────────────────
ALTER TABLE public.referral_tiers
  ADD COLUMN IF NOT EXISTS commission_addon_pct NUMERIC(5,2) DEFAULT 5.0;
ALTER TABLE public.referral_tiers
  ADD COLUMN IF NOT EXISTS commission_plan_pct  NUMERIC(5,2) DEFAULT 20.0;

-- Set tier-specific percentages
UPDATE public.referral_tiers SET commission_plan_pct = 20, commission_addon_pct = 5 WHERE slug = 'bronze';
UPDATE public.referral_tiers SET commission_plan_pct = 24, commission_addon_pct = 5 WHERE slug = 'silver';
UPDATE public.referral_tiers SET commission_plan_pct = 30, commission_addon_pct = 5 WHERE slug = 'gold';
UPDATE public.referral_tiers SET commission_plan_pct = 30, commission_addon_pct = 7 WHERE slug = 'platinum';

-- ────────────────────────────────────────────────────────────
-- 5. company_feature_overrides table
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.company_feature_overrides (
  id            UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    UUID           NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  feature_key   TEXT           NOT NULL,
  is_enabled    BOOLEAN        DEFAULT NULL,
  limit_value   INTEGER        DEFAULT NULL,
  price_override NUMERIC(10,2) DEFAULT NULL,
  notes         TEXT,
  set_by        UUID           REFERENCES auth.users(id),
  set_by_email  TEXT,
  expires_at    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ    DEFAULT now(),
  updated_at    TIMESTAMPTZ    DEFAULT now(),
  UNIQUE(company_id, feature_key)
);

-- Add columns if table already existed without them
DO $$ BEGIN
  ALTER TABLE public.company_feature_overrides ADD COLUMN IF NOT EXISTS limit_value     INTEGER        DEFAULT NULL;
  ALTER TABLE public.company_feature_overrides ADD COLUMN IF NOT EXISTS price_override  NUMERIC(10,2)  DEFAULT NULL;
  ALTER TABLE public.company_feature_overrides ADD COLUMN IF NOT EXISTS notes           TEXT;
  ALTER TABLE public.company_feature_overrides ADD COLUMN IF NOT EXISTS set_by          UUID           REFERENCES auth.users(id);
  ALTER TABLE public.company_feature_overrides ADD COLUMN IF NOT EXISTS set_by_email    TEXT;
  ALTER TABLE public.company_feature_overrides ADD COLUMN IF NOT EXISTS expires_at      TIMESTAMPTZ;
  ALTER TABLE public.company_feature_overrides ADD COLUMN IF NOT EXISTS updated_at      TIMESTAMPTZ    DEFAULT now();
EXCEPTION WHEN others THEN NULL;
END $$;

ALTER TABLE public.company_feature_overrides ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "super_admin_manage_feature_overrides" ON public.company_feature_overrides;
CREATE POLICY "super_admin_manage_feature_overrides"
  ON public.company_feature_overrides FOR ALL
  USING (has_role(auth.uid(), 'super_admin'::app_role));

CREATE INDEX IF NOT EXISTS idx_cfo_company_id   ON public.company_feature_overrides(company_id);
CREATE INDEX IF NOT EXISTS idx_cfo_feature_key  ON public.company_feature_overrides(feature_key);
CREATE INDEX IF NOT EXISTS idx_cfo_expires_at   ON public.company_feature_overrides(expires_at) WHERE expires_at IS NOT NULL;

-- ────────────────────────────────────────────────────────────
-- 6. superadmin_override_log table
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.superadmin_override_log (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  feature_key     TEXT        NOT NULL,
  action          TEXT        NOT NULL CHECK (action IN ('set','remove','expire')),
  old_value       JSONB,
  new_value       JSONB,
  performed_by    UUID        REFERENCES auth.users(id),
  performed_email TEXT,
  reason          TEXT,
  created_at      TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.superadmin_override_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "super_admin_view_override_log" ON public.superadmin_override_log;
CREATE POLICY "super_admin_view_override_log"
  ON public.superadmin_override_log FOR ALL
  USING (has_role(auth.uid(), 'super_admin'::app_role));

CREATE INDEX IF NOT EXISTS idx_sol_company_id  ON public.superadmin_override_log(company_id);
CREATE INDEX IF NOT EXISTS idx_sol_feature_key ON public.superadmin_override_log(feature_key);
CREATE INDEX IF NOT EXISTS idx_sol_created_at  ON public.superadmin_override_log(created_at);

-- ────────────────────────────────────────────────────────────
-- 7. company_subscriptions: trial extension columns
-- ────────────────────────────────────────────────────────────
ALTER TABLE public.company_subscriptions
  ADD COLUMN IF NOT EXISTS trial_extended_days   INTEGER       DEFAULT 0,
  ADD COLUMN IF NOT EXISTS trial_extended_by     UUID,
  ADD COLUMN IF NOT EXISTS trial_extended_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS trial_extended_reason TEXT;

-- ────────────────────────────────────────────────────────────
-- 8. companies: storage & render overrides
-- ────────────────────────────────────────────────────────────
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS storage_override_mb       INTEGER DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS render_monthly_override   INTEGER DEFAULT NULL;

-- ────────────────────────────────────────────────────────────
-- 9. admin_company_features VIEW
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW public.admin_company_features AS
SELECT
  c.id                          AS company_id,
  c.name                        AS company_name,
  c.status                      AS company_status,
  sp.slug                       AS plan_slug,
  sp.name                       AS plan_name,
  sp.price_monthly              AS plan_price,
  sp.max_orders,
  sp.max_users,
  sp.max_storage_mb             AS plan_storage_mb,
  COALESCE(c.storage_override_mb, sp.max_storage_mb) AS effective_storage_mb,
  sp.features                   AS plan_features,
  cs.status                     AS subscription_status,
  cs.billing_period,
  cs.current_period_end,
  cs.trial_extended_days,
  c.trial_ends_at,
  -- Aggregate overrides as JSONB array
  (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'feature_key',    cfo.feature_key,
      'is_enabled',     cfo.is_enabled,
      'limit_value',    cfo.limit_value,
      'price_override', cfo.price_override,
      'notes',          cfo.notes,
      'expires_at',     cfo.expires_at
    )), '[]'::jsonb)
    FROM public.company_feature_overrides cfo
    WHERE cfo.company_id = c.id
      AND (cfo.expires_at IS NULL OR cfo.expires_at > now())
  ) AS feature_overrides
FROM public.companies c
LEFT JOIN public.company_subscriptions cs
  ON cs.company_id = c.id
  AND cs.status IN ('active','trialing')
LEFT JOIN public.subscription_plans sp
  ON sp.id = cs.plan_id;

-- ────────────────────────────────────────────────────────────
-- 10. calculate_monthly_commissions (v4: plan_pct + addon_pct)
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.calculate_monthly_commissions(
  p_month INTEGER,
  p_year  INTEGER
)
RETURNS INTEGER AS $$
DECLARE
  v_referrer       RECORD;
  v_company        RECORD;
  v_plan_mrr       NUMERIC;
  v_plan_comm      NUMERIC;
  v_addon_total    NUMERIC;
  v_addon_comm     NUMERIC;
  v_plan_pct       NUMERIC;
  v_addon_pct      NUMERIC;
  v_multiplier     NUMERIC;
  v_usage          NUMERIC;
  v_usage_comm     NUMERIC;
  v_usage_pct      NUMERIC;
  v_period_start   TIMESTAMPTZ;
  v_period_end     TIMESTAMPTZ;
  v_count          INTEGER := 0;
BEGIN
  v_period_start := make_date(p_year, p_month, 1)::TIMESTAMPTZ;
  v_period_end   := (make_date(p_year, p_month, 1) + INTERVAL '1 month')::TIMESTAMPTZ;

  FOR v_referrer IN
    SELECT r.*,
           COALESCE(rt.commission_multiplier, 1.00)   AS tier_multiplier,
           COALESCE(rt.commission_plan_pct,  20.0)     AS tier_plan_pct,
           COALESCE(rt.commission_addon_pct,  5.0)     AS tier_addon_pct,
           COALESCE(rt.commission_on_usage, false)     AS on_usage,
           COALESCE(rt.usage_commission_pct, 5.0)      AS tier_usage_pct
    FROM referrers r
    LEFT JOIN referral_tiers rt ON r.tier_id = rt.id
    WHERE r.is_active = true
  LOOP
    v_plan_pct  := v_referrer.tier_plan_pct;
    v_addon_pct := v_referrer.tier_addon_pct;
    v_multiplier := COALESCE(v_referrer.tier_multiplier, 1.00);

    -- ── Plan-based commissions ──────────────────────────────────
    FOR v_company IN
      SELECT rc.company_id, sp.price_monthly, sp.name AS plan_name
      FROM referral_companies rc
      JOIN companies c ON rc.company_id = c.id
      JOIN subscription_plans sp ON c.subscription_plan_id = sp.id
      WHERE rc.referrer_id = v_referrer.id
        AND rc.is_active = true
        AND c.status = 'active'
    LOOP
      v_plan_mrr := COALESCE(v_company.price_monthly, 0);

      -- Plan commission: tier plan_pct * multiplier
      v_plan_comm := ROUND(v_plan_mrr * (v_plan_pct / 100) * v_multiplier, 2);

      -- Addon commission: sum active add-on prices for this company
      SELECT COALESCE(SUM(pff.price_per_month), 0)
      INTO v_addon_total
      FROM public.company_feature_overrides cfo
      JOIN public.platform_feature_flags pff ON pff.key = cfo.feature_key
      WHERE cfo.company_id = v_company.company_id
        AND cfo.is_enabled = true
        AND pff.category = 'addon'
        AND pff.price_per_month IS NOT NULL
        AND (cfo.expires_at IS NULL OR cfo.expires_at > now());

      v_addon_comm := ROUND(v_addon_total * (v_addon_pct / 100) * v_multiplier, 2);

      INSERT INTO referral_commission_ledger (
        referrer_id, company_id, period_month, period_year,
        subscription_plan_name, plan_mrr,
        commission_type, commission_rate, tier_multiplier, commission_amount,
        status
      ) VALUES (
        v_referrer.id, v_company.company_id, p_month, p_year,
        v_company.plan_name, v_plan_mrr,
        'percentage', v_plan_pct,
        v_multiplier, v_plan_comm + v_addon_comm,
        'pending'
      )
      ON CONFLICT (referrer_id, company_id, period_month, period_year)
      DO UPDATE SET
        plan_mrr               = EXCLUDED.plan_mrr,
        commission_amount      = EXCLUDED.commission_amount,
        commission_rate        = EXCLUDED.commission_rate,
        tier_multiplier        = EXCLUDED.tier_multiplier,
        subscription_plan_name = EXCLUDED.subscription_plan_name,
        calculated_at          = now();

      v_count := v_count + 1;
    END LOOP;

    -- ── Usage-based commissions ─────────────────────────────────
    IF v_referrer.on_usage THEN
      v_usage_pct := COALESCE(v_referrer.tier_usage_pct, 5.0);

      FOR v_company IN
        SELECT rc.company_id
        FROM referral_companies rc
        WHERE rc.referrer_id = v_referrer.id
          AND rc.is_active = true
      LOOP
        SELECT COALESCE(
          (
            SELECT SUM(ABS(ecl.amount_eur))
            FROM email_credits_log ecl
            WHERE ecl.company_id = v_company.company_id
              AND ecl.type = 'deduct'
              AND ecl.created_at >= v_period_start
              AND ecl.created_at <  v_period_end
          ), 0
        ) +
        COALESCE(
          (
            SELECT SUM(ABS(wcl.amount_eur))
            FROM whatsapp_credits_log wcl
            WHERE wcl.company_id = v_company.company_id
              AND wcl.type = 'deduct'
              AND wcl.created_at >= v_period_start
              AND wcl.created_at <  v_period_end
          ), 0
        ) +
        COALESCE(
          (
            SELECT SUM(acu.cost_eur)
            FROM ai_credit_usage acu
            WHERE acu.company_id = v_company.company_id
              AND acu.created_at >= v_period_start
              AND acu.created_at <  v_period_end
          ), 0
        )
        INTO v_usage;

        IF v_usage > 0 THEN
          v_usage_comm := ROUND(v_usage * v_usage_pct / 100, 4);

          INSERT INTO referral_commission_ledger (
            referrer_id, company_id, period_month, period_year,
            subscription_plan_name, plan_mrr,
            commission_type, commission_rate, tier_multiplier, commission_amount,
            status
          ) VALUES (
            v_referrer.id, v_company.company_id, p_month, p_year,
            'usage_commission', v_usage,
            'usage', v_usage_pct,
            1.0, v_usage_comm,
            'pending'
          )
          ON CONFLICT (referrer_id, company_id, period_month, period_year)
          DO UPDATE SET
            commission_amount = referral_commission_ledger.commission_amount + v_usage_comm,
            plan_mrr          = EXCLUDED.plan_mrr,
            calculated_at     = now();

          v_count := v_count + 1;
        END IF;
      END LOOP;
    END IF;

    -- Update total_earned for this referrer
    UPDATE referrers SET
      total_earned = (
        SELECT COALESCE(SUM(commission_amount), 0)
        FROM referral_commission_ledger
        WHERE referrer_id = v_referrer.id AND status != 'cancelled'
      )
    WHERE id = v_referrer.id;

  END LOOP;

  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
