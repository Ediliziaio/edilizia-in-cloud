
-- ============================================================
-- 1. Fix genera_numero_documento_native: annual reset + proforma counter
-- ============================================================
ALTER TABLE public.anagrafica_azienda 
  ADD COLUMN IF NOT EXISTS ultimo_numero_proforma INTEGER NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.genera_numero_documento_native(
  p_company_id UUID,
  p_tipo TEXT,
  p_anno INTEGER DEFAULT EXTRACT(YEAR FROM NOW())::INTEGER
)
RETURNS TEXT AS $$
DECLARE
  v_prefisso TEXT;
  v_contatore INTEGER;
  v_ana public.anagrafica_azienda%ROWTYPE;
BEGIN
  SELECT * INTO v_ana FROM public.anagrafica_azienda
  WHERE company_id = p_company_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Anagrafica azienda non trovata per company_id: %', p_company_id;
  END IF;

  -- Annual reset: if the requested year differs from the stored year, reset all counters
  IF COALESCE(v_ana.reset_numeratore_annuale, TRUE) AND (v_ana.anno_corrente IS NULL OR v_ana.anno_corrente < p_anno) THEN
    UPDATE public.anagrafica_azienda
    SET anno_corrente = p_anno,
        ultimo_numero_fattura = 0,
        ultimo_numero_nc = 0,
        ultimo_numero_ddt = 0,
        ultimo_numero_preventivo = 0,
        ultimo_numero_proforma = 0
    WHERE company_id = p_company_id;
    -- Re-read after reset
    SELECT * INTO v_ana FROM public.anagrafica_azienda WHERE company_id = p_company_id FOR UPDATE;
  END IF;

  CASE p_tipo
    WHEN 'fattura', 'fattura_pa' THEN
      v_prefisso := COALESCE(v_ana.prefisso_fattura, 'FT');
      UPDATE public.anagrafica_azienda
      SET ultimo_numero_fattura = ultimo_numero_fattura + 1
      WHERE company_id = p_company_id
      RETURNING ultimo_numero_fattura INTO v_contatore;
    WHEN 'nota_credito' THEN
      v_prefisso := COALESCE(v_ana.prefisso_nc, 'NC');
      UPDATE public.anagrafica_azienda
      SET ultimo_numero_nc = ultimo_numero_nc + 1
      WHERE company_id = p_company_id
      RETURNING ultimo_numero_nc INTO v_contatore;
    WHEN 'ddt' THEN
      v_prefisso := COALESCE(v_ana.prefisso_ddt, 'DDT');
      UPDATE public.anagrafica_azienda
      SET ultimo_numero_ddt = ultimo_numero_ddt + 1
      WHERE company_id = p_company_id
      RETURNING ultimo_numero_ddt INTO v_contatore;
    WHEN 'preventivo' THEN
      v_prefisso := COALESCE(v_ana.prefisso_preventivo, 'PRV');
      UPDATE public.anagrafica_azienda
      SET ultimo_numero_preventivo = ultimo_numero_preventivo + 1
      WHERE company_id = p_company_id
      RETURNING ultimo_numero_preventivo INTO v_contatore;
    WHEN 'proforma' THEN
      v_prefisso := 'PF';
      UPDATE public.anagrafica_azienda
      SET ultimo_numero_proforma = ultimo_numero_proforma + 1
      WHERE company_id = p_company_id
      RETURNING ultimo_numero_proforma INTO v_contatore;
    ELSE
      v_prefisso := 'DOC';
      v_contatore := 1;
  END CASE;

  RETURN v_prefisso || '-' || p_anno || '-' || LPAD(v_contatore::TEXT, 4, '0');
END;
$$ LANGUAGE plpgsql
SET search_path = public;

-- ============================================================
-- 2. Composite index for documenti_fiscali list queries
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_documenti_fiscali_compound 
  ON public.documenti_fiscali(company_id, tipo, stato, data_emissione DESC);

-- ============================================================
-- 3. sdi_log index on sdi_id
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_sdi_log_sdi_id ON public.sdi_log(sdi_id);

-- ============================================================
-- 4. updated_at trigger for documenti_fiscali
-- ============================================================
CREATE OR REPLACE FUNCTION public.trg_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_updated_at ON public.documenti_fiscali;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.documenti_fiscali
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_set_updated_at();

-- ============================================================
-- 5. RPC for document counts (server-side aggregation)
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_documenti_counts(p_company_id UUID)
RETURNS JSON AS $$
DECLARE
  v_result JSON;
BEGIN
  SELECT json_build_object(
    'fatture', COUNT(*) FILTER (WHERE tipo IN ('fattura', 'fattura_pa') AND stato != 'annullata'),
    'proforma', COUNT(*) FILTER (WHERE tipo = 'proforma' AND stato != 'annullata'),
    'nota_credito', COUNT(*) FILTER (WHERE tipo = 'nota_credito' AND stato != 'annullata'),
    'ddt', COUNT(*) FILTER (WHERE tipo = 'ddt' AND stato != 'annullata'),
    'preventivo', COUNT(*) FILTER (WHERE tipo = 'preventivo' AND stato != 'annullata'),
    'annullate', COUNT(*) FILTER (WHERE stato = 'annullata')
  ) INTO v_result
  FROM public.documenti_fiscali
  WHERE company_id = p_company_id;
  
  RETURN v_result;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public;

-- ============================================================
-- 6. RPC for monthly timeline (server-side aggregation)
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_documenti_monthly_timeline(
  p_company_id UUID,
  p_tipos TEXT[] DEFAULT NULL
)
RETURNS JSON AS $$
DECLARE
  v_result JSON;
BEGIN
  SELECT json_agg(row_to_json(t)) INTO v_result
  FROM (
    SELECT 
      EXTRACT(YEAR FROM data_emissione)::INTEGER AS year,
      EXTRACT(MONTH FROM data_emissione)::INTEGER AS month,
      COUNT(*)::INTEGER AS doc_count,
      COALESCE(SUM(totale_documento), 0)::NUMERIC AS total_amount
    FROM public.documenti_fiscali
    WHERE company_id = p_company_id
      AND stato != 'annullata'
      AND (p_tipos IS NULL OR tipo = ANY(p_tipos))
      AND data_emissione >= (date_trunc('month', NOW()) - INTERVAL '12 months')::DATE
      AND data_emissione < (date_trunc('month', NOW()) + INTERVAL '4 months')::DATE
    GROUP BY 1, 2
    ORDER BY 1, 2
  ) t;
  
  RETURN COALESCE(v_result, '[]'::JSON);
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public;
