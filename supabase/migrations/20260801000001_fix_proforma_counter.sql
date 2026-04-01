-- ============================================================
-- Fix P2-01: Separare contatore proforma da preventivo
-- La migration 20260328100400 aveva fatto usare ultimo_numero_preventivo
-- per i proforma, ma 20260313051436 aveva già aggiunto ultimo_numero_proforma.
-- Questa migration ripristina il comportamento corretto.
-- ============================================================

-- 1. Assicura che la colonna esista (era già stata aggiunta in 20260313051436)
ALTER TABLE public.anagrafica_azienda
  ADD COLUMN IF NOT EXISTS ultimo_numero_proforma INTEGER NOT NULL DEFAULT 0;

-- 2. Reset annuale: aggiunge il campo anno_corrente_proforma se non esiste
ALTER TABLE public.anagrafica_azienda
  ADD COLUMN IF NOT EXISTS anno_corrente_proforma INTEGER NOT NULL DEFAULT EXTRACT(YEAR FROM NOW())::INTEGER;

-- 3. Ricrea genera_numero_documento_native con contatori separati
--    Sostituisce la versione di 20260328100400 che condivideva il contatore
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
  v_anno_corrente INTEGER;
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
      -- Reset annuale
      IF COALESCE(v_ana.anno_corrente_fattura, 0) < p_anno THEN
        UPDATE public.anagrafica_azienda
        SET ultimo_numero_fattura = 1,
            anno_corrente_fattura = p_anno
        WHERE company_id = p_company_id
        RETURNING ultimo_numero_fattura INTO v_contatore;
      ELSE
        UPDATE public.anagrafica_azienda
        SET ultimo_numero_fattura = ultimo_numero_fattura + 1
        WHERE company_id = p_company_id
        RETURNING ultimo_numero_fattura INTO v_contatore;
      END IF;

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
      -- Reset annuale preventivo
      IF COALESCE(v_ana.anno_corrente_preventivo, 0) < p_anno THEN
        UPDATE public.anagrafica_azienda
        SET ultimo_numero_preventivo = 1,
            anno_corrente_preventivo = p_anno
        WHERE company_id = p_company_id
        RETURNING ultimo_numero_preventivo INTO v_contatore;
      ELSE
        UPDATE public.anagrafica_azienda
        SET ultimo_numero_preventivo = ultimo_numero_preventivo + 1
        WHERE company_id = p_company_id
        RETURNING ultimo_numero_preventivo INTO v_contatore;
      END IF;

    WHEN 'proforma' THEN
      -- Fix P2-01: proforma usa il proprio contatore separato, non quello dei preventivi
      v_prefisso := COALESCE(v_ana.prefisso_proforma, 'PF');
      -- Reset annuale proforma
      IF COALESCE(v_ana.anno_corrente_proforma, 0) < p_anno THEN
        UPDATE public.anagrafica_azienda
        SET ultimo_numero_proforma = 1,
            anno_corrente_proforma = p_anno
        WHERE company_id = p_company_id
        RETURNING ultimo_numero_proforma INTO v_contatore;
      ELSE
        UPDATE public.anagrafica_azienda
        SET ultimo_numero_proforma = ultimo_numero_proforma + 1
        WHERE company_id = p_company_id
        RETURNING ultimo_numero_proforma INTO v_contatore;
      END IF;

    ELSE
      -- Fallback: usa contatore fattura
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

-- 4. Aggiungi prefisso_proforma se non esiste (default 'PF')
ALTER TABLE public.anagrafica_azienda
  ADD COLUMN IF NOT EXISTS prefisso_proforma TEXT NOT NULL DEFAULT 'PF';

-- 5. Aggiungi anno_corrente_preventivo se non esiste
ALTER TABLE public.anagrafica_azienda
  ADD COLUMN IF NOT EXISTS anno_corrente_preventivo INTEGER NOT NULL DEFAULT EXTRACT(YEAR FROM NOW())::INTEGER;
