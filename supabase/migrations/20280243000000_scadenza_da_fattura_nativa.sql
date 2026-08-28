-- ============================================================================
-- La fatturazione nativa non generava la scadenza di incasso.
--
-- Quando una fattura nasce dalla sincronizzazione (tabella invoices) la sua
-- scadenza "da incassare" viene creata a valle. Ma la fatturazione NATIVA
-- (documenti_fiscali) non aveva questo ponte: una fattura emessa dal
-- gestionale non produceva NESSUNA scadenza. Risultato: spariva dallo
-- scadenzario e dalla previsione di cassa — 22 fatture emesse su Demo 2,
-- tutte senza il loro credito (10.370 €). Nessuna azienda reale ne aveva
-- ancora emesse in volume, ma il buco era strutturale: da chiudere prima che
-- qualcuno fatturi davvero col nativo.
--
-- Trigger: quando una fattura/NC nativa passa a uno stato emesso (non piu'
-- bozza, non annullata) crea — o aggiorna se gia' c'e' — la scadenza di
-- incasso. Idempotente (upsert logico via numero nelle note); segue la
-- fattura se cambia importo/scadenza finche' non e' incassata a mano.
--   fattura → credito positivo (incasso_cliente, direction 'entrata' generata)
--   nota_credito → storno (importo negativo, riduce il dovuto)
-- Data scadenza: data_scadenza del documento, altrimenti +30gg dall'emissione.
-- Solo la nativa cliente: proforma/preventivo/ddt non sono crediti fiscali.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.sync_scadenza_da_documento_fiscale()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_scad_id uuid;
  v_due date;
  v_amount numeric;
  v_tag text;
BEGIN
  -- Solo fatture e note di credito, non i documenti non fiscali
  IF NEW.tipo NOT IN ('fattura', 'fattura_pa', 'nota_credito') THEN
    RETURN NEW;
  END IF;

  v_tag := '[DOC:' || NEW.id::text || ']';  -- ancora stabile per ritrovare la scadenza

  -- Documento tornato in bozza o annullato → via l'eventuale scadenza (se non
  -- gia' incassata: un incasso registrato non si cancella da solo)
  IF NEW.stato IN ('bozza', 'annullata') THEN
    DELETE FROM public.scadenze
    WHERE company_id = NEW.company_id
      AND notes LIKE '%' || v_tag || '%'
      AND COALESCE(paid_amount, 0) = 0;
    RETURN NEW;
  END IF;

  v_due := COALESCE(NEW.data_scadenza, NEW.data_emissione + 30, CURRENT_DATE + 30);
  -- Nota di credito = storno: importo negativo
  v_amount := CASE WHEN NEW.tipo = 'nota_credito'
                   THEN -1 * COALESCE(NEW.totale_documento, 0)
                   ELSE COALESCE(NEW.totale_da_pagare, NEW.totale_documento, 0) END;

  IF v_amount = 0 THEN
    RETURN NEW;
  END IF;

  SELECT id INTO v_scad_id
  FROM public.scadenze
  WHERE company_id = NEW.company_id AND notes LIKE '%' || v_tag || '%'
  LIMIT 1;

  IF v_scad_id IS NULL THEN
    INSERT INTO public.scadenze (company_id, tipo, description, amount, due_date,
           status, order_id, is_auto_generated, auto_source, notes, created_at)
    VALUES (NEW.company_id, 'incasso_cliente',
           NEW.numero || ' — ' || COALESCE(NEW.cliente_snapshot->>'ragione_sociale', 'Cliente'),
           v_amount, v_due,
           CASE WHEN NEW.stato = 'pagata' THEN 'pagata' ELSE 'da_pagare' END,
           NEW.ordine_id, true, 'documento_fiscale', v_tag, now());
  ELSE
    -- Aggiorna l'esistente, ma non calpestare un incasso gia' registrato
    UPDATE public.scadenze
    SET amount = v_amount, due_date = v_due,
        status = CASE WHEN NEW.stato = 'pagata' THEN 'pagata'
                      WHEN COALESCE(paid_amount, 0) > 0 THEN status
                      ELSE 'da_pagare' END,
        updated_at = now()
    WHERE id = v_scad_id;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_scadenza_da_documento_fiscale ON public.documenti_fiscali;
CREATE TRIGGER trg_scadenza_da_documento_fiscale
  AFTER INSERT OR UPDATE OF stato, totale_da_pagare, data_scadenza
  ON public.documenti_fiscali
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_scadenza_da_documento_fiscale();

-- ── Backfill: le fatture native gia' emesse senza scadenza ──────────────────
INSERT INTO public.scadenze (company_id, tipo, description, amount, due_date,
       status, order_id, is_auto_generated, auto_source, notes, created_at)
SELECT d.company_id, 'incasso_cliente',
       d.numero || ' — ' || COALESCE(d.cliente_snapshot->>'ragione_sociale', 'Cliente'),
       CASE WHEN d.tipo = 'nota_credito' THEN -1 * COALESCE(d.totale_documento, 0)
            ELSE COALESCE(d.totale_da_pagare, d.totale_documento, 0) END,
       COALESCE(d.data_scadenza, d.data_emissione + 30, CURRENT_DATE + 30),
       CASE WHEN d.stato = 'pagata' THEN 'pagata' ELSE 'da_pagare' END,
       d.ordine_id, true, 'documento_fiscale', '[DOC:' || d.id::text || ']', now()
FROM public.documenti_fiscali d
WHERE d.tipo IN ('fattura', 'fattura_pa', 'nota_credito')
  AND d.stato NOT IN ('bozza', 'annullata')
  AND COALESCE(d.totale_da_pagare, d.totale_documento, 0) <> 0
  AND NOT EXISTS (
    SELECT 1 FROM public.scadenze s
    WHERE s.company_id = d.company_id
      AND s.notes LIKE '%[DOC:' || d.id::text || ']%'
  );
