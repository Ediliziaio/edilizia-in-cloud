-- ============================================================================
-- "Segna pagata" su una fattura nativa non registrava l'incasso in cassa.
--
-- Due strade portano a "fattura incassata":
--   A) dallo scadenzario → mark_scadenza_paid: scrive la prima nota e chiude
--      la scadenza (importo incassato, data, riferimento). Completa.
--   B) dalla fattura → "Segna pagata": aggiornava solo lo stato del documento.
--      Con il trigger introdotto poco fa la scadenza passava a "pagata" ma con
--      importo incassato ZERO e nessuna riga in prima nota: i soldi non
--      entravano in cassa e la scadenza restava in uno stato incoerente.
--
-- Qui la strada B fa esattamente quello che fa la A, una volta sola.
--
-- Anti doppio conteggio, su tre livelli:
--   1. si registra solo se la scadenza ha ancora un residuo (se l'incasso e'
--      gia' stato messo a mano dallo scadenzario, non si tocca niente);
--   2. si registra solo se non esiste gia' la nostra riga automatica;
--   3. indice UNICO parziale su documento_fiscale_id per le righe automatiche:
--      la garanzia e' del database, non del codice. Stesso schema gia' usato
--      per le rate (uq_prima_nota_installment).
--
-- Se la fattura torna indietro da "pagata" si annulla SOLO la registrazione
-- automatica (una riga scritta a mano non si tocca mai) e la scadenza torna
-- aperta per l'importo corrispondente.
--
-- La nota di credito resta fuori dalla cassa: non e' un incasso. Continua a
-- comparire nello scadenzario come storno (importo negativo).
-- ============================================================================

CREATE UNIQUE INDEX IF NOT EXISTS uq_prima_nota_documento_fiscale_auto
  ON public.prima_nota_entries (documento_fiscale_id)
  WHERE documento_fiscale_id IS NOT NULL AND auto_source = 'documento_fiscale';

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
  IF NEW.tipo NOT IN ('fattura', 'fattura_pa', 'nota_credito') THEN
    RETURN NEW;
  END IF;

  v_tag := '[DOC:' || NEW.id::text || ']';

  -- ── Documento tornato bozza o annullato: si smonta tutto ────────────────
  IF NEW.stato IN ('bozza', 'annullata') THEN
    -- Prima si toglie la registrazione automatica di cassa...
    DELETE FROM public.prima_nota_entries
    WHERE documento_fiscale_id = NEW.id
      AND is_auto = true AND auto_source = 'documento_fiscale'
    RETURNING amount INTO v_pn_amount;

    -- ...e si scala l'incasso dalla scadenza, altrimenti resterebbe "pagata"
    -- e non verrebbe rimossa: un credito fantasma su una fattura annullata.
    IF v_pn_amount IS NOT NULL THEN
      UPDATE public.scadenze
      SET paid_amount = GREATEST(0, COALESCE(paid_amount, 0) - v_pn_amount),
          paid_date = NULL,
          prima_nota_entry_id = NULL,
          updated_at = now()
      WHERE company_id = NEW.company_id AND notes LIKE '%' || v_tag || '%';
    END IF;

    -- Via la scadenza, ma solo se non resta un incasso registrato a mano
    DELETE FROM public.scadenze
    WHERE company_id = NEW.company_id
      AND notes LIKE '%' || v_tag || '%'
      AND COALESCE(paid_amount, 0) = 0;
    RETURN NEW;
  END IF;

  v_due := COALESCE(NEW.data_scadenza, NEW.data_emissione + 30, CURRENT_DATE + 30);
  v_amount := CASE WHEN NEW.tipo = 'nota_credito'
                   THEN -1 * COALESCE(NEW.totale_documento, 0)
                   ELSE COALESCE(NEW.totale_da_pagare, NEW.totale_documento, 0) END;

  IF v_amount = 0 THEN
    RETURN NEW;
  END IF;

  -- ── La scadenza: creala o tienila allineata ─────────────────────────────
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
    -- Importo e data seguono il documento; lo stato lo decide l'incasso, non qui
    UPDATE public.scadenze
    SET amount = v_amount, due_date = v_due, updated_at = now()
    WHERE id = v_scad_id;
    v_scad_amount := v_amount;
  END IF;

  -- ── Registrazione dell'incasso in cassa (solo fatture, non note credito) ─
  IF NEW.tipo IN ('fattura', 'fattura_pa') THEN

    IF NEW.stato = 'pagata' THEN
      v_residuo := v_scad_amount - v_scad_paid;

      -- Niente da fare se e' gia' tutto incassato (tipicamente: l'utente lo ha
      -- gia' registrato dallo scadenzario) o se la nostra riga esiste gia'.
      IF v_residuo > 0 AND NOT EXISTS (
        SELECT 1 FROM public.prima_nota_entries
        WHERE documento_fiscale_id = NEW.id
          AND is_auto = true AND auto_source = 'documento_fiscale'
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
      -- Non e' piu' pagata: si annulla SOLO la registrazione automatica.
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
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_scadenza_da_documento_fiscale ON public.documenti_fiscali;
CREATE TRIGGER trg_scadenza_da_documento_fiscale
  AFTER INSERT OR UPDATE OF stato, totale_da_pagare, data_scadenza, pagato_at
  ON public.documenti_fiscali
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_scadenza_da_documento_fiscale();
