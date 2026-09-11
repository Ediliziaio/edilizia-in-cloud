-- Misura del recapito dell'outreach a freddo (audit 11/09/2026): senza pixel
-- («stile umano») la risposta è l'unico segnale vero di inbox, e il bounce
-- l'unico segnale vero di lista sporca. Prima esistevano solo contatori
-- cumulativi mai azzerati: una casella vecchia non andava mai in allarme.
-- Qui tutto è a finestra mobile di 7 giorni, per casella e per server di
-- destinazione (gruppo MX: Google, Microsoft, Aruba, Register…), attribuendo
-- risposte e bounce alla casella e al dominio dell'ULTIMO invio dell'iscrizione.
CREATE OR REPLACE FUNCTION public.outreach_recapito_7g(p_company uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_super_admin(auth.uid()) AND NOT public.is_platform_staff(auth.uid()) THEN
    RAISE EXCEPTION 'Accesso riservato allo staff di piattaforma' USING ERRCODE = '42501';
  END IF;
  RETURN (
    WITH inviate AS (
      SELECT q.id, q.sender_account_id, q.enrollment_id, q.sent_at,
             lower(split_part(q.to_email, '@', 2)) AS dom
        FROM public.outreach_send_queue q
       WHERE q.company_id = p_company AND q.status = 'sent' AND q.sent_at > now() - interval '7 days'
    ), risposte AS (
      SELECT r.enrollment_id, r.intent
        FROM public.outreach_replies r
       WHERE r.company_id = p_company AND r.received_at > now() - interval '7 days'
         AND COALESCE(r.intent, '') <> 'auto_reply'
    ), ultima AS (
      SELECT DISTINCT ON (q.enrollment_id) q.enrollment_id, q.sender_account_id,
             lower(split_part(q.to_email, '@', 2)) AS dom
        FROM public.outreach_send_queue q
       WHERE q.company_id = p_company AND q.status = 'sent' AND q.enrollment_id IS NOT NULL
       ORDER BY q.enrollment_id, q.sent_at DESC
    ), bounce AS (
      SELECT e.id AS enrollment_id
        FROM public.outreach_enrollments e
       WHERE e.company_id = p_company AND e.status = 'bounced' AND e.updated_at > now() - interval '7 days'
    ), mx AS (
      SELECT email_domain, mx_group FROM public.outreach_mx_map
    ), ris_u AS (
      SELECT u.sender_account_id, u.dom, r.intent FROM risposte r JOIN ultima u ON u.enrollment_id = r.enrollment_id
    ), bou_u AS (
      SELECT u.sender_account_id, u.dom FROM bounce b JOIN ultima u ON u.enrollment_id = b.enrollment_id
    )
    SELECT jsonb_build_object(
      'per_casella', (
        SELECT COALESCE(jsonb_agg(x ORDER BY x.inviate DESC, x.email), '[]'::jsonb) FROM (
          SELECT a.id, a.email, a.status, a.last_sent_at,
                 (SELECT count(*) FROM inviate i WHERE i.sender_account_id = a.id) AS inviate,
                 (SELECT count(*) FROM ris_u r WHERE r.sender_account_id = a.id) AS risposte,
                 (SELECT count(*) FROM ris_u r WHERE r.sender_account_id = a.id AND r.intent IN ('interested', 'question')) AS positive,
                 (SELECT count(*) FROM bou_u b WHERE b.sender_account_id = a.id) AS bounce
            FROM public.outreach_sender_accounts a
           WHERE a.company_id = p_company
        ) x),
      'per_gruppo_mx', (
        SELECT COALESCE(jsonb_agg(x ORDER BY x.inviate DESC), '[]'::jsonb) FROM (
          SELECT g.gruppo,
                 (SELECT count(*) FROM inviate i LEFT JOIN mx m ON m.email_domain = i.dom WHERE COALESCE(m.mx_group, 'altro') = g.gruppo) AS inviate,
                 (SELECT count(*) FROM ris_u r LEFT JOIN mx m ON m.email_domain = r.dom WHERE COALESCE(m.mx_group, 'altro') = g.gruppo) AS risposte,
                 (SELECT count(*) FROM bou_u b LEFT JOIN mx m ON m.email_domain = b.dom WHERE COALESCE(m.mx_group, 'altro') = g.gruppo) AS bounce
            FROM (SELECT DISTINCT COALESCE(m.mx_group, 'altro') AS gruppo FROM inviate i LEFT JOIN mx m ON m.email_domain = i.dom) g
        ) x),
      'calcolato_il', now())
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.outreach_recapito_7g(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.outreach_recapito_7g(uuid) TO authenticated, service_role;
