INSERT INTO public.bank_provider_configs
  (provider_slug, provider_name, logo_url, description, is_enabled, supported_countries)
VALUES (
  'gocardless', 'GoCardless Bank Account Data',
  'https://avatars.githubusercontent.com/u/1234567',
  'Open Banking PSD2 — 2.400+ banche EU (ex Nordigen)', false,
  ARRAY['IT','FR','DE','ES','NL','BE','AT','PT','GB','SE','NO','DK','FI','IE','PL','CZ','HU','SK','SI','HR','RO','BG','EE','LV','LT']
) ON CONFLICT (provider_slug) DO NOTHING;
