-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.

CREATE OR REPLACE FUNCTION public.outreach_stats_daily(
  p_company uuid,
  p_days integer DEFAULT 30,
  p_tz text DEFAULT 'Europe/Rome'
)
RETURNS TABLE(day_key text, date_label text, sent bigint, opened bigint, replied bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  WITH days AS (
    SELECT (d::date) AS day
    FROM generate_series(
      (((now() AT TIME ZONE p_tz)::date - (GREATEST(p_days, 1) - 1))::timestamp),
      (((now() AT TIME ZONE p_tz)::date)::timestamp),
      interval '1 day'
    ) AS d
  ),
  q AS (
    SELECT ((sent_at AT TIME ZONE p_tz)::date) AS sent_day,
           ((opened_at AT TIME ZONE p_tz)::date) AS opened_day
    FROM public.outreach_send_queue
    WHERE company_id = p_company AND public.is_super_admin()
      AND (sent_at IS NOT NULL OR opened_at IS NOT NULL)
  ),
  sent_by_day AS (SELECT sent_day AS day, COUNT(*)::bigint AS n FROM q WHERE sent_day IS NOT NULL GROUP BY sent_day),
  opened_by_day AS (SELECT opened_day AS day, COUNT(*)::bigint AS n FROM q WHERE opened_day IS NOT NULL GROUP BY opened_day),
  replied_by_day AS (
    SELECT ((received_at AT TIME ZONE p_tz)::date) AS day, COUNT(*)::bigint AS n
    FROM public.outreach_replies
    WHERE company_id = p_company AND public.is_super_admin() AND received_at IS NOT NULL
    GROUP BY 1
  )
  SELECT to_char(days.day, 'YYYY-MM-DD'), to_char(days.day, 'DD/MM'),
         COALESCE(s.n, 0)::bigint, COALESCE(o.n, 0)::bigint, COALESCE(r.n, 0)::bigint
  FROM days
  LEFT JOIN sent_by_day s ON s.day = days.day
  LEFT JOIN opened_by_day o ON o.day = days.day
  LEFT JOIN replied_by_day r ON r.day = days.day
  ORDER BY days.day;
$$;

CREATE OR REPLACE FUNCTION public.outreach_stats_funnel(p_company uuid)
RETURNS TABLE(sent bigint, delivered bigint, opened bigint, replied bigint, interested bigint, active_senders bigint, contactable bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  WITH guard AS (SELECT public.is_super_admin() AS ok),
  queue AS (
    SELECT COUNT(*) FILTER (WHERE status = 'sent')::bigint AS sent,
           COUNT(*) FILTER (WHERE status = 'failed')::bigint AS failed,
           COUNT(*) FILTER (WHERE opened_at IS NOT NULL)::bigint AS opened
    FROM public.outreach_send_queue, guard WHERE company_id = p_company AND guard.ok
  ),
  replies AS (
    SELECT COUNT(*)::bigint AS replied,
      COUNT(*) FILTER (WHERE lower(coalesce(intent, '')) IN ('interested','positive','meeting','meeting_booked','opportunity') OR lower(coalesce(status, '')) = 'interested')::bigint AS interested
    FROM public.outreach_replies, guard WHERE company_id = p_company AND guard.ok
  ),
  senders AS (
    SELECT COUNT(*) FILTER (WHERE status IN ('active','warming','warmup'))::bigint AS active_senders
    FROM public.outreach_sender_accounts, guard WHERE company_id = p_company AND guard.ok
  ),
  contacts AS (
    SELECT COUNT(*) FILTER (WHERE coalesce(optout_email, false) = false AND coalesce(opt_out, false) = false AND coalesce(unsubscribed, false) = false)::bigint AS contactable
    FROM public.marketing_contacts, guard WHERE company_id = p_company AND guard.ok
  )
  SELECT q.sent, GREATEST(0, q.sent - q.failed)::bigint, q.opened, r.replied, r.interested, s.active_senders, c.contactable
  FROM queue q, replies r, senders s, contacts c;
$$;

CREATE OR REPLACE FUNCTION public.outreach_stats_queue_status(p_company uuid)
RETURNS TABLE(status text, total bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT lower(coalesce(status, 'unknown')) AS status, COUNT(*)::bigint AS total
  FROM public.outreach_send_queue WHERE company_id = p_company AND public.is_super_admin() GROUP BY 1;
$$;

CREATE OR REPLACE FUNCTION public.outreach_stats_by_sender(p_company uuid)
RETURNS TABLE(id uuid, email text, status text, sent bigint, bounce integer, complaint integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT sa.id, sa.email, sa.status, COALESCE(q.sent, 0)::bigint, COALESCE(sa.bounce_count, 0), COALESCE(sa.complaint_count, 0)
  FROM public.outreach_sender_accounts sa
  LEFT JOIN (
    SELECT sender_account_id, COUNT(*)::bigint AS sent FROM public.outreach_send_queue
    WHERE company_id = p_company AND status = 'sent' AND sender_account_id IS NOT NULL GROUP BY sender_account_id
  ) q ON q.sender_account_id = sa.id
  WHERE sa.company_id = p_company AND public.is_super_admin() ORDER BY sa.email;
$$;

CREATE OR REPLACE FUNCTION public.outreach_stats_by_sequence(p_company uuid)
RETURNS TABLE(id uuid, name text, status text, enrolled bigint, sent bigint, replied bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT seq.id, seq.name, seq.status, COALESCE(en.enrolled, 0)::bigint, COALESCE(sn.sent, 0)::bigint, COALESCE(rp.replied, 0)::bigint
  FROM public.outreach_sequences seq
  LEFT JOIN (SELECT sequence_id, COUNT(*)::bigint AS enrolled FROM public.outreach_enrollments WHERE company_id = p_company AND sequence_id IS NOT NULL GROUP BY sequence_id) en ON en.sequence_id = seq.id
  LEFT JOIN (SELECT e.sequence_id, COUNT(*)::bigint AS sent FROM public.outreach_send_queue q JOIN public.outreach_enrollments e ON e.id = q.enrollment_id WHERE q.company_id = p_company AND q.status = 'sent' AND e.sequence_id IS NOT NULL GROUP BY e.sequence_id) sn ON sn.sequence_id = seq.id
  LEFT JOIN (SELECT e.sequence_id, COUNT(*)::bigint AS replied FROM public.outreach_replies r JOIN public.outreach_enrollments e ON e.id = r.enrollment_id WHERE r.company_id = p_company AND e.sequence_id IS NOT NULL GROUP BY e.sequence_id) rp ON rp.sequence_id = seq.id
  WHERE seq.company_id = p_company AND public.is_super_admin() ORDER BY seq.created_at DESC;
$$;

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
