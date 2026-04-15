-- ════════════════════════════════════════════════════════════════
-- FIX: abilita di default il feature flag 'dashboard_builder_v1'
--
-- BUG: la flag era seedata con default_value = false quindi nessuna
-- azienda poteva accedere a /azienda/dashboards senza override manuale
-- dell'admin di piattaforma. Tutte le 3 dashboard predefinite risultavano
-- irraggiungibili → il sistema builder era di fatto disattivato lato utente.
--
-- Il flag resta `is_beta = true` (badge "Beta" in UI) ma è ora ATTIVO di
-- default per tutte le aziende; admin di piattaforma possono comunque
-- disabilitarlo via company_feature_overrides se serve.
-- ════════════════════════════════════════════════════════════════

UPDATE public.platform_feature_flags
SET default_value = true
WHERE key = 'dashboard_builder_v1';
