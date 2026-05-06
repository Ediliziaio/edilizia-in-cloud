-- MP-OPS-01 v2 — Reportino Settimanale Committente
-- ════════════════════════════════════════════════════════════════════════════
-- Schema + RPC per il tool `genera_reportino_settimanale_committente` che è
-- eseguibile sia da cron settimanale (venerdì 17:00) sia da chat conversazionale
-- ("Silvio, manda il reportino al cliente del cantiere via Roma 12").
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.customer_weekly_reports (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  cantiere_id     uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  -- Nota: in EiC il "cliente" è memorizzato come profile (orders.customer_id → profiles.id)
  customer_id     uuid REFERENCES public.profiles(id) ON DELETE SET NULL,

  week_start      date NOT NULL,
  week_end        date NOT NULL,

  pdf_storage_path text,
  pdf_size_bytes  int,
  pdf_pages       int,

  ai_narrative    text,
  ai_persona_used text DEFAULT 'pm_cantiere',
  ai_cost_billed_eur numeric(10,4),

  metrics_snapshot jsonb DEFAULT '{}'::jsonb,

  -- Trigger source (cron | conversation | manual_ui)
  trigger_source  text NOT NULL CHECK (trigger_source IN ('cron','conversation','manual_ui')),
  triggered_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  triggered_by_persona text,

  email_sent_at      timestamptz,
  email_message_id   text,
  email_opened_at    timestamptz,
  whatsapp_sent_at   timestamptz,
  whatsapp_message_id text,

  customer_responded boolean DEFAULT false,
  customer_feedback  text,

  status            text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','generating','generated','delivered','failed')),
  error_message     text,

  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT uq_weekly_report UNIQUE (cantiere_id, week_start)
);

CREATE INDEX IF NOT EXISTS idx_weekly_reports_company_date
  ON public.customer_weekly_reports(company_id, week_start DESC);
CREATE INDEX IF NOT EXISTS idx_weekly_reports_customer
  ON public.customer_weekly_reports(customer_id, week_start DESC) WHERE customer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_weekly_reports_status
  ON public.customer_weekly_reports(status, created_at DESC) WHERE status <> 'delivered';

ALTER TABLE public.customer_weekly_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS weekly_reports_company_read ON public.customer_weekly_reports;
CREATE POLICY weekly_reports_company_read ON public.customer_weekly_reports FOR SELECT
  USING (company_id = public.get_my_company_id());

DROP POLICY IF EXISTS weekly_reports_company_admin ON public.customer_weekly_reports;
CREATE POLICY weekly_reports_company_admin ON public.customer_weekly_reports FOR ALL
  USING (
    company_id = public.get_my_company_id()
    AND public.has_role(auth.uid(), 'company_admin'::public.app_role)
  );

DROP POLICY IF EXISTS weekly_reports_super_admin ON public.customer_weekly_reports;
CREATE POLICY weekly_reports_super_admin ON public.customer_weekly_reports FOR ALL
  USING (public.has_role(auth.uid(), 'super_admin'::public.app_role));

COMMENT ON TABLE public.customer_weekly_reports IS
  'MP-OPS-01 v2: report PDF settimanale al committente. Idempotente per (cantiere, week_start).';

-- Trigger updated_at
CREATE OR REPLACE FUNCTION public.tg_weekly_reports_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_weekly_reports_updated_at ON public.customer_weekly_reports;
CREATE TRIGGER trg_weekly_reports_updated_at
  BEFORE UPDATE ON public.customer_weekly_reports
  FOR EACH ROW EXECUTE FUNCTION public.tg_weekly_reports_updated_at();

-- ────────────────────────────────────────────────────────────────────────────
-- Estensione companies + orders per opt-in feature
-- ────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS weekly_reports_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS weekly_reports_default_tone text NOT NULL DEFAULT 'professionale',
  ADD COLUMN IF NOT EXISTS weekly_reports_send_friday_hour int NOT NULL DEFAULT 17;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS weekly_report_enabled boolean NOT NULL DEFAULT true;

