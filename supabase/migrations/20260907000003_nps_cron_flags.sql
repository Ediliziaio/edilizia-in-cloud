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
      COALESCE(NEW.feedback_text, 'Nessun commento lasciato'),
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
CREATE POLICY "super_admin_nps_send_log"
  ON public.nps_send_log FOR ALL
  USING  (public.has_role(auth.uid(), 'super_admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::public.app_role));
