-- Registra il modulo verticale "Elettrico / Domotica" nel catalogo platform_feature_flags.
-- Categoria modulo_vendita. default false: attivazione per-azienda via override.
-- ADDITIVA/IDEMPOTENTE. LOCALE: applicata in pubblicazione.
INSERT INTO public.platform_feature_flags
  (key, name, description, category, is_beta, default_value, plans_included, icon, sort_order, price_per_month)
VALUES
  ('modulo_elettrico_attivo',
   'Elettrico / Domotica',
   'Preventivatore impianti elettrici e domotica: quadro, punti luce/presa, linee, building automation — computo metrico e incentivi.',
   'modulo_vendita', true, false,
   '{pro,enterprise}'::text[],
   'Zap', 107, 149)
ON CONFLICT (key) DO UPDATE SET
  name            = EXCLUDED.name,
  description     = EXCLUDED.description,
  category        = EXCLUDED.category,
  is_beta         = EXCLUDED.is_beta,
  plans_included  = EXCLUDED.plans_included,
  icon            = EXCLUDED.icon,
  sort_order      = EXCLUDED.sort_order,
  price_per_month = EXCLUDED.price_per_month;
