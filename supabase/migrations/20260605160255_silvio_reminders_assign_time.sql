-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.

ALTER TABLE public.silvio_reminders ADD COLUMN IF NOT EXISTS created_by uuid;
ALTER TABLE public.silvio_reminders ADD COLUMN IF NOT EXISTS remind_at timestamptz;

DROP POLICY IF EXISTS silvio_reminders_company_read ON public.silvio_reminders;
CREATE POLICY silvio_reminders_company_read ON public.silvio_reminders FOR SELECT
  USING ((company_id = get_my_company_id())
    AND ((user_id IS NULL) OR (user_id = (SELECT auth.uid())) OR (created_by = (SELECT auth.uid()))
      OR has_role((SELECT auth.uid()), 'company_admin'::app_role)));

CREATE OR REPLACE FUNCTION public.silvio_promote_due_reminders()
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE r record; n integer := 0; v_next date; v_next_at timestamptz; v_guard int; v_step interval;
BEGIN
  FOR r IN
    SELECT * FROM public.silvio_reminders
    WHERE status = 'pending'
      AND ((remind_at IS NOT NULL AND remind_at <= now())
        OR (remind_at IS NULL AND remind_on <= CURRENT_DATE))
    ORDER BY COALESCE(remind_at, remind_on::timestamptz) ASC LIMIT 500
  LOOP
    PERFORM public.silvio_create_alert(
      r.company_id, 'reminder', COALESCE(r.severity, 'warning'),
      r.title, COALESCE(r.note, 'Promemoria pianificato in scadenza.'),
      'reminder:' || r.id::text || ':' || COALESCE(r.remind_at::text, r.remind_on::text), r.user_id,
      r.cta_label, r.cta_action, r.cta_payload,
      COALESCE(r.source_type, 'reminder'), r.source_id, NULL, NULL
    );
    IF COALESCE(r.recurrence, 'none') = 'none' THEN
      UPDATE public.silvio_reminders SET status = 'promoted', promoted_at = now() WHERE id = r.id;
    ELSE
      v_step := CASE r.recurrence
        WHEN 'daily' THEN interval '1 day' WHEN 'weekly' THEN interval '7 days'
        WHEN 'monthly' THEN interval '1 month' WHEN 'yearly' THEN interval '1 year'
        ELSE interval '1 day' END;
      IF r.remind_at IS NOT NULL THEN
        v_next_at := r.remind_at; v_guard := 0;
        LOOP
          v_next_at := v_next_at + v_step; v_guard := v_guard + 1;
          EXIT WHEN v_next_at > now() OR v_guard > 500;
        END LOOP;
        UPDATE public.silvio_reminders SET remind_at = v_next_at, remind_on = v_next_at::date, promoted_at = now() WHERE id = r.id;
      ELSE
        v_next := (r.remind_on + v_step)::date;
        IF v_next <= CURRENT_DATE THEN v_next := CURRENT_DATE + 1; END IF;
        UPDATE public.silvio_reminders SET remind_on = v_next, promoted_at = now() WHERE id = r.id;
      END IF;
    END IF;
    n := n + 1;
  END LOOP;
  RETURN n;
END;
$$;

GRANT EXECUTE ON FUNCTION public.silvio_promote_due_reminders() TO service_role;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('silvio-promote-reminders-daily')
      WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'silvio-promote-reminders-daily');
    PERFORM cron.unschedule('silvio-promote-reminders-15min')
      WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'silvio-promote-reminders-15min');
    PERFORM cron.schedule('silvio-promote-reminders-15min', '*/15 * * * *',
      'SELECT public.silvio_promote_due_reminders();');
  END IF;
END $$;
