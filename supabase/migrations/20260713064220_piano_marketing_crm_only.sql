-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.

-- ═══ Piano Marketing ═══════════════════════════════════════════════════════
-- Piano azienda "solo CRM + Marketing + Automazioni AI":
--   • included_modules = [] → nessun modulo gestionale (commesse, magazzino,
--     clienti operativi, calendario operativo, assistenza, previsionale/costi)
--   • is_full_plan = true → i moduli non inclusi sono NASCOSTI davvero
--     (con false sarebbero visibili in modalità DEMO/upsell)
--   • plan_feature_defaults sotto spegne fiscalità/cantieri/preventivi
-- Prezzo 97 €/mese = placeholder modificabile da /admin (piani).

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
