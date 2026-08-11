-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.

-- Reply GHL-style: ogni contatto ha un indirizzo di risposta stabile
-- r-<route_id>@<email_reply_domain> (es. replies.eic-mail.com). Le risposte
-- entrano dall'inbound Elastic Email → edge email-inbound-reply → email_inbox
-- agganciata al contatto, senza caselle collegate e in tempo reale.
-- Feature gated dal platform setting email_reply_domain (assente = spento).
BEGIN;

CREATE TABLE IF NOT EXISTS public.email_reply_routes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL REFERENCES public.marketing_contacts(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_reply_at timestamptz,
  replies_count integer NOT NULL DEFAULT 0
);

CREATE UNIQUE INDEX IF NOT EXISTS email_reply_routes_company_contact_uq
  ON public.email_reply_routes (company_id, contact_id);

ALTER TABLE public.email_reply_routes ENABLE ROW LEVEL SECURITY;

-- Lettura per i membri dell'azienda; scritture solo service-role dalle edge.
DROP POLICY IF EXISTS email_reply_routes_company_read ON public.email_reply_routes;
CREATE POLICY email_reply_routes_company_read
  ON public.email_reply_routes
  FOR SELECT TO authenticated
  USING (
    company_id IN (
      SELECT profiles.company_id FROM profiles WHERE profiles.id = (SELECT auth.uid())
      UNION
      SELECT multi_company_access.company_id FROM multi_company_access WHERE multi_company_access.user_id = (SELECT auth.uid())
    )
    OR has_role((SELECT auth.uid()), 'super_admin'::app_role)
  );

COMMIT;
