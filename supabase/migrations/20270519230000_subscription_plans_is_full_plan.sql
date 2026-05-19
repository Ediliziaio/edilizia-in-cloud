-- ─────────────────────────────────────────────────────────────────────────────
-- subscription_plans.is_full_plan
-- ─────────────────────────────────────────────────────────────────────────────
-- Storico: CompanyLayout.tsx cablava `FULL_PLAN_SLUGS = {starter,pro,enterprise}`
-- per decidere isLimitedPlan + DEMO badge. Aggiungere un piano "premium" o
-- "team" significava deploy frontend per non vederlo trattato come limited.
--
-- Soluzione: spostare la verità sul DB. Il client legge `is_full_plan` se
-- presente, altrimenti fa fallback al check di slug (backward compat — il
-- frontend funziona prima E dopo questa migration).
--
-- Idempotente: la colonna viene creata solo se non esiste.

ALTER TABLE public.subscription_plans
  ADD COLUMN IF NOT EXISTS is_full_plan boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.subscription_plans.is_full_plan IS
  'Se true, il piano abilita TUTTI i moduli core: il client non mostra badge DEMO sui moduli non in included_modules. Default false per piani limited/trial/scopri/custom. Sostituisce il FULL_PLAN_SLUGS hardcoded lato client.';

-- Popola lo storico in base allo slug (sorgente di verità precedente).
-- Sicuro da rieseguire: l'UPDATE è idempotente.
UPDATE public.subscription_plans
   SET is_full_plan = true
 WHERE slug IN ('starter', 'pro', 'enterprise')
   AND is_full_plan IS DISTINCT FROM true;

-- Index parziale: queries client e admin filtrano spesso per "piani full"
-- (es. dashboard distribuzione clienti per tier). Trascurabile su tabella
-- piccola ma evita scan sequenziale quando crescerà.
CREATE INDEX IF NOT EXISTS subscription_plans_is_full_plan_idx
  ON public.subscription_plans (is_full_plan)
  WHERE is_full_plan = true;
