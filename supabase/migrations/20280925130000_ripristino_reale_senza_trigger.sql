-- Il ripristino reale di un'azienda purgata funziona (25/09/2026).
--
-- admin_ripristina_backup(dump, 'reale') non poteva riuscire su un'azienda
-- vera. Provato sulla Demo 2 (esportata, purgata col job della notte,
-- ripristinata, tutto annullato): cadeva sulla prima riga, perché il controllo
-- della partita IVA non accetta quella finta della Demo; su un'azienda vera
-- sarebbe caduto sulla seconda tabella. Tre motivi:
--   · le tabelle si versavano nell'ordine delle chiavi del JSON (per lunghezza
--     del nome) e nessuna delle 2.201 chiavi esterne è rinviabile: le attività
--     arrivavano prima delle commesse a cui puntano;
--   · gli utenti (profiles) si saltavano, e cadeva tutto ciò che punta a loro;
--   · i trigger giravano come per un'azienda nuova: le righe iniziali (fase
--     «Assistenza», crediti, onboarding…) andavano in conflitto con quelle del
--     backup in 9 tabelle, 90 trigger su 40 tabelle mandavano avvisi e
--     automazioni per ogni riga, e updated_by veniva riscritto a vuoto.
--
-- Adesso, in modo reale:
--   · session_replication_role = replica mentre si versano le righe: niente
--     trigger e niente controlli di chiave esterna. Sono righe vecchie che
--     tornano, non lavoro nuovo: niente righe create due volte, niente avvisi,
--     niente dati riscritti, e l'ordine delle tabelle non conta più;
--   · gli utenti rientrano se il loro account di accesso esiste ancora (la
--     purga non lo cancella); quelli senza account si contano e si dicono;
--   · 45 tabelle hanno company_id senza cancellazione a cascata, e la purga le
--     lascia dov'erano (a volte svuotandone i riferimenti): una riga che c'è
--     già con la stessa chiave primaria torna ai valori del backup;
--   · i contatori (serial) ripartono dopo il valore più alto rientrato;
--   · alla fine admin_backup_collegamenti_rotti controlla ogni chiave esterna
--     delle tabelle rientrate: se una riga punta a qualcosa che non c'è, si
--     annulla tutto e si dice dove.
-- In tutti e due i modi le colonne sono quelle della tabella che il file
-- contiene: una colonna nata dopo il backup prende il suo valore predefinito
-- (la prova del 20/09 sulla Demo perdeva 7 righe per una colonna NOT NULL
-- aggiunta dopo il backup).
--
-- Collaudo sulla Demo 2 (purgata e ripristinata, tutto annullato): 13.060 righe
-- su 13.060 in 1,7 s, 237 tabelle identiche riga per riga, zero avvisi, eventi
-- o righe di diario. Due differenze, nessuna del ripristino: listino_griglia_history
-- tiene le 348 righe «cancellato» che la purga stessa scrive; e un jsonb che
-- contiene il valore JSON null torna come NULL (nel file sono la stessa cosa,
-- e per l'app anche). Il controllo finale ha trovato 26 righe della Demo 2 già
-- rotte prima della purga (dati finti caricati a trigger spenti): giustamente
-- non le rimette.

-- ---------------------------------------------------------------------------
-- Le righe di un'azienda che puntano a qualcosa che non c'è
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_backup_collegamenti_rotti(p_company_id uuid, p_tabelle text[] DEFAULT NULL)
RETURNS TABLE (tabella text, vincolo text, madre text, righe bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public' AS $function$
DECLARE
  v_k      record;
  v_pieni  text;
  v_uguali text;
  v_n      bigint;
BEGIN
  IF NOT public.is_super_admin(auth.uid()) AND current_user <> 'service_role'
     AND coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'role', '') <> 'service_role' THEN
    RAISE EXCEPTION 'Riservato al super admin' USING ERRCODE = '42501';
  END IF;

  -- Ogni chiave esterna delle tabelle dell'azienda: le righe dell'azienda sono
  -- quelle del filtro del catalogo (per companies, la riga stessa).
  FOR v_k IN
    SELECT k.conname::text AS nome, c.relname::text AS figlia, k.confrelid::regclass::text AS tabella_madre,
           k.conrelid, k.confrelid, k.conkey, k.confkey,
           CASE WHEN c.relname = 'companies' THEN 't.id = $1' ELSE cat.filtro END AS filtro
      FROM pg_constraint k
      JOIN pg_class c ON c.oid = k.conrelid
      LEFT JOIN public.admin_catalogo_backup() cat ON cat.tabella = c.relname::text
     WHERE k.contype = 'f' AND c.relnamespace = 'public'::regnamespace
       AND (c.relname = 'companies' OR cat.filtro IS NOT NULL)
       AND (p_tabelle IS NULL OR c.relname::text = ANY (p_tabelle))
     ORDER BY 2, 1
  LOOP
    -- MATCH SIMPLE: una chiave con una colonna vuota non punta a niente.
    SELECT string_agg(format('t.%I IS NOT NULL', a.attname), ' AND '),
           string_agg(format('m.%I = t.%I', am.attname, a.attname), ' AND ')
      INTO v_pieni, v_uguali
      FROM unnest(v_k.conkey, v_k.confkey) AS u(col_figlia, col_madre)
      JOIN pg_attribute a  ON a.attrelid  = v_k.conrelid  AND a.attnum  = u.col_figlia
      JOIN pg_attribute am ON am.attrelid = v_k.confrelid AND am.attnum = u.col_madre;
    EXECUTE format('SELECT count(*) FROM public.%I t WHERE (%s) AND %s AND NOT EXISTS (SELECT 1 FROM %s m WHERE %s)',
                   v_k.figlia, v_k.filtro, v_pieni, v_k.tabella_madre, v_uguali)
       INTO v_n USING p_company_id;
    IF v_n > 0 THEN
      tabella := v_k.figlia;
      vincolo := v_k.nome;
      madre := v_k.tabella_madre;
      righe := v_n;
      RETURN NEXT;
    END IF;
  END LOOP;
END $function$;

REVOKE ALL ON FUNCTION public.admin_backup_collegamenti_rotti(uuid, text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_backup_collegamenti_rotti(uuid, text[]) TO service_role;

-- ---------------------------------------------------------------------------
-- Il ripristino
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_ripristina_backup(
  p_dump jsonb, p_modo text DEFAULT 'prova', p_conserva_schema boolean DEFAULT false
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public' AS $function$
DECLARE
  v_azienda      jsonb := p_dump -> 'azienda';
  v_company_id   uuid;
  v_schema       text;
  v_chiave       text;
  v_tabella      text;
  v_colonne      text;
  v_nel_file     int;
  v_inserite     int;
  v_esito        jsonb := '[]'::jsonb;
  v_totale_file  int := 0;
  v_totale_ins   int := 0;
  v_errore       text;
  v_rientrate    text[] := ARRAY['companies'];
  v_senza_account int := 0;
  v_gia_presenti int;
  v_totale_presenti int := 0;
  v_chiave_primaria text;
  v_dal_file     text;
  v_rotti        text;
  v_contatore    record;
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

  -- In reale tornano righe vecchie, non nasce lavoro nuovo: niente trigger
  -- (controlli, righe iniziali, avvisi, automazioni, updated_by) e niente
  -- chiavi esterne mentre si versa. Le chiavi si controllano tutte alla fine.
  IF p_modo = 'reale' THEN
    -- SET, non set_config(): Supabase concede questo parametro solo al comando SET.
    SET LOCAL session_replication_role = replica;
  END IF;

  -- La riga dell'azienda per prima. Le colonne sono quelle che il file ha:
  -- una colonna nata dopo il backup prende il suo valore predefinito.
  IF p_modo = 'prova' THEN
    EXECUTE format('CREATE TABLE %I.companies (LIKE public.companies INCLUDING DEFAULTS)', v_schema);
  END IF;
  SELECT string_agg(quote_ident(a.attname), ', ' ORDER BY a.attnum) INTO v_colonne
    FROM pg_attribute a
   WHERE a.attrelid = 'public.companies'::regclass AND a.attnum > 0
     AND NOT a.attisdropped AND a.attgenerated = '' AND v_azienda ? a.attname;
  EXECUTE format('INSERT INTO %I.companies (%s) OVERRIDING SYSTEM VALUE SELECT %s FROM jsonb_populate_record(NULL::public.companies, $1)',
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
    CONTINUE WHEN v_nel_file = 0;
    v_totale_file := v_totale_file + v_nel_file;

    SELECT string_agg(quote_ident(a.attname), ', ' ORDER BY a.attnum) INTO v_colonne
      FROM pg_attribute a
     WHERE a.attrelid = ('public.' || quote_ident(v_tabella))::regclass AND a.attnum > 0
       AND NOT a.attisdropped AND a.attgenerated = ''
       AND (p_dump -> v_chiave -> 0) ? a.attname;
    SELECT string_agg('EXCLUDED.' || quote_ident(a.attname), ', ' ORDER BY a.attnum) INTO v_dal_file
      FROM pg_attribute a
     WHERE a.attrelid = ('public.' || quote_ident(v_tabella))::regclass AND a.attnum > 0
       AND NOT a.attisdropped AND a.attgenerated = ''
       AND (p_dump -> v_chiave -> 0) ? a.attname;
    SELECT k.conname INTO v_chiave_primaria
      FROM pg_constraint k
     WHERE k.conrelid = ('public.' || quote_ident(v_tabella))::regclass AND k.contype = 'p';

    BEGIN
      IF p_modo = 'prova' THEN
        EXECUTE format('CREATE TABLE %I.%I (LIKE public.%I INCLUDING DEFAULTS)', v_schema, v_tabella, v_tabella);
      END IF;
      -- Gli utenti rientrano se il loro account di accesso c'è ancora: la purga
      -- cancella il profilo, non l'account. Chi non ce l'ha va ricreato dall'auth.
      -- 45 tabelle hanno company_id senza cancellazione a cascata (conversazioni
      -- non ha chiavi esterne): la purga le lascia dov'erano, ma può averne
      -- svuotato i riferimenti a ciò che ha cancellato. Una riga che c'è già con
      -- la stessa chiave primaria torna ai valori del backup, e si conta a parte.
      EXECUTE format('WITH scritte AS (INSERT INTO %I.%I (%s) OVERRIDING SYSTEM VALUE SELECT %s FROM jsonb_populate_recordset(NULL::public.%I, $1) r%s%s RETURNING (xmax = 0) AS nuova) '
                     'SELECT count(*) FILTER (WHERE nuova), count(*) FILTER (WHERE NOT nuova) FROM scritte',
                     v_schema, v_tabella, v_colonne, v_colonne, v_tabella,
                     CASE WHEN p_modo = 'reale' AND v_tabella = 'profiles'
                          THEN ' WHERE EXISTS (SELECT 1 FROM auth.users u WHERE u.id = r.id)' ELSE '' END,
                     CASE WHEN p_modo = 'reale' AND v_chiave_primaria IS NOT NULL
                          THEN format(' ON CONFLICT ON CONSTRAINT %I DO UPDATE SET (%s) = ROW(%s)',
                                      v_chiave_primaria, v_colonne, v_dal_file) ELSE '' END)
        INTO v_inserite, v_gia_presenti USING (p_dump -> v_chiave);
      v_totale_ins := v_totale_ins + v_inserite;
      v_totale_presenti := v_totale_presenti + v_gia_presenti;
      v_rientrate := v_rientrate || v_tabella;
      IF p_modo = 'reale' AND v_tabella = 'profiles' THEN
        SELECT count(*) INTO v_senza_account
          FROM jsonb_populate_recordset(NULL::public.profiles, p_dump -> v_chiave) r
         WHERE NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = r.id);
      END IF;
      v_esito := v_esito || (
                   jsonb_build_object('tabella', v_tabella, 'nel_file', v_nel_file, 'ripristinate', v_inserite)
                   || CASE WHEN v_gia_presenti > 0 THEN jsonb_build_object('gia_presenti', v_gia_presenti) ELSE '{}'::jsonb END
                   || CASE WHEN v_tabella = 'profiles' AND v_senza_account > 0
                           THEN jsonb_build_object('nota', format('%s utenti senza account di accesso: vanno ricreati dall''auth', v_senza_account))
                           ELSE '{}'::jsonb END);
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

  IF p_modo = 'reale' THEN
    SET LOCAL session_replication_role = origin;

    -- Il PIN dei numeri WhatsApp sta nel Vault (trigger whatsapp_pin_nel_vault,
    -- dal 25/09): un backup più vecchio potrebbe averlo in chiaro, e con i
    -- trigger spenti non sarebbe passato di lì. Riscriverlo lo fa passare.
    IF 'ai_whatsapp_numbers' = ANY (v_rientrate)
       AND EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid = 'public.ai_whatsapp_numbers'::regclass
                      AND a.attname = 'cloud_api_pin' AND NOT a.attisdropped) THEN
      EXECUTE 'UPDATE public.ai_whatsapp_numbers SET cloud_api_pin = cloud_api_pin WHERE company_id = $1 AND cloud_api_pin IS NOT NULL'
        USING v_company_id;
    END IF;

    -- I contatori ripartono dopo il valore più alto rientrato.
    FOR v_contatore IN
      SELECT x.t AS tabella, a.attname::text AS colonna,
             pg_get_serial_sequence(format('public.%I', x.t), a.attname) AS sequenza
        FROM unnest(v_rientrate) AS x(t)
        JOIN pg_attribute a ON a.attrelid = ('public.' || quote_ident(x.t))::regclass
                           AND a.attnum > 0 AND NOT a.attisdropped
       WHERE pg_get_serial_sequence(format('public.%I', x.t), a.attname) IS NOT NULL
    LOOP
      EXECUTE format('SELECT setval(%L, GREATEST((SELECT coalesce(max(%I), 0) FROM public.%I), (SELECT last_value FROM %s)))',
                     v_contatore.sequenza, v_contatore.colonna, v_contatore.tabella, v_contatore.sequenza);
    END LOOP;

    -- Adesso che ci sono tutte, ogni chiave esterna delle tabelle rientrate.
    SELECT string_agg(format('%s.%s → %s: %s righe', r.tabella, r.vincolo, r.madre, r.righe), '; ')
      INTO v_rotti
      FROM public.admin_backup_collegamenti_rotti(v_company_id, v_rientrate) r;
    IF v_rotti IS NOT NULL THEN
      RAISE EXCEPTION 'Ripristino reale annullato: righe che puntano a qualcosa che non c''è più — %', v_rotti;
    END IF;
  END IF;

  IF p_modo = 'prova' AND NOT p_conserva_schema THEN
    EXECUTE format('DROP SCHEMA %I CASCADE', v_schema);
  END IF;

  RETURN jsonb_build_object(
    'modo', p_modo, 'azienda', v_azienda ->> 'name', 'company_id', v_company_id,
    'esportato_il', p_dump ->> 'esportato_il',
    'righe_nel_file', v_totale_file, 'righe_ripristinate', v_totale_ins,
    'righe_gia_presenti', CASE WHEN p_modo = 'reale' THEN v_totale_presenti END,
    'integro', (v_totale_file = v_totale_ins + v_totale_presenti),
    'utenti_senza_account', CASE WHEN p_modo = 'reale' THEN v_senza_account END,
    'collegamenti_controllati', (p_modo = 'reale'),
    'schema', CASE WHEN p_modo = 'prova' AND p_conserva_schema THEN v_schema END,
    'tabelle', v_esito, 'eseguito_il', now());
END; $function$;

REVOKE ALL ON FUNCTION public.admin_ripristina_backup(jsonb, text, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_ripristina_backup(jsonb, text, boolean) TO service_role;

-- ---------------------------------------------------------------------------
-- La prova a blocchi prende le colonne con la stessa regola: se una riga entra
-- nel ripristino, deve entrare anche nella prova (e viceversa).
-- (Corpo copiato dalla definizione in produzione; cambia solo l'elenco colonne.)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_ripristino_prova_versa(p_prova_id uuid, p_tabella text, p_righe jsonb, p_passo integer DEFAULT NULL::integer, p_pezzo integer DEFAULT 0, p_ultimo_pezzo boolean DEFAULT true, p_errore text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET lock_timeout TO '3s'
AS $function$
DECLARE
  v_prova    public.backup_prove_ripristino%ROWTYPE;
  v_righe    jsonb;
  v_n        integer := 0;
  v_inserite integer := 0;
  v_colonne  text;
  v_errore   text := nullif(left(coalesce(p_errore, ''), 300), '');
  v_voce     jsonb;
  v_pezzo    integer := coalesce(p_pezzo, 0);
  v_ultimo   boolean := coalesce(p_ultimo_pezzo, true);
BEGIN
  IF NOT public.is_super_admin(auth.uid())
     AND coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '') <> 'service_role' THEN
    RAISE EXCEPTION 'Riservato al super admin' USING ERRCODE = '42501';
  END IF;
  IF coalesce(p_tabella, '') = '' THEN
    RAISE EXCEPTION 'Serve il nome della tabella';
  END IF;

  SELECT * INTO v_prova FROM public.backup_prove_ripristino WHERE id = p_prova_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Prova di ripristino % non trovata', p_prova_id USING ERRCODE = 'PT404';
  END IF;
  IF v_prova.stato <> 'in_corso' THEN
    -- 409: chi sta versando si ferma, non c'è più niente in cui versare.
    RAISE EXCEPTION 'La prova di ripristino % non è più in corso (%)', p_prova_id, v_prova.stato USING ERRCODE = 'PT409';
  END IF;
  -- Lo schema lo sceglie «apri» e sta nel registro: qui non arriva da fuori.
  -- Si ricontrolla lo stesso, perché qui sotto si crea e si scrive.
  IF v_prova.schema_prova !~ '^ripristino_prova_[0-9a-f]{8}_blocchi$' THEN
    RAISE EXCEPTION 'Schema di prova non valido: %', v_prova.schema_prova;
  END IF;

  IF p_passo IS NOT NULL THEN
    IF (p_passo, v_pezzo) < (v_prova.passo, v_prova.pezzo) THEN
      RETURN jsonb_build_object('tabella', p_tabella, 'gia_versato', true,
                                'passo', v_prova.passo, 'pezzo', v_prova.pezzo);
    ELSIF (p_passo, v_pezzo) > (v_prova.passo, v_prova.pezzo) THEN
      RAISE EXCEPTION 'Passo %.% fuori ordine: la prova è al %.%', p_passo, v_pezzo, v_prova.passo, v_prova.pezzo;
    END IF;
  END IF;

  v_righe := CASE jsonb_typeof(p_righe) WHEN 'object' THEN p_righe -> 'righe' ELSE p_righe END;
  IF v_righe IS NULL OR jsonb_typeof(v_righe) = 'null' THEN
    v_righe := '[]'::jsonb;
  ELSIF jsonb_typeof(v_righe) <> 'array' THEN
    v_errore := coalesce(v_errore, 'il blocco non contiene un elenco di righe');
    v_righe := '[]'::jsonb;
  END IF;
  v_n := jsonb_array_length(v_righe);

  IF v_errore IS NULL AND v_n > 0 THEN
    IF NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
                    WHERE n.nspname = 'public' AND c.relname = p_tabella AND c.relkind IN ('r', 'p')) THEN
      v_errore := 'tabella inesistente in public';
    ELSE
      -- Le colonne che il file contiene: una colonna nata dopo il backup prende
      -- il suo valore predefinito, come nel ripristino.
      SELECT string_agg(quote_ident(a.attname), ', ' ORDER BY a.attnum) INTO v_colonne
        FROM pg_attribute a
       WHERE a.attrelid = ('public.' || quote_ident(p_tabella))::regclass AND a.attnum > 0
         AND NOT a.attisdropped AND a.attgenerated = ''
         AND (v_righe -> 0) ? a.attname;
      BEGIN
        -- Di norma la tabella c'è già (la crea «apri»); se manca la si crea qui.
        IF to_regclass(format('%I.%I', v_prova.schema_prova, p_tabella)) IS NULL THEN
          EXECUTE format('CREATE UNLOGGED TABLE %I.%I (LIKE public.%I INCLUDING DEFAULTS)',
                         v_prova.schema_prova, p_tabella, p_tabella);
        END IF;
        EXECUTE format('INSERT INTO %I.%I (%s) SELECT %s FROM jsonb_populate_recordset(NULL::public.%I, $1)',
                       v_prova.schema_prova, p_tabella, v_colonne, v_colonne, p_tabella)
          USING v_righe;
        GET DIAGNOSTICS v_inserite = ROW_COUNT;
      EXCEPTION WHEN OTHERS THEN
        -- Come nella prova del file unico: il blocco che non entra si dichiara,
        -- con il motivo, e si va avanti.
        v_errore := left(SQLERRM, 300);
        v_inserite := 0;
      END;
    END IF;
  END IF;

  v_voce := coalesce(v_prova.avanzamento -> p_tabella, '{}'::jsonb);
  v_voce := jsonb_build_object(
              'nel_file',   coalesce((v_voce ->> 'nel_file')::bigint, 0) + v_n,
              'inserite',   coalesce((v_voce ->> 'inserite')::bigint, 0) + v_inserite,
              'file_fatti', coalesce((v_voce ->> 'file_fatti')::integer, 0) + CASE WHEN v_ultimo THEN 1 ELSE 0 END)
            -- Resta il primo errore della tabella: è quello che spiega gli altri.
            || CASE WHEN coalesce(v_voce ->> 'errore', v_errore) IS NOT NULL
                    THEN jsonb_build_object('errore', coalesce(v_voce ->> 'errore', v_errore))
                    ELSE '{}'::jsonb END;

  UPDATE public.backup_prove_ripristino
     SET avanzamento   = avanzamento || jsonb_build_object(p_tabella, v_voce),
         passo         = CASE WHEN p_passo IS NULL THEN passo WHEN v_ultimo THEN p_passo + 1 ELSE p_passo END,
         pezzo         = CASE WHEN p_passo IS NULL THEN pezzo WHEN v_ultimo THEN 0 ELSE v_pezzo + 1 END,
         aggiornata_il = now()
   WHERE id = p_prova_id;

  RETURN jsonb_build_object('tabella', p_tabella, 'nel_blocco', v_n, 'inserite', v_inserite)
         || CASE WHEN v_errore IS NOT NULL THEN jsonb_build_object('errore', v_errore) ELSE '{}'::jsonb END;
END; $function$;
