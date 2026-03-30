-- 2. Atomic function to get next progressivo (per company, per year)
DROP FUNCTION IF EXISTS public.incrementa_progressivo_sdi(uuid) CASCADE;
CREATE OR REPLACE FUNCTION incrementa_progressivo_sdi(
  p_company_id uuid
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_next integer;
  v_piva text;
BEGIN
  -- Atomic increment with row lock
  UPDATE anagrafica_azienda
  SET sdi_progressivo_invio = sdi_progressivo_invio + 1
  WHERE company_id = p_company_id
  RETURNING sdi_progressivo_invio, partita_iva
  INTO v_next, v_piva;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Anagrafica azienda non trovata per company_id %', p_company_id;
  END IF;

  -- Format: 5 chars alphanumeric (SDI max 10 chars for ProgressivoInvio)
  -- Using year prefix + zero-padded counter: e.g. "26A00001"
  RETURN SUBSTRING(EXTRACT(YEAR FROM CURRENT_DATE)::text FROM 3 FOR 2)
    || CHR(65 + ((v_next - 1) / 99999))  -- A, B, C... for overflow
    || LPAD(((v_next - 1) % 99999 + 1)::text, 5, '0');
END;
$$;
