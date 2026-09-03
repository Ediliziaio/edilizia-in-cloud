-- Ondata 0.2 — Fattura emessa immutabile
--
-- Stato prima dell'intervento: documenti_fiscali ha 5 policy, 2 permettono
-- UPDATE, nessuna guarda lo stato, nessun trigger protegge le righe trasmesse.
-- Il divieto viveva soltanto in un `if` in src/hooks/useDocumentiFiscali.ts —
-- e nemmeno lì: useUpdateDocumento non controlla affatto lo stato, il controllo
-- c'era solo su cancellazione ed emissione. Una PATCH diretta a PostgREST
-- riscriveva numero e totale di una fattura già trasmessa allo SdI.
--
-- Tre pezzi:
--   1. un muro (trigger BEFORE UPDATE OR DELETE) che nessun percorso aggira:
--      né PostgREST, né una edge function col service role, né la console SQL;
--   2. l'elenco dei campi che DEVONO restare scrivibili dopo l'emissione,
--      ricavato dai writer reali e non indovinato (incasso, ciclo SdI, PDF);
--   3. uno storico di chi/cosa/quando, con l'attore preso da auth.uid() e mai
--      dal client.
--
-- Idempotente.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Quali documenti sono fiscali, e quando sono chiusi
-- ─────────────────────────────────────────────────────────────────────────────

-- Preventivo e proforma non sono documenti fiscali: si rivedono quante volte
-- serve. Il blocco vale solo per ciò che ha valore fiscale.
CREATE OR REPLACE FUNCTION public.documento_fiscale_e_immutabile(p_tipo text, p_stato text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $function$
  SELECT coalesce(
    p_tipo IN ('fattura','fattura_pa','nota_credito','nota_debito',
               'autofattura','fattura_riepilogativa','ddt')
    AND p_stato IS DISTINCT FROM 'bozza',
    false
  );
$function$;

-- I campi che restano scrivibili dopo l'emissione. Ognuno ha un padrone noto:
-- toglierne uno rompe un flusso reale, aggiungerne uno apre un buco fiscale.
CREATE OR REPLACE FUNCTION public.documento_fiscale_campi_modificabili()
RETURNS text[]
LANGUAGE sql
IMMUTABLE
AS $function$
  SELECT ARRAY[
    -- ciclo di vita e incasso
    --   registra_incasso_atomico, storna_incasso_atomico,
    --   update_fattura_stato_on_movimento, claim_documento_per_invio,
    --   noteCredito.ts, soft-delete
    'stato', 'importo_pagato', 'pagato_at', 'deleted_at',
    -- ciclo SdI: invia-sdi, sdi-webhook, _shared/sdiInvioGuard
    'sdi_id_trasmissione', 'sdi_stato', 'sdi_data_consegna', 'sdi_file_xml_url',
    'sdi_ricevuta_url', 'sdi_errori', 'sdi_notifica_tipo', 'sdi_firmato',
    'sdi_file_p7m_url', 'trasmissione',
    -- prodotti dopo l'emissione, non contenuto fiscale
    'pdf_url', 'note_interne', 'updated_at',
    -- un DDT viene fatturato dopo; una nota di credito si lega alla fattura
    'ddt_fatturato', 'ddt_fattura_id', 'documento_correlato_id',
    -- collegamento anagrafico (CRM), non il cliente stampato in fattura:
    -- quello vive in cliente_snapshot, che resta bloccato
    'anagrafica_id', 'ordine_id'
  ]::text[];
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Lo storico: chi, cosa, quando
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.documenti_fiscali_storico (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  documento_id  uuid NOT NULL,
  company_id    uuid NOT NULL,
  avvenuto_il   timestamptz NOT NULL DEFAULT now(),
  -- L'attore viene da auth.uid(), mai da un parametro passato dal browser:
  -- una cronologia che il client può firmare non è una cronologia.
  eseguito_da   uuid DEFAULT auth.uid(),
  -- Il ruolo di chi ha chiamato, non quello sotto cui gira la funzione:
  -- dentro una SECURITY DEFINER current_user è sempre il proprietario.
  ruolo_db      text NOT NULL DEFAULT coalesce(
                  nullif(current_setting('request.jwt.claim.role', true), ''),
                  nullif(auth.role()::text, ''),
                  current_user),
  operazione    text NOT NULL CHECK (operazione IN ('update','delete')),
  esito         text NOT NULL CHECK (esito IN ('applicata','rifiutata')),
  stato_prima   text,
  stato_dopo    text,
  campi         text[] NOT NULL DEFAULT '{}',
  differenze    jsonb  NOT NULL DEFAULT '{}'::jsonb,
  motivo        text
);

CREATE INDEX IF NOT EXISTS idx_doc_fisc_storico_documento
  ON public.documenti_fiscali_storico (documento_id, avvenuto_il DESC);
CREATE INDEX IF NOT EXISTS idx_doc_fisc_storico_azienda
  ON public.documenti_fiscali_storico (company_id, avvenuto_il DESC);

ALTER TABLE public.documenti_fiscali_storico
  ALTER COLUMN ruolo_db SET DEFAULT coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    nullif(auth.role()::text, ''),
    current_user);

