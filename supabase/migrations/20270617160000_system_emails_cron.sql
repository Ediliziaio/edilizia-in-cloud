-- Email di sistema ritardate (cron robusto, pattern process-dunning).
-- Tabella anti-doppione + RPC che ritornano i candidati (escludendo i già inviati).
-- Usate da edge function system-emails-tick.

-- 1) Registro invii (idempotenza): un (email_key, ref_id) inviato una volta sola.
CREATE TABLE IF NOT EXISTS public.system_email_sends (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email_key  text NOT NULL,
  ref_id     text NOT NULL,
  company_id uuid,
  recipient  text,
  sent_at    timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_system_email_sends_key_ref
  ON public.system_email_sends(email_key, ref_id);

ALTER TABLE public.system_email_sends ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.system_email_sends FROM anon, authenticated;
-- Nessuna policy → tabella accessibile solo a service_role (bypassa RLS). OK: la
-- gestisce solo l'edge function di sistema.

-- 2) Candidati "setup non completato +48h": aziende create tra min e max ore fa,
--    con un admin email, SENZA nemmeno il primo cantiere (orders) e non già avvisate.
CREATE OR REPLACE FUNCTION public.system_emails_setup_incomplete_candidates(
  p_min_hours int DEFAULT 48, p_max_hours int DEFAULT 96
) RETURNS TABLE(company_id uuid, company_name text, admin_email text, admin_name text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT c.id, c.name, p.email, coalesce(NULLIF(p.first_name, ''), 'Admin')
  FROM companies c
  JOIN profiles p   ON p.company_id = c.id
  JOIN user_roles ur ON ur.user_id = p.id AND ur.role = 'company_admin'
  WHERE c.created_at <= now() - make_interval(hours => greatest(p_min_hours, 1))
    AND c.created_at >  now() - make_interval(hours => greatest(p_max_hours, p_min_hours + 1))
    AND p.email IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM orders o WHERE o.company_id = c.id)
    AND NOT EXISTS (SELECT 1 FROM system_email_sends s
                    WHERE s.email_key = 'setup_incomplete' AND s.ref_id = c.id::text)
  ORDER BY c.created_at;
$$;
REVOKE ALL ON FUNCTION public.system_emails_setup_incomplete_candidates(int,int) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.system_emails_setup_incomplete_candidates(int,int) TO service_role;

-- 3) Candidati "promemoria invito +48h": inviti admin creati tra min e max ore fa,
--    non accettati, non scaduti, non già sollecitati.
CREATE OR REPLACE FUNCTION public.system_emails_invite_reminder_candidates(
  p_min_hours int DEFAULT 48, p_max_hours int DEFAULT 96
) RETURNS TABLE(invite_id uuid, recipient_email text, inviter_name text, token text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT ai.id, ai.email,
         coalesce(NULLIF(pi.first_name, ''), pi.email, 'EdiliziaInCloud'),
         ai.token
  FROM admin_invites ai
  LEFT JOIN profiles pi ON pi.id = ai.invited_by
  WHERE ai.accepted_at IS NULL
    AND ai.expires_at > now()
    AND ai.created_at <= now() - make_interval(hours => greatest(p_min_hours, 1))
    AND ai.created_at >  now() - make_interval(hours => greatest(p_max_hours, p_min_hours + 1))
    AND NOT EXISTS (SELECT 1 FROM system_email_sends s
                    WHERE s.email_key = 'invite_reminder' AND s.ref_id = ai.id::text);
$$;
REVOKE ALL ON FUNCTION public.system_emails_invite_reminder_candidates(int,int) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.system_emails_invite_reminder_candidates(int,int) TO service_role;

-- 4) Candidati "conferma acquisto": aziende passate a status active (prima
--    attivazione a pagamento) nelle ultime p_hours, non già confermate.
--    DISTINCT ON (c.id) + dedup per company → una sola conferma per azienda.
CREATE OR REPLACE FUNCTION public.system_emails_purchase_confirmed_candidates(
  p_hours int DEFAULT 25
) RETURNS TABLE(company_id uuid, company_name text, admin_email text, admin_name text,
                plan_name text, price_monthly numeric, price_yearly numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT DISTINCT ON (c.id)
    c.id, c.name, p.email, coalesce(NULLIF(p.first_name, ''), 'Admin'),
    sp.name, sp.price_monthly, sp.price_yearly
  FROM subscription_logs sl
  JOIN companies c   ON c.id = sl.company_id
  JOIN profiles p    ON p.company_id = c.id
  JOIN user_roles ur ON ur.user_id = p.id AND ur.role = 'company_admin'
  LEFT JOIN subscription_plans sp ON sp.id = coalesce(sl.plan_id, c.subscription_plan_id)
  WHERE sl.new_status = 'active' AND coalesce(sl.old_status, '') <> 'active'
    AND sl.created_at > now() - make_interval(hours => greatest(p_hours, 1))
    AND p.email IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM system_email_sends s
                    WHERE s.email_key = 'purchase_confirmed' AND s.ref_id = c.id::text)
  ORDER BY c.id, sl.created_at DESC;
$$;
REVOKE ALL ON FUNCTION public.system_emails_purchase_confirmed_candidates(int) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.system_emails_purchase_confirmed_candidates(int) TO service_role;
