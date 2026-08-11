-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.

-- Iscrizioni webhook PER PAGINA Meta: l'azione subscribe-webhook (e il nuovo
-- self-healing di meta-health-check) tracciano l'iscrizione leadgen di ogni
-- pagina. Lo schema originale non aveva page_id → l'upsert non ha mai potuto
-- funzionare e nessuna pagina è mai stata iscritta (lead solo via backfill).
alter table public.integration_webhook_subscriptions
  add column if not exists page_id text,
  add column if not exists subscribed_fields jsonb,
  add column if not exists subscribed_at timestamptz;

create unique index if not exists integration_webhook_subscriptions_integration_page_key
  on public.integration_webhook_subscriptions (integration_id, page_id);
