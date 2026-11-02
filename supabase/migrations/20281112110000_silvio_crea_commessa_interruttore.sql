-- «Crea con Silvio»: l'interruttore per azienda (31/10/2026, fase 1, lotto 1.5).
-- Vedi docs/piano-silvio-commessa-ai.md, sezione 6: ogni fase si accende prima su Demo 2,
-- poi su 2 aziende pilota, poi per tutti, e si spegne in un clic.
--
-- - La chiave `silvio_crea_commessa` nasce spenta per tutti (default false, nessun piano):
--   non è un modulo in vendita, è un rilascio progressivo.
-- - Un override la accende per Demo Azienda 2. Per le aziende pilota basta un override
--   (scheda azienda → Funzionalità), senza migrazioni.
-- - Il client (useCreaConSilvioAttivo) NON si fida del passe-partout di useFeatureAccess per
--   demo e super admin: vale solo quello che dice il database (e Demo 2 per id).
--
-- Richiede 20281112100000 (commessa_bozze e RPC): applicarle insieme, in quest'ordine.
-- IDEMPOTENTE. NON APPLICATA: va applicata con apply_migration e riallineata prima del push.

insert into public.platform_feature_flags
  (key, name, description, category, is_beta, default_value, plans_included, icon, sort_order)
select 'silvio_crea_commessa',
       'Crea la commessa con Silvio',
       'Popup in cui si carica preventivo, contratto, computo, PDF, foto o vocale: Silvio compone la commessa con fasi, rate e date, e la crea in una transazione.',
       coalesce((select category from public.platform_feature_flags where key = 'ai_agents_internal'), 'beta'),
       true, false, '{}'::text[], 'Sparkles', 900
on conflict (key) do update set
  name        = excluded.name,
  description = excluded.description,
  is_beta     = excluded.is_beta;

insert into public.company_feature_overrides
       (company_id, feature_key, access_level, is_enabled, override_reason, notes)
select c.id, 'silvio_crea_commessa', 'enabled', true,
       'Rilascio progressivo di Silvio',
       'Demo Azienda 2: prima azienda con «Crea con Silvio» (lotto 1.5, 31/10/2026).'
  from public.companies c
 where c.id = 'd2000000-0000-4000-a000-000000000002'::uuid
on conflict (company_id, feature_key) do nothing;
