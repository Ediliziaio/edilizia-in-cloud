-- GAP-03: Reset annuale automatico ProgressivoInvio SDI
-- Adds sdi_progressivo_anno column and updates incrementa_progressivo_sdi()
-- to reset the counter when the year changes.

-- 1. Add tracking column for the year of the last progressivo
ALTER TABLE anagrafica_azienda
  ADD COLUMN IF NOT EXISTS sdi_progressivo_anno integer DEFAULT EXTRACT(YEAR FROM CURRENT_DATE);

-- 2. Replace function with year-aware version
CREATE OR REPLACE FUNCTION incrementa_progressivo_sdi(p_company_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_current_anno integer;
  v_new_progressivo integer;
  v_prefix text;
BEGIN
  v_current_anno := EXTRACT(YEAR FROM CURRENT_DATE)::integer;

  -- Reset se l'anno è cambiato
  UPDATE anagrafica_azienda
  SET sdi_progressivo_invio = 0,
      sdi_progressivo_anno = v_current_anno
  WHERE company_id = p_company_id
    AND (sdi_progressivo_anno IS NULL OR sdi_progressivo_anno != v_current_anno);

  -- Incrementa atomicamente
  UPDATE anagrafica_azienda
  SET sdi_progressivo_invio = sdi_progressivo_invio + 1
  WHERE company_id = p_company_id
  RETURNING sdi_progressivo_invio INTO v_new_progressivo;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Anagrafica azienda non trovata per company_id %', p_company_id;
  END IF;

  -- Formato: YY + lettera (A-Z ogni 99999) + 5 cifre
  -- Es: 26A00042
  v_prefix := TO_CHAR(v_current_anno, 'YY') || CHR(65 + ((v_new_progressivo - 1) / 99999));
  RETURN v_prefix || LPAD((((v_new_progressivo - 1) % 99999) + 1)::text, 5, '0');
END;
$$;
