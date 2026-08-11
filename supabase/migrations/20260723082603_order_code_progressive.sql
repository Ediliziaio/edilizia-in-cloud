-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS order_code_prefix text NOT NULL DEFAULT 'O';

COMMENT ON COLUMN public.companies.order_code_prefix IS
  'Prefisso del codice commessa progressivo auto-generato (es. "O" -> O-0001). Personalizzabile per azienda.';

CREATE UNIQUE INDEX IF NOT EXISTS orders_company_order_code_uniq
  ON public.orders (company_id, lower(order_code))
  WHERE order_code IS NOT NULL AND order_code <> '';

CREATE OR REPLACE FUNCTION public.prossimo_numero_commessa(p_company_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_prefix text;
  v_max    bigint;
  v_code   text;
  v_i      int := 0;
BEGIN
  IF NOT public.can_access_company_people(p_company_id) THEN
    RETURN NULL;
  END IF;

  SELECT coalesce(nullif(btrim(order_code_prefix), ''), 'O')
    INTO v_prefix
  FROM public.companies WHERE id = p_company_id;
  IF v_prefix IS NULL THEN v_prefix := 'O'; END IF;

  SELECT coalesce(max((regexp_match(order_code, '([0-9]+)\s*$'))[1]::bigint), 0)
    INTO v_max
  FROM public.orders
  WHERE company_id = p_company_id
    AND order_code IS NOT NULL
    AND lower(order_code) LIKE lower(v_prefix) || '%'
    AND order_code ~ '[0-9]+\s*$';

  v_code := v_prefix || '-' || lpad((v_max + 1)::text, 4, '0');

  WHILE v_i < 10000 AND EXISTS (
    SELECT 1 FROM public.orders
    WHERE company_id = p_company_id AND lower(order_code) = lower(v_code)
  ) LOOP
    v_max := v_max + 1;
    v_code := v_prefix || '-' || lpad((v_max + 1)::text, 4, '0');
    v_i := v_i + 1;
  END LOOP;

  RETURN v_code;
END;
$$;

GRANT EXECUTE ON FUNCTION public.prossimo_numero_commessa(uuid) TO authenticated;
