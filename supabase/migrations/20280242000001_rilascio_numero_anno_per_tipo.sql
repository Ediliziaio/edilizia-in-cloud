-- ============================================================================
-- rilascia_numero_documento: controllava l'anno sbagliato.
--
-- Quando l'utente apre una nuova fattura e poi esce senza scriverci niente,
-- il numero va restituito al contatore: se ne occupa questa funzione. Ma per
-- capire se il documento appartiene all'anno in corso guardava
-- COALESCE(anno_corrente, anno_corrente_fattura), mentre chi ASSEGNA i numeri
-- (genera_numero_documento_native) tiene un anno separato per tipo:
-- anno_corrente_fattura, anno_corrente_preventivo, anno_corrente_proforma —
-- e non scrive MAI la colonna anno_corrente.
--
-- Oggi il guasto dorme perche' tutte le colonne valgono 2026. Al primo
-- documento del 2027 il generatore portera' avanti il suo anno per tipo,
-- mentre anno_corrente restera' 2026: la condizione qui non sara' mai vera,
-- il contatore non verra' piu' decrementato e ogni bozza abbandonata
-- bruciera' un numero. Sulle fatture significa buchi nella numerazione.
--
-- Qui allineiamo il rilascio al generatore, tipo per tipo:
--   fattura + varianti (fattura_pa, autofattura, integrazione_*) → anno_corrente_fattura
--   preventivo                                                   → anno_corrente_preventivo
--   proforma                                                     → anno_corrente_proforma
--   nota_credito, ddt   → nessun controllo d'anno: il generatore non li azzera
--                         a inizio anno, la loro serie e' continua.
-- Le varianti fattura prima cadevano nell'ELSE: uscivano con FALSE senza
-- rilasciare il numero E senza cancellare la bozza, che restava li'.
--
-- Invariato: si rilascia solo se il documento e' ancora 'bozza', e solo se il
-- suo progressivo e' l'ultimo emesso (rinumerare i documenti successivi non
-- si puo', quindi in mezzo alla serie il buco resta — corretto).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.rilascia_numero_documento(p_documento_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_doc RECORD;
  v_company_id UUID;
  v_progressivo INTEGER;
  v_tipo TEXT;
  v_anno INTEGER;
  v_rilasciato BOOLEAN := FALSE;
BEGIN
  -- [audit sicurezza 2026-08-27] guardia anti cross-tenant
  IF (SELECT x.company_id FROM public.documenti_fiscali x WHERE x.id = p_documento_id) IS NOT NULL
     AND NOT public.user_can_access_company((SELECT x.company_id FROM public.documenti_fiscali x WHERE x.id = p_documento_id)) THEN
    RAISE EXCEPTION 'accesso negato: azienda non consentita' USING ERRCODE = '42501';
  END IF;

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

  -- Decrementa solo se il progressivo del doc e' il piu' alto emesso per
  -- quel tipo/anno/azienda, e confrontando l'anno col contatore GIUSTO.
  CASE v_tipo
    WHEN 'fattura', 'fattura_pa', 'autofattura',
         'integrazione_servizi_estero', 'integrazione_beni_ue', 'integrazione_beni_extra_ue' THEN
      UPDATE public.anagrafica_azienda
      SET ultimo_numero_fattura = ultimo_numero_fattura - 1
      WHERE company_id = v_company_id
        AND anno_corrente_fattura = v_anno
        AND ultimo_numero_fattura = v_progressivo;
      IF FOUND THEN v_rilasciato := TRUE; END IF;

    WHEN 'preventivo' THEN
      UPDATE public.anagrafica_azienda
      SET ultimo_numero_preventivo = ultimo_numero_preventivo - 1
      WHERE company_id = v_company_id
        AND anno_corrente_preventivo = v_anno
        AND ultimo_numero_preventivo = v_progressivo;
      IF FOUND THEN v_rilasciato := TRUE; END IF;

    WHEN 'proforma' THEN
      UPDATE public.anagrafica_azienda
      SET ultimo_numero_proforma = ultimo_numero_proforma - 1
      WHERE company_id = v_company_id
        AND anno_corrente_proforma = v_anno
        AND ultimo_numero_proforma = v_progressivo;
      IF FOUND THEN v_rilasciato := TRUE; END IF;

    -- Nota di credito e DDT: serie continua, il generatore non le azzera a
    -- inizio anno → qui niente controllo d'anno, altrimenti dal 2027 il
    -- numero non tornerebbe mai indietro.
    WHEN 'nota_credito' THEN
      UPDATE public.anagrafica_azienda
      SET ultimo_numero_nc = ultimo_numero_nc - 1
      WHERE company_id = v_company_id
        AND ultimo_numero_nc = v_progressivo;
      IF FOUND THEN v_rilasciato := TRUE; END IF;

    WHEN 'ddt' THEN
      UPDATE public.anagrafica_azienda
      SET ultimo_numero_ddt = ultimo_numero_ddt - 1
      WHERE company_id = v_company_id
        AND ultimo_numero_ddt = v_progressivo;
      IF FOUND THEN v_rilasciato := TRUE; END IF;

    ELSE
      RETURN FALSE;
  END CASE;

  -- La bozza vuota se ne va comunque: se il numero non era l'ultimo, il buco
  -- resta ma il documento fantasma no.
  DELETE FROM public.documenti_fiscali WHERE id = p_documento_id;

  RETURN v_rilasciato;
END;
$function$;
