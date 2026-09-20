-- La prova di ripristino per i backup a blocchi.
--
-- Dal 20/09/2026 le aziende grandi — BeMade, Il Bagno Group, Best Infissi, la
-- Demo, e dal 19/09 l'area super admin — si salvano a blocchi: una cartella
-- <azienda>/<data>/ con un indice e un file per blocco. Per quel formato la
-- prova di ripristino non c'era: admin_ripristina_backup vuole il dump intero
-- in un parametro solo, e un dump intero di quelle aziende è proprio quello
-- che non passa (8 secondi di PostgREST, memoria della edge function).
-- «Un backup che non ha passato la prova non è un backup»: le aziende più
-- importanti avevano una copia che nessuno aveva mai provato a rimettere dentro.
--
-- Qui la stessa prova, un blocco per chiamata:
--   admin_ripristino_prova_apri    crea lo schema ripristino_prova_<id>_blocchi
--                                  e TUTTE le tabelle dell'indice, in una volta;
--   admin_ripristino_prova_versa   versa un blocco in una tabella e tiene il conto;
--   admin_ripristino_prova_chiudi  conta cosa c'è davvero, butta via lo schema.
-- Le chiama company-restore (azione «prova» su un indice.json), che scorre i
-- file dell'indice. Nessun effetto su public; il modo «reale» non c'entra e
-- resta com'è, in admin_ripristina_backup.
--
-- Creazione delle tabelle e inserimento sono gli stessi di
-- admin_ripristina_backup (LIKE public.<tabella> INCLUDING DEFAULTS, colonne
-- non generate, jsonb_populate_recordset con il tipo di produzione): se una
-- riga non entra qui, non entrerebbe nemmeno nel ripristino vero. Due sole
-- differenze, volute:
--   · le tabelle sono UNLOGGED: sono copie da buttare, e centinaia di MB di WAL
--     per una prova sarebbero solo lavoro in più per un database piccolo;
--   · le tabelle si creano tutte in «apri», non una per blocco: ogni CREATE
--     TABLE fa ricaricare a PostgREST la sua cache dello schema (event trigger
--     pgrst_ddl_watch), e cento ricariche in due minuti non servono a nessuno.
--
-- Il registro delle prove (backup_prove_ripristino) serve a tre cose: una
-- prova lunga gira in sottofondo e la scheda ne chiede lo stato; il cursore
-- (passo, pezzo) rende ogni versamento ripetibile senza doppioni, anche quando
-- il lavoro passa da una chiamata della funzione alla successiva; e l'esito
-- resta scritto — si vede quale backup ha passato la prova, e quando.

