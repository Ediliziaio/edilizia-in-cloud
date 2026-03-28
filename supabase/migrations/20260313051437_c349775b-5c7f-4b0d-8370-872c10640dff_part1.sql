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
