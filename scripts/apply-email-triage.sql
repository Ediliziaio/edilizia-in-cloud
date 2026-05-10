-- ════════════════════════════════════════════════════════════════════════════
-- GAP 7 — Apply Email Triage schema
-- ────────────────────────────────────────────────────────────────────────────
-- Da incollare nel SQL Editor di Supabase Studio (project rsbrguhkodgnqfomrevo)
--
-- Effetti:
--   - Tabella email_inbox (RLS multi-tenant + super_admin bypass)
--   - VIEW v_email_inbox_pending_count (per badge counter)
--   - Trigger updated_at
-- ════════════════════════════════════════════════════════════════════════════

\i supabase/migrations/20260510030000_email_triage_inbox.sql

-- Verifica
SELECT
  EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='email_inbox') AS table_ok,
  EXISTS (SELECT 1 FROM information_schema.views WHERE table_schema='public' AND table_name='v_email_inbox_pending_count') AS view_ok,
  (SELECT COUNT(*)::int FROM information_schema.columns WHERE table_name='email_inbox' AND column_name LIKE 'ai_%') AS ai_cols_count;

-- ─── Setup successivo (opzionale, per attivare l'ingest) ────────────────────
-- 1. Aggiungi colonna inbound_email_address su companies se non esiste:
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS inbound_email_address text;

-- 2. Per ogni azienda che vuole ricevere email triage, setta l'address:
-- UPDATE public.companies SET inbound_email_address = 'triage+nomeXXX@inbound.tuodominio.it' WHERE slug = '...';

-- 3. Setta secret per webhook ingest:
-- ALTER DATABASE postgres SET app.inbound_email_secret = 'random_string_qui';
-- E lo stesso valore in Supabase Dashboard → Edge Functions → Secrets → INBOUND_EMAIL_SECRET

-- 4. Configura inbound webhook su Resend/Mailgun/Postmark:
--    POST https://rsbrguhkodgnqfomrevo.supabase.co/functions/v1/email-triage-ai
--    headers: { x-inbound-secret: <stesso secret> }
--    body: payload email del provider (compatibile auto)