COMMENT ON TABLE public.documenti_fiscali_storico IS
  'Ogni modifica a un documento fiscale chiuso, applicata o rifiutata. '
  'Scrivibile solo dai trigger; dal client è in sola lettura.';

ALTER TABLE public.documenti_fiscali_storico ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS doc_fisc_storico_lettura ON public.documenti_fiscali_storico;
CREATE POLICY doc_fisc_storico_lettura ON public.documenti_fiscali_storico
  FOR SELECT USING (public.user_can_access_company(company_id));

-- Nessuna policy di scrittura: si scrive solo dai trigger (SECURITY DEFINER).
REVOKE INSERT, UPDATE, DELETE ON public.documenti_fiscali_storico FROM anon, authenticated;
GRANT SELECT ON public.documenti_fiscali_storico TO authenticated;
GRANT ALL    ON public.documenti_fiscali_storico TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Il muro
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.documenti_fiscali_proteggi_emessi()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_consentiti text[] := public.documento_fiscale_campi_modificabili();
  v_prima      jsonb;
  v_dopo       jsonb;
  v_campo      text;
  v_violati    text[] := '{}';
  v_toccati    text[] := '{}';
  v_diff       jsonb  := '{}'::jsonb;
  v_motivo     text;
BEGIN
  -- ── DELETE ────────────────────────────────────────────────────────────────
  IF TG_OP = 'DELETE' THEN
    IF public.documento_fiscale_e_immutabile(OLD.tipo, OLD.stato) THEN
      v_motivo := format(
        'Un documento %s in stato "%s" non si cancella: la conservazione è obbligatoria. Annullalo (stato = annullata).',
        OLD.tipo, OLD.stato);
      RAISE LOG 'documenti_fiscali: DELETE rifiutata su % (% %) da % / %',
        OLD.id, OLD.tipo, OLD.stato, coalesce(auth.uid()::text,'—'), current_user;
      RAISE EXCEPTION '%', v_motivo USING ERRCODE = '42501';
    END IF;
    RETURN OLD;
  END IF;

  -- ── UPDATE ────────────────────────────────────────────────────────────────
  IF NOT public.documento_fiscale_e_immutabile(OLD.tipo, OLD.stato) THEN
    -- Documento ancora in bozza (o non fiscale): modificabile liberamente.
    -- Unico vincolo: da bozza non si esce all'indietro, ci pensa il ramo sotto.
    RETURN NEW;
  END IF;

  v_prima := to_jsonb(OLD);
  v_dopo  := to_jsonb(NEW);

  FOR v_campo IN SELECT jsonb_object_keys(v_dopo) LOOP
    IF v_prima -> v_campo IS DISTINCT FROM v_dopo -> v_campo THEN
      v_toccati := v_toccati || v_campo;
      v_diff := v_diff || jsonb_build_object(v_campo, jsonb_build_object(
        'prima', left(coalesce(v_prima ->> v_campo, ''), 500),
        'dopo',  left(coalesce(v_dopo  ->> v_campo, ''), 500)
      ));
      IF NOT (v_campo = ANY(v_consentiti)) THEN
        v_violati := v_violati || v_campo;
      END IF;
    END IF;
  END LOOP;

  -- Tornare in bozza sarebbe la scorciatoia per aggirare tutto il resto:
  -- prima si "riapre" il documento, poi lo si riscrive campo per campo.
  IF NEW.stato = 'bozza' AND OLD.stato IS DISTINCT FROM 'bozza' THEN
    v_violati := v_violati || 'stato→bozza';
  END IF;

  IF cardinality(v_violati) > 0 THEN
    v_motivo := format(
      'Documento %s n. %s in stato "%s": non si possono modificare %s. Per correggerlo emetti una nota di credito.',
      OLD.tipo, OLD.numero, OLD.stato, array_to_string(v_violati, ', '));

    -- Il tentativo resta nei log del server anche quando la transazione viene
    -- annullata dall'eccezione qui sotto (dove serve una traccia in tabella
    -- che sopravviva, il percorso è public.documento_fiscale_aggiorna).
    RAISE LOG 'documenti_fiscali: UPDATE rifiutata su % (% n.% %) campi=% da % / %',
      OLD.id, OLD.tipo, OLD.numero, OLD.stato,
      array_to_string(v_violati, ','), coalesce(auth.uid()::text,'—'), current_user;

    RAISE EXCEPTION '%', v_motivo USING ERRCODE = '42501';
  END IF;

  -- Modifica lecita su documento chiuso: si registra.
  IF cardinality(v_toccati) > 0
     AND v_toccati <> ARRAY['updated_at']::text[] THEN
    INSERT INTO public.documenti_fiscali_storico (
      documento_id, company_id, operazione, esito,
      stato_prima, stato_dopo, campi, differenze
    ) VALUES (
      OLD.id, OLD.company_id, 'update', 'applicata',
      OLD.stato, NEW.stato, v_toccati, v_diff
    );
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_documenti_fiscali_proteggi_emessi ON public.documenti_fiscali;
CREATE TRIGGER trg_documenti_fiscali_proteggi_emessi
  BEFORE UPDATE OR DELETE ON public.documenti_fiscali
  FOR EACH ROW EXECUTE FUNCTION public.documenti_fiscali_proteggi_emessi();

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Il percorso che lascia traccia anche quando dice di no
-- ─────────────────────────────────────────────────────────────────────────────
-- Un'eccezione annulla la transazione, e con essa qualunque riga di storico
-- scritta dal trigger: è il prezzo di un muro che non si può aggirare. Questa
-- RPC cattura il rifiuto in un sotto-blocco, così l'annullamento si ferma lì e
-- la registrazione del tentativo viene confermata. È il percorso che
-- l'interfaccia dovrebbe usare per salvare un documento fiscale.

