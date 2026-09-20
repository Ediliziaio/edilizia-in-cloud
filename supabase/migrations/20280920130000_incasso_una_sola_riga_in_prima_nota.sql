-- Un incasso, una riga in prima nota (audit 20/09/2026).
--
-- registra_incasso_atomico inseriva per primo il movimento di cassa. Quello fa
-- scattare update_fattura_stato_on_movimento, che porta subito il documento a
-- 'pagata', e quel cambio di stato sveglia sync_scadenza_da_documento_fiscale:
-- a quel punto la scadenza risultava ancora scoperta e in prima nota non c'era
-- niente, così il trigger registrava un'entrata per l'intero importo
-- (auto_source = 'documento_fiscale'). Subito dopo la RPC scriveva la SUA riga
-- (auto_source = 'incasso_fattura'). L'indice unico sulle registrazioni
-- automatiche non se ne accorgeva: è parziale su 'documento_fiscale'.
--
-- Provato in produzione il 20/09/2026 su una fattura da 1.220 €: in prima nota
-- finivano 2.440 €, due righe da 1.220. Nessun caso reale in archivio — il ciclo
-- nativo non lo usa ancora nessun cliente — ma sarebbe scattato al primo incasso
-- a saldo del primo cliente che lo usa.
--
-- Due interventi, indipendenti:
--   1. la RPC mette in ordine scadenza e prima nota PRIMA di inserire il
--      movimento, così quando il trigger si sveglia trova il residuo a zero e
--      la registrazione già fatta (ed è giusto di suo: incassare una fattura
--      chiude anche la sua scadenza);
--   2. il trigger non registra più nulla se per quel documento esiste già una
--      registrazione automatica di cassa, qualunque ne sia l'origine.

SET lock_timeout = '3s';
SET statement_timeout = '60s';

