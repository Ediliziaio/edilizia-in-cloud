-- Numerazione dei preventivi senza anno: a gennaio non ricomincia (11/11/2026).
--
-- generate_quote_number tiene un contatore per azienda e anno (quote_number_counters).
-- Al primo uso dell'anno il contatore parte dal MAX dei numeri in quotes che combaciano
-- col formato. Se il formato NON ha l'anno ({YYYY} / {YY}: per esempio Impresa Vulcano,
-- {PREFIX}-{NNN}, PV-251) la serie è una sola per sempre, ma il MAX in quotes non vede
-- i numeri dati alle bozze del preventivo con computo: a gennaio si sarebbero ripetuti.
--
-- Regola: formato senza anno → al primo uso del nuovo anno si parte dal massimo tra
-- l'ultimo contatore degli anni passati dell'azienda e il MAX in quotes. Formato con
-- l'anno → tutto come prima. Stesso corpo di 20280909000002 (identico a quello in
-- produzione l'11/11/2026, md5 33ecda0a…), cambia solo l'INSERT del primo uso.
-- Solo CREATE OR REPLACE di una funzione: nessuna riga scritta.

CREATE OR REPLACE FUNCTION public.generate_quote_number(p_company_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_anno     integer := EXTRACT(YEAR FROM now())::integer;
  v_ultimo   integer;
  v_prefix   text;
  v_formato  text;
  v_regex    text;
BEGIN
  IF NOT public.user_can_access_company(p_company_id) THEN
    RAISE EXCEPTION 'Accesso negato' USING ERRCODE = '42501';
  END IF;

  SELECT upper(regexp_replace(coalesce(nullif(trim(numero_prefisso), ''), 'OFF'), '[^A-Za-z0-9]', '', 'g')),
         coalesce(nullif(trim(numero_formato), ''), '{PREFIX}-{YYYY}-{NNN}')
    INTO v_prefix, v_formato
    FROM public.preventivo_impostazioni
   WHERE company_id = p_company_id;
  v_prefix  := left(coalesce(nullif(v_prefix, ''), 'OFF'), 8);
  v_formato := coalesce(v_formato, '{PREFIX}-{YYYY}-{NNN}');
  IF position('{N' in v_formato) = 0 THEN
    v_formato := v_formato || '-{NNN}';
  END IF;

  -- Un solo salvataggio alla volta per azienda e anno, dentro la transazione.
  PERFORM pg_advisory_xact_lock(hashtext('quote_number:' || p_company_id::text || ':' || v_anno::text));

  -- Regex del formato corrente: il progressivo è il gruppo catturato.
  v_regex := '^' || regexp_replace(v_formato, '([.\\+*?\[\]^$(){}|/])', '\\\1', 'g') || '$';
  v_regex := replace(v_regex, '\{PREFIX\}', v_prefix);
  v_regex := replace(v_regex, '\{YYYY\}', v_anno::text);
  v_regex := replace(v_regex, '\{YY\}', right(v_anno::text, 2));
  v_regex := regexp_replace(v_regex, '\\\{N+\\\}', '([0-9]+)');

  -- Primo uso dell'anno: si riparte dal massimo già emesso (cestinati compresi,
  -- così un numero purgato non torna in circolo), non dal conteggio.
  -- Formato senza anno (11/11/2026): la serie non ricomincia a gennaio, quindi si
  -- parte anche dall'ultimo contatore degli anni passati, che conta i numeri dati
  -- alle bozze del preventivo con computo (non stanno in quotes).
  INSERT INTO public.quote_number_counters (company_id, anno, ultimo)
  SELECT p_company_id, v_anno,
         GREATEST(
           COALESCE(MAX((regexp_match(quote_number, v_regex))[1]::integer), 0),
           CASE WHEN position('{YY' in v_formato) = 0 THEN
             COALESCE((SELECT max(c.ultimo) FROM public.quote_number_counters c
                        WHERE c.company_id = p_company_id AND c.anno < v_anno), 0)
           ELSE 0 END)
    FROM public.quotes
   WHERE company_id = p_company_id
     AND quote_number ~ v_regex
  ON CONFLICT (company_id, anno) DO NOTHING;

  UPDATE public.quote_number_counters
     SET ultimo = ultimo + 1
   WHERE company_id = p_company_id AND anno = v_anno
  RETURNING ultimo INTO v_ultimo;

  RETURN regexp_replace(
           replace(replace(replace(v_formato, '{PREFIX}', v_prefix), '{YYYY}', v_anno::text), '{YY}', right(v_anno::text, 2)),
           '\{N+\}',
           lpad(v_ultimo::text,
                greatest(3, length(coalesce((regexp_match(v_formato, '\{(N+)\}'))[1], 'NNN'))),
                '0'));
END;
$function$;

-- Gli stessi diritti di oggi: postgres, authenticated, service_role.
REVOKE ALL ON FUNCTION public.generate_quote_number(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.generate_quote_number(uuid) TO authenticated, service_role;
