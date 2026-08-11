-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.

-- MP-SILVIO-FOLLOWUP — Promemoria datati / follow-up automatico.
CREATE TABLE IF NOT EXISTS public.silvio_reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  user_id uuid,
  title text NOT NULL,
  note text,
  remind_on date NOT NULL,
  severity text NOT NULL DEFAULT 'warning',
  source_type text,
  source_id uuid,
  cta_action text,
  cta_label text,
  cta_payload jsonb,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  promoted_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_silvio_reminders_due
  ON public.silvio_reminders(company_id, remind_on) WHERE status = 'pending';

ALTER TABLE public.silvio_reminders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS silvio_reminders_admin ON public.silvio_reminders;
CREATE POLICY silvio_reminders_admin ON public.silvio_reminders FOR SELECT
  USING (has_role((SELECT auth.uid()), 'super_admin'::app_role));

DROP POLICY IF EXISTS silvio_reminders_company_read ON public.silvio_reminders;
CREATE POLICY silvio_reminders_company_read ON public.silvio_reminders FOR SELECT
  USING ((company_id = get_my_company_id())
    AND ((user_id IS NULL) OR (user_id = (SELECT auth.uid())) OR has_role((SELECT auth.uid()), 'company_admin'::app_role)));

DROP POLICY IF EXISTS silvio_reminders_company_update ON public.silvio_reminders;
CREATE POLICY silvio_reminders_company_update ON public.silvio_reminders FOR UPDATE
  USING (company_id = get_my_company_id()) WITH CHECK (company_id = get_my_company_id());

CREATE OR REPLACE FUNCTION public.silvio_tool_crea_promemoria(
  p_company_id uuid, p_user_id uuid, p_title text, p_note text DEFAULT NULL,
  p_remind_on date DEFAULT NULL, p_source_type text DEFAULT NULL, p_source_id uuid DEFAULT NULL,
  p_cta_action text DEFAULT NULL, p_cta_label text DEFAULT NULL, p_cta_payload jsonb DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_id uuid; v_when date;
BEGIN
  IF p_company_id IS NULL OR p_title IS NULL OR length(trim(p_title)) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Dati promemoria insufficienti (azienda/titolo).');
  END IF;
  v_when := COALESCE(p_remind_on, CURRENT_DATE);
  INSERT INTO public.silvio_reminders(company_id, user_id, title, note, remind_on,
    source_type, source_id, cta_action, cta_label, cta_payload)
  VALUES (p_company_id, p_user_id, left(p_title, 200), p_note, v_when,
    p_source_type, p_source_id, p_cta_action, p_cta_label, p_cta_payload)
  RETURNING id INTO v_id;
  RETURN jsonb_build_object('ok', true, 'reminder_id', v_id, 'remind_on', v_when);
END;
$$;

CREATE OR REPLACE FUNCTION public.silvio_promote_due_reminders()
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE r record; n integer := 0;
BEGIN
  FOR r IN
    SELECT * FROM public.silvio_reminders
    WHERE status = 'pending' AND remind_on <= CURRENT_DATE
    ORDER BY remind_on ASC LIMIT 500
  LOOP
    PERFORM public.silvio_create_alert(
      r.company_id, 'reminder', COALESCE(r.severity, 'warning'),
      r.title, COALESCE(r.note, 'Promemoria pianificato in scadenza oggi.'),
      'reminder:' || r.id::text, r.user_id,
      r.cta_label, r.cta_action, r.cta_payload,
      COALESCE(r.source_type, 'reminder'), r.source_id, NULL, NULL
    );
    UPDATE public.silvio_reminders SET status = 'promoted', promoted_at = now() WHERE id = r.id;
    n := n + 1;
  END LOOP;
  RETURN n;
END;
$$;

GRANT EXECUTE ON FUNCTION public.silvio_tool_crea_promemoria(uuid,uuid,text,text,date,text,uuid,text,text,jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.silvio_promote_due_reminders() TO service_role;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('silvio-promote-reminders-daily')
      WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'silvio-promote-reminders-daily');
    PERFORM cron.schedule('silvio-promote-reminders-daily', '10 5 * * *',
      'SELECT public.silvio_promote_due_reminders();');
  END IF;
END $$;