-- ---------------------------------------------------------------------------
-- Il registro delle prove
-- ---------------------------------------------------------------------------
-- La colonna si chiama azienda_id e non company_id apposta: il catalogo del
-- backup (admin_tabelle_da_esportare) prende ogni tabella con una company_id,
-- e il registro delle prove non è un dato dell'azienda. Niente chiave esterna:
-- l'esito di una prova resta anche dopo la purga dell'azienda (sono conteggi
-- per tabella, non dati).
CREATE TABLE IF NOT EXISTS public.backup_prove_ripristino (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  azienda_id     uuid NOT NULL,
  percorso       text NOT NULL,
  schema_prova   text NOT NULL,
  stato          text NOT NULL DEFAULT 'in_corso' CHECK (stato IN ('in_corso', 'finita', 'fallita')),
  -- Il cursore: il prossimo passo del piano (un passo = un file dell'indice) e,
  -- se un blocco è stato diviso, il prossimo pezzo di quel passo.
  passo          integer NOT NULL DEFAULT 0,
  pezzo          integer NOT NULL DEFAULT 0,
  passi_totali   integer,
  righe_attese   bigint,
  -- Per tabella: righe arrivate nei blocchi, righe entrate, file fatti, primo errore.
  avanzamento    jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- Per tabella: righe contate nello schema di prova un attimo prima di buttarlo.
  conteggi       jsonb,
  -- L'esito nel formato che la scheda Backup sa mostrare (lo compone company-restore).
  esito          jsonb,
  errore         text,
  avviata_da     uuid,
  avviata_il     timestamptz NOT NULL DEFAULT now(),
  aggiornata_il  timestamptz NOT NULL DEFAULT now(),
  finita_il      timestamptz
);

COMMENT ON TABLE public.backup_prove_ripristino IS
  'Prove di ripristino dei backup a blocchi (company-restore): stato, cursore ed esito. Solo service role.';

-- Una prova per azienda alla volta: due insieme si butterebbero via lo schema a vicenda.
CREATE UNIQUE INDEX IF NOT EXISTS backup_prove_ripristino_una_in_corso
  ON public.backup_prove_ripristino (azienda_id) WHERE stato = 'in_corso';
CREATE INDEX IF NOT EXISTS backup_prove_ripristino_per_azienda
  ON public.backup_prove_ripristino (azienda_id, avviata_il DESC);

-- Nessuna policy: ci arriva solo il service role, da company-restore.
ALTER TABLE public.backup_prove_ripristino ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.backup_prove_ripristino FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.backup_prove_ripristino TO service_role;

-- ---------------------------------------------------------------------------
-- apri: lo schema, tutte le tabelle, la riga nel registro
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_ripristino_prova_apri(
  p_company_id uuid,
  p_percorso   text,
  p_tabelle    text[]  DEFAULT NULL,
  p_passi      integer DEFAULT NULL,
  p_righe      bigint  DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
SET lock_timeout TO '5s'
AS $function$
DECLARE
  v_schema   text;
  v_viva     public.backup_prove_ripristino%ROWTYPE;
  v_morta    public.backup_prove_ripristino%ROWTYPE;
  v_id       uuid;
  v_tabella  text;
  v_create   text[] := '{}';
  v_saltate  text[] := '{}';
BEGIN
  IF NOT public.is_super_admin(auth.uid())
     AND coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '') <> 'service_role' THEN
    RAISE EXCEPTION 'Riservato al super admin' USING ERRCODE = '42501';
  END IF;
  IF p_company_id IS NULL OR coalesce(p_percorso, '') = '' THEN
    RAISE EXCEPTION 'Servono l''azienda e il percorso dell''indice';
  END IF;
  -- L'indice sta nella cartella della sua azienda: <azienda>/<AAAA-MM-GG>/indice.json.
  IF p_percorso !~ ('^' || p_company_id::text || '/[0-9]{4}-[0-9]{2}-[0-9]{2}/indice[.]json$') THEN
    RAISE EXCEPTION 'Il percorso % non è l''indice di un backup a blocchi di questa azienda', p_percorso;
  END IF;
  v_schema := 'ripristino_prova_' || replace(left(p_company_id::text, 8), '-', '') || '_blocchi';

  -- Due «apri» insieme sulla stessa azienda: il secondo aspetta il primo e poi
  -- trova la sua prova in corso, invece di buttargli via lo schema.
  PERFORM pg_advisory_xact_lock(hashtext('ripristino_prova:' || p_company_id::text));

  -- Le prove rimaste a metà (funzione ritirata, memoria finita): dopo dieci
  -- minuti di silenzio sono morte. Si dichiarano fallite e si butta via la
  -- loro copia dei dati, di qualunque azienda fossero. Lo stesso tempo sta in
  -- _shared/ripristinoBlocchi.ts (SILENZIO_MASSIMO_MS).
  FOR v_morta IN
    SELECT * FROM public.backup_prove_ripristino
     WHERE stato = 'in_corso' AND aggiornata_il < now() - interval '10 minutes'
     FOR UPDATE SKIP LOCKED
  LOOP
    IF v_morta.schema_prova ~ '^ripristino_prova_[0-9a-f]{8}_blocchi$' THEN
      EXECUTE format('DROP SCHEMA IF EXISTS %I CASCADE', v_morta.schema_prova);
    END IF;
    UPDATE public.backup_prove_ripristino
       SET stato = 'fallita', finita_il = now(), aggiornata_il = now(),
           errore = 'Interrotta: nessun segno di vita da più di dieci minuti'
     WHERE id = v_morta.id;
  END LOOP;

  SELECT * INTO v_viva FROM public.backup_prove_ripristino
   WHERE azienda_id = p_company_id AND stato = 'in_corso';
  IF FOUND THEN
    RETURN jsonb_build_object('gia_in_corso', true, 'prova_id', v_viva.id, 'percorso', v_viva.percorso);
  END IF;

  EXECUTE format('DROP SCHEMA IF EXISTS %I CASCADE', v_schema);
  EXECUTE format('CREATE SCHEMA %I', v_schema);

  -- La riga dell'azienda per prima, come nel ripristino vero; poi le tabelle
  -- dell'indice. Una tabella che in public non c'è più si salta: «versa» lo
  -- dirà quando arriva il suo blocco.
  FOREACH v_tabella IN ARRAY array_prepend('companies', coalesce(p_tabelle, '{}'::text[])) LOOP
    CONTINUE WHEN v_tabella IS NULL OR v_tabella = ANY (v_create) OR v_tabella = ANY (v_saltate);
    IF NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
                    WHERE n.nspname = 'public' AND c.relname = v_tabella AND c.relkind IN ('r', 'p')) THEN
      v_saltate := v_saltate || v_tabella;
      CONTINUE;
    END IF;
    EXECUTE format('CREATE UNLOGGED TABLE %I.%I (LIKE public.%I INCLUDING DEFAULTS)', v_schema, v_tabella, v_tabella);
    v_create := v_create || v_tabella;
  END LOOP;

  INSERT INTO public.backup_prove_ripristino (azienda_id, percorso, schema_prova, passi_totali, righe_attese, avviata_da)
  VALUES (p_company_id, p_percorso, v_schema, p_passi, p_righe, auth.uid())
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('prova_id', v_id, 'schema', v_schema,
                            'tabelle_create', coalesce(array_length(v_create, 1), 0),
                            'tabelle_saltate', to_jsonb(v_saltate));
