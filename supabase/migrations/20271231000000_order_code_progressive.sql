-- Codice Commessa progressivo per-azienda (stile "O-0001") con prefisso
-- personalizzabile. Il campo resta editabile: se il commerciale scrive un codice
-- vince il manuale; se lo lascia vuoto, si usa il progressivo auto-generato.
--
-- Componenti:
--   1) companies.order_code_prefix — prefisso per azienda (default 'O')
--   2) prossimo_numero_commessa(company) — PEEK del prossimo codice (non incrementa
--      contatori: max suffisso numerico tra i codici col prefisso, +1, {prefix}-{NNNN})
--   3) indice unique per-azienda su order_code (0 doppioni esistenti verificati)

-- ── 1) Prefisso per azienda ────────────────────────────────────────────────
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS order_code_prefix text NOT NULL DEFAULT 'O';

COMMENT ON COLUMN public.companies.order_code_prefix IS
  'Prefisso del codice commessa progressivo auto-generato (es. "O" → O-0001, "SS" → SS-0001). Personalizzabile per azienda.';

-- ── 2) Unicità per-azienda del codice ──────────────────────────────────────
-- Case-insensitive; solo codici valorizzati (null/'' restano liberi). Nessun
-- doppione esistente (verificato prima della migration), quindi la creazione è safe.
CREATE UNIQUE INDEX IF NOT EXISTS orders_company_order_code_uniq
  ON public.orders (company_id, lower(order_code))
  WHERE order_code IS NOT NULL AND order_code <> '';

-- ── 3) Prossimo numero commessa (peek, non-incrementante) ──────────────────
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
  -- Guard multi-tenant: solo membri dell'azienda (stesso guard di get_company_customers).
  IF NOT public.can_access_company_people(p_company_id) THEN
    RETURN NULL;
  END IF;

  SELECT coalesce(nullif(btrim(order_code_prefix), ''), 'O')
    INTO v_prefix
  FROM public.companies WHERE id = p_company_id;
  IF v_prefix IS NULL THEN v_prefix := 'O'; END IF;

  -- Max numero finale tra i codici dell'azienda che iniziano col prefisso e
  -- finiscono con cifre (es. "O-0007", "SS-011"): estrae le cifre finali → max.
  SELECT coalesce(max((regexp_match(order_code, '([0-9]+)\s*$'))[1]::bigint), 0)
    INTO v_max
  FROM public.orders
  WHERE company_id = p_company_id
    AND order_code IS NOT NULL
    AND lower(order_code) LIKE lower(v_prefix) || '%'
    AND order_code ~ '[0-9]+\s*$';

  v_code := v_prefix || '-' || lpad((v_max + 1)::text, 4, '0');

  -- Salvaguardia anti-collisione con eventuali codici manuali fuori-pattern.
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

NOTIFY pgrst, 'reload schema';
