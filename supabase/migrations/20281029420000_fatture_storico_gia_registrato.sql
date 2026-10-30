-- Fatture importate dal gestionale di prima: già registrate, pagate e incassate.
-- (Richiesta Dimora Torino, vale per tutti.)
--
-- Chi arriva da un altro software importa da Fatture in Cloud anni di fatture che
-- là sono già chiuse. Qui nascevano «da incassare» (le emesse che FIC non segna
-- pagate) e «da leggere/contabilizzare» (tutte le ricevute): migliaia di cose da
-- fare che non sono da fare. Dimora oggi: 19 emesse aperte su 199, 1.221
-- ricevute da contabilizzare su 1.271.
--
-- billing_integrations.storico_registrato_fino_al = data di taglio. Ogni fattura
-- importata con data fino a quel giorno è storico:
--   · emesse: stato 'paid', paid_amount = totale, payment_date = scadenza (o data
--     della fattura), storico_esterno = true. Nessuna scadenza nuova; quelle già
--     aperte si chiudono (auto_reconcile_invoice_payment). Nessun invoice_payments,
--     nessun movimento di cassa, nessuna prima nota, nessun invio SDI: la sola
--     scrittura di cassa sulle fatture passa da invoice_payments e dagli incassi
--     registrati in app, che qui non si toccano.
--   · ricevute: stato 'contabilizzata' senza costo e senza prima nota,
--     storico_esterno = true. Non creano costi, rate fornitori o scadenze (le
--     crea solo la contabilizzazione vera, che a stato 'contabilizzata' non si
--     offre più). Restano nel registro IVA come prima.
-- Le fatture dopo la data di taglio seguono le regole di sempre.
--
-- Trigger verificati il 29/10/2026:
--   invoices: trg_auto_scadenza_from_invoice (qui: niente scadenza per lo storico),
--     trg_auto_reconcile_invoice (chiude le scadenze aperte, nessuna cassa),
--     trg_incassa_rata_da_fattura_pagata (segna incassata la rata di commessa
--     legata alla fattura: è vero, è stata incassata; nessuna cassa, solo diario),
--     trg_fire_invoice_automation e trg_invoices_fattura_emessa (già spenti per le
--     importate), trg_rate_date_da_fattura (solo date rate), anno fiscale,
--     onboarding, registro azioni.
--   fatture_ricevute: fiscalita_guard (il cambio fra non_letta/letta/contabilizzata
--     non è fiscale), aggancia_fattura_a_oda (solo su INSERT/cambio importi: come
--     prima), rate_fornitori_da_fattura (solo con company_cost_id: lo storico non
--     ne ha), porta_costo_su_ordine (idem), impronta, updated_at, registro azioni.

SET LOCAL lock_timeout = '3s';

ALTER TABLE public.billing_integrations
  ADD COLUMN IF NOT EXISTS storico_registrato_fino_al date;
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS storico_esterno boolean NOT NULL DEFAULT false;
ALTER TABLE public.fatture_ricevute
  ADD COLUMN IF NOT EXISTS storico_esterno boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.billing_integrations.storico_registrato_fino_al IS
  'Data di taglio: le fatture importate fino a questo giorno sono già registrate, pagate e incassate nel gestionale di prima.';
COMMENT ON COLUMN public.invoices.storico_esterno IS
  'Fattura importata come storico già incassato (data <= storico_registrato_fino_al): niente scadenze, niente incassi.';
COMMENT ON COLUMN public.fatture_ricevute.storico_esterno IS
  'Fattura ricevuta importata come storico già registrato e pagato: contabilizzata senza costo.';

-- Niente scadenza per lo storico: non c'è niente da incassare. Il resto della
-- funzione è identico.
CREATE OR REPLACE FUNCTION public.auto_create_scadenza_from_invoice()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_tipo TEXT;
  v_description TEXT;
  v_importata boolean := NEW.external_provider IS NOT NULL;
  v_pagata boolean;
  v_stato text;
