-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.

ALTER TABLE public.silvio_reminders
  ADD COLUMN IF NOT EXISTS recurrence text NOT NULL DEFAULT 'none';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'silvio_reminders_recurrence_check'
  ) THEN
    ALTER TABLE public.silvio_reminders
      ADD CONSTRAINT silvio_reminders_recurrence_check
      CHECK (recurrence IN ('none','daily','weekly','monthly','yearly'));
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.silvio_promote_due_reminders()
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE r record; n integer := 0; v_next date;
BEGIN
  FOR r IN
    SELECT * FROM public.silvio_reminders
    WHERE status = 'pending' AND remind_on <= CURRENT_DATE
    ORDER BY remind_on ASC LIMIT 500
  LOOP
    PERFORM public.silvio_create_alert(
      r.company_id, 'reminder', COALESCE(r.severity, 'warning'),
      r.title, COALESCE(r.note, 'Promemoria pianificato in scadenza oggi.'),
      'reminder:' || r.id::text || ':' || r.remind_on::text, r.user_id,
      r.cta_label, r.cta_action, r.cta_payload,
      COALESCE(r.source_type, 'reminder'), r.source_id, NULL, NULL
    );
    IF COALESCE(r.recurrence, 'none') = 'none' THEN
      UPDATE public.silvio_reminders SET status = 'promoted', promoted_at = now() WHERE id = r.id;
    ELSE
      v_next := (r.remind_on + CASE r.recurrence
        WHEN 'daily'   THEN interval '1 day'
        WHEN 'weekly'  THEN interval '7 days'
        WHEN 'monthly' THEN interval '1 month'
        WHEN 'yearly'  THEN interval '1 year'
        ELSE interval '1 day' END)::date;
      IF v_next <= CURRENT_DATE THEN v_next := CURRENT_DATE + 1; END IF;
      UPDATE public.silvio_reminders SET remind_on = v_next, promoted_at = now() WHERE id = r.id;
    END IF;
    n := n + 1;
  END LOOP;
  RETURN n;
END;
$$;

GRANT EXECUTE ON FUNCTION public.silvio_promote_due_reminders() TO service_role;
