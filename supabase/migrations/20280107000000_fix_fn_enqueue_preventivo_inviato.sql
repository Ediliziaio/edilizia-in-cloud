-- BUG PROD-CRITICAL: impossibile marcare un preventivo come "inviato".
-- Trovato il 2026-07-31 testando il tool Silvio aggiorna_stato_preventivo su
-- Demo: qualunque INSERT/UPDATE che porti quotes.status a 'inviato' fallisce con
--   ERROR 42703: record "new" has no field "client_company_name"
-- perché fn_enqueue_preventivo_inviato (trigger trg_quotes_preventivo_inviato,
-- AFTER INSERT OR UPDATE OF status) legge due colonne che su `quotes` NON
-- esistono: `client_company_name` (la colonna vera è `client_company`) e
-- `total_amount` (la colonna vera è `total`). Sono i nomi della tabella
-- `invoices`: la funzione è nata come copia di fn_enqueue_fattura_emessa.
-- Nota: la gemella sulle fatture era già stata corretta a suo tempo (porta
-- ancora il commento "era NEW.total_amount ... ogni INSERT su invoices falliva");
-- questa è rimasta indietro.
--
-- Fix: nomi colonna reali + handler d'eccezione — l'accodamento di una notifica
-- WhatsApp non deve MAI impedire di inviare un preventivo. Se la coda notifiche
-- ha un problema, il preventivo parte lo stesso e resta un WARNING nei log.

CREATE OR REPLACE FUNCTION public.fn_enqueue_preventivo_inviato()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (TG_OP = 'INSERT' OR (OLD.status IS DISTINCT FROM NEW.status))
     AND NEW.status IN ('sent', 'inviato', 'sent_to_client')
  THEN
    BEGIN
      INSERT INTO public.wa_notifiche_event_queue (
        company_id, trigger_kind, subject_id, variables
      ) VALUES (
        NEW.company_id,
        'preventivo_inviato',
        NEW.id::text,
        jsonb_build_object(
          '1', COALESCE(NEW.quote_number, 'N/D'),
          '2', COALESCE(NEW.client_company, NEW.client_name, ''),
          '3', COALESCE(NEW.total::text, '0')
        )
      )
      ON CONFLICT DO NOTHING;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'fn_enqueue_preventivo_inviato: notifica non accodata per il preventivo % (%): %',
        NEW.id, COALESCE(NEW.quote_number, 'N/D'), SQLERRM;
    END;
  END IF;
  RETURN NEW;
END;
$$;
