-- Correzione trasversale — `text[] || 'letterale'` esplode invece di aggiungere
--
-- In plpgsql `v := v || 'stringa'` su una variabile `text[]` è ambiguo:
-- Postgres sceglie `anyarray || anyarray` e prova a leggere il letterale come
-- array literal, che non inizia con "{". Risultato:
--     ERROR 22P02: malformed array literal: "stock_below_minimum"
-- L'errore non è un dettaglio di stile: abortisce la transazione che ha
-- innescato il trigger.
--
-- Trovato dal vivo provando la cancellazione di una ricezione merce:
--   ERROR: 22P02 malformed array literal: "stock_below_minimum"
--   CONTEXT: PL/pgSQL function trigger_internal_auto_stock_events() line 14
--            SQL statement "UPDATE public.warehouse_stock SET quantity = …"
--
-- Cosa era rotto in produzione, e da quanto nessuno lo sapeva:
--   trigger_internal_auto_stock_events   scaricare merce fino a scendere alla
--                                        scorta minima o sotto (30 articoli
--                                        hanno una scorta minima impostata)
--   trigger_internal_auto_order_status   cambiare stato a una commessa
--   trigger_internal_auto_task_events    completare un'attività
--   trigger_internal_auto_ticket_events  cambiare stato a un ticket
--
-- Sono quattro trigger di automazione: il gesto dell'utente falliva per intero,
-- con un messaggio che non c'entra nulla con quello che stava facendo.
--
-- La correzione è aggiungere `::text` al letterale. Invece di ricopiare qui
-- quattro funzioni lunghe — con il rischio di trascriverle male e di farle
-- divergere dalle migrazioni che le hanno create — si riscrive esattamente
-- quel pezzo, prendendo la definizione corrente dal catalogo. La sostituzione è
-- chirurgica (solo il letterale dopo `|| `), e alla fine si verifica che non ne
-- resti nemmeno una.
--
-- Idempotente: rieseguirla non cambia nulla, il pattern non c'è più.

DO $$
DECLARE
  r          record;
  v_nuovo    text;
  v_corrette text[] := '{}';
BEGIN
  FOR r IN
    SELECT p.oid, p.oid::regprocedure::text AS sig, pg_get_functiondef(p.oid) AS def
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prolang = (SELECT oid FROM pg_language WHERE lanname = 'plpgsql')
      AND p.prosrc ~ 'v_trigger_types := v_trigger_types \|\| ''[a-z_]+'';'
  LOOP
    v_nuovo := regexp_replace(
      r.def,
      '(v_trigger_types := v_trigger_types \|\| )(''[a-z_]+'')(\s*;)',
      '\1\2::text\3',
      'g');

    IF v_nuovo IS DISTINCT FROM r.def THEN
      EXECUTE v_nuovo;
      v_corrette := v_corrette || r.sig;
    END IF;
  END LOOP;

  RAISE LOG 'array letterale non tipizzato — funzioni corrette: %',
    coalesce(array_to_string(v_corrette, ', '), 'nessuna');

  -- La verifica fa parte della migrazione: se ne resta una, non si va avanti.
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosrc ~ 'v_trigger_types := v_trigger_types \|\| ''[a-z_]+'';'
  ) THEN
    RAISE EXCEPTION 'restano funzioni con il letterale non tipizzato';
  END IF;
END $$;
