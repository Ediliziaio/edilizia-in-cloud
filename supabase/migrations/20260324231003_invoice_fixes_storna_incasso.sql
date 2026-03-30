-- Atomic storno (undo) incasso

DROP FUNCTION IF EXISTS public.storna_incasso_atomico(uuid, uuid) CASCADE;
CREATE OR REPLACE FUNCTION public.storna_incasso_atomico(
  p_company_id   uuid,
  p_movimento_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_importo       numeric;
  v_documento_id  uuid;
  v_totale        numeric;
  v_pagato        numeric;
  v_nuovo_pagato  numeric;
  v_nuovo_stato   text;
BEGIN
  -- Fetch and delete movement atomically
  DELETE FROM movimenti_cassa_native
   WHERE id = p_movimento_id AND company_id = p_company_id
  RETURNING importo, documento_id
    INTO v_importo, v_documento_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Movimento non trovato o accesso negato';
  END IF;

  -- Update linked invoice if present
  IF v_documento_id IS NOT NULL THEN
    SELECT totale_da_pagare, importo_pagato
      INTO v_totale, v_pagato
      FROM documenti_fiscali
     WHERE id = v_documento_id
       AND company_id = p_company_id
       FOR UPDATE;

    IF FOUND THEN
      v_nuovo_pagato := GREATEST(0, v_pagato - v_importo);
      v_nuovo_stato  := CASE
        WHEN v_nuovo_pagato <= 0 THEN 'emessa'
        ELSE 'parzialmente_pagata'
      END;

      UPDATE documenti_fiscali SET
        importo_pagato = v_nuovo_pagato,
        stato          = v_nuovo_stato,
        pagato_at      = NULL,
        updated_at     = now()
      WHERE id = v_documento_id;
    END IF;
  END IF;
END;
$$;
