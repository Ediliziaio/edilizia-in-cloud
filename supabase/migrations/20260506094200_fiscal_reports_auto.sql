-- MP-FAT-06 — Reportistica Fiscale Auto (LIPE / F24 / CU)
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.fiscal_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,

  report_type text NOT NULL CHECK (report_type IN (
    'lipe','f24','cu','esterometro','dichiarazione_iva','770','redditi_sc'
  )),
  period_start date NOT NULL,
  period_end date NOT NULL,

  data_summary jsonb DEFAULT '{}'::jsonb,
  ai_validation_warnings jsonb DEFAULT '[]'::jsonb,
  ai_persona_used text DEFAULT 'commercialista',
  ai_cost_billed_eur numeric(10,4) DEFAULT 0,

  xml_storage_path text,
  pdf_storage_path text,

  status text NOT NULL DEFAULT 'draft' CHECK (status IN (
    'draft','reviewed_commercialista','submitted','accepted_ade','rejected_ade'
  )),
  reviewed_by_commercialista_at timestamptz,
  submitted_at timestamptz,
  ade_protocol_number text,
  ade_response jsonb,

  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT uq_fiscal_period UNIQUE (company_id, report_type, period_start)
);

CREATE INDEX IF NOT EXISTS idx_fiscal_company_period ON public.fiscal_reports(company_id, period_start DESC);
CREATE INDEX IF NOT EXISTS idx_fiscal_status ON public.fiscal_reports(company_id, status);

ALTER TABLE public.fiscal_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS fiscal_admin ON public.fiscal_reports;
CREATE POLICY fiscal_admin ON public.fiscal_reports
  FOR ALL USING (company_id = public.get_my_company_id());

-- ════════════════════════════════════════════════════════════════════════════
-- RPC: silvio_tool_genera_lipe_trimestrale
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.silvio_tool_genera_lipe_trimestrale(
  p_company_id uuid,
  p_year int,
  p_quarter int
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_period_start date;
  v_period_end date;
  v_id uuid;
BEGIN
  IF p_quarter NOT BETWEEN 1 AND 4 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_quarter');
  END IF;

  v_period_start := make_date(p_year, ((p_quarter - 1) * 3) + 1, 1);
  v_period_end := (v_period_start + interval '3 months' - interval '1 day')::date;

  INSERT INTO public.fiscal_reports(company_id, report_type, period_start, period_end, status)
  VALUES (p_company_id, 'lipe', v_period_start, v_period_end, 'draft')
  ON CONFLICT (company_id, report_type, period_start) DO UPDATE
    SET updated_at = now()
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('ok', true, 'report_id', v_id, 'period_start', v_period_start, 'period_end', v_period_end);
END $$;

GRANT EXECUTE ON FUNCTION public.silvio_tool_genera_lipe_trimestrale(uuid, int, int) TO authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- RPC: silvio_tool_genera_f24_mese
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.silvio_tool_genera_f24_mese(
  p_company_id uuid,
  p_year int,
  p_month int
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_period_start date := make_date(p_year, p_month, 1);
  v_period_end date := (v_period_start + interval '1 month' - interval '1 day')::date;
  v_id uuid;
BEGIN
  INSERT INTO public.fiscal_reports(company_id, report_type, period_start, period_end, status)
  VALUES (p_company_id, 'f24', v_period_start, v_period_end, 'draft')
  ON CONFLICT (company_id, report_type, period_start) DO UPDATE
    SET updated_at = now()
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('ok', true, 'report_id', v_id, 'period', format('%s-%s', p_year, lpad(p_month::text, 2, '0')));
END $$;

GRANT EXECUTE ON FUNCTION public.silvio_tool_genera_f24_mese(uuid, int, int) TO authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- RPC: silvio_tool_genera_cu_anno
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.silvio_tool_genera_cu_anno(
  p_company_id uuid,
  p_year int
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_period_start date := make_date(p_year, 1, 1);
  v_period_end date := make_date(p_year, 12, 31);
  v_id uuid;
BEGIN
  INSERT INTO public.fiscal_reports(company_id, report_type, period_start, period_end, status)
  VALUES (p_company_id, 'cu', v_period_start, v_period_end, 'draft')
  ON CONFLICT (company_id, report_type, period_start) DO UPDATE
    SET updated_at = now()
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('ok', true, 'report_id', v_id, 'year', p_year);
END $$;

GRANT EXECUTE ON FUNCTION public.silvio_tool_genera_cu_anno(uuid, int) TO authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- RPC: silvio_tool_verifica_quadrature_contabili
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.silvio_tool_verifica_quadrature_contabili(
  p_company_id uuid,
  p_period_start date,
  p_period_end date
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_warnings jsonb := '[]'::jsonb;
BEGIN
  -- Placeholder: in produzione verifica IVA esigibile vs detraibile, ritenute, F24
  -- L'edge function ai-fiscal-report-generator esegue le verifiche reali.
  RETURN jsonb_build_object(
    'ok', true,
    'period_start', p_period_start, 'period_end', p_period_end,
    'warnings', v_warnings,
    'next_step', 'edge:ai-fiscal-report-generator esegue verifiche'
  );
END $$;

GRANT EXECUTE ON FUNCTION public.silvio_tool_verifica_quadrature_contabili(uuid, date, date) TO authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- RPC: silvio_tool_invia_lipe_ade
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.silvio_tool_invia_lipe_ade(
  p_company_id uuid,
  p_report_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_status text;
  v_type text;
BEGIN
  SELECT status, report_type INTO v_status, v_type
  FROM public.fiscal_reports
  WHERE id = p_report_id AND company_id = p_company_id;

  IF v_status IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'report_not_found');
  END IF;

  IF v_status NOT IN ('reviewed_commercialista','draft') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_status', 'current', v_status);
  END IF;

  UPDATE public.fiscal_reports
     SET status = 'submitted', submitted_at = now(), updated_at = now()
   WHERE id = p_report_id;

  RETURN jsonb_build_object('ok', true, 'report_id', p_report_id, 'submitted_at', now());
END $$;

GRANT EXECUTE ON FUNCTION public.silvio_tool_invia_lipe_ade(uuid, uuid) TO authenticated;

DO $$ BEGIN RAISE NOTICE 'MP-FAT-06 deployed: fiscal_reports + 5 RPC'; END $$;
