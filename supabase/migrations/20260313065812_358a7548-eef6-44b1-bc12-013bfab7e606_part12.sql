-- ─── 4. Trigger: aggiorna stato fattura su movimenti_cassa_native ──
DROP FUNCTION IF EXISTS public.update_fattura_stato_on_movimento() CASCADE;
CREATE OR REPLACE FUNCTION public.update_fattura_stato_on_movimento()
RETURNS TRIGGER AS $$
DECLARE
  v_doc_id    UUID;
  v_totale    NUMERIC;
  v_incassato NUMERIC;
  v_nuovo     TEXT;
BEGIN
  v_doc_id := COALESCE(NEW.documento_id, OLD.documento_id);
  IF v_doc_id IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;

  SELECT totale_da_pagare INTO v_totale
  FROM public.documenti_fiscali
  WHERE id = v_doc_id;

  IF NOT FOUND THEN RETURN COALESCE(NEW, OLD); END IF;

  SELECT COALESCE(SUM(importo), 0) INTO v_incassato
  FROM public.movimenti_cassa_native
  WHERE documento_id = v_doc_id AND tipo = 'entrata';

  IF v_incassato >= v_totale THEN
    v_nuovo := 'pagata';
  ELSIF v_incassato > 0 THEN
    v_nuovo := 'parzialmente_pagata';
  ELSE
    v_nuovo := 'emessa';
  END IF;

  UPDATE public.documenti_fiscali
  SET stato = v_nuovo,
      importo_pagato = v_incassato,
      pagato_at = CASE WHEN v_incassato >= v_totale THEN NOW() ELSE NULL END,
      updated_at = NOW()
  WHERE id = v_doc_id
    AND stato NOT IN ('annullata', 'rifiutata', 'bozza');

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
