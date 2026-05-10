-- ════════════════════════════════════════════════════════════════════════════
-- GAP 7 — Apply Email Triage Inbox schema (paste-and-run)
-- Generato 2026-05-10T08:34:45Z — versione INLINED (no \i, no psql)
-- Da incollare nel SQL Editor di Supabase Studio (project rsbrguhkodgnqfomrevo)
-- ════════════════════════════════════════════════════════════════════════════

-- ════════════════════════════════════════════════════════════════════════════
-- GAP 7 (Email Triage AI) — Inbox tabella + RLS
-- ────────────────────────────────────────────────────────────────────────────
-- Tabella per email ricevute via webhook (Resend/Mailgun/Postmark inbound,
-- o forward manuale). L'edge function `email-triage-ai` classifica ogni
-- email + estrae azioni e popola i campi ai_*.
--
-- Setup esterno (per l'utente):
--   1. Configurare forwarding email aziendale verso indirizzo dedicato
--      (es. info@ediliziaincloud.it → forward a triage@inbound.ediliziaincloud.it)
--   2. Su Resend/Mailgun creare inbound webhook che POSTa a
--      /functions/v1/email-triage-ai con il payload email
--   3. L'edge function decodifica, salva qui, classifica via AI
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── 1) Tabella email_inbox ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.email_inbox (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  -- Email metadata
  message_id      text,                -- header Message-ID per dedup
  from_email      text NOT NULL,
  from_name       text,
  to_email        text NOT NULL,       -- indirizzo del tenant (per multi-tenant routing)
  subject         text,
  received_at     timestamptz NOT NULL DEFAULT now(),
  raw_text        text,                 -- body plain
  raw_html        text,                 -- body HTML
  attachments     jsonb DEFAULT '[]'::jsonb,  -- [{filename, mime, url}]
  -- AI classification (popolato dopo triage)
  ai_category     text CHECK (ai_category IN (
    'lead', 'cliente_esistente', 'fornitore', 'fattura',
    'pratica_amministrativa', 'spam', 'altro', 'pending'
  )) DEFAULT 'pending',
  ai_priority     text CHECK (ai_priority IN ('alta', 'media', 'bassa', 'nessuna')) DEFAULT 'nessuna',
  ai_summary      text,                 -- 1 frase
  ai_extracted    jsonb DEFAULT '{}'::jsonb,  -- {nome, telefono, indirizzo, importo, scadenza, ...}
  ai_suggested_action text,             -- es. "crea_lead_da_email", "fattura_da_caricare"
  ai_action_proposal_id uuid REFERENCES public.ai_action_proposals(id) ON DELETE SET NULL,
  ai_processed_at timestamptz,
  ai_error        text,
  -- Stato gestione
  status          text NOT NULL DEFAULT 'new' CHECK (status IN (
    'new', 'triaged', 'actioned', 'archived', 'spam'
  )),
  matched_contact_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  matched_order_id   uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- Dedup naturale: stesso message_id non viene salvato due volte
CREATE UNIQUE INDEX IF NOT EXISTS idx_email_inbox_message_id
  ON public.email_inbox (company_id, message_id)
  WHERE message_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_email_inbox_company_received
  ON public.email_inbox (company_id, received_at DESC);

CREATE INDEX IF NOT EXISTS idx_email_inbox_pending
  ON public.email_inbox (company_id, status)
  WHERE status IN ('new', 'triaged');

-- Trigger updated_at
CREATE OR REPLACE FUNCTION public.tg_email_inbox_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS trg_email_inbox_updated_at ON public.email_inbox;
CREATE TRIGGER trg_email_inbox_updated_at
  BEFORE UPDATE ON public.email_inbox
  FOR EACH ROW EXECUTE FUNCTION public.tg_email_inbox_updated_at();

-- ─── 2) RLS multi-tenant ────────────────────────────────────────────────────
ALTER TABLE public.email_inbox ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS email_inbox_company_read ON public.email_inbox;
CREATE POLICY email_inbox_company_read ON public.email_inbox
  FOR SELECT TO authenticated
  USING (company_id = public.get_effective_company_id());

DROP POLICY IF EXISTS email_inbox_company_update ON public.email_inbox;
CREATE POLICY email_inbox_company_update ON public.email_inbox
  FOR UPDATE TO authenticated
  USING (company_id = public.get_effective_company_id())
  WITH CHECK (company_id = public.get_effective_company_id());

DROP POLICY IF EXISTS email_inbox_service_all ON public.email_inbox;
CREATE POLICY email_inbox_service_all ON public.email_inbox
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Super_admin bypass (per supporto + debugging)
DROP POLICY IF EXISTS email_inbox_super_admin ON public.email_inbox;
CREATE POLICY email_inbox_super_admin ON public.email_inbox
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::public.app_role));

-- ─── 3) View counter pending per badge ──────────────────────────────────────
CREATE OR REPLACE VIEW public.v_email_inbox_pending_count AS
SELECT
  company_id,
  COUNT(*) FILTER (WHERE status = 'new')      AS new_count,
  COUNT(*) FILTER (WHERE ai_priority = 'alta' AND status IN ('new','triaged')) AS high_priority_count,
  MAX(received_at)                            AS last_received_at
FROM public.email_inbox
GROUP BY company_id;

GRANT SELECT ON public.v_email_inbox_pending_count TO authenticated;

COMMIT;

-- ─── Verifica ───────────────────────────────────────────────────────────
SELECT
  EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='email_inbox') AS table_ok,
  EXISTS (SELECT 1 FROM information_schema.views WHERE table_schema='public' AND table_name='v_email_inbox_pending_count') AS view_ok,
  (SELECT COUNT(*)::int FROM information_schema.columns WHERE table_name='email_inbox' AND column_name LIKE 'ai_%') AS ai_cols_count;

-- ─── Setup successivo (opzionale, per attivare l'ingest webhook) ────────
-- 1. Aggiungi colonna inbound_email_address su companies se non esiste:
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS inbound_email_address text;

-- 2. Per ogni azienda che vuole ricevere email triage, setta l'address:
-- UPDATE public.companies SET inbound_email_address = 'triage+nomeXXX@inbound.tuodominio.it' WHERE slug = '...';

-- 3. Setta secret per webhook ingest in Supabase Dashboard → Edge Functions →
--    Secrets → INBOUND_EMAIL_SECRET = 'random_string'

-- 4. Configura inbound webhook su Resend/Mailgun/Postmark:
--    POST https://rsbrguhkodgnqfomrevo.supabase.co/functions/v1/email-triage-ai
--    headers: { x-inbound-secret: <stesso secret> }
--    body: payload email del provider (compatibile auto)
