# MP-PRICE-01 — plan_ai_budgets + view consumo + alert

## 🎯 Obiettivo
Introdurre cap dinamici per piano sull'AI con soft/hard cap, downgrade automatico
modelli al soft cap, top-up obbligatorio all'hard cap, PAYG packages.

## 📦 Context
- **Branch**: `feat/mp-price-01-plan-budgets`
- **Dipendenze**: nessuna (base per MP-PRICE-02 routing dinamico + MP-PRICE-03 UI)
- **Esistente**:
  - `ai_call_ledger` (audit trail)
  - `consume_credits()` (wallet unificato)
  - `pricing_v4_complete` (schema pricing)
  - WhatsApp budget soft/hard (esempio buono in `whatsapp-ai-processor/budget.ts`)

## 📐 Architettura Target

```
┌─────────────────────────────────┐
│ plan_ai_budgets (config)        │
│ - plan_key (PK)                 │
│ - monthly_budget_eur            │
│ - soft_cap_pct / hard_cap_pct   │
│ - on_soft_cap behavior          │
│ - on_hard_cap behavior          │
│ - payg_packages                 │
└──────┬──────────────────────────┘
       │ join via companies.plan_key
       ▼
┌──────────────────────────────────┐
│ ai_call_ledger (esistente)       │
│ - company_id                     │
│ - cost_billed_eur                │
└──────┬───────────────────────────┘
       │ aggrega
       ▼
┌──────────────────────────────────┐
│ company_ai_usage_month VIEW      │
│ - usage_pct calcolato            │
│ - alert se > soft/hard           │
└──────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────┐
│ aiRouter precheck (MP-PRICE-02)  │
│ - downgrade modello a soft       │
│ - block o auto-charge a hard     │
└──────────────────────────────────┘
```

## 🛠️ Implementazione

### Step 1 — Schema plan_ai_budgets
File: `supabase/migrations/[timestamp]_plan_ai_budgets.sql`

```sql
CREATE TABLE IF NOT EXISTS public.plan_ai_budgets (
  plan_key            text PRIMARY KEY,
  monthly_budget_eur  numeric(10,4) NOT NULL,
  soft_cap_pct        int DEFAULT 80,
  hard_cap_pct        int DEFAULT 100,
  on_soft_cap         text DEFAULT 'downgrade_models'
                      CHECK (on_soft_cap IN ('downgrade_models','notify_only','block')),
  fallback_model_tier text DEFAULT 'standard',
  on_hard_cap         text DEFAULT 'require_topup'
                      CHECK (on_hard_cap IN ('require_topup','block','auto_charge')),
  payg_enabled        boolean DEFAULT true,
  payg_packages       jsonb DEFAULT '[
    {"price_eur": 29, "credits_eur": 29, "bonus_pct": 5},
    {"price_eur": 79, "credits_eur": 82, "bonus_pct": 4},
    {"price_eur": 199, "credits_eur": 215, "bonus_pct": 8}
  ]'::jsonb,
  updated_at timestamptz DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id)
);

INSERT INTO public.plan_ai_budgets
  (plan_key, monthly_budget_eur, soft_cap_pct, hard_cap_pct, on_soft_cap, fallback_model_tier, on_hard_cap)
VALUES
  ('pro',        5,   80, 100, 'downgrade_models', 'standard', 'require_topup'),
  ('plus',       40,  80, 100, 'downgrade_models', 'standard', 'require_topup'),
  ('premium',    150, 90, 110, 'notify_only',      'standard', 'auto_charge'),
  ('enterprise', 500, 95, 200, 'notify_only',      'advanced', 'auto_charge')
ON CONFLICT (plan_key) DO UPDATE
  SET monthly_budget_eur = EXCLUDED.monthly_budget_eur,
      soft_cap_pct = EXCLUDED.soft_cap_pct,
      hard_cap_pct = EXCLUDED.hard_cap_pct;

ALTER TABLE public.plan_ai_budgets ENABLE ROW LEVEL SECURITY;
CREATE POLICY plan_ai_budgets_read ON public.plan_ai_budgets FOR SELECT USING (true);
CREATE POLICY plan_ai_budgets_admin ON public.plan_ai_budgets FOR ALL
  USING (public.has_role(auth.uid(), 'super_admin'::public.app_role));

-- View consumo mensile per company
CREATE OR REPLACE VIEW public.company_ai_usage_month AS
SELECT
  l.company_id,
  c.plan_key,
  pb.monthly_budget_eur,
  pb.soft_cap_pct,
  pb.hard_cap_pct,
  date_trunc('month', l.created_at) as usage_month,
  SUM(l.cost_billed_eur) as total_billed_eur,
  SUM(l.cost_real_eur)   as total_real_eur,
  SUM(l.margin_eur)      as total_margin_eur,
  COUNT(*)               as call_count,
  ROUND((SUM(l.cost_billed_eur) / NULLIF(pb.monthly_budget_eur, 0) * 100)::numeric, 2) as usage_pct,
  CASE
    WHEN pb.monthly_budget_eur IS NULL THEN 'no_budget'
    WHEN SUM(l.cost_billed_eur) / NULLIF(pb.monthly_budget_eur, 0) * 100 >= pb.hard_cap_pct THEN 'hard_cap'
    WHEN SUM(l.cost_billed_eur) / NULLIF(pb.monthly_budget_eur, 0) * 100 >= pb.soft_cap_pct THEN 'soft_cap'
    ELSE 'ok'
  END as cap_status
FROM public.ai_call_ledger l
JOIN public.companies c ON c.id = l.company_id
LEFT JOIN public.plan_ai_budgets pb ON pb.plan_key = c.plan_key
WHERE l.status = 'success'
GROUP BY l.company_id, c.plan_key, pb.monthly_budget_eur, pb.soft_cap_pct, pb.hard_cap_pct, date_trunc('month', l.created_at);

GRANT SELECT ON public.company_ai_usage_month TO authenticated;
```

