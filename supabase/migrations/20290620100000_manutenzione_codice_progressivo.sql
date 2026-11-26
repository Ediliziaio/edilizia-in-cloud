-- Codice progressivo della manutenzione (MAN-0001), per azienda.
--
-- Stessa ricetta del codice commessa (20271231000000_order_code_progressive):
-- prefisso per azienda, indice unico per azienda, funzione che PEEK-a il
-- prossimo numero senza consumarlo. In più, qui, un trigger che assegna il
-- codice da solo quando chi inserisce non ne scrive uno: la manutenzione nasce
-- anche dal wizard, dagli import e dai tool di Silvio, e nessuno di questi
-- deve poterla creare senza codice.
--
-- Se l'ufficio scrive un codice suo, vince il suo.

-- ── 1) Prefisso per azienda ────────────────────────────────────────────────
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS manutenzione_code_prefix text NOT NULL DEFAULT 'MAN';

COMMENT ON COLUMN public.companies.manutenzione_code_prefix IS
  'Prefisso del codice manutenzione progressivo auto-generato (es. "MAN" → MAN-0001). Personalizzabile per azienda.';

-- ── 2) Il codice sulla manutenzione ────────────────────────────────────────
ALTER TABLE public.impianti_cliente
  ADD COLUMN IF NOT EXISTS codice text;

COMMENT ON COLUMN public.impianti_cliente.codice IS
  'Codice della manutenzione (es. MAN-0014). Assegnato dal trigger se lasciato vuoto; modificabile a mano.';

-- Unicità per azienda, case-insensitive, solo codici valorizzati.
CREATE UNIQUE INDEX IF NOT EXISTS impianti_cliente_company_codice_uniq
  ON public.impianti_cliente (company_id, lower(codice))
  WHERE codice IS NOT NULL AND codice <> '';

-- ── 3) Il prossimo numero (peek, non consuma) ──────────────────────────────
CREATE OR REPLACE FUNCTION public.prossimo_numero_manutenzione(p_company_id uuid)
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
  -- Guard multi-tenant: solo membri dell'azienda, come prossimo_numero_commessa.
  IF NOT public.can_access_company_people(p_company_id) THEN
    RETURN NULL;
  END IF;

  SELECT coalesce(nullif(btrim(manutenzione_code_prefix), ''), 'MAN')
    INTO v_prefix
  FROM public.companies WHERE id = p_company_id;
  IF v_prefix IS NULL THEN v_prefix := 'MAN'; END IF;

  SELECT coalesce(max((regexp_match(codice, '([0-9]+)\s*$'))[1]::bigint), 0)
    INTO v_max
  FROM public.impianti_cliente
  WHERE company_id = p_company_id
    AND codice IS NOT NULL
    AND lower(codice) LIKE lower(v_prefix) || '%'
    AND codice ~ '[0-9]+\s*$';

  v_code := v_prefix || '-' || lpad((v_max + 1)::text, 4, '0');

  WHILE v_i < 10000 AND EXISTS (
    SELECT 1 FROM public.impianti_cliente
    WHERE company_id = p_company_id AND lower(codice) = lower(v_code)
  ) LOOP
    v_max := v_max + 1;
    v_code := v_prefix || '-' || lpad((v_max + 1)::text, 4, '0');
    v_i := v_i + 1;
  END LOOP;

  RETURN v_code;
END;
$$;

GRANT EXECUTE ON FUNCTION public.prossimo_numero_manutenzione(uuid) TO authenticated;

-- ── 4) Assegnazione automatica all'inserimento ─────────────────────────────
-- Non riusa la funzione del punto 3: quella ha il guard multi-tenant (serve
-- all'app per mostrare «sarà MAN-0014»), il trigger invece gira anche dagli
-- import e dalle edge function, dove il chiamante non è un membro.
CREATE OR REPLACE FUNCTION public.manutenzione_assegna_codice()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_prefix text;
  v_max    bigint;
  v_code   text;
  v_i      int := 0;
BEGIN
  IF NEW.codice IS NOT NULL AND btrim(NEW.codice) <> '' THEN
    NEW.codice := btrim(NEW.codice);
    RETURN NEW;
  END IF;
  IF NEW.company_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Serializza per azienda: due inserimenti nello stesso istante non prendono
  -- lo stesso numero. Si sblocca a fine transazione.
  PERFORM pg_advisory_xact_lock(hashtext('manutenzione_codice'), hashtext(NEW.company_id::text));

  SELECT coalesce(nullif(btrim(manutenzione_code_prefix), ''), 'MAN')
    INTO v_prefix
  FROM public.companies WHERE id = NEW.company_id;
  IF v_prefix IS NULL THEN v_prefix := 'MAN'; END IF;

  SELECT coalesce(max((regexp_match(codice, '([0-9]+)\s*$'))[1]::bigint), 0)
    INTO v_max
  FROM public.impianti_cliente
  WHERE company_id = NEW.company_id
    AND codice IS NOT NULL
    AND lower(codice) LIKE lower(v_prefix) || '%'
    AND codice ~ '[0-9]+\s*$';

  v_code := v_prefix || '-' || lpad((v_max + 1)::text, 4, '0');
  WHILE v_i < 10000 AND EXISTS (
    SELECT 1 FROM public.impianti_cliente
    WHERE company_id = NEW.company_id AND lower(codice) = lower(v_code)
  ) LOOP
    v_max := v_max + 1;
    v_code := v_prefix || '-' || lpad((v_max + 1)::text, 4, '0');
    v_i := v_i + 1;
  END LOOP;

  NEW.codice := v_code;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_manutenzione_assegna_codice ON public.impianti_cliente;
CREATE TRIGGER trg_manutenzione_assegna_codice
  BEFORE INSERT ON public.impianti_cliente
  FOR EACH ROW EXECUTE FUNCTION public.manutenzione_assegna_codice();

-- ── 5) Le manutenzioni che ci sono già ─────────────────────────────────────
-- Cinque righe su tre aziende al 26/11/2026: nessun rischio di lock, ma i
-- paracadute restano perché la migrazione gira anche altrove.
DO $$
BEGIN
  PERFORM set_config('lock_timeout', '3s', true);
  PERFORM set_config('statement_timeout', '60s', true);

  WITH numerate AS (
    SELECT i.id,
           coalesce(nullif(btrim(c.manutenzione_code_prefix), ''), 'MAN') AS prefix,
           row_number() OVER (PARTITION BY i.company_id ORDER BY i.created_at NULLS LAST, i.id) AS n
    FROM public.impianti_cliente i
    JOIN public.companies c ON c.id = i.company_id
    WHERE i.codice IS NULL OR btrim(i.codice) = ''
  )
  UPDATE public.impianti_cliente i
     SET codice = numerate.prefix || '-' || lpad(numerate.n::text, 4, '0')
    FROM numerate
   WHERE i.id = numerate.id;
END;
$$;

NOTIFY pgrst, 'reload schema';
