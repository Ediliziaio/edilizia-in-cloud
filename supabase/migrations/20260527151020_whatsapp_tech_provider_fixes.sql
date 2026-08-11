-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.

-- WhatsApp Tech Provider — fix incrementali (v8.6.74)
-- ============================================================================
-- Contesto: audit del modulo WhatsApp ha rivelato 4 gap operativi sul DB:
--   1. ai_whatsapp_numbers: mancano quality_rating + messaging_limit_tier
--   2. wa_routing_errors: CHECK vieta 'template_status_update'
--   3. wa_routing_errors: manca company_id
--   4. platform_settings: manca meta_webhook_verify_token
--
-- Tutti i cambi sono RETROCOMPATIBILI.
-- ============================================================================

-- ── (1) ai_whatsapp_numbers: quality_rating + messaging_limit_tier ──────────
alter table public.ai_whatsapp_numbers
  add column if not exists quality_rating text,
  add column if not exists messaging_limit_tier text;

comment on column public.ai_whatsapp_numbers.quality_rating is
  'Quality rating WhatsApp del numero (green/yellow/red/unknown). Aggiornato da whatsapp-status.';
comment on column public.ai_whatsapp_numbers.messaging_limit_tier is
  'Tier limite Meta (TIER_1K, TIER_10K, TIER_100K, TIER_UNLIMITED). Aggiornato da whatsapp-status.';

-- ── (2) wa_routing_errors: estensione CHECK per template_status_update ──────
alter table public.wa_routing_errors
  drop constraint if exists wa_routing_errors_error_kind_check;

alter table public.wa_routing_errors
  add constraint wa_routing_errors_error_kind_check
  check (error_kind = any (array[
    'unknown_phone_number_id',
    'hmac_invalid',
    'payload_malformed',
    'company_disabled',
    'purpose_not_configured',
    'agent_not_found',
    'rate_limit_exceeded',
    'template_status_update'
  ]));

-- ── (3) wa_routing_errors: nuova colonna company_id (nullable) ──────────────
alter table public.wa_routing_errors
  add column if not exists company_id uuid references public.companies(id) on delete set null;

comment on column public.wa_routing_errors.company_id is
  'Company di appartenenza. Nullable perché unknown_phone_number_id/hmac_invalid precedono lookup tenant.';

create index if not exists idx_wa_routing_errors_company_id
  on public.wa_routing_errors(company_id)
  where company_id is not null;

-- ── (4) platform_settings: meta_webhook_verify_token ─────────────────────────
-- Generato con UUID v4 random (64 char hex). Idempotente: non sovrascrive.
insert into public.platform_settings (key, value)
values (
  'meta_webhook_verify_token',
  replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')
)
on conflict (key) do nothing;