END; $function$;

-- ---------------------------------------------------------------------------
-- versa: un blocco in una tabella, e il conto aggiornato nella stessa transazione
-- ---------------------------------------------------------------------------
-- p_righe è l'elenco delle righe, oppure il file del blocco così com'è
-- ({ "n", "righe": [...], "finito", "ultimo" }): company-restore lo passa
-- senza aprirlo, perché trasformare 130 MB di testo in oggetti e di nuovo in
-- testo è ciò che ha fatto fermare company-backup per «CPU Time exceeded».
--
-- (p_passo, p_pezzo) è il cursore. Un versamento già fatto non si rifà: si
-- risponde «gia_versato» con il punto a cui si è arrivati. Così una chiamata
-- dall'esito incerto (rete caduta dopo il COMMIT) si può ripetere, e due giri
-- della funzione che si sovrapponessero non raddoppiano le righe.
--
-- p_errore: il passo non è andato dal lato della funzione (file mancante,
-- blocco che non passa nemmeno a pezzi). Si scrive l'errore sulla tabella e il
-- cursore avanza lo stesso: una tabella rotta non ferma la prova delle altre.
CREATE OR REPLACE FUNCTION public.admin_ripristino_prova_versa(
  p_prova_id     uuid,
  p_tabella      text,
  p_righe        jsonb,
  p_passo        integer DEFAULT NULL,
  p_pezzo        integer DEFAULT 0,
  p_ultimo_pezzo boolean DEFAULT true,
  p_errore       text    DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
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
      SELECT string_agg(quote_ident(a.attname), ', ' ORDER BY a.attnum) INTO v_colonne
        FROM pg_attribute a
       WHERE a.attrelid = ('public.' || quote_ident(p_tabella))::regclass AND a.attnum > 0
         AND NOT a.attisdropped AND a.attgenerated = '';
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

-- ---------------------------------------------------------------------------
-- chiudi: si conta quello che c'è davvero, poi lo schema si butta
-- ---------------------------------------------------------------------------
-- Il conto lo fa un count(*) sulle tabelle di prova, non la somma di quello
-- che «versa» ha dichiarato: è la differenza tra «ho detto di averle messe» e
-- «ci sono». Con p_stato = 'fallita' è anche il modo di abbandonare una prova
-- (indice illeggibile, giro successivo mai partito) senza lasciare in giro la
-- copia dei dati. Chiamarla due volte non fa danni: la seconda risponde con
-- quello che la prima ha scritto.
CREATE OR REPLACE FUNCTION public.admin_ripristino_prova_chiudi(
  p_prova_id uuid,
  p_stato    text DEFAULT 'finita',
  p_errore   text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
SET lock_timeout TO '3s'
AS $function$
DECLARE
  v_prova    public.backup_prove_ripristino%ROWTYPE;
  v_tabella  text;
  v_n        bigint;
  v_conteggi jsonb := '{}'::jsonb;
  v_totale   bigint := 0;
BEGIN
  IF NOT public.is_super_admin(auth.uid())
     AND coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '') <> 'service_role' THEN
    RAISE EXCEPTION 'Riservato al super admin' USING ERRCODE = '42501';
  END IF;
  IF p_stato NOT IN ('finita', 'fallita') THEN
    RAISE EXCEPTION 'Stato % non valido: finita o fallita', p_stato;
  END IF;

  SELECT * INTO v_prova FROM public.backup_prove_ripristino WHERE id = p_prova_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Prova di ripristino % non trovata', p_prova_id USING ERRCODE = 'PT404';
  END IF;
  IF v_prova.stato <> 'in_corso' THEN
    RETURN jsonb_build_object('gia_chiusa', true, 'stato', v_prova.stato,
                              'conteggi', coalesce(v_prova.conteggi, '{}'::jsonb),
                              'avanzamento', v_prova.avanzamento);
  END IF;
  IF v_prova.schema_prova !~ '^ripristino_prova_[0-9a-f]{8}_blocchi$' THEN
    RAISE EXCEPTION 'Schema di prova non valido: %', v_prova.schema_prova;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = v_prova.schema_prova) THEN
    FOR v_tabella IN
      SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = v_prova.schema_prova AND c.relkind = 'r' ORDER BY c.relname
    LOOP
      EXECUTE format('SELECT count(*) FROM %I.%I', v_prova.schema_prova, v_tabella) INTO v_n;
      v_conteggi := v_conteggi || jsonb_build_object(v_tabella, v_n);
      -- La riga dell'azienda non entra nel totale, come nella prova del file unico.
      IF v_tabella <> 'companies' THEN v_totale := v_totale + v_n; END IF;
    END LOOP;
    EXECUTE format('DROP SCHEMA %I CASCADE', v_prova.schema_prova);
  END IF;

  UPDATE public.backup_prove_ripristino
     SET stato = p_stato, errore = nullif(left(coalesce(p_errore, ''), 500), ''),
         conteggi = v_conteggi, finita_il = now(), aggiornata_il = now()
   WHERE id = p_prova_id;

  RETURN jsonb_build_object('stato', p_stato, 'conteggi', v_conteggi,
                            'righe_ripristinate', v_totale, 'avanzamento', v_prova.avanzamento);
END; $function$;

-- Nessuna delle tre è per il pubblico, e nemmeno per chi è collegato: le chiama
-- company-restore col service role, dopo aver controllato che sia un super admin.
REVOKE ALL ON FUNCTION public.admin_ripristino_prova_apri(uuid, text, text[], integer, bigint) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_ripristino_prova_versa(uuid, text, jsonb, integer, integer, boolean, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_ripristino_prova_chiudi(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_ripristino_prova_apri(uuid, text, text[], integer, bigint) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_ripristino_prova_versa(uuid, text, jsonb, integer, integer, boolean, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_ripristino_prova_chiudi(uuid, text, text) TO service_role;
