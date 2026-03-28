-- Convert existing messaging_beta_enabled = true to overrides
INSERT INTO public.company_feature_overrides (company_id, feature_key, is_enabled, override_reason)
SELECT id, 'messaging_beta', true, 'Migrato da messaging_beta_enabled'
FROM public.companies
WHERE messaging_beta_enabled = true;
