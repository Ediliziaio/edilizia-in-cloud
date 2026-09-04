-- ════════════════════════════════════════════════════════════════════════════
-- Sincronizzazione offline: una ricevuta per operazione
-- ════════════════════════════════════════════════════════════════════════════
--
-- Oggi la coda offline (`src/hooks/campo/useOfflineSync.ts`) rigioca gli
-- elementi uno alla volta con degli insert semplici. Tre conseguenze.
--
-- 1. Niente idempotenza. Se la richiesta parte e la risposta si perde — che è
--    il caso NORMALE su una rete di cantiere — il telefono ritenta e inserisce
--    una seconda timbratura identica. Solo `checklist` usa un upsert con una
--    chiave naturale; le altre no.
-- 2. Niente esito per elemento. Il processore lancia un'eccezione e la coda
--    non sa quali elementi siano passati e quali no.
-- 3. `supabase.from(item.target).insert(item.payload)` — il nome della tabella
--    e il contenuto arrivano dal telefono. Le policy di riga limitano il
--    danno, ma è una porta larga.
--
-- ── Il criterio ────────────────────────────────────────────────────────────
-- Ogni operazione porta un `id_client`: un UUID generato dal telefono quando
-- l'utente compie il gesto, non quando la rete torna. È la chiave di
-- idempotenza. La seconda volta che arriva, il server non reinserisce: rilegge
-- la ricevuta e restituisce lo stesso esito di prima.
--
-- Ogni operazione ha il suo punto di ripristino: una foto malformata non
-- blocca quaranta timbrature. Non è una svista sull'atomicità — è che per una
-- coda offline l'esito per elemento vale più del tutto-o-niente, e il client
-- deve poter cancellare dalla coda esattamente ciò che è passato.
--
-- Anche il RIFIUTO si registra. Senza, il telefono ritenterebbe per sempre
-- un'operazione che non passerà mai.
--
-- I tipi ammessi sono cinque e sono scritti qui. Nessun nome di tabella
-- arriva dal telefono.

CREATE TABLE IF NOT EXISTS public.sync_ricevute (
  company_id  uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  id_client   uuid NOT NULL,
  tipo        text NOT NULL,
  esito       text NOT NULL CHECK (esito IN ('inserita', 'rifiutata')),
  entita_id   uuid,
  messaggio   text,
  user_id     uuid,
  ricevuta_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (company_id, id_client)
);

CREATE INDEX IF NOT EXISTS idx_sync_ricevute_recenti
  ON public.sync_ricevute (company_id, ricevuta_at DESC);

ALTER TABLE public.sync_ricevute ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polrelid='public.sync_ricevute'::regclass
                   AND polname='sync_ricevute_proprie') THEN
    CREATE POLICY sync_ricevute_proprie ON public.sync_ricevute
      FOR SELECT TO authenticated
      USING (user_id = (SELECT auth.uid()));
  END IF;
END $$;

COMMENT ON TABLE public.sync_ricevute IS
  'Una riga per operazione sincronizzata dal campo. La chiave (company_id, id_client) è ciò che rende la sincronizzazione ripetibile: un rinvio dopo una risposta persa rilegge l''esito invece di reinserire.';

