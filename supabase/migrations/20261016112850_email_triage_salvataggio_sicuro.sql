SET LOCAL lock_timeout = '500ms';
SET LOCAL statement_timeout = '3s';

-- La categoria esiste già nel classificatore pubblicato. Nessun dato email riscritto.
ALTER TABLE public.email_inbox DROP CONSTRAINT email_inbox_ai_category_check;
ALTER TABLE public.email_inbox ADD CONSTRAINT email_inbox_ai_category_check CHECK
  (ai_category IN ('lead','preventivo','cliente_esistente','fornitore','fattura',
   'pratica_amministrativa','support','newsletter','spam','altro','pending'));
ALTER TABLE public.email_inbox
  ADD COLUMN ai_triage_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN ai_triage_claimed_at timestamptz,
  ADD COLUMN ai_triage_retry_at timestamptz;

-- Lease atomica: due worker non pagano due analisi per la stessa email.
-- Nessun lock di sessione mantenuto durante chiamate HTTP/AI.
CREATE FUNCTION public.claim_email_triage(p_email_id uuid, p_company_id uuid)
RETURNS integer LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  UPDATE public.email_inbox SET
    ai_triage_attempts = ai_triage_attempts + 1,
    ai_triage_claimed_at = now(), ai_triage_retry_at = NULL
  WHERE id = p_email_id AND company_id = p_company_id AND status = 'new'
    AND ai_processed_at IS NULL AND ai_triage_attempts < 3
    AND (ai_triage_retry_at IS NULL OR ai_triage_retry_at <= now())
    AND (ai_triage_claimed_at IS NULL OR ai_triage_claimed_at < now()-interval '10 minutes')
  RETURNING ai_triage_attempts;
$$;
REVOKE ALL ON FUNCTION public.claim_email_triage(uuid,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_email_triage(uuid,uuid) TO service_role;
