-- Un backup che non è mai stato ripristinato è un file, non un backup. Diciotto
-- file nel bucket company-exports da settimane, e nessuna strada per rimetterli
-- dentro: questa funzione è quella strada, e la prova a secco è il modo di
-- percorrerla senza toccare niente.
--
-- Due modi.
--   prova  → ricrea le tabelle del dump in uno schema a parte, ci versa le righe
--            con gli stessi tipi di produzione, conta, e butta via lo schema.
--            Se una riga non entra, si sa quale tabella e perché. Nessun
--            effetto su public.
--   reale  → solo se l'azienda NON esiste più in public.companies (purgata).
--            Tutto in una transazione: o rientra tutto o niente. profiles non
--            si ripristina — punta ad auth.users, e gli utenti cancellati vanno
--            ricreati dall'auth, non da un INSERT.
--
-- Il dump è quello di company-backup: chiave "azienda" con la riga di
-- companies, e una chiave per tabella con l'array delle righe.

CREATE OR REPLACE FUNCTION public.admin_ripristina_backup(
  p_dump jsonb, p_modo text DEFAULT 'prova', p_conserva_schema boolean DEFAULT false
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public' AS $function$
DECLARE
  v_azienda     jsonb := p_dump -> 'azienda';
  v_company_id  uuid;
  v_schema      text;
  v_chiave      text;
  v_tabella     text;
  v_colonne     text;
  v_nel_file    int;
  v_inserite    int;
  v_esito       jsonb := '[]'::jsonb;
  v_totale_file int := 0;
  v_totale_ins  int := 0;
  v_errore      text;
BEGIN
  IF NOT public.is_super_admin(auth.uid()) AND current_user <> 'service_role'
     AND NOT (current_setting('request.jwt.claims', true)::jsonb ->> 'role' = 'service_role') THEN
    RAISE EXCEPTION 'Riservato al super admin' USING ERRCODE = '42501';
  END IF;
  IF p_modo NOT IN ('prova', 'reale') THEN
    RAISE EXCEPTION 'Modo % non valido: prova o reale', p_modo;
  END IF;
  IF v_azienda IS NULL OR (v_azienda ->> 'id') IS NULL THEN
    RAISE EXCEPTION 'Il dump non contiene la chiave "azienda" con un id';
  END IF;
  v_company_id := (v_azienda ->> 'id')::uuid;

  IF p_modo = 'reale' AND EXISTS (SELECT 1 FROM public.companies WHERE id = v_company_id) THEN
    RAISE EXCEPTION 'L''azienda % esiste ancora: il ripristino reale vale solo per un''azienda purgata. Per una cancellata di recente usa restore_company.', v_company_id;
  END IF;

  v_schema := CASE WHEN p_modo = 'prova'
                   THEN 'ripristino_prova_' || replace(left(v_company_id::text, 8), '-', '')
                   ELSE 'public' END;

  IF p_modo = 'prova' THEN
    EXECUTE format('DROP SCHEMA IF EXISTS %I CASCADE', v_schema);
    EXECUTE format('CREATE SCHEMA %I', v_schema);
  END IF;

  -- La riga dell'azienda per prima: tutto il resto la referenzia.
  IF p_modo = 'prova' THEN
    EXECUTE format('CREATE TABLE %I.companies (LIKE public.companies INCLUDING DEFAULTS)', v_schema);
  END IF;
  SELECT string_agg(quote_ident(a.attname), ', ' ORDER BY a.attnum) INTO v_colonne
    FROM pg_attribute a
   WHERE a.attrelid = 'public.companies'::regclass AND a.attnum > 0
     AND NOT a.attisdropped AND a.attgenerated = '';
  EXECUTE format('INSERT INTO %I.companies (%s) SELECT %s FROM jsonb_populate_record(NULL::public.companies, $1)',
                 v_schema, v_colonne, v_colonne) USING v_azienda;
  v_esito := v_esito || jsonb_build_object('tabella', 'companies', 'nel_file', 1, 'ripristinate', 1);

  FOR v_chiave IN SELECT jsonb_object_keys(p_dump) LOOP
    CONTINUE WHEN v_chiave IN ('azienda', 'esportato_il') OR v_chiave LIKE '%__errore';
    CONTINUE WHEN jsonb_typeof(p_dump -> v_chiave) <> 'array';
    v_tabella := v_chiave;

    IF to_regclass('public.' || quote_ident(v_tabella)) IS NULL THEN
      v_esito := v_esito || jsonb_build_object('tabella', v_tabella, 'errore', 'tabella inesistente in public');
      CONTINUE;
    END IF;

    v_nel_file := jsonb_array_length(p_dump -> v_chiave);
    v_totale_file := v_totale_file + v_nel_file;

    -- Gli utenti non si ripristinano con un INSERT: profiles.id punta ad
    -- auth.users, e chi è stato cancellato lì va ricreato lì.
    IF p_modo = 'reale' AND v_tabella = 'profiles' THEN
      v_esito := v_esito || jsonb_build_object('tabella', v_tabella, 'nel_file', v_nel_file,
                   'ripristinate', 0, 'nota', 'gli utenti vanno ricreati dall''auth, non da un INSERT');
      CONTINUE;
    END IF;

    SELECT string_agg(quote_ident(a.attname), ', ' ORDER BY a.attnum) INTO v_colonne
      FROM pg_attribute a
     WHERE a.attrelid = ('public.' || quote_ident(v_tabella))::regclass AND a.attnum > 0
       AND NOT a.attisdropped AND a.attgenerated = '';

    BEGIN
      IF p_modo = 'prova' THEN
        EXECUTE format('CREATE TABLE %I.%I (LIKE public.%I INCLUDING DEFAULTS)', v_schema, v_tabella, v_tabella);
      END IF;
      EXECUTE format('INSERT INTO %I.%I (%s) SELECT %s FROM jsonb_populate_recordset(NULL::public.%I, $1)',
                     v_schema, v_tabella, v_colonne, v_colonne, v_tabella)
        USING (p_dump -> v_chiave);
      GET DIAGNOSTICS v_inserite = ROW_COUNT;
      v_totale_ins := v_totale_ins + v_inserite;
      v_esito := v_esito || jsonb_build_object('tabella', v_tabella, 'nel_file', v_nel_file, 'ripristinate', v_inserite);
    EXCEPTION WHEN OTHERS THEN
      IF p_modo = 'reale' THEN
        -- Tutto o niente: si rilancia e la transazione annulla ogni tabella già inserita.
        RAISE EXCEPTION 'Ripristino reale fallito su %: %', v_tabella, SQLERRM;
      END IF;
      v_errore := SQLERRM;
      v_esito := v_esito || jsonb_build_object('tabella', v_tabella, 'nel_file', v_nel_file,
                   'ripristinate', 0, 'errore', left(v_errore, 300));
    END;
  END LOOP;

  IF p_modo = 'prova' AND NOT p_conserva_schema THEN
    EXECUTE format('DROP SCHEMA %I CASCADE', v_schema);
  END IF;

  RETURN jsonb_build_object(
    'modo', p_modo, 'azienda', v_azienda ->> 'name', 'company_id', v_company_id,
    'esportato_il', p_dump ->> 'esportato_il',
    'righe_nel_file', v_totale_file, 'righe_ripristinate', v_totale_ins,
    'integro', (v_totale_file = v_totale_ins),
    'schema', CASE WHEN p_modo = 'prova' AND p_conserva_schema THEN v_schema END,
    'tabelle', v_esito, 'eseguito_il', now());
END; $function$;

REVOKE ALL ON FUNCTION public.admin_ripristina_backup(jsonb, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_ripristina_backup(jsonb, text, boolean) TO authenticated, service_role;
