-- ─────────────────────────────────────────────────────────────────────────────
-- Invoice system fixes
-- 1. Soft-delete for documenti_fiscali (fiscal retention law compliance)
-- 2. Atomic incasso RPC (prevent race condition on importo_pagato)
-- 3. Atomic storno incasso RPC
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Soft-delete column ──────────────────────────────────────────────────

ALTER TABLE public.documenti_fiscali
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz DEFAULT NULL;

-- Index for the common case of filtering out deleted documents
CREATE INDEX IF NOT EXISTS idx_documenti_fiscali_deleted_at
  ON public.documenti_fiscali (company_id, deleted_at)
  WHERE deleted_at IS NULL;

-- ── 2. Atomic incasso registration ────────────────────────────────────────
-- Inserts the cash movement and updates importo_pagato on the invoice
-- within the same DB transaction, eliminating the read-modify-write race.

CREATE OR REPLACE FUNCTION public.registra_incasso_atomico(
  p_company_id      uuid,
  p_documento_id    uuid,
  p_importo         numeric,
  p_metodo          text,
  p_data_movimento  date,
  p_riferimento     text DEFAULT NULL,
  p_note            text DEFAULT NULL
)
RETURNS uuid          -- returns the new movimenti_cassa_native.id
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_movimento_id  uuid;
  v_totale        numeric;
  v_pagato        numeric;
  v_nuovo_pagato  numeric;
  v_nuovo_stato   text;
BEGIN
  -- Validate company ownership (defense-in-depth)
  IF NOT EXISTS (
    SELECT 1 FROM documenti_fiscali
    WHERE id = p_documento_id AND company_id = p_company_id
  ) THEN
    RAISE EXCEPTION 'Documento non trovato o accesso negato';
  END IF;

  -- Lock the invoice row to prevent concurrent updates
  SELECT totale_da_pagare, importo_pagato
    INTO v_totale, v_pagato
    FROM documenti_fiscali
   WHERE id = p_documento_id
     AND company_id = p_company_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Documento non trovato';
  END IF;

  -- Insert movement
  INSERT INTO movimenti_cassa_native (
    company_id, documento_id, importo, tipo,
    metodo, data_movimento, riferimento, note
  ) VALUES (
    p_company_id, p_documento_id, p_importo, 'incasso',
    p_metodo, p_data_movimento, p_riferimento, p_note
  )
  RETURNING id INTO v_movimento_id;

  -- Recalculate invoice state atomically
  v_nuovo_pagato := v_pagato + p_importo;
  v_nuovo_stato  := CASE
    WHEN v_nuovo_pagato >= v_totale THEN 'pagata'
    ELSE 'parzialmente_pagata'
  END;

  UPDATE documenti_fiscali SET
    importo_pagato = v_nuovo_pagato,
    stato          = v_nuovo_stato,
    pagato_at      = CASE WHEN v_nuovo_stato = 'pagata' THEN now() ELSE NULL END,
    updated_at     = now()
  WHERE id = p_documento_id;

  RETURN v_movimento_id;
END;
$$;

-- ── 3. Atomic storno (undo) incasso ───────────────────────────────────────

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

-- Grant execute to authenticated role (RLS already enforces company isolation)
GRANT EXECUTE ON FUNCTION public.registra_incasso_atomico TO authenticated;
GRANT EXECUTE ON FUNCTION public.storna_incasso_atomico TO authenticated;
