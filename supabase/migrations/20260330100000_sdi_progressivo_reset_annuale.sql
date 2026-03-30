-- Migration: Reset annuale automatico del ProgressivoInvio SDI (GAP-03)
-- Problema: sdi_progressivo_invio non veniva mai resettato a inizio anno.
-- Dopo il 31/12 il counter continuava da dove era rimasto (es. 27A04523 invece di 27A00001).
-- Fix: aggiunta colonna sdi_progressivo_anno e reset automatico nella funzione quando l'anno cambia.

-- 1. Aggiunge colonna per tracciare l'anno corrente del contatore
ALTER TABLE anagrafica_azienda
ADD COLUMN IF NOT EXISTS sdi_progressivo_anno integer NOT NULL DEFAULT EXTRACT(YEAR FROM CURRENT_DATE);

-- 2. Ricrea la funzione con logica di reset annuale
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
  v_anno integer;
  v_current_anno integer;
BEGIN
  v_current_anno := EXTRACT(YEAR FROM CURRENT_DATE)::integer;

  -- Prima verifica se l'anno corrente è diverso da quello salvato → reset
  SELECT sdi_progressivo_anno INTO v_anno
  FROM anagrafica_azienda
  WHERE company_id = p_company_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Anagrafica azienda non trovata per company_id %', p_company_id;
  END IF;

  IF v_anno IS NULL OR v_anno != v_current_anno THEN
    -- Nuovo anno: reset contatore a 1
    UPDATE anagrafica_azienda
    SET sdi_progressivo_invio  = 1,
        sdi_progressivo_anno   = v_current_anno
    WHERE company_id = p_company_id
    RETURNING sdi_progressivo_invio INTO v_next;
  ELSE
    -- Stesso anno: incremento atomico
    UPDATE anagrafica_azienda
    SET sdi_progressivo_invio = sdi_progressivo_invio + 1
    WHERE company_id = p_company_id
    RETURNING sdi_progressivo_invio INTO v_next;
  END IF;

  -- Formato: "{YY}{A-Z}{00001}" — es. "26A00001"
  -- La lettera cambia ogni 99999 invii (overflow estremamente improbabile per PMI)
  RETURN SUBSTRING(v_current_anno::text FROM 3 FOR 2)
    || CHR(65 + ((v_next - 1) / 99999))
    || LPAD(((v_next - 1) % 99999 + 1)::text, 5, '0');
END;
$$;

-- 3. Inizializza sdi_progressivo_anno per le righe esistenti che hanno il campo a NULL o 0
UPDATE anagrafica_azienda
SET sdi_progressivo_anno = EXTRACT(YEAR FROM CURRENT_DATE)::integer
WHERE sdi_progressivo_anno IS NULL
   OR sdi_progressivo_anno = 0;
