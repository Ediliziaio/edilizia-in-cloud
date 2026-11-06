-- Distribuita in produzione il 2026-11-06: migrazione 20261106075753.
-- Baseline per replay/test: non riapplicare su funzioni già aggiornate.
-- BUG-65: consegna diretta in cantiere senza carico magazzino.
-- Integrare nella sequenza migrazioni dopo le definizioni oda_registra_arrivo.
-- Il repository contiene migrazioni fino al 2028 mentre la data corrente è 2026:
-- un file generato con la data corrente precederebbe la funzione che modifica.
-- Conserva firma, autorizzazioni e corpo corrente, interrompendosi su divergenze.
DO $patch$
DECLARE
  definizione text;
  prima text := E'      v_stock_item_id := NULLIF(v_riga->>''stock_item_id'', '''')::uuid;';
  guardia text := E'\n      -- BUG-65: consegna diretta, nessuna disponibilità in magazzino.\n'
    || E'      IF EXISTS (SELECT 1 FROM public.ddt_ricezione\n'
    || E'        WHERE id = v_ddt_id AND company_id = v_company_id AND destinazione = ''cantiere'') THEN\n'
    || E'        v_stock_item_id := NULL;\n'
    || E'      END IF;';
BEGIN
  SELECT pg_get_functiondef('public.oda_registra_arrivo(uuid,jsonb,text,date,uuid,text,text,uuid)'::regprocedure)
    INTO definizione;
  IF position(guardia IN definizione) > 0 THEN RETURN; END IF;
  IF (length(definizione) - length(replace(definizione, prima, ''))) / length(prima) <> 1 THEN
    RAISE EXCEPTION 'BUG-65: corpo oda_registra_arrivo inatteso, verificare prima di applicare';
  END IF;
  EXECUTE replace(definizione, prima, prima || guardia);
END;
$patch$;