CREATE OR REPLACE FUNCTION public.sync_batch(p_operazioni jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid     uuid := auth.uid();
  v_company uuid;
  op        jsonb;
  v_idc     uuid;
  v_tipo    text;
  v_dati    jsonb;
  v_gia     record;
  v_id      uuid;
  v_esiti   jsonb := '[]'::jsonb;
  v_ok      int := 0;
  v_ko      int := 0;
  v_ripet   int := 0;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'sincronizzazione senza sessione' USING ERRCODE = '42501';
  END IF;
  IF p_operazioni IS NULL OR jsonb_typeof(p_operazioni) <> 'array' THEN
    RAISE EXCEPTION 'le operazioni devono essere un elenco' USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(p_operazioni) > 200 THEN
    RAISE EXCEPTION 'troppe operazioni in un solo invio: massimo 200, ricevute %',
      jsonb_array_length(p_operazioni) USING ERRCODE = '22023';
  END IF;

  SELECT p.company_id INTO v_company FROM public.profiles p WHERE p.id = v_uid;
  IF v_company IS NULL THEN
    RAISE EXCEPTION 'utente senza azienda' USING ERRCODE = '42501';
  END IF;

  FOR op IN SELECT * FROM jsonb_array_elements(p_operazioni)
  LOOP
    v_idc  := nullif(op ->> 'id_client', '')::uuid;
    v_tipo := op ->> 'tipo';
    v_dati := coalesce(op -> 'dati', '{}'::jsonb);
    v_id   := NULL;

    -- Senza chiave non c'è idempotenza, quindi non si accetta.
    IF v_idc IS NULL THEN
      v_ko := v_ko + 1;
      v_esiti := v_esiti || jsonb_build_object(
        'id_client', NULL, 'esito', 'rifiutata',
        'messaggio', 'manca id_client: senza una chiave l''operazione non può essere ripetibile');
      CONTINUE;
    END IF;

    -- Già ricevuta: si rilegge, non si rifà.
    SELECT * INTO v_gia FROM public.sync_ricevute r
     WHERE r.company_id = v_company AND r.id_client = v_idc;
    IF FOUND THEN
      v_ripet := v_ripet + 1;
      v_esiti := v_esiti || jsonb_build_object(
        'id_client', v_idc, 'esito', v_gia.esito, 'entita_id', v_gia.entita_id,
        'messaggio', v_gia.messaggio, 'gia_ricevuta', true);
      CONTINUE;
    END IF;

    BEGIN
      CASE v_tipo
        WHEN 'timbratura' THEN
          INSERT INTO public.campo_timbrature
            (company_id, user_id, order_id, tipo, timestamp_evento,
             gps_lat, gps_lng, gps_accuracy, fonte, note)
          VALUES (v_company, v_uid,
                  nullif(v_dati ->> 'order_id', '')::uuid,
                  coalesce(nullif(v_dati ->> 'tipo', ''), 'entrata'),
                  coalesce(nullif(v_dati ->> 'timestamp_evento', '')::timestamptz, now()),
                  nullif(v_dati ->> 'gps_lat', '')::numeric,
                  nullif(v_dati ->> 'gps_lng', '')::numeric,
                  nullif(v_dati ->> 'gps_accuracy', '')::numeric,
                  coalesce(nullif(v_dati ->> 'fonte', ''), 'app'),
                  nullif(v_dati ->> 'note', ''))
          RETURNING id INTO v_id;

        WHEN 'rapportino_vocale' THEN
          INSERT INTO public.rapportini_vocali
            (company_id, order_id, operaio_id, audio_url, audio_duration_sec,
             trascrizione, ore_lavorate, lavorazione, note, stato)
          VALUES (v_company,
                  nullif(v_dati ->> 'order_id', '')::uuid, v_uid,
                  nullif(v_dati ->> 'audio_url', ''),
                  nullif(v_dati ->> 'audio_duration_sec', '')::integer,
                  nullif(v_dati ->> 'trascrizione', ''),
                  nullif(v_dati ->> 'ore_lavorate', '')::numeric,
                  nullif(v_dati ->> 'lavorazione', ''),
                  nullif(v_dati ->> 'note', ''),
                  coalesce(nullif(v_dati ->> 'stato', ''), 'bozza'))
          RETURNING id INTO v_id;

        WHEN 'checklist' THEN
          INSERT INTO public.checklist_sicurezza
            (company_id, order_id, operaio_id, data, turno, risposte, note,
             foto_urls, completata, firmata, posizione_gps)
          VALUES (v_company,
                  nullif(v_dati ->> 'order_id', '')::uuid, v_uid,
                  coalesce(nullif(v_dati ->> 'data', '')::date, CURRENT_DATE),
                  coalesce(nullif(v_dati ->> 'turno', ''), 'mattina'),
                  coalesce(v_dati -> 'risposte', '{}'::jsonb),
                  nullif(v_dati ->> 'note', ''),
                  CASE WHEN jsonb_typeof(v_dati -> 'foto_urls') = 'array'
                       THEN ARRAY(SELECT jsonb_array_elements_text(v_dati -> 'foto_urls')) END,
                  coalesce((v_dati ->> 'completata')::boolean, false),
                  coalesce((v_dati ->> 'firmata')::boolean, false),
                  v_dati -> 'posizione_gps')
          ON CONFLICT (company_id, operaio_id, data, turno) DO UPDATE
            SET risposte = EXCLUDED.risposte, note = EXCLUDED.note,
                completata = EXCLUDED.completata, firmata = EXCLUDED.firmata,
                updated_at = now()
          RETURNING id INTO v_id;

        WHEN 'foto' THEN
          -- Il file lo carica il client su storage; qui arriva solo il
          -- riferimento. Senza percorso non c'è niente da registrare.
          IF coalesce(v_dati ->> 'storage_path', '') = '' THEN
            RAISE EXCEPTION 'manca storage_path: la foto non è stata caricata';
          END IF;
          INSERT INTO public.foto_cantiere
            (company_id, order_id, uploaded_by, storage_path, thumbnail_path,
             latitudine, longitudine, accuracy_meters, taken_at, server_timestamp,
             descrizione, source)
          VALUES (v_company,
                  nullif(v_dati ->> 'order_id', '')::uuid, v_uid,
                  v_dati ->> 'storage_path',
                  nullif(v_dati ->> 'thumbnail_path', ''),
                  nullif(v_dati ->> 'latitudine', '')::numeric,
                  nullif(v_dati ->> 'longitudine', '')::numeric,
                  nullif(v_dati ->> 'accuracy_meters', '')::numeric,
                  coalesce(nullif(v_dati ->> 'taken_at', '')::timestamptz, now()),
                  now(),
                  nullif(v_dati ->> 'descrizione', ''),
                  coalesce(nullif(v_dati ->> 'source', ''), 'campo'))
          RETURNING id INTO v_id;

        WHEN 'movimento_magazzino' THEN
          -- Delega alla funzione transazionale dell'ondata 0.4: blocca la riga
          -- di giacenza e rifiuta di scendere sotto zero.
          PERFORM public.warehouse_movimento_rapido(
            (v_dati ->> 'stock_item_id')::uuid,
            coalesce(nullif(v_dati ->> 'tipo', ''), 'uscita'),
            (v_dati ->> 'quantita')::integer,
            nullif(v_dati ->> 'note', ''));
          v_id := (v_dati ->> 'stock_item_id')::uuid;

        ELSE
          RAISE EXCEPTION 'tipo non ammesso: %. I tipi sono timbratura, rapportino_vocale, checklist, foto, movimento_magazzino', coalesce(v_tipo, '(nessuno)');
      END CASE;

      INSERT INTO public.sync_ricevute (company_id, id_client, tipo, esito, entita_id, user_id)
      VALUES (v_company, v_idc, v_tipo, 'inserita', v_id, v_uid);

      v_ok := v_ok + 1;
      v_esiti := v_esiti || jsonb_build_object(
        'id_client', v_idc, 'esito', 'inserita', 'entita_id', v_id);

    EXCEPTION WHEN OTHERS THEN
      -- Il rifiuto si registra come la riuscita: altrimenti il telefono
      -- ritenterebbe per sempre un'operazione che non passerà mai.
      INSERT INTO public.sync_ricevute (company_id, id_client, tipo, esito, messaggio, user_id)
      VALUES (v_company, v_idc, coalesce(v_tipo, '?'), 'rifiutata', left(SQLERRM, 300), v_uid)
      ON CONFLICT DO NOTHING;

      v_ko := v_ko + 1;
      v_esiti := v_esiti || jsonb_build_object(
        'id_client', v_idc, 'esito', 'rifiutata', 'messaggio', left(SQLERRM, 300));
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'ricevute', jsonb_array_length(p_operazioni),
    'inserite', v_ok, 'rifiutate', v_ko, 'gia_ricevute', v_ripet,
    'esiti', v_esiti,
    'nota', 'Le operazioni con esito «inserita» o «rifiutata» si possono togliere dalla coda: rinviarle non cambierebbe niente.');
END $function$;

COMMENT ON FUNCTION public.sync_batch(jsonb) IS
  'Sincronizza in blocco le operazioni raccolte offline. Ogni operazione porta un id_client generato dal telefono: è la chiave che rende il rinvio innocuo. Restituisce un esito per operazione.';

REVOKE ALL ON FUNCTION public.sync_batch(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sync_batch(jsonb) TO authenticated, service_role;
