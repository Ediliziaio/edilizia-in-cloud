-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.

-- Piano Marketing = gratuito: regalato dal gestore ai suoi clienti marketing.
-- Niente trial (parte subito "free"); l'upsell a un piano pieno si fa da /admin.
update public.subscription_plans
set price_monthly = 0, price_yearly = 0, trial_days = 0
where slug = 'marketing';
