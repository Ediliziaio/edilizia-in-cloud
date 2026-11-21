-- La serie propria delle note usa lo stesso formato sia con progressivo
-- automatico sia quando il numero è scelto a mano.
DO $$
DECLARE
  definizione text := pg_get_functiondef('public.documento_numero_nella_serie(uuid,text,integer,integer,uuid)'::regprocedure);
  prima constant text := 'v_formato  := null;';
  dopo constant text := 'v_formato  := v_ana.formato_numero;';
BEGIN
  IF position(prima in definizione) = 0 THEN
    IF length(definizione) - length(replace(definizione, dopo, '')) = 2 * length(dopo) THEN RETURN; END IF;
    RAISE EXCEPTION 'Ramo numerazione note di credito non trovato.';
  END IF;
  IF length(definizione) - length(replace(definizione, prima, '')) <> length(prima) THEN
    RAISE EXCEPTION 'Il ramo numerazione note di credito non è univoco.';
  END IF;
  EXECUTE replace(definizione, prima, dopo);
END $$;
