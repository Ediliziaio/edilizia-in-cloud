-- ═══════════════════════════════════════════════════════════════════════════
-- RPC sr_converti_in_ordine — converte un progetto Serramenti in commessa.
-- ---------------------------------------------------------------------------
-- Crea una riga in orders collegata al progetto, copiando i campi essenziali
-- (descrizione, importo, cliente). Setta sr_progetti.ordine_id e stato.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.sr_converti_in_ordine(
  p_progetto_id uuid,
  p_importo_eur numeric DEFAULT NULL,
  p_anticipo_eur numeric DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $fn$
DECLARE
  v_progetto record;
  v_ordine_id uuid;
  v_cliente text;
  v_descrizione text;
  v_importo numeric;
  v_anticipo numeric;
BEGIN
  -- 1. Carica progetto (RLS guard)
  SELECT * INTO v_progetto
  FROM public.sr_progetti
  WHERE id = p_progetto_id
    AND (company_id = public.get_my_company_id() OR public.is_super_admin());

  IF v_progetto IS NULL THEN
    RAISE EXCEPTION 'Progetto Serramenti non trovato o non accessibile';
  END IF;

  IF v_progetto.ordine_id IS NOT NULL THEN
    RAISE EXCEPTION 'Progetto già convertito in commessa (%)', v_progetto.ordine_id;
  END IF;

  -- 2. Calcola importo (priorità: param > totale_max > totale_min > 0)
  v_importo := COALESCE(p_importo_eur, v_progetto.totale_max, v_progetto.totale_min, 0);
  v_anticipo := COALESCE(p_anticipo_eur, v_importo * (v_progetto.fin_anticipo_pct / 100.0), 0);

  v_cliente := TRIM(COALESCE(v_progetto.cliente_nome, '') || ' ' || COALESCE(v_progetto.cliente_cognome, ''));
  v_descrizione := 'Stima Serramenti ' || v_progetto.code
    || CASE WHEN v_cliente IS NOT NULL AND v_cliente <> '' THEN ' · ' || v_cliente ELSE '' END
    || CASE WHEN v_progetto.cantiere_citta IS NOT NULL THEN ' (' || v_progetto.cantiere_citta || ')' ELSE '' END;

  -- 3. Crea ordine
  INSERT INTO public.orders (
    company_id,
    customer_id,
    description,
    total_amount,
    deposit_amount,
    balance_amount,
    internal_notes,
    order_type
  ) VALUES (
    v_progetto.company_id,
    v_progetto.cliente_id,    -- può essere NULL, è ok
    v_descrizione,
    v_importo,
    v_anticipo,
    GREATEST(0, v_importo - v_anticipo),
    'Creato automaticamente dalla stima Serramenti ' || v_progetto.code ||
      coalesce(E'\n\nIntervento: ' || v_progetto.intervento_sintesi, ''),
    'cliente'
  )
  RETURNING id INTO v_ordine_id;

  -- 4. Aggiorna progetto: link + stato accettato
  UPDATE public.sr_progetti
  SET
    ordine_id = v_ordine_id,
    stato = CASE WHEN stato = 'accettato' THEN 'accettato' ELSE 'accettato' END,
    updated_at = now()
  WHERE id = p_progetto_id;

  -- 5. Audit
  INSERT INTO public.sr_progetti_audit (progetto_id, company_id, user_id, event_type, event_data)
  VALUES (
    p_progetto_id,
    v_progetto.company_id,
    auth.uid(),
    'converted_to_ordine',
    jsonb_build_object(
      'ordine_id', v_ordine_id,
      'importo_eur', v_importo,
      'anticipo_eur', v_anticipo
    )
  );

  RETURN v_ordine_id;
END
$fn$;

GRANT EXECUTE ON FUNCTION public.sr_converti_in_ordine(uuid, numeric, numeric) TO authenticated;
