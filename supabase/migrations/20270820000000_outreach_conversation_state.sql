-- ── Outreach · Stato conversazione (SNOOZE / Posticipa) ──────────────────────
-- Posticipa una conversazione cold dell'inbox "Posta": fino a `snoozed_until`
-- esce dalle viste Tutte/Non lette/Interessati e compare solo sotto il filtro
-- "Posticipate"; passata l'ora riappare normalmente (nessun job: il confronto
-- snoozed_until > now() avviene a query-time lato hook). Una riga per
-- (company_id, contact_id): lo stato è per conversazione = per contatto.
--
-- NB: l'Outreach Engine gira sulla company di piattaforma (super_admin); non
-- esiste una tabella task/promemoria adatta a questo scope (silvio_reminders è
-- company-scoped via get_my_company_id()), perciò lo snooze stesso funge da
-- promemoria. RLS allineata alle altre tabelle outreach_* (super_admin pieno
-- controllo dalla console, service_role per cron/edge). Idempotente.

CREATE TABLE IF NOT EXISTS public.outreach_conversation_state (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id     uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  contact_id     uuid NOT NULL REFERENCES public.marketing_contacts(id) ON DELETE CASCADE,
  snoozed_until  timestamptz,
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT outreach_conversation_state_unique UNIQUE (company_id, contact_id)
);

-- Lookup del filtro "Posticipate": conversazioni ancora posticipate per azienda.
CREATE INDEX IF NOT EXISTS idx_outreach_conv_state_snoozed
  ON public.outreach_conversation_state (company_id, snoozed_until)
  WHERE snoozed_until IS NOT NULL;

ALTER TABLE public.outreach_conversation_state ENABLE ROW LEVEL SECURITY;

-- super_admin: pieno controllo dalla console; service_role: cron/edge.
-- Stesso pattern delle altre tabelle outreach_* (guard idempotente con DROP IF EXISTS).
DO $$
BEGIN
  EXECUTE 'DROP POLICY IF EXISTS outreach_conversation_state_super ON public.outreach_conversation_state';
  EXECUTE 'CREATE POLICY outreach_conversation_state_super ON public.outreach_conversation_state FOR ALL TO authenticated USING (public.is_super_admin()) WITH CHECK (public.is_super_admin())';
  EXECUTE 'DROP POLICY IF EXISTS outreach_conversation_state_service ON public.outreach_conversation_state';
  EXECUTE 'CREATE POLICY outreach_conversation_state_service ON public.outreach_conversation_state FOR ALL TO service_role USING (true) WITH CHECK (true)';
END $$;