### Step 2 — RPC checkCompanyBudget
File: `supabase/migrations/[timestamp]_check_company_budget_rpc.sql`

```sql
CREATE OR REPLACE FUNCTION public.check_company_budget(p_company_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v jsonb;
BEGIN
  SELECT jsonb_build_object(
    'plan_key', plan_key,
    'budget_eur', monthly_budget_eur,
    'used_eur', total_billed_eur,
    'usage_pct', usage_pct,
    'cap_status', cap_status,
    'soft_cap_pct', soft_cap_pct,
    'hard_cap_pct', hard_cap_pct
  ) INTO v
    FROM public.company_ai_usage_month
   WHERE company_id = p_company_id
     AND usage_month = date_trunc('month', NOW())
   LIMIT 1;
  RETURN COALESCE(v, jsonb_build_object('cap_status', 'ok', 'usage_pct', 0));
END $$;

REVOKE ALL ON FUNCTION public.check_company_budget FROM public, anon;
GRANT EXECUTE ON FUNCTION public.check_company_budget TO authenticated, service_role;
```

### Step 3 — Estensione aiRouter (precheck) [vedi MP-PRICE-02]
Lasciato a MP-PRICE-02 per scope contenuto.

### Step 4 — Edge function alert
File: `supabase/functions/check-ai-usage-alerts/index.ts`

Cron giornaliero che notifica via email/whatsapp/in_app a 50/80/100% di consumo.

## ✅ Acceptance Criteria
- [ ] Schema `plan_ai_budgets` con 4 piani seedati
- [ ] View `company_ai_usage_month` funzionante con `cap_status`
- [ ] RPC `check_company_budget(company_id)` ritorna jsonb stabile
- [ ] Edge function check-ai-usage-alerts (cron daily)
- [ ] RLS: read public, write only super_admin
- [ ] TypeScript 0 errori

## 🔗 Risorse
- Doc fonte: `EiC-Verticali-BrainAEDIX-PricingAI.md` (PARTE 3)
