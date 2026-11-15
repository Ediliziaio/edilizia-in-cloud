-- bolletta_registra non si ferma su un valore non valido (area D, 15/11/2026).
--
-- Una data o un numero non validi nella lettura facevano fallire la registrazione: la fattura non
-- riceveva la sua riga in `bollette` e tornava in testa a `bollette_da_leggere` a ogni giro; con
-- 30 fatture così il giro sarebbe rimasto fermo. Ora il valore non valido diventa vuoto (la riga
-- si registra lo stesso, con quello che si è potuto leggere) e la bolletta ha l'avviso
-- `valore_non_valido`. Si cambiano le sole conversioni, sul testo del database (blocco DO,
-- idempotente), come in 20290415100000.

SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '60s';

CREATE OR REPLACE FUNCTION private.data_iso(v text)
RETURNS date LANGUAGE plpgsql IMMUTABLE SET search_path TO '' AS $$
BEGIN
  IF v IS NULL OR v !~ '^\d{4}-\d{2}-\d{2}$' THEN RETURN NULL; END IF;
  RETURN v::date;
EXCEPTION WHEN others THEN RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION private.numero_o_null(v text)
RETURNS numeric LANGUAGE plpgsql IMMUTABLE SET search_path TO '' AS $$
BEGIN
  IF v IS NULL OR v !~ '^-?\d+(\.\d+)?$' THEN RETURN NULL; END IF;
  RETURN v::numeric;
EXCEPTION WHEN others THEN RETURN NULL;
END $$;

REVOKE ALL ON FUNCTION private.data_iso(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.numero_o_null(text) FROM PUBLIC, anon, authenticated;

DO $$
DECLARE v_def text;
BEGIN
  v_def := pg_get_functiondef('public.bolletta_registra(uuid, jsonb)'::regprocedure);
  IF position('private.data_iso(' IN v_def) = 0 THEN
    IF position('(u ->> ''periodo_dal'')::date' IN v_def) = 0 THEN
      RAISE EXCEPTION 'bolletta_registra: non trovo le conversioni da sostituire';
    END IF;
    v_def := replace(v_def, '(u ->> ''periodo_dal'')::date', 'private.data_iso(u ->> ''periodo_dal'')');
    v_def := replace(v_def, '(u ->> ''periodo_al'')::date', 'private.data_iso(u ->> ''periodo_al'')');
    v_def := replace(v_def, '(u ->> ''consumo'')::numeric', 'private.numero_o_null(u ->> ''consumo'')');
    v_def := replace(v_def, '(u ->> ''importo'')::numeric', 'private.numero_o_null(u ->> ''importo'')');
    v_def := replace(v_def, '(p_lettura ->> ''data'')::date', 'private.data_iso(p_lettura ->> ''data'')');
    v_def := replace(v_def, 'array_agg(x::int) FROM jsonb_array_elements_text(coalesce(u -> ''righe'', ''[]'')) x)',
                            'array_agg(x::int) FROM jsonb_array_elements_text(coalesce(u -> ''righe'', ''[]'')) x WHERE x ~ ''^\d{1,6}$'')');
    -- L'avviso: una data o un numero scritti ma non leggibili.
    v_def := replace(v_def, '    CONTINUE WHEN v_riga IS NULL;',
      '    CONTINUE WHEN v_riga IS NULL;
    IF (u ->> ''periodo_dal'' IS NOT NULL AND private.data_iso(u ->> ''periodo_dal'') IS NULL)
       OR (u ->> ''periodo_al'' IS NOT NULL AND private.data_iso(u ->> ''periodo_al'') IS NULL)
       OR (u ->> ''importo'' IS NOT NULL AND private.numero_o_null(u ->> ''importo'') IS NULL) THEN
      v_avvisi := v_avvisi || jsonb_build_object(''codice'', ''valore_non_valido'', ''testo'', format(''Utenza %s: periodo o importo non leggibili nella fattura.'', u ->> ''codice''));
    END IF;');
    EXECUTE v_def;
  END IF;
END $$;
