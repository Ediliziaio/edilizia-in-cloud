-- ============================================================
-- PIANO SCOPRI — Free Discovery Plan
-- Non è un trial: non scade mai, utenti illimitati, 3 commesse
-- ============================================================

-- ─── 1. Aggiungi 'free' al CHECK del company status ──────────
ALTER TABLE public.companies
  DROP CONSTRAINT IF EXISTS companies_status_check;

ALTER TABLE public.companies
  ADD CONSTRAINT companies_status_check
  CHECK (status IN ('trial', 'active', 'suspended', 'expired', 'free'));

-- ─── 2. Piano Scopri in subscription_plans ───────────────────
INSERT INTO public.subscription_plans (
  name, slug, description,
  price_monthly, price_yearly,
  max_orders, max_users, max_storage_mb,
  trial_days, features, is_active, position
)
VALUES (
  'Scopri',
  'scopri',
  'Inizia gratis, senza carta. Tocca con mano EiC senza limiti di tempo. Fino a 3 cantieri attivi, preventivi con firma online, app operai GPS. Aggiorna quando sei pronto.',
  0, 0,
  3,           -- 3 commesse attive massimo
  -1,          -- utenti ILLIMITATI
  1024,        -- 1 GB storage
  0,           -- 0 = non scade mai
  '[
    "Fino a 3 cantieri attivi con SAL e marginalità reale",
    "1 preventivo digitale con firma online del cliente",
    "App operai mobile: timbratura GPS + rapportino giornaliero",
    "2 operai sull''app campo (Starter = illimitati)",
    "Prima Nota base (max 10 registrazioni)",
    "Dashboard cantieri con salute operativa",
    "Utenti illimitati",
    "1 GB storage",
    "Nessuna carta richiesta · nessuna scadenza"
  ]'::jsonb,
  true,
  0
)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  price_monthly = EXCLUDED.price_monthly,
  price_yearly = EXCLUDED.price_yearly,
  max_orders = EXCLUDED.max_orders,
  max_users = EXCLUDED.max_users,
  max_storage_mb = EXCLUDED.max_storage_mb,
  trial_days = EXCLUDED.trial_days,
  features = EXCLUDED.features,
  is_active = EXCLUDED.is_active,
  position = EXCLUDED.position;

-- Sposta gli altri piani a position 1, 2, 3
UPDATE public.subscription_plans SET position = 1 WHERE slug = 'starter';
UPDATE public.subscription_plans SET position = 2 WHERE slug = 'pro';
UPDATE public.subscription_plans SET position = 3 WHERE slug = 'enterprise';

-- ─── 3. Moduli inclusi nel piano Scopri ──────────────────────
UPDATE public.subscription_plans
SET included_modules = '["orders", "customers"]'::jsonb
WHERE slug = 'scopri';

-- ─── 4. Funzione helper: is_scopri_plan ──────────────────────
CREATE OR REPLACE FUNCTION public.is_scopri_plan(p_company_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.company_subscriptions cs
    JOIN public.subscription_plans sp ON sp.id = cs.plan_id
    WHERE cs.company_id = p_company_id
      AND sp.slug = 'scopri'
      AND cs.status NOT IN ('canceled')
  );
$$;

COMMENT ON TABLE public.subscription_plans IS
  'Piani EiC: Scopri €0 (pos 0) · Starter €127 (pos 1) · Pro €247 (pos 2) · Enterprise €547 (pos 3). Scopri: non scade, max 3 ordini, utenti illimitati.';