BEGIN
  IF NEW.due_date IS NULL OR COALESCE(NEW.total, 0) <= 0 THEN
    RETURN NEW;
  END IF;

  -- Per le fatture importate lo stato del pagamento arriva dal gestionale
  -- esterno (FIC, Aruba…): la scadenza lo segue. Le native passano dagli
  -- incassi registrati in app, come prima.
  v_pagata := v_importata AND (NEW.status = 'paid' OR COALESCE(NEW.paid_amount, 0) >= COALESCE(NEW.total, 0) - 0.01);
  v_stato := CASE
    WHEN v_pagata THEN 'pagata'
    WHEN v_importata AND COALESCE(NEW.paid_amount, 0) > 0 THEN 'parziale'
    ELSE 'da_pagare'
  END;

  -- Una scadenza per fattura. Prima si guardavano solo quelle aperte: con la
  -- scadenza già pagata, un cambio di stato della fattura ne creava una nuova.
  IF EXISTS (SELECT 1 FROM scadenze WHERE invoice_id = NEW.id) THEN
    IF TG_OP = 'UPDATE' THEN
      IF OLD.total IS DISTINCT FROM NEW.total OR OLD.due_date IS DISTINCT FROM NEW.due_date THEN
        UPDATE scadenze SET
          amount = COALESCE(NEW.total, 0),
          due_date = NEW.due_date,
          description = CASE
            WHEN NEW.document_type IN ('nota_credito', 'credit_note') THEN 'Nota credito ' || COALESCE(NEW.invoice_number, '')
            ELSE 'Fattura ' || COALESCE(NEW.invoice_number, '') || ' - ' || COALESCE(NEW.client_company_name, '')
          END,
          updated_at = now()
        WHERE invoice_id = NEW.id AND status IN ('da_pagare', 'parziale');
      END IF;
      IF v_importata AND v_stato <> 'da_pagare' THEN
        UPDATE scadenze SET
          status = v_stato,
          paid_amount = CASE WHEN v_pagata THEN amount ELSE LEAST(COALESCE(NEW.paid_amount, 0), amount) END,
          paid_date = CASE WHEN v_pagata AND NEW.storico_esterno THEN COALESCE(paid_date, NEW.payment_date) ELSE paid_date END,
          updated_at = now()
        WHERE invoice_id = NEW.id
          AND auto_source = 'invoice'
          AND status IN ('da_pagare', 'parziale')
          AND status IS DISTINCT FROM v_stato;
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  -- Storico già incassato nel gestionale di prima: nessuna scadenza.
  IF NEW.storico_esterno THEN
    RETURN NEW;
  END IF;

  IF NEW.document_type IN ('fattura', 'fattura_accompagnatoria', 'parcella', 'invoice') THEN
    v_tipo := 'incasso_cliente';
    v_description := 'Fattura ' || COALESCE(NEW.invoice_number, '') || ' - ' || COALESCE(NEW.client_company_name, '');
  ELSIF NEW.document_type IN ('nota_credito', 'credit_note') THEN
    v_tipo := 'pagamento_fornitore';
    v_description := 'Nota credito ' || COALESCE(NEW.invoice_number, '') || ' - ' || COALESCE(NEW.client_company_name, '');
  ELSE
    RETURN NEW;
  END IF;

  -- NB: NON inserire "direction": è una colonna GENERATED ALWAYS (calcolata da tipo).
  INSERT INTO scadenze (
    company_id, tipo, description, amount, due_date,
    invoice_id, order_id, status, paid_amount, is_auto_generated, auto_source,
    alert_days_before, created_by
  ) VALUES (
    NEW.company_id, v_tipo, v_description,
    COALESCE(NEW.total, 0), NEW.due_date,
    NEW.id, NEW.order_id, v_stato,
    CASE WHEN v_pagata THEN COALESCE(NEW.total, 0) WHEN v_stato = 'parziale' THEN NEW.paid_amount ELSE 0 END,
    true, 'invoice',
    7, NEW.created_by
  );

  RETURN NEW;
END;
$function$;

-- Segna storico le fatture già importate fino alla data di taglio (e salva la
-- data sull'integrazione). Le nuove le marca l'import stesso. Gira coi permessi
-- di chi la chiama: le policy di invoices, fatture_ricevute e
-- billing_integrations decidono, come per le stesse modifiche fatte a mano.
-- p_fino_al NULL = togli la data di taglio (le fatture già segnate restano).
CREATE OR REPLACE FUNCTION public.fatturazione_segna_storico(p_integrazione_id uuid, p_fino_al date)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public'
SET lock_timeout TO '3s'
SET statement_timeout TO '60s'
AS $function$
DECLARE
  v_integ record;
  v_emesse integer := 0;
  v_ricevute integer := 0;
BEGIN
  SELECT id, company_id, provider INTO v_integ
    FROM public.billing_integrations WHERE id = p_integrazione_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Collegamento di fatturazione non trovato.' USING errcode = '42501';
  END IF;
  IF p_fino_al IS NOT NULL AND p_fino_al > (now() AT TIME ZONE 'Europe/Rome')::date THEN
    RAISE EXCEPTION 'La data di taglio non può essere nel futuro.' USING errcode = '22023';
  END IF;

  UPDATE public.billing_integrations
     SET storico_registrato_fino_al = p_fino_al, updated_at = now()
   WHERE id = v_integ.id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Non puoi modificare questo collegamento.' USING errcode = '42501';
  END IF;

  IF p_fino_al IS NULL THEN
    RETURN jsonb_build_object('fino_al', null, 'emesse', 0, 'ricevute', 0);
  END IF;

  -- Emesse dal gestionale collegato: chiuse come incassate. Le stornate e le
  -- annullate restano come sono (lo storno ha già deciso).
  UPDATE public.invoices i
     SET status = 'paid',
         paid_amount = CASE WHEN i.document_type IN ('credit_note', 'nota_credito') THEN i.paid_amount ELSE i.total END,
         payment_date = COALESCE(i.payment_date, i.due_date, i.issue_date),
         storico_esterno = true,
         updated_at = now()
   WHERE i.company_id = v_integ.company_id
     AND i.external_provider = v_integ.provider
     AND i.deleted_at IS NULL
     AND i.issue_date <= p_fino_al
     AND COALESCE(i.status, '') NOT IN ('credited', 'cancelled', 'draft')
     AND NOT (i.status = 'paid' AND i.storico_esterno);
  GET DIAGNOSTICS v_emesse = ROW_COUNT;

  -- Ricevute: solo quelle che nessuno ha ancora toccato (niente costo, niente
  -- prima nota, non rifiutate). Quelle importate a mano o dallo SDI contano uguale:
  -- fino alla data di taglio sono state registrate nel gestionale di prima.
  UPDATE public.fatture_ricevute f
     SET stato = 'contabilizzata',
         storico_esterno = true,
         updated_at = now()
   WHERE f.company_id = v_integ.company_id
     AND f.data_fattura <= p_fino_al
     AND f.stato IN ('non_letta', 'letta')
     AND f.company_cost_id IS NULL
     AND f.prima_nota_id IS NULL;
  GET DIAGNOSTICS v_ricevute = ROW_COUNT;

  RETURN jsonb_build_object('fino_al', p_fino_al, 'emesse', v_emesse, 'ricevute', v_ricevute);
END
$function$;

REVOKE ALL ON FUNCTION public.fatturazione_segna_storico(uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fatturazione_segna_storico(uuid, date) TO authenticated, service_role;
