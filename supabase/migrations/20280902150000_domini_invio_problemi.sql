-- Verifica SPF/DKIM/DMARC v2: oltre a "c'è / non c'è" si salvano stato
-- (ok|assente|errato|debole) e problemi trovati per record, più il provider
-- di posta dedotto dagli MX. Idempotente.
alter table public.domini_invio
  add column if not exists spf_stato text,
  add column if not exists dkim_stato text,
  add column if not exists dmarc_stato text,
  add column if not exists provider_posta text,
  add column if not exists problemi jsonb not null default '[]'::jsonb;
