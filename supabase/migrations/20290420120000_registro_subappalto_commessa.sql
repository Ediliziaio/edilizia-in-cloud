BEGIN;

CREATE TABLE private.registro_subappalto_commessa (
  order_id uuid PRIMARY KEY REFERENCES public.orders(id) ON DELETE CASCADE,
  versione integer NOT NULL DEFAULT 0,
  richieste jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(richieste) = 'array'),
  interne jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(interne) = 'array')
);
ALTER TABLE private.registro_subappalto_commessa ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.registro_subappalto_commessa FROM PUBLIC, anon, authenticated;

CREATE FUNCTION private.registro_subappalto(p_azienda uuid, p_commessa uuid, p_operazione jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  utente uuid := auth.uid();
  ordine public.orders%ROWTYPE;
  archivio private.registro_subappalto_commessa%ROWTYPE;
  tipo text := p_operazione->>'tipo';
  richiesta jsonb;
  offerta jsonb;
  voce jsonb;
  voce_id text;
  ambito text;
  id_richiesta text;
  id_contratto uuid;
  posizione integer;
  ditta public.subappaltatori%ROWTYPE;
BEGIN
  SELECT * INTO ordine FROM public.orders WHERE id = p_commessa AND company_id = p_azienda AND deleted_at IS NULL;
  IF utente IS NULL OR ordine.id IS NULL OR coalesce(public.utente_bloccato(), true)
    OR NOT coalesce(private.office_visible_order(p_commessa), false)
    OR NOT coalesce(public.has_permission_for_company(utente, 'can_view_orders', p_azienda), false)
    OR NOT coalesce(public.has_permission_for_company(utente, 'can_view_costs', p_azienda), false)
    OR NOT coalesce(public.has_permission_for_company(utente, 'can_view_subappaltatori_amministrazione', p_azienda), false)
    OR NOT coalesce(public.can_see_order(ordine.id, ordine.assigned_to, ordine.destination_warehouse_id), false)
  THEN RAISE EXCEPTION 'Archivio di subappalto non disponibile per questa commessa.' USING ERRCODE = '42501'; END IF;

  IF p_operazione IS NULL THEN
    SELECT * INTO archivio FROM private.registro_subappalto_commessa WHERE order_id = p_commessa;
    RETURN jsonb_build_object('versione', coalesce(archivio.versione, 0), 'richieste', coalesce(archivio.richieste, '[]'),
      'interne', coalesce(archivio.interne, '[]'));
  END IF;

  IF coalesce(public.utente_sola_lettura(p_azienda), true)
    OR NOT coalesce(public.has_permission_for_company(utente, 'can_edit_orders', p_azienda), false)
  THEN RAISE EXCEPTION 'Modifica del subappalto non consentita.' USING ERRCODE = '42501'; END IF;
  IF pg_column_size(p_operazione) > 2000000 OR tipo IS NULL OR tipo NOT IN ('crea', 'invia', 'offerta', 'contratto', 'interno')
  THEN RAISE EXCEPTION 'Operazione di subappalto non valida.' USING ERRCODE = '22023'; END IF;

  INSERT INTO private.registro_subappalto_commessa (order_id) VALUES (p_commessa) ON CONFLICT DO NOTHING;
  SELECT * INTO STRICT archivio FROM private.registro_subappalto_commessa WHERE order_id = p_commessa FOR UPDATE;
  IF tipo = 'crea' THEN
    richiesta := p_operazione->'richiesta';
    id_richiesta := (richiesta->>'id')::uuid::text;
    IF id_richiesta IS NULL THEN RAISE EXCEPTION 'Identificativo della richiesta mancante.' USING ERRCODE = '22023'; END IF;
    IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(archivio.richieste) AS r WHERE r->>'id' = id_richiesta) THEN
      SELECT * INTO ditta FROM public.subappaltatori WHERE company_id = p_azienda AND id = (richiesta->>'dittaId')::uuid AND is_active IS DISTINCT FROM false;
      IF ditta.id IS NULL OR coalesce(jsonb_typeof(richiesta->'righe'), '') <> 'array'
        OR jsonb_array_length(richiesta->'righe') NOT BETWEEN 1 AND 500
      THEN RAISE EXCEPTION 'Controlla ditta e voci da quotare.' USING ERRCODE = '22023'; END IF;
      IF (SELECT count(DISTINCT r->>'id') FROM jsonb_array_elements(richiesta->'righe') AS r) <> jsonb_array_length(richiesta->'righe')
      THEN RAISE EXCEPTION 'Il computo contiene voci duplicate o senza identificativo.' USING ERRCODE = '22023'; END IF;
      FOR voce IN SELECT value FROM jsonb_array_elements(richiesta->'righe') LOOP
        ambito := voce->>'ambito';
        IF ambito IS NULL OR coalesce(length(trim(voce->>'descrizione')), 0) NOT BETWEEN 1 AND 7000
          OR coalesce(jsonb_typeof(voce->'quantita'), '') <> 'number'
          OR (voce->>'quantita')::numeric <= 0 OR (voce->>'quantita')::numeric > 1000000000
          OR (voce->>'faseId' IS NOT NULL AND NOT EXISTS (
            SELECT 1 FROM public.order_work_phases f WHERE f.id::text = voce->>'faseId' AND f.company_id = p_azienda AND f.order_id = p_commessa))
          OR (voce->>'sottofaseId' IS NOT NULL AND NOT EXISTS (
            SELECT 1 FROM public.order_work_subphases s WHERE s.id::text = voce->>'sottofaseId' AND s.phase_id::text = voce->>'faseId'))
          OR (left(ambito, 2) = 'v:' AND NOT EXISTS (
            SELECT 1 FROM public.order_work_phase_voci v WHERE v.id::text = substr(ambito, 3) AND v.company_id = p_azienda
              AND v.order_id = p_commessa AND v.phase_id::text = voce->>'faseId'))
          OR (left(ambito, 2) <> 'v:' AND ambito <> coalesce('s:' || (voce->>'sottofaseId'), voce->>'faseId', 'altri-lavori'))
        THEN RAISE EXCEPTION 'Una lavorazione non è valida per questa commessa.' USING ERRCODE = '22023'; END IF;
      END LOOP;
      richiesta := (richiesta - 'contrattoId' - 'offerta' - 'inviataIl') || jsonb_build_object(
        'id', id_richiesta, 'dittaId', ditta.id, 'ditta', ditta.ragione_sociale,
        'commessa', ordine.order_code, 'luogo', ordine.work_address, 'creataIl', pg_catalog.clock_timestamp(),
        'destinatario', jsonb_build_object('indirizzo', ditta.indirizzo, 'partitaIva', ditta.piva, 'email', ditta.email));
      archivio.richieste := jsonb_build_array(richiesta) || archivio.richieste;
    END IF;
  ELSIF tipo = 'interno' THEN
    ambito := p_operazione->>'ambito';
    IF ambito IS NULL OR coalesce(jsonb_typeof(p_operazione->'interno'), '') <> 'boolean'
      OR NOT (
        EXISTS (SELECT 1 FROM public.order_work_phases f WHERE f.id::text = ambito AND f.company_id = p_azienda AND f.order_id = p_commessa)
        OR EXISTS (SELECT 1 FROM public.order_work_phase_voci v WHERE 'v:' || v.id::text = ambito AND v.company_id = p_azienda AND v.order_id = p_commessa)
        OR EXISTS (SELECT 1 FROM public.order_work_subphases s JOIN public.order_work_phases f ON f.id = s.phase_id
          WHERE 's:' || s.id::text = ambito AND f.company_id = p_azienda AND f.order_id = p_commessa)
      )
    THEN RAISE EXCEPTION 'Lavorazione non disponibile.' USING ERRCODE = '22023'; END IF;
    archivio.interne := archivio.interne - ambito;
    IF (p_operazione->>'interno')::boolean THEN archivio.interne := archivio.interne || jsonb_build_array(ambito); END IF;
  ELSE
    SELECT r, (i - 1)::integer INTO richiesta, posizione
      FROM jsonb_array_elements(archivio.richieste) WITH ORDINALITY AS dati(r, i)
      WHERE r->>'id' = p_operazione->>'id';
    IF posizione IS NULL THEN RAISE EXCEPTION 'Richiesta non disponibile nella commessa.' USING ERRCODE = 'P0002'; END IF;
    IF tipo = 'invia' THEN
      IF richiesta->>'inviataIl' IS NULL THEN richiesta := richiesta || jsonb_build_object('inviataIl', pg_catalog.clock_timestamp()); END IF;
    ELSIF tipo = 'offerta' THEN
      IF richiesta->>'contrattoId' IS NOT NULL OR richiesta#>>'{offerta,contrattoId}' IS NOT NULL
        OR coalesce(richiesta->'offerta', 'null'::jsonb) IS DISTINCT FROM coalesce(p_operazione->'precedente', 'null'::jsonb)
      THEN RAISE EXCEPTION 'L’offerta è cambiata. Riaprila per vedere la versione aggiornata.' USING ERRCODE = 'PT409'; END IF;
      offerta := p_operazione->'offerta';
      IF coalesce(jsonb_typeof(offerta->'prezzi'), '') <> 'object' OR offerta->'prezzi' = '{}'::jsonb
        OR coalesce(offerta->>'data', '') !~ '^\d{4}-\d{2}-\d{2}$' OR (offerta->>'data')::date > CURRENT_DATE
        OR coalesce(length(offerta->>'riferimento'), 0) > 250
      THEN RAISE EXCEPTION 'Verifica data, riferimento e prezzi dell’offerta.' USING ERRCODE = '22023'; END IF;
      FOR voce_id, voce IN SELECT key, value FROM jsonb_each(offerta->'prezzi') LOOP
        IF jsonb_typeof(voce) <> 'number' OR voce::numeric <= 0 OR voce::numeric > 1000000000
          OR voce::numeric <> round(voce::numeric, 2)
          OR NOT EXISTS (SELECT 1 FROM jsonb_array_elements(richiesta->'righe') AS r WHERE r->>'id' = voce_id)
        THEN RAISE EXCEPTION 'Una voce dell’offerta o il suo prezzo non è valido.' USING ERRCODE = '22023'; END IF;
      END LOOP;
      richiesta := richiesta || jsonb_build_object('offerta', offerta - 'contrattoId');
    ELSIF tipo = 'contratto' THEN
      id_contratto := (p_operazione->>'contrattoId')::uuid;
      IF NOT EXISTS (
        SELECT 1 FROM public.contratti_subappalto c LEFT JOIN public.subappaltatori_sicurezza s ON s.id = c.subappaltatore_id
        WHERE c.id = id_contratto AND c.order_id = p_commessa AND c.company_id = p_azienda
          AND coalesce(s.campo_subappaltatore_id, c.subappaltatore_id)::text = richiesta->>'dittaId'
      ) THEN RAISE EXCEPTION 'Il contratto non appartiene alla ditta di questa richiesta.' USING ERRCODE = '22023'; END IF;
      IF coalesce(richiesta->>'contrattoId', richiesta#>>'{offerta,contrattoId}', id_contratto::text) <> id_contratto::text
      THEN RAISE EXCEPTION 'Il computo è già collegato a un altro contratto.' USING ERRCODE = 'PT409'; END IF;
      IF coalesce((p_operazione->>'daOfferta')::boolean, false) THEN
        IF jsonb_typeof(richiesta->'offerta') IS DISTINCT FROM 'object'
        THEN RAISE EXCEPTION 'Offerta non disponibile.' USING ERRCODE = 'PT409'; END IF;
        richiesta := jsonb_set(richiesta, '{offerta,contrattoId}', to_jsonb(id_contratto));
      ELSE richiesta := richiesta || jsonb_build_object('contrattoId', id_contratto);
      END IF;
    END IF;
    archivio.richieste := jsonb_set(archivio.richieste, ARRAY[posizione::text], richiesta);
  END IF;

  UPDATE private.registro_subappalto_commessa
    SET versione = archivio.versione + 1, richieste = archivio.richieste, interne = archivio.interne WHERE order_id = p_commessa
    RETURNING * INTO archivio;
  RETURN jsonb_build_object('versione', archivio.versione, 'richieste', archivio.richieste, 'interne', archivio.interne);
END;
$$;
REVOKE ALL ON FUNCTION private.registro_subappalto(uuid, uuid, jsonb) FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA private TO authenticated;
GRANT EXECUTE ON FUNCTION private.registro_subappalto(uuid, uuid, jsonb) TO authenticated;

CREATE FUNCTION public.registro_subappalto(p_azienda uuid, p_commessa uuid, p_operazione jsonb DEFAULT NULL)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path = ''
AS $$ SELECT private.registro_subappalto(p_azienda, p_commessa, p_operazione); $$;
REVOKE ALL ON FUNCTION public.registro_subappalto(uuid, uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registro_subappalto(uuid, uuid, jsonb) TO authenticated;
NOTIFY pgrst, 'reload schema';

COMMIT;
