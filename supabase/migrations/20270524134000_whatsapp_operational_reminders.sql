-- Log idempotente per i promemoria WhatsApp operativi, es. richiesta rapportino giornaliero.

BEGIN;

CREATE TABLE IF NOT EXISTS public.wa_operational_reminder_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  wa_number_id uuid REFERENCES public.ai_whatsapp_numbers(id) ON DELETE SET NULL,
  employee_user_id uuid,
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  reminder_date date NOT NULL DEFAULT CURRENT_DATE,
  reminder_kind text NOT NULL DEFAULT 'rapportino_daily',
  phone text NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','sent','skipped','failed')),
  error_detail text,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_wa_operational_reminder_daily
  ON public.wa_operational_reminder_log (
    company_id,
    wa_number_id,
    employee_user_id,
    order_id,
    reminder_date,
    reminder_kind
  );

CREATE INDEX IF NOT EXISTS ix_wa_operational_reminder_company_date
  ON public.wa_operational_reminder_log (company_id, reminder_date DESC);

ALTER TABLE public.wa_operational_reminder_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "wa_operational_reminder_company_read" ON public.wa_operational_reminder_log;
CREATE POLICY "wa_operational_reminder_company_read"
  ON public.wa_operational_reminder_log
  FOR SELECT TO authenticated
  USING (
    company_id IN (SELECT p.company_id FROM public.profiles p WHERE p.id = auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid() AND ur.role = 'super_admin'
    )
  );

DROP POLICY IF EXISTS "wa_operational_reminder_service_all" ON public.wa_operational_reminder_log;
CREATE POLICY "wa_operational_reminder_service_all"
  ON public.wa_operational_reminder_log
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

COMMENT ON TABLE public.wa_operational_reminder_log IS
  'Log idempotente dei promemoria WhatsApp operativi inviati da Silvio: rapportini, sicurezza, fine giornata.';

COMMIT;