-- ── 1. L'incasso chiude anche la scadenza ──────────────────────────────────
CREATE OR REPLACE FUNCTION public.registra_incasso_atomico(
  p_company_id uuid, p_documento_id uuid, p_importo numeric, p_metodo text,
  p_data_movimento date, p_riferimento text DEFAULT NULL::text, p_note text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_movimento_id uuid; v_totale numeric; v_pagato numeric;
  v_nuovo_pagato numeric; v_nuovo_stato text; v_numero text; v_tipo text;
  v_pn_id uuid; v_tag text;
BEGIN
  -- SEC: solo utente della company richiesta (o service_role da edge). anon è revocato.
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

  -- Guardia importo: positivo e non oltre il residuo (anti overpay/negativo)
  IF p_importo IS NULL OR p_importo <= 0 THEN
    RAISE EXCEPTION 'Importo incasso non valido (deve essere positivo)';
  END IF;
  IF (COALESCE(v_pagato,0) + p_importo) > COALESCE(v_totale,0) + 0.01 THEN
    RAISE EXCEPTION 'Incasso (% EUR) superiore al residuo da pagare', p_importo;
  END IF;

  -- ORDINE IMPORTANTE. Inserire il movimento di cassa fa scattare
  -- update_fattura_stato_on_movimento, che porta SUBITO il documento a 'pagata';
  -- quel cambio di stato sveglia il trigger delle scadenze, che se trova la
  -- scadenza ancora scoperta e nessuna registrazione di cassa ne scrive una lui.
  -- Perciò prima si mette in ordine la scadenza e si scrive la riga di prima
  -- nota, e solo dopo si inserisce il movimento.

  INSERT INTO prima_nota_entries (company_id, direction, category, description, amount, entry_date,
    payment_method, reference_number, is_auto, auto_source, documento_fiscale_id, notes)
  VALUES (p_company_id, 'entrata', 'Incassi fatture',
    'Incasso ' || CASE WHEN v_tipo='nota_credito' THEN 'NC' ELSE 'fattura' END || ' ' || COALESCE(v_numero,''),
    p_importo, p_data_movimento, p_metodo, p_riferimento, true, 'incasso_fattura', p_documento_id, p_note)
  RETURNING id INTO v_pn_id;

  -- Le scadenze dei documenti fiscali si riconoscono dal tag nelle note.
  v_tag := '[DOC:' || p_documento_id::text || ']';
  UPDATE scadenze
     SET paid_amount = LEAST(COALESCE(paid_amount, 0) + p_importo, amount),
         status = CASE WHEN COALESCE(paid_amount, 0) + p_importo >= amount - 0.01
                       THEN 'pagata' ELSE 'parziale' END,
         paid_date = p_data_movimento,
         prima_nota_entry_id = COALESCE(prima_nota_entry_id, v_pn_id),
         updated_at = now()
   WHERE company_id = p_company_id
     AND notes LIKE '%' || v_tag || '%'
     AND status <> 'annullata';

  INSERT INTO movimenti_cassa_native (company_id, documento_id, importo, tipo, metodo, data_movimento, riferimento, note)
  VALUES (p_company_id, p_documento_id, p_importo, 'incasso', p_metodo, p_data_movimento, p_riferimento, p_note)
  RETURNING id INTO v_movimento_id;

  UPDATE prima_nota_entries SET movimento_id = v_movimento_id WHERE id = v_pn_id;

  v_nuovo_pagato := v_pagato + p_importo;
  v_nuovo_stato := CASE WHEN v_nuovo_pagato >= v_totale THEN 'pagata' ELSE 'parzialmente_pagata' END;

  UPDATE documenti_fiscali SET importo_pagato=v_nuovo_pagato, stato=v_nuovo_stato,
    pagato_at=CASE WHEN v_nuovo_stato='pagata' THEN now() ELSE NULL END, updated_at=now()
  WHERE id=p_documento_id;

  RETURN v_movimento_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.registra_incasso_atomico(uuid, uuid, numeric, text, date, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registra_incasso_atomico(uuid, uuid, numeric, text, date, text, text) TO authenticated, service_role;

-- ── 2. Il trigger non raddoppia una registrazione già fatta ────────────────
-- Unica differenza rispetto a prima: la EXISTS che protegge l'inserimento non
-- guarda più solo le righe con auto_source = 'documento_fiscale', ma qualunque
-- registrazione automatica di cassa legata allo stesso documento.
CREATE OR REPLACE FUNCTION public.sync_scadenza_da_documento_fiscale()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_scad_id uuid;
  v_scad_amount numeric;
  v_scad_paid numeric;
  v_due date;
  v_amount numeric;
  v_tag text;
  v_pn_id uuid;
  v_residuo numeric;
  v_pn_amount numeric;
BEGIN
  -- Solo fatture: la nota di credito non genera un credito da incassare
  -- (e scadenze vieta gli importi negativi).
  IF NEW.tipo NOT IN ('fattura', 'fattura_pa') THEN
    RETURN NEW;
  END IF;

  v_tag := '[DOC:' || NEW.id::text || ']';

  -- ── Documento tornato bozza o annullato: si smonta tutto ────────────────
  IF NEW.stato IN ('bozza', 'annullata') THEN
    DELETE FROM public.prima_nota_entries
    WHERE documento_fiscale_id = NEW.id
      AND is_auto = true AND auto_source = 'documento_fiscale'
    RETURNING amount INTO v_pn_amount;

    IF v_pn_amount IS NOT NULL THEN
      UPDATE public.scadenze
      SET paid_amount = GREATEST(0, COALESCE(paid_amount, 0) - v_pn_amount),
          paid_date = NULL,
          prima_nota_entry_id = NULL,
          updated_at = now()
      WHERE company_id = NEW.company_id AND notes LIKE '%' || v_tag || '%';
    END IF;

    DELETE FROM public.scadenze
    WHERE company_id = NEW.company_id
      AND notes LIKE '%' || v_tag || '%'
      AND COALESCE(paid_amount, 0) = 0;
    RETURN NEW;
  END IF;

  v_due := COALESCE(NEW.data_scadenza, NEW.data_emissione + 30, CURRENT_DATE + 30);
  v_amount := COALESCE(NEW.totale_da_pagare, NEW.totale_documento, 0);

  IF v_amount <= 0 THEN
    RETURN NEW;
  END IF;

  SELECT id, amount, COALESCE(paid_amount, 0)
    INTO v_scad_id, v_scad_amount, v_scad_paid
  FROM public.scadenze
  WHERE company_id = NEW.company_id AND notes LIKE '%' || v_tag || '%'
  LIMIT 1;

  IF v_scad_id IS NULL THEN
    INSERT INTO public.scadenze (company_id, tipo, description, amount, due_date,
           status, order_id, is_auto_generated, auto_source, notes, created_at)
    VALUES (NEW.company_id, 'incasso_cliente',
           NEW.numero || ' — ' || COALESCE(NEW.cliente_snapshot->>'ragione_sociale', 'Cliente'),
           v_amount, v_due, 'da_pagare',
           NEW.ordine_id, true, 'documento_fiscale', v_tag, now())
    RETURNING id, amount, COALESCE(paid_amount, 0)
      INTO v_scad_id, v_scad_amount, v_scad_paid;
  ELSE
    UPDATE public.scadenze
    SET amount = v_amount, due_date = v_due, updated_at = now()
    WHERE id = v_scad_id;
    v_scad_amount := v_amount;
  END IF;

  IF NEW.stato = 'pagata' THEN
    v_residuo := v_scad_amount - v_scad_paid;

    -- Niente da fare se è già tutto incassato o se una registrazione
    -- automatica per questo documento esiste già: fino al 20/09/2026 qui si
    -- guardava solo auto_source = 'documento_fiscale', e l'incasso scritto da
    -- registra_incasso_atomico ('incasso_fattura') veniva contato due volte.
    IF v_residuo > 0 AND NOT EXISTS (
      SELECT 1 FROM public.prima_nota_entries
      WHERE documento_fiscale_id = NEW.id AND is_auto = true
    ) THEN
      INSERT INTO public.prima_nota_entries (
        company_id, direction, category, description, amount, entry_date,
        account_label, order_id, scadenza_id, documento_fiscale_id,
        is_auto, auto_source, created_by
      ) VALUES (
        NEW.company_id, 'entrata', 'incasso',
        'Incasso ' || NEW.numero || ' — ' ||
          COALESCE(NEW.cliente_snapshot->>'ragione_sociale', 'Cliente'),
        v_residuo, COALESCE(NEW.pagato_at::date, CURRENT_DATE),
        'banca', NEW.ordine_id, v_scad_id, NEW.id,
        true, 'documento_fiscale', (SELECT auth.uid())
      )
      RETURNING id INTO v_pn_id;

      UPDATE public.scadenze
      SET paid_amount = v_scad_amount,
          status = 'pagata',
          paid_date = COALESCE(NEW.pagato_at::date, CURRENT_DATE),
          prima_nota_entry_id = v_pn_id,
          updated_at = now()
      WHERE id = v_scad_id;
    END IF;

  ELSE
    -- Non è più pagata: si annulla SOLO la registrazione automatica del trigger.
    DELETE FROM public.prima_nota_entries
    WHERE documento_fiscale_id = NEW.id
      AND is_auto = true AND auto_source = 'documento_fiscale'
    RETURNING amount INTO v_pn_amount;

    IF v_pn_amount IS NOT NULL THEN
      UPDATE public.scadenze
      SET paid_amount = GREATEST(0, COALESCE(paid_amount, 0) - v_pn_amount),
          status = CASE WHEN GREATEST(0, COALESCE(paid_amount, 0) - v_pn_amount) > 0
                        THEN 'parziale' ELSE 'da_pagare' END,
          paid_date = NULL,
          prima_nota_entry_id = NULL,
          updated_at = now()
      WHERE id = v_scad_id;
    ELSIF v_scad_paid = 0 THEN
      UPDATE public.scadenze SET status = 'da_pagare', updated_at = now()
      WHERE id = v_scad_id AND status <> 'da_pagare';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;