CREATE OR REPLACE FUNCTION public.documento_fiscale_aggiorna(
  p_documento_id uuid,
  p_patch        jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_doc        public.documenti_fiscali%ROWTYPE;
  v_chiavi     text[];
  v_colonne    text;
  v_motivo     text;
  v_toccati    text[];
BEGIN
  SELECT * INTO v_doc FROM public.documenti_fiscali WHERE id = p_documento_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Documento non trovato' USING ERRCODE = 'P0002';
  END IF;
  IF public.user_can_access_company(v_doc.company_id) IS NOT TRUE THEN
    RAISE EXCEPTION 'Accesso negato' USING ERRCODE = '42501';
  END IF;

  IF p_patch IS NULL OR jsonb_typeof(p_patch) <> 'object' THEN
    RAISE EXCEPTION 'patch non valida' USING ERRCODE = '22023';
  END IF;

  -- Solo colonne che esistono davvero: le chiavi passano da %I e dal catalogo,
  -- quindi non c'è modo di iniettare SQL da una patch del client.
  SELECT array_agg(k ORDER BY k) INTO v_chiavi
  FROM jsonb_object_keys(p_patch) k
  WHERE EXISTS (
    SELECT 1 FROM pg_attribute a
    WHERE a.attrelid = 'public.documenti_fiscali'::regclass
      AND a.attnum > 0 AND NOT a.attisdropped AND a.attname = k
  );
  IF v_chiavi IS NULL OR cardinality(v_chiavi) = 0 THEN
    RAISE EXCEPTION 'nessuna colonna valida nella patch' USING ERRCODE = '22023';
  END IF;

  -- Identità e proprietà non si spostano da una patch: un documento che cambia
  -- azienda sparirebbe da un registro IVA e comparirebbe in un altro.
  IF v_chiavi && ARRAY['id','company_id']::text[] THEN
    RAISE EXCEPTION 'id e company_id non sono modificabili' USING ERRCODE = '42501';
  END IF;

  SELECT string_agg(format('%I', k), ', ' ORDER BY k) INTO v_colonne
  FROM unnest(v_chiavi) k;

  BEGIN
    EXECUTE format(
      'UPDATE public.documenti_fiscali SET (%s) = (SELECT %s FROM jsonb_populate_record(NULL::public.documenti_fiscali, $1)) WHERE id = $2',
      v_colonne, v_colonne)
    USING p_patch, p_documento_id;

    RETURN jsonb_build_object('ok', true, 'campi', to_jsonb(v_chiavi));
  EXCEPTION WHEN OTHERS THEN
    -- Il sotto-blocco annulla solo sé stesso: da qui in poi si scrive e si
    -- conferma. Il tentativo respinto resta.
    v_motivo := SQLERRM;

    SELECT array_agg(k ORDER BY k) INTO v_toccati
    FROM unnest(v_chiavi) k
    WHERE to_jsonb(v_doc) -> k IS DISTINCT FROM p_patch -> k;

    INSERT INTO public.documenti_fiscali_storico (
      documento_id, company_id, operazione, esito,
      stato_prima, stato_dopo, campi, differenze, motivo
    ) VALUES (
      v_doc.id, v_doc.company_id, 'update', 'rifiutata',
      v_doc.stato, v_doc.stato, coalesce(v_toccati, v_chiavi),
      jsonb_build_object('richiesta', p_patch), v_motivo
    );

    RETURN jsonb_build_object('ok', false, 'motivo', v_motivo);
  END;
END;
$function$;

REVOKE ALL ON FUNCTION public.documento_fiscale_aggiorna(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.documento_fiscale_aggiorna(uuid, jsonb) TO authenticated, service_role;
