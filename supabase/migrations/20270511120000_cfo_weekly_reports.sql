-- MP-FAT-05 — Report CFO Settimanale
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.cfo_weekly_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,

  week_start date NOT NULL,
  week_end date NOT NULL,

  fatturato_eur numeric(12,2),
  fatturato_target_eur numeric(12,2),
  incassi_eur numeric(12,2),
  dso_giorni int,
  cantieri_attivi int,
  cashflow_min_30d numeric(12,2),

  ai_narrative text,
  ai_top_actions jsonb DEFAULT '[]'::jsonb,
  ai_persona_used text DEFAULT 'cfo',
  ai_cost_billed_eur numeric(10,4) DEFAULT 0,

  email_sent_at timestamptz,
  email_opened_at timestamptz,
  whatsapp_sent_at timestamptz,

  created_at timestamptz DEFAULT now(),
  CONSTRAINT uq_cfo_report_week UNIQUE (company_id, week_start)
);

CREATE INDEX IF NOT EXISTS idx_cfo_reports_company_week ON public.cfo_weekly_reports(company_id, week_start DESC);

ALTER TABLE public.cfo_weekly_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cfo_reports_admin ON public.cfo_weekly_reports;
CREATE POLICY cfo_reports_admin ON public.cfo_weekly_reports
  FOR ALL USING (company_id = public.get_my_company_id());

-- Settings su companies
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS cfo_weekly_report_enabled boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS cfo_weekly_report_day text DEFAULT 'monday',
  ADD COLUMN IF NOT EXISTS cfo_weekly_report_hour int DEFAULT 8;

-- ════════════════════════════════════════════════════════════════════════════
-- RPC: silvio_tool_genera_report_cfo_settimanale
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.silvio_tool_genera_report_cfo_settimanale(
  p_company_id uuid,
  p_week_start date DEFAULT NULL,
  p_force_regenerate boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_week_start date := COALESCE(p_week_start, date_trunc('week', current_date - interval '7 days')::date);
  v_week_end date := v_week_start + interval '6 days';
  v_existing uuid;
  v_id uuid;
BEGIN
  SELECT id INTO v_existing
  FROM public.cfo_weekly_reports
  WHERE company_id = p_company_id AND week_start = v_week_start;

  IF v_existing IS NOT NULL AND NOT p_force_regenerate THEN
    RETURN jsonb_build_object('ok', true, 'already_exists', true, 'report_id', v_existing);
  END IF;

  -- Aggregazioni: in produzione l'edge function ai-cfo-weekly-report popola
  -- i dati con persona cfo. Qui creiamo lo skeleton.
  IF v_existing IS NULL THEN
    INSERT INTO public.cfo_weekly_reports(company_id, week_start, week_end, ai_persona_used, ai_top_actions)
    VALUES (p_company_id, v_week_start, v_week_end::date, 'cfo', '[]'::jsonb)
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.cfo_weekly_reports
       SET ai_narrative = NULL, ai_top_actions = '[]'::jsonb
     WHERE id = v_existing
    RETURNING id INTO v_id;
  END IF;

  RETURN jsonb_build_object('ok', true, 'report_id', v_id, 'week_start', v_week_start);
END $$;

GRANT EXECUTE ON FUNCTION public.silvio_tool_genera_report_cfo_settimanale(uuid, date, boolean) TO authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- RPC: silvio_tool_invia_report_cfo
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.silvio_tool_invia_report_cfo(
  p_company_id uuid,
  p_report_id uuid,
  p_channels text[] DEFAULT ARRAY['email']
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF 'email' = ANY(p_channels) THEN
    UPDATE public.cfo_weekly_reports
       SET email_sent_at = now()
     WHERE id = p_report_id AND company_id = p_company_id;
  END IF;
  IF 'whatsapp' = ANY(p_channels) THEN
    UPDATE public.cfo_weekly_reports
       SET whatsapp_sent_at = now()
     WHERE id = p_report_id AND company_id = p_company_id;
  END IF;
  RETURN jsonb_build_object('ok', true, 'channels', p_channels);
END $$;

GRANT EXECUTE ON FUNCTION public.silvio_tool_invia_report_cfo(uuid, uuid, text[]) TO authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- RPC: silvio_tool_chiedi_riassunto_settimana
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.silvio_tool_chiedi_riassunto_settimana(
  p_company_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_latest jsonb;
BEGIN
  SELECT jsonb_build_object(
    'week_start', week_start, 'week_end', week_end,
    'fatturato_eur', fatturato_eur, 'incassi_eur', incassi_eur,
    'dso_giorni', dso_giorni, 'cantieri_attivi', cantieri_attivi,
    'narrative', ai_narrative, 'top_actions', ai_top_actions
  ) INTO v_latest
  FROM public.cfo_weekly_reports
  WHERE company_id = p_company_id
  ORDER BY week_start DESC LIMIT 1;

  RETURN COALESCE(v_latest, jsonb_build_object('ok', false, 'error', 'no_report_yet'));
END $$;

GRANT EXECUTE ON FUNCTION public.silvio_tool_chiedi_riassunto_settimana(uuid) TO authenticated;

DO $$ BEGIN RAISE NOTICE 'MP-FAT-05 deployed: cfo_weekly_reports + 3 RPC'; END $$;
