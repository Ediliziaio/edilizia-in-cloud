-- Audit fatturazione: FIX SICUREZZA + SOLDI sulle RPC incassi.
--
-- P0 sicurezza: registra_incasso_atomico / storna_incasso_atomico erano
-- SECURITY DEFINER concesse a `anon` + PUBLIC e si fidavano di `p_company_id`
-- passato dal chiamante senza verificare che l'utente appartenga a quella
-- azienda → chiunque (anche non loggato) poteva registrare/stornare incassi e
-- scrivere in prima_nota di QUALSIASI azienda.
--   Fix: REVOKE da anon/PUBLIC + guardia in-funzione (get_my_company_id()==p_company_id,
--   con bypass solo per service_role/edge dove auth.uid() IS NULL).
-- P1 soldi: registra non validava l'importo → overpay (importo_pagato > totale) o
--   importo negativo. Aggiunta guardia (>0 e <= residuo).
-- P1 bomba latente: il trigger update_fattura_stato_on_movimento sommava
--   `tipo='entrata'` (valore inesistente nel CHECK: incasso/pagamento/storno/rettifica)
--   → SUM sempre 0. Corretto a `tipo='incasso'`.

CREATE OR REPLACE FUNCTION public.registra_incasso_atomico(
  p_company_id uuid, p_documento_id uuid, p_importo numeric, p_metodo text,
  p_data_movimento date, p_riferimento text DEFAULT NULL, p_note text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  v_movimento_id uuid; v_totale numeric; v_pagato numeric;
  v_nuovo_pagato numeric; v_nuovo_stato text; v_numero text; v_tipo text;
BEGIN
  IF public.get_my_company_id() IS DISTINCT FROM p_company_id THEN
    IF auth.uid() IS NOT NULL THEN
      RAISE EXCEPTION 'Accesso negato: non autorizzato per questa azienda';
    END IF;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM documenti_fiscali WHERE id=p_documento_id AND company_id=p_company_id) THEN
    RAISE EXCEPTION 'Documento non trovato o accesso negato';
  END IF;

  SELECT totale_da_pagare, importo_pagato, numero, tipo
    INTO v_totale, v_pagato, v_numero, v_tipo
    FROM documenti_fiscali WHERE id=p_documento_id AND company_id=p_company_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Documento non trovato'; END IF;

  IF p_importo IS NULL OR p_importo <= 0 THEN
    RAISE EXCEPTION 'Importo incasso non valido (deve essere positivo)';
  END IF;
  IF (COALESCE(v_pagato,0) + p_importo) > COALESCE(v_totale,0) + 0.01 THEN
    RAISE EXCEPTION 'Incasso (% EUR) superiore al residuo da pagare', p_importo;
  END IF;

  INSERT INTO movimenti_cassa_native (company_id, documento_id, importo, tipo, metodo, data_movimento, riferimento, note)
  VALUES (p_company_id, p_documento_id, p_importo, 'incasso', p_metodo, p_data_movimento, p_riferimento, p_note)
  RETURNING id INTO v_movimento_id;

  v_nuovo_pagato := v_pagato + p_importo;
  v_nuovo_stato := CASE WHEN v_nuovo_pagato >= v_totale THEN 'pagata' ELSE 'parzialmente_pagata' END;

  UPDATE documenti_fiscali SET importo_pagato=v_nuovo_pagato, stato=v_nuovo_stato,
    pagato_at=CASE WHEN v_nuovo_stato='pagata' THEN now() ELSE NULL END, updated_at=now()
  WHERE id=p_documento_id;

  INSERT INTO prima_nota_entries (company_id, direction, category, description, amount, entry_date,
    payment_method, reference_number, is_auto, auto_source, documento_fiscale_id, movimento_id, notes)
  VALUES (p_company_id, 'entrata', 'Incassi fatture',
    'Incasso ' || CASE WHEN v_tipo='nota_credito' THEN 'NC' ELSE 'fattura' END || ' ' || COALESCE(v_numero,''),
    p_importo, p_data_movimento, p_metodo, p_riferimento, true, 'incasso_fattura', p_documento_id, v_movimento_id, p_note);

  RETURN v_movimento_id;
END; $function$;

CREATE OR REPLACE FUNCTION public.storna_incasso_atomico(p_company_id uuid, p_movimento_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  v_importo numeric; v_documento_id uuid; v_totale numeric; v_pagato numeric;
  v_nuovo_pagato numeric; v_nuovo_stato text;
BEGIN
  IF public.get_my_company_id() IS DISTINCT FROM p_company_id THEN
    IF auth.uid() IS NOT NULL THEN
      RAISE EXCEPTION 'Accesso negato: non autorizzato per questa azienda';
    END IF;
  END IF;

  DELETE FROM movimenti_cassa_native WHERE id=p_movimento_id AND company_id=p_company_id
  RETURNING importo, documento_id INTO v_importo, v_documento_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Movimento non trovato o accesso negato'; END IF;

  IF v_documento_id IS NOT NULL THEN
    SELECT totale_da_pagare, importo_pagato INTO v_totale, v_pagato
      FROM documenti_fiscali WHERE id=v_documento_id AND company_id=p_company_id FOR UPDATE;
    IF FOUND THEN
      v_nuovo_pagato := GREATEST(0, v_pagato - v_importo);
      v_nuovo_stato := CASE WHEN v_nuovo_pagato >= v_totale THEN 'pagata'
        WHEN v_nuovo_pagato > 0 THEN 'parzialmente_pagata' ELSE 'emessa' END;
      UPDATE documenti_fiscali SET importo_pagato=v_nuovo_pagato, stato=v_nuovo_stato,
        pagato_at=CASE WHEN v_nuovo_stato='pagata' THEN pagato_at ELSE NULL END, updated_at=now()
      WHERE id=v_documento_id;
    END IF;
  END IF;
END; $function$;

REVOKE EXECUTE ON FUNCTION public.registra_incasso_atomico(uuid,uuid,numeric,text,date,text,text) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.storna_incasso_atomico(uuid,uuid) FROM anon, PUBLIC;

CREATE OR REPLACE FUNCTION public.update_fattura_stato_on_movimento()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE v_doc_id UUID; v_totale NUMERIC; v_incassato NUMERIC; v_nuovo TEXT;
BEGIN
  v_doc_id := COALESCE(NEW.documento_id, OLD.documento_id);
  IF v_doc_id IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;
  SELECT totale_da_pagare INTO v_totale FROM public.documenti_fiscali WHERE id=v_doc_id;
  IF NOT FOUND THEN RETURN COALESCE(NEW, OLD); END IF;
  SELECT COALESCE(SUM(importo),0) INTO v_incassato FROM public.movimenti_cassa_native
    WHERE documento_id=v_doc_id AND tipo='incasso';
  IF v_incassato >= v_totale THEN v_nuovo := 'pagata';
  ELSIF v_incassato > 0 THEN v_nuovo := 'parzialmente_pagata';
  ELSE v_nuovo := 'emessa'; END IF;
  UPDATE public.documenti_fiscali SET stato=v_nuovo, importo_pagato=v_incassato,
    pagato_at=CASE WHEN v_incassato >= v_totale THEN NOW() ELSE NULL END, updated_at=NOW()
  WHERE id=v_doc_id AND stato NOT IN ('annullata','rifiutata','bozza');
  RETURN COALESCE(NEW, OLD);
END; $function$;
