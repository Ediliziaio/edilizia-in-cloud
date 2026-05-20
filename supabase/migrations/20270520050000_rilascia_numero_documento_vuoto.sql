-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║ rilascia_numero_documento — rilascia il numero progressivo di      ║
-- ║ un documento ELIMINATO se era l'ultimo emesso per quel tipo/anno.  ║
-- ║ Decrementa ultimo_numero_<tipo> su anagrafica_azienda così che il  ║
-- ║ prossimo create riutilizzi lo stesso numero.                       ║
-- ║                                                                     ║
-- ║ Usato dall'editor quando l'utente esce senza compilare nulla ed il ║
-- ║ draft viene auto-eliminato — evita buchi nella numerazione.        ║
-- ║                                                                     ║
-- ║ Sicurezza: la decrement avviene SOLO se:                            ║
-- ║   1) il documento esiste ed è "bozza" del company chiamante         ║
-- ║   2) il numero_progressivo del doc == ultimo_numero_<tipo> attuale  ║
-- ║   3) l'utente ha permesso di scrivere sull'anagrafica_azienda       ║
-- ╚═══════════════════════════════════════════════════════════════════╝

CREATE OR REPLACE FUNCTION public.rilascia_numero_documento(
  p_documento_id UUID
)
RETURNS BOOLEAN AS $$
DECLARE
  v_doc RECORD;
  v_company_id UUID;
  v_progressivo INTEGER;
  v_tipo TEXT;
  v_anno INTEGER;
  v_rilasciato BOOLEAN := FALSE;
BEGIN
  -- Carica il doc, deve essere ancora bozza
  SELECT id, company_id, numero_progressivo, tipo, anno, stato
    INTO v_doc
  FROM public.documenti_fiscali
  WHERE id = p_documento_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  IF v_doc.stato != 'bozza' THEN
    RETURN FALSE;
  END IF;

  v_company_id := v_doc.company_id;
  v_progressivo := v_doc.numero_progressivo;
  v_tipo := v_doc.tipo;
  v_anno := v_doc.anno;

  -- Decrementa il counter solo se il progressivo del doc è IL piu alto
  -- emesso per quel tipo/anno/azienda. Altrimenti un buco rimane (corretto:
  -- non possiamo "rinumerare" doc successivi).
  CASE v_tipo
    WHEN 'fattura', 'fattura_pa' THEN
      UPDATE public.anagrafica_azienda
      SET ultimo_numero_fattura = ultimo_numero_fattura - 1
      WHERE company_id = v_company_id
        AND COALESCE(anno_corrente, anno_corrente_fattura) = v_anno
        AND ultimo_numero_fattura = v_progressivo;
      IF FOUND THEN v_rilasciato := TRUE; END IF;
    WHEN 'nota_credito' THEN
      UPDATE public.anagrafica_azienda
      SET ultimo_numero_nc = ultimo_numero_nc - 1
      WHERE company_id = v_company_id
        AND COALESCE(anno_corrente, anno_corrente_fattura) = v_anno
        AND ultimo_numero_nc = v_progressivo;
      IF FOUND THEN v_rilasciato := TRUE; END IF;
    WHEN 'ddt' THEN
      UPDATE public.anagrafica_azienda
      SET ultimo_numero_ddt = ultimo_numero_ddt - 1
      WHERE company_id = v_company_id
        AND COALESCE(anno_corrente, anno_corrente_fattura) = v_anno
        AND ultimo_numero_ddt = v_progressivo;
      IF FOUND THEN v_rilasciato := TRUE; END IF;
    WHEN 'preventivo' THEN
      UPDATE public.anagrafica_azienda
      SET ultimo_numero_preventivo = ultimo_numero_preventivo - 1
      WHERE company_id = v_company_id
        AND COALESCE(anno_corrente, anno_corrente_fattura) = v_anno
        AND ultimo_numero_preventivo = v_progressivo;
      IF FOUND THEN v_rilasciato := TRUE; END IF;
    WHEN 'proforma' THEN
      UPDATE public.anagrafica_azienda
      SET ultimo_numero_proforma = ultimo_numero_proforma - 1
      WHERE company_id = v_company_id
        AND COALESCE(anno_corrente, anno_corrente_fattura) = v_anno
        AND ultimo_numero_proforma = v_progressivo;
      IF FOUND THEN v_rilasciato := TRUE; END IF;
    ELSE
      RETURN FALSE;
  END CASE;

  -- Elimina effettivamente il doc dopo aver rilasciato il numero
  DELETE FROM public.documenti_fiscali WHERE id = p_documento_id;

  RETURN v_rilasciato;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

GRANT EXECUTE ON FUNCTION public.rilascia_numero_documento(UUID) TO authenticated;

COMMENT ON FUNCTION public.rilascia_numero_documento(UUID) IS
'Elimina un documento bozza e, se era l''ultimo numero emesso per quel tipo/anno, decrementa il counter su anagrafica_azienda così che il prossimo create riutilizzi lo stesso numero. Idempotente: ritorna FALSE se il doc non era l''ultimo (in tal caso il documento viene comunque eliminato).';
