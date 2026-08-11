-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.

CREATE TABLE IF NOT EXISTS public.outreach_conversation_state (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id     uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  contact_id     uuid NOT NULL REFERENCES public.marketing_contacts(id) ON DELETE CASCADE,
  snoozed_until  timestamptz,
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT outreach_conversation_state_unique UNIQUE (company_id, contact_id)
);

CREATE INDEX IF NOT EXISTS idx_outreach_conv_state_snoozed
  ON public.outreach_conversation_state (company_id, snoozed_until)
  WHERE snoozed_until IS NOT NULL;

ALTER TABLE public.outreach_conversation_state ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  EXECUTE 'DROP POLICY IF EXISTS outreach_conversation_state_super ON public.outreach_conversation_state';
  EXECUTE 'CREATE POLICY outreach_conversation_state_super ON public.outreach_conversation_state FOR ALL TO authenticated USING (public.is_super_admin()) WITH CHECK (public.is_super_admin())';
  EXECUTE 'DROP POLICY IF EXISTS outreach_conversation_state_service ON public.outreach_conversation_state';
  EXECUTE 'CREATE POLICY outreach_conversation_state_service ON public.outreach_conversation_state FOR ALL TO service_role USING (true) WITH CHECK (true)';
END $$;
