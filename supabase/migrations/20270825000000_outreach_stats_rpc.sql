-- ── Outreach · Statistiche lato-server (aggregazioni a scala) ────────────────
-- Sposta le aggregazioni della dashboard "Statistiche" dal client al database:
-- invece di scaricare fino a 5.000 righe di outreach_send_queue / outreach_replies
-- e contarle in JS, queste RPC fanno COUNT/GROUP BY in SQL e restituiscono solo
-- gli aggregati. A volumi alti (decine di migliaia di invii/risposte) la differenza
-- è netta: payload minuscolo, niente loop client, niente cap di righe che falsa i
-- conteggi headline.
--
-- Sicurezza: le tabelle outreach sono visibili in RLS solo a super_admin/service_role
-- (feature admin di piattaforma). Le funzioni sono SECURITY DEFINER (bypassano RLS),
-- quindi *gateano esplicitamente* su public.is_super_admin(): un authenticated non
-- super-admin riceve zero righe, identico a quello che vedrebbe via RLS. search_path
-- bloccato a public. GRANT a authenticated + service_role come le altre RPC reporting.
--
-- Compatibilità numeri (deve combaciare con useOutreachStats client-side):
--   • giorno locale: il client usa i confini giorno del browser (Europe/Rome per
--     l'admin italiano). Qui i bucket usano un parametro timezone (default Europe/Rome)
--     così l'asse "oggi" coincide.
--   • interessati: intent ∈ {interested,positive,meeting,meeting_booked,opportunity}
--     (case-insensitive) OPPURE status='interested'.
--   • consegnate ≈ inviate − fallite (stesso proxy onesto del client, niente flag
--     delivered dedicato sulla coda).
--   • contattabili = contatti − (optout_email OR opt_out OR unsubscribed).
--
-- Idempotente: CREATE OR REPLACE FUNCTION + DROP/GRANT ripetibili. NON applicata.

-- ── 1. Andamento giornaliero (inviate / aperte / risposte per data) ──────────
-- Serie continua di p_days giorni (oggi incluso) anche se alcuni giorni sono vuoti:
-- generate_series costruisce lo scaffold, le LEFT JOIN laterali contano per bucket.
-- Risposte e invii/aperture arrivano da tabelle diverse, quindi tre sotto-aggregati
-- separati uniti sul giorno. date_label in DD/MM come l'asse client.
CREATE OR REPLACE FUNCTION public.outreach_stats_daily(
  p_company uuid,
  p_days integer DEFAULT 30,
  p_tz text DEFAULT 'Europe/Rome'
)
RETURNS TABLE(
  day_key text,
  date_label text,
  sent bigint,
  opened bigint,
  replied bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH days AS (
    -- Bounds castati a timestamp per scegliere senza ambiguità l'overload
    -- generate_series(timestamp, timestamp, interval); poi ::date per il bucket.
    SELECT (d::date) AS day
    FROM generate_series(
      (((now() AT TIME ZONE p_tz)::date - (GREATEST(p_days, 1) - 1))::timestamp),
      (((now() AT TIME ZONE p_tz)::date)::timestamp),
      interval '1 day'
    ) AS d
  ),
  q AS (
    SELECT
      ((sent_at   AT TIME ZONE p_tz)::date) AS sent_day,
      ((opened_at AT TIME ZONE p_tz)::date) AS opened_day
    FROM public.outreach_send_queue
    WHERE company_id = p_company
      AND public.is_super_admin()
      AND (sent_at IS NOT NULL OR opened_at IS NOT NULL)
  ),
  sent_by_day AS (
    SELECT sent_day AS day, COUNT(*)::bigint AS n
    FROM q WHERE sent_day IS NOT NULL GROUP BY sent_day
  ),
  opened_by_day AS (
    SELECT opened_day AS day, COUNT(*)::bigint AS n
    FROM q WHERE opened_day IS NOT NULL GROUP BY opened_day
  ),
  replied_by_day AS (
    SELECT ((received_at AT TIME ZONE p_tz)::date) AS day, COUNT(*)::bigint AS n
    FROM public.outreach_replies
    WHERE company_id = p_company
      AND public.is_super_admin()
      AND received_at IS NOT NULL
    GROUP BY 1
  )
  SELECT
    to_char(days.day, 'YYYY-MM-DD')          AS day_key,
    to_char(days.day, 'DD/MM')               AS date_label,
    COALESCE(s.n, 0)::bigint                  AS sent,
    COALESCE(o.n, 0)::bigint                  AS opened,
    COALESCE(r.n, 0)::bigint                  AS replied
  FROM days
  LEFT JOIN sent_by_day    s ON s.day = days.day
  LEFT JOIN opened_by_day  o ON o.day = days.day
  LEFT JOIN replied_by_day r ON r.day = days.day
  ORDER BY days.day;
$$;

-- ── 2. Funnel cold + totali headline (una riga) ──────────────────────────────
-- sent/opened sono COUNT mirati sulla coda; replied/interested sul tavolo risposte;
-- delivered = sent − failed; contactable dai contatti al netto degli opt-out;
-- active_senders dai sender in stato active/warming/warmup. Tutto in un solo round-trip.
CREATE OR REPLACE FUNCTION public.outreach_stats_funnel(p_company uuid)
RETURNS TABLE(
  sent bigint,
  delivered bigint,
  opened bigint,
  replied bigint,
  interested bigint,
  active_senders bigint,
  contactable bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH guard AS (SELECT public.is_super_admin() AS ok),
  queue AS (
    SELECT
      COUNT(*) FILTER (WHERE status = 'sent')::bigint   AS sent,
      COUNT(*) FILTER (WHERE status = 'failed')::bigint AS failed,
      COUNT(*) FILTER (WHERE opened_at IS NOT NULL)::bigint AS opened
    FROM public.outreach_send_queue, guard
    WHERE company_id = p_company AND guard.ok
  ),
  replies AS (
    SELECT
      COUNT(*)::bigint AS replied,
      COUNT(*) FILTER (
        WHERE lower(coalesce(intent, '')) IN
              ('interested','positive','meeting','meeting_booked','opportunity')
           OR lower(coalesce(status, '')) = 'interested'
      )::bigint AS interested
    FROM public.outreach_replies, guard
    WHERE company_id = p_company AND guard.ok
  ),
  senders AS (
    SELECT COUNT(*) FILTER (WHERE status IN ('active','warming','warmup'))::bigint AS active_senders
    FROM public.outreach_sender_accounts, guard
    WHERE company_id = p_company AND guard.ok
  ),
  contacts AS (
    SELECT COUNT(*) FILTER (
      WHERE coalesce(optout_email, false) = false
        AND coalesce(opt_out, false) = false
        AND coalesce(unsubscribed, false) = false
    )::bigint AS contactable
    FROM public.marketing_contacts, guard
    WHERE company_id = p_company AND guard.ok
  )
  SELECT
    q.sent,
    GREATEST(0, q.sent - q.failed)::bigint AS delivered,
    q.opened,
    r.replied,
    r.interested,
    s.active_senders,
    c.contactable
  FROM queue q, replies r, senders s, contacts c;
$$;

-- ── 3. Distribuzione coda per stato (donut) ──────────────────────────────────
CREATE OR REPLACE FUNCTION public.outreach_stats_queue_status(p_company uuid)
RETURNS TABLE(status text, total bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT lower(coalesce(status, 'unknown')) AS status, COUNT(*)::bigint AS total
  FROM public.outreach_send_queue
  WHERE company_id = p_company
    AND public.is_super_admin()
  GROUP BY 1;
$$;

-- ── 4. Salute per casella ────────────────────────────────────────────────────
-- Invii "sent" per casella (LEFT JOIN: caselle senza invii restano a 0). bounce/
-- complaint dal record sender. Il flag at-risk lo decide il client (stessa soglia).
CREATE OR REPLACE FUNCTION public.outreach_stats_by_sender(p_company uuid)
RETURNS TABLE(
  id uuid,
  email text,
  status text,
  sent bigint,
  bounce integer,
  complaint integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    sa.id,
    sa.email,
    sa.status,
    COALESCE(q.sent, 0)::bigint     AS sent,
    COALESCE(sa.bounce_count, 0)    AS bounce,
    COALESCE(sa.complaint_count, 0) AS complaint
  FROM public.outreach_sender_accounts sa
  LEFT JOIN (
    SELECT sender_account_id, COUNT(*)::bigint AS sent
    FROM public.outreach_send_queue
    WHERE company_id = p_company AND status = 'sent' AND sender_account_id IS NOT NULL
    GROUP BY sender_account_id
  ) q ON q.sender_account_id = sa.id
  WHERE sa.company_id = p_company
    AND public.is_super_admin()
  ORDER BY sa.email;
$$;

-- ── 5. Performance per sequenza ──────────────────────────────────────────────
-- enrolled = iscrizioni per sequenza; sent/replied risalgono alla sequenza via
-- enrollment_id (JOIN su outreach_enrollments). LEFT JOIN così le sequenze nuove
-- (zero iscritti) compaiono comunque a 0.
CREATE OR REPLACE FUNCTION public.outreach_stats_by_sequence(p_company uuid)
RETURNS TABLE(
  id uuid,
  name text,
  status text,
  enrolled bigint,
  sent bigint,
  replied bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    seq.id,
    seq.name,
    seq.status,
    COALESCE(en.enrolled, 0)::bigint AS enrolled,
    COALESCE(sn.sent, 0)::bigint     AS sent,
    COALESCE(rp.replied, 0)::bigint  AS replied
  FROM public.outreach_sequences seq
  LEFT JOIN (
    SELECT sequence_id, COUNT(*)::bigint AS enrolled
    FROM public.outreach_enrollments
    WHERE company_id = p_company AND sequence_id IS NOT NULL
    GROUP BY sequence_id
  ) en ON en.sequence_id = seq.id
  LEFT JOIN (
    SELECT e.sequence_id, COUNT(*)::bigint AS sent
    FROM public.outreach_send_queue q
    JOIN public.outreach_enrollments e ON e.id = q.enrollment_id
    WHERE q.company_id = p_company AND q.status = 'sent' AND e.sequence_id IS NOT NULL
    GROUP BY e.sequence_id
  ) sn ON sn.sequence_id = seq.id
  LEFT JOIN (
    SELECT e.sequence_id, COUNT(*)::bigint AS replied
    FROM public.outreach_replies r
    JOIN public.outreach_enrollments e ON e.id = r.enrollment_id
    WHERE r.company_id = p_company AND e.sequence_id IS NOT NULL
    GROUP BY e.sequence_id
  ) rp ON rp.sequence_id = seq.id
  WHERE seq.company_id = p_company
    AND public.is_super_admin()
  ORDER BY seq.created_at DESC;
$$;

-- ── GRANT (come le altre RPC reporting: authenticated + service_role) ─────────
-- L'autorizzazione effettiva la fa is_super_admin() nel corpo; il GRANT abilita solo
-- la chiamata dal client autenticato (Statistiche gira in console super-admin).
DO $$
DECLARE sig text;
BEGIN
  FOREACH sig IN ARRAY ARRAY[
    'public.outreach_stats_daily(uuid, integer, text)',
    'public.outreach_stats_funnel(uuid)',
    'public.outreach_stats_queue_status(uuid)',
    'public.outreach_stats_by_sender(uuid)',
    'public.outreach_stats_by_sequence(uuid)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', sig);
  END LOOP;
END $$;
