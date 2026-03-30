-- GAP4: Fix genera_numero_documento_native
-- 1. Aggiungere supporto proforma, fatture estere (TD17/18/19)
-- 2. Il CASE ELSE ora fallback a fattura per evitare numero fisso = 1

DROP FUNCTION IF EXISTS public.genera_numero_documento_native(UUID, TEXT, INTEGER) CASCADE;
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

  CASE p_tipo
    -- Fatture (tutte le varianti usano lo stesso contatore)
    WHEN 'fattura', 'fattura_pa', 'autofattura',
         'integrazione_servizi_estero', 'integrazione_beni_ue', 'integrazione_beni_extra_ue' THEN
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
      -- Proforma usa il contatore preventivo (sono simili)
      UPDATE public.anagrafica_azienda
      SET ultimo_numero_preventivo = ultimo_numero_preventivo + 1
      WHERE company_id = p_company_id
      RETURNING ultimo_numero_preventivo INTO v_contatore;

    ELSE
      -- Fallback: usa contatore fattura per evitare duplicati
      v_prefisso := 'DOC';
      UPDATE public.anagrafica_azienda
      SET ultimo_numero_fattura = ultimo_numero_fattura + 1
      WHERE company_id = p_company_id
      RETURNING ultimo_numero_fattura INTO v_contatore;
  END CASE;

  RETURN v_prefisso || '-' || p_anno || '-' || LPAD(v_contatore::TEXT, 4, '0');
END;
$$ LANGUAGE plpgsql
SET search_path = public;
