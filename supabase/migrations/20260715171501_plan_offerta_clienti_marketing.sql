-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.

-- Nuovo piano "Offerta Clienti Marketing": identico al Pro (247€) ma a 127€/mese.
-- Clona features/limiti dal Pro così resta allineato. Non appare su /prezzi
-- (pagina hardcoded ai 4 tier), viene usato solo dal checkout in trattativa.
insert into public.subscription_plans
  (slug, name, description, price_monthly, price_yearly, max_orders, max_users, max_storage_mb, position, is_active, trial_days, features)
select
  'offerta-clienti-marketing',
  'Pro — Offerta Clienti',
  description,
  127,
  1524,           -- 127 x 12
  max_orders,
  max_users,
  max_storage_mb,
  60,             -- posizione alta: fuori dai tier principali
  true,
  0,              -- nessun trial: si paga al checkout
  features
from public.subscription_plans
where slug = 'pro'
on conflict (slug) do update set
  name = excluded.name,
  description = excluded.description,
  price_monthly = excluded.price_monthly,
  price_yearly = excluded.price_yearly,
  max_orders = excluded.max_orders,
  max_users = excluded.max_users,
  max_storage_mb = excluded.max_storage_mb,
  is_active = excluded.is_active,
  trial_days = excluded.trial_days,
  features = excluded.features;