-- ────────────────────────────────────────────────────────────────────────────
-- RPC: silvio_tool_genera_reportino_committente (placeholder + idempotenza)
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.silvio_tool_genera_reportino_committente(
  p_company_id uuid,
  p_user_id uuid,
  p_cantiere_id uuid,
  p_week_start date DEFAULT NULL,
  p_force_regenerate boolean DEFAULT false,
  p_trigger_source text DEFAULT 'conversation',
  p_triggered_by_persona text DEFAULT 'silvio'
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cantiere RECORD;
  v_week_start date;
  v_week_end date;
  v_existing_id uuid;
  v_existing_status text;
  v_new_id uuid;
BEGIN
  -- Determina week_start (default = lunedì settimana corrente)
  v_week_start := COALESCE(p_week_start, date_trunc('week', current_date)::date);
  v_week_end := v_week_start + 4;  -- venerdì

  -- Verifica cantiere
  SELECT id, order_code, customer_id, company_id
    INTO v_cantiere
    FROM public.orders WHERE id = p_cantiere_id;

  IF v_cantiere IS NULL OR v_cantiere.company_id <> p_company_id THEN
    RETURN jsonb_build_object('error', 'Cantiere non trovato per questa azienda');
  END IF;

  -- Idempotenza
  SELECT id, status INTO v_existing_id, v_existing_status
    FROM public.customer_weekly_reports
   WHERE cantiere_id = p_cantiere_id AND week_start = v_week_start
   LIMIT 1;

  IF v_existing_id IS NOT NULL AND NOT p_force_regenerate THEN
    RETURN jsonb_build_object(
      'success', true,
      'report_id', v_existing_id,
      'already_exists', true,
      'status', v_existing_status,
      'cantiere_code', v_cantiere.order_code,
      'week_start', v_week_start,
      'week_end', v_week_end,
      'message', 'Reportino di questa settimana già presente'
    );
  END IF;

  -- Crea/aggiorna placeholder. Il PDF viene generato async dall'edge function
  -- generate-customer-report-async.
  INSERT INTO public.customer_weekly_reports (
    company_id, cantiere_id, customer_id, week_start, week_end,
    trigger_source, triggered_by_user_id, triggered_by_persona,
    status
  ) VALUES (
    p_company_id, p_cantiere_id, v_cantiere.customer_id, v_week_start, v_week_end,
    COALESCE(p_trigger_source, 'conversation'), p_user_id, p_triggered_by_persona,
    'pending'
  )
  ON CONFLICT (cantiere_id, week_start) DO UPDATE
    SET status = 'pending',
        trigger_source = EXCLUDED.trigger_source,
        triggered_by_user_id = EXCLUDED.triggered_by_user_id,
        triggered_by_persona = EXCLUDED.triggered_by_persona,
        updated_at = NOW(),
        error_message = NULL
  RETURNING id INTO v_new_id;

  RETURN jsonb_build_object(
    'success', true,
    'report_id', v_new_id,
    'pending', true,
    'cantiere_id', p_cantiere_id,
    'cantiere_code', v_cantiere.order_code,
    'week_start', v_week_start,
    'week_end', v_week_end,
    'message', format('Reportino settimanale per cantiere %s in elaborazione...', v_cantiere.order_code)
  );
END $$;

REVOKE ALL ON FUNCTION public.silvio_tool_genera_reportino_committente(uuid, uuid, uuid, date, boolean, text, text)
  FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.silvio_tool_genera_reportino_committente(uuid, uuid, uuid, date, boolean, text, text)
  TO service_role;

COMMENT ON FUNCTION public.silvio_tool_genera_reportino_committente IS
  'MP-OPS-01 v2: idempotente per (cantiere, week_start). Placeholder + delegato a edge function async per il PDF.';
