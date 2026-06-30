-- Collega i piani SaaS ai Price di Stripe (LIVE) creati nella dashboard il
-- 2026-06-30. Senza questi ID il bottone "Genera Link Pagamento" dava errore
-- ("Nessun prezzo Stripe configurato"). Idempotente (UPDATE per id).
--
-- Scopri ha solo il prezzo mensile a €0 (demo): stripe_price_yearly_id resta NULL.

-- Scopri (demo €0)
UPDATE public.subscription_plans SET
  stripe_product_id       = 'prod_UnW6TxV8VAZXeP',
  stripe_price_monthly_id = 'price_1Tnv4aLkeFsw7yTqVNGXj6QQ'
WHERE id = '3b7bc74a-b047-46ea-a4c0-ea0eb5077086';

-- Starter (€127 / €1.188)
UPDATE public.subscription_plans SET
  stripe_product_id       = 'prod_UnW9bFI1FpBc3u',
  stripe_price_monthly_id = 'price_1Tnv6rLkeFsw7yTqE3S2GBGM',
  stripe_price_yearly_id  = 'price_1Tnv6rLkeFsw7yTqUptlxRhq'
WHERE id = 'e2805db3-6852-4335-8398-db24e57c1672';

-- Pro (€247 / €2.364)
UPDATE public.subscription_plans SET
  stripe_product_id       = 'prod_UnW9y0gJxCgiJa',
  stripe_price_monthly_id = 'price_1Tnv7ZLkeFsw7yTqlEMtqg3y',
  stripe_price_yearly_id  = 'price_1Tnv8TLkeFsw7yTqFvdZ3chc'
WHERE id = '60ba7938-55ef-4cb4-99ee-3b80f68226e5';

-- Enterprise (€547 / €5.244)
UPDATE public.subscription_plans SET
  stripe_product_id       = 'prod_UnWD699oVTV0fL',
  stripe_price_monthly_id = 'price_1TnvB3LkeFsw7yTqnGhypBuq',
  stripe_price_yearly_id  = 'price_1TnvOBLkeFsw7yTqgeYzX4zD'
WHERE id = '97206ca0-e681-4d89-a7ea-af1fdaae3fe0';
