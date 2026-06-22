-- Registra il modulo verticale "Termoidraulico" nel catalogo platform_feature_flags.
-- Categoria modulo_vendita. default false: attivazione per-azienda via override.
-- ADDITIVA/IDEMPOTENTE. LOCALE: applicata in pubblicazione.
INSERT INTO public.platform_feature_flags
  (key, name, description, category, is_beta, default_value, plans_included, icon, sort_order, price_per_month)
VALUES
  ('modulo_termoidraulico_attivo',
   'Termoidraulico',
   'Preventivatore impianti termoidraulici: caldaie, pompe di calore, radiatori, pannelli radianti e idrosanitario — computo metrico e incentivi.',
   'modulo_vendita', true, false,
   '{pro,enterprise}'::text[],
   'Flame', 108, 149)
ON CONFLICT (key) DO UPDATE SET
  name            = EXCLUDED.name,
  description     = EXCLUDED.description,
  category        = EXCLUDED.category,
  is_beta         = EXCLUDED.is_beta,
  plans_included  = EXCLUDED.plans_included,
  icon            = EXCLUDED.icon,
  sort_order      = EXCLUDED.sort_order,
  price_per_month = EXCLUDED.price_per_month;
