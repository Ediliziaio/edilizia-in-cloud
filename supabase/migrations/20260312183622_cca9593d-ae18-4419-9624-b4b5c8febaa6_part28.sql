-- ============================================================
-- TRIGGER: aggiorna stats anagrafica dopo inserimento fattura
-- ============================================================
CREATE OR REPLACE FUNCTION public.aggiorna_stats_anagrafica_native()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.anagrafica_id IS NOT NULL AND NEW.tipo IN ('fattura','fattura_pa')
     AND NEW.stato NOT IN ('bozza','annullata','stornata') THEN
    UPDATE public.anagrafiche_native SET
      fatturato_totale = (
        SELECT COALESCE(SUM(totale_documento),0)
        FROM public.documenti_fiscali
        WHERE anagrafica_id = NEW.anagrafica_id
        AND tipo IN ('fattura','fattura_pa')
        AND stato NOT IN ('bozza','annullata','stornata')
      ),
      numero_fatture = (
        SELECT COUNT(*) FROM public.documenti_fiscali
        WHERE anagrafica_id = NEW.anagrafica_id
        AND tipo IN ('fattura','fattura_pa')
        AND stato NOT IN ('bozza','annullata','stornata')
      ),
      ultima_fattura_at = NOW()
    WHERE id = NEW.anagrafica_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql
SET search_path = public;
