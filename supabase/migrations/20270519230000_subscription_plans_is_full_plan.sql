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

-- Recovered Marketing-plan initialization, after full-plan and preview dependencies exist.
-- Creates plan metadata only; does not subscribe any company or activate a paid service.
insert into public.subscription_plans
  (name, slug, description, price_monthly, price_yearly, max_orders, max_users,
   features, is_active, position, included_modules, trial_days, is_full_plan)
select
  'Marketing', 'marketing',
  'CRM, Marketing e Automazioni AI — senza gestionale operativo e senza preventivi',
  97, 970, 0, -1, '[]'::jsonb, true, 4, '[]'::jsonb, 31, true
where not exists (select 1 from public.subscription_plans where slug = 'marketing');

-- Flag dedicato ai preventivi CRM: prima erano gated solo da crm_modulo, quindi
-- impossibile spegnerli senza spegnere tutto il CRM. default_value=true →
-- nessun piano/azienda esistente perde nulla.
insert into public.platform_feature_flags
  (key, name, description, category, default_value, plans_included, sort_order)
select
  'preventivi_crm', 'Preventivi CRM',
  'Hub preventivi nel CRM (lista, builder, moduli vendita). Separato da crm_modulo per poterlo disattivare nel Piano Marketing.',
  'marketing', true, '{}'::text[], 0
where not exists (select 1 from public.platform_feature_flags where key = 'preventivi_crm');

-- Default per-piano: tutto ciò che non è CRM/Marketing/Automazioni è spento.
-- (I flag già default false — hr, render, moduli vendita, appaltatori — non
-- servono qui: restano spenti da soli.)
insert into public.plan_feature_defaults (plan_id, feature_key, is_enabled, access_level, notes)
select p.id, f.key, false, 'disabled'::feature_access_level,
  'Piano Marketing: solo CRM, Marketing e Automazioni AI'
from public.subscription_plans p
cross join unnest(array[
  'preventivi_crm','ai_preventivo','fv_modulo_attivo',
  'firma_fea','subappaltatori','manutenzione_modulo','cantieri_avanzati',
  'surveys_module','giornale_lavori',
  'tesoreria','prima_nota','fatturazione','documenti',
  'contabilita_fiscale','archivio_sostitutivo','ritenute_garanzia','banca_extra'
]) as f(key)
where p.slug = 'marketing'
  and not exists (
    select 1 from public.plan_feature_defaults d
    where d.plan_id = p.id and d.feature_key = f.key
  );
