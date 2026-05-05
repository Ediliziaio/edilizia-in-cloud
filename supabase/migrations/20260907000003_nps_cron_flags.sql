-- IMP-2: NPS Auto-cron flags su companies
-- Flag per tracciare invii survey NPS già schedulati/inviati

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS nps_sent_30d   boolean      NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS nps_sent_90d   boolean      NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS nps_sent_at    timestamptz;

-- Log invii survey (audit trail)
CREATE TABLE IF NOT EXISTS public.nps_send_log (
  id            uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid         NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  day_offset    int          NOT NULL CHECK (day_offset IN (30, 90)),
  sent_at       timestamptz  NOT NULL DEFAULT now(),
  status        text         NOT NULL DEFAULT 'sent'
                               CHECK (status IN ('sent', 'failed', 'skipped')),
  error_message text
);

-- Risposte NPS usate dal modal onboarding. La tabella non era presente nella
-- catena pulita, ma il trigger detractor qui sotto la richiede.
CREATE TABLE IF NOT EXISTS public.nps_responses (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id       uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  score         int NOT NULL CHECK (score BETWEEN 0 AND 10),
  comment       text,
  feedback_text text,
  source        text DEFAULT 'manual',
  created_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.nps_responses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "nps_responses_company_insert" ON public.nps_responses;
CREATE POLICY "nps_responses_company_insert"
  ON public.nps_responses FOR INSERT TO authenticated
  WITH CHECK (company_id = public.get_effective_company_id());

DROP POLICY IF EXISTS "nps_responses_admin_read" ON public.nps_responses;
CREATE POLICY "nps_responses_admin_read"
  ON public.nps_responses FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::public.app_role));

-- Alert CS minimale per non perdere detractor. Se in futuro arriva una tabella
-- CS dedicata più ricca, questa base resta compatibile.
CREATE TABLE IF NOT EXISTS public.cs_alerts (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  alert_type  text NOT NULL,
  priority    text NOT NULL DEFAULT 'medium',
  title       text NOT NULL,
  description text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);

ALTER TABLE public.cs_alerts ENABLE ROW LEVEL SECURITY;

-- Alert detractor: trigger che crea cs_alert quando score < 7
CREATE OR REPLACE FUNCTION public.notify_nps_detractor()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NEW.score IS NOT NULL AND NEW.score < 7 THEN
    INSERT INTO public.cs_alerts (
      company_id, alert_type, priority, title, description, created_at
    )
    VALUES (
      NEW.company_id,
      'nps_detractor',
      'high',
      'NPS Detractor — score ' || NEW.score,
      COALESCE(NULLIF(NEW.feedback_text, ''), NULLIF(NEW.comment, ''), 'Nessun commento lasciato'),
      NOW()
    )
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

-- Evita duplicati: drop+create trigger
DROP TRIGGER IF EXISTS on_nps_response_detractor ON public.nps_responses;
CREATE TRIGGER on_nps_response_detractor
  AFTER INSERT ON public.nps_responses
  FOR EACH ROW EXECUTE FUNCTION public.notify_nps_detractor();

-- RLS nps_send_log
ALTER TABLE public.nps_send_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "super_admin_nps_send_log" ON public.nps_send_log;
CREATE POLICY "super_admin_nps_send_log"
  ON public.nps_send_log FOR ALL
  USING  (public.has_role(auth.uid(), 'super_admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::public.app_role));
