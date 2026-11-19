BEGIN;

CREATE TABLE private.previsionale_cantiere_commessa (
  order_id uuid PRIMARY KEY REFERENCES public.orders(id) ON DELETE CASCADE,
  versione integer NOT NULL DEFAULT 0,
  piani jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(piani) = 'array'),
  ultima_operazione uuid
);
ALTER TABLE private.previsionale_cantiere_commessa ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.previsionale_cantiere_commessa FROM PUBLIC, anon, authenticated;

CREATE FUNCTION private.previsionale_cantiere(p_azienda uuid, p_commessa uuid, p_operazione jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  utente uuid := auth.uid();
  ordine public.orders%ROWTYPE;
  archivio private.previsionale_cantiere_commessa%ROWTYPE;
  piano jsonb;
  altri jsonb;
  ambito jsonb;
  chiave text;
  dal date;
  al date;
  operazione uuid;
BEGIN
  SELECT * INTO ordine FROM public.orders WHERE id = p_commessa AND company_id = p_azienda AND deleted_at IS NULL;
  IF utente IS NULL OR ordine.id IS NULL OR coalesce(public.utente_bloccato(), true)
    OR NOT coalesce(private.office_visible_order(ordine.id), false)
    OR NOT coalesce(public.has_permission_for_company(utente, 'can_view_orders', p_azienda), false)
    OR NOT coalesce(public.has_permission_for_company(utente, 'can_view_employees', p_azienda), false)
    OR NOT coalesce((private.office_order_rights(ordine.id)->>'costs')::boolean, false)
    OR NOT coalesce(public.can_see_order(ordine.id, ordine.assigned_to, ordine.destination_warehouse_id), false)
  THEN RAISE EXCEPTION 'Accesso al previsionale non consentito.' USING ERRCODE = '42501'; END IF;

  IF p_operazione IS NULL THEN
    SELECT * INTO archivio FROM private.previsionale_cantiere_commessa WHERE order_id = ordine.id;
    RETURN jsonb_build_object('versione', coalesce(archivio.versione, 0), 'piani', coalesce(archivio.piani, '[]'));
  END IF;

  IF p_operazione->>'tipo' = 'disponibilita' THEN
    dal := (p_operazione->>'dal')::date;
    al := (p_operazione->>'al')::date;
    IF dal IS NULL OR al IS NULL OR al - dal NOT BETWEEN 0 AND 365
    THEN RAISE EXCEPTION 'Periodo di disponibilità non valido.' USING ERRCODE = '22023'; END IF;
    SELECT coalesce(jsonb_agg(jsonb_build_object('commessa', o.id, 'piani', porzione.piani)), '[]'::jsonb) INTO altri
    FROM private.previsionale_cantiere_commessa a
    JOIN public.orders o ON o.id = a.order_id
    CROSS JOIN LATERAL (
      SELECT jsonb_agg((p.value - 'operai') || jsonb_build_object('operai', (
        SELECT coalesce(jsonb_agg(jsonb_build_object('id', id_operaio->>'id')), '[]'::jsonb)
        FROM jsonb_array_elements(p.value->'operai') AS id_operaio
      ))) AS piani
      FROM jsonb_array_elements(a.piani) AS p(value)
      WHERE (p.value->>'dal')::date <= al AND (p.value->>'al')::date >= dal
    ) AS porzione
    WHERE o.company_id = p_azienda AND o.id <> ordine.id AND o.deleted_at IS NULL
      AND porzione.piani IS NOT NULL AND private.office_visible_order(o.id)
      AND public.can_see_order(o.id, o.assigned_to, o.destination_warehouse_id);
    RETURN altri;
  END IF;

  IF coalesce(public.utente_sola_lettura(p_azienda), true)
    OR NOT coalesce(public.has_permission_for_company(utente, 'can_edit_orders', p_azienda), false)
  THEN RAISE EXCEPTION 'Modifica del previsionale non consentita.' USING ERRCODE = '42501'; END IF;
  operazione := (p_operazione->>'operazione')::uuid;
  IF operazione IS NULL OR pg_column_size(p_operazione) > 2000000 OR coalesce(jsonb_typeof(p_operazione->'nuovi'), '') <> 'array'
    OR jsonb_array_length(p_operazione->'nuovi') > 30
  THEN RAISE EXCEPTION 'Piano del cantiere non valido.' USING ERRCODE = '22023'; END IF;

  INSERT INTO private.previsionale_cantiere_commessa (order_id) VALUES (ordine.id) ON CONFLICT DO NOTHING;
  SELECT * INTO STRICT archivio FROM private.previsionale_cantiere_commessa WHERE order_id = ordine.id FOR UPDATE;
  IF archivio.ultima_operazione = operazione THEN
    RETURN jsonb_build_object('versione', archivio.versione, 'piani', archivio.piani);
  END IF;
  IF archivio.versione IS DISTINCT FROM (p_operazione->>'versione')::integer
  THEN RAISE EXCEPTION 'Il previsionale è cambiato. Rileggi i dati e riprova.' USING ERRCODE = 'PT409'; END IF;

  chiave := p_operazione->>'togli';
  IF chiave IS NOT NULL THEN
    SELECT coalesce(jsonb_agg(p), '[]') INTO archivio.piani FROM jsonb_array_elements(archivio.piani) AS p
      WHERE (p#>>'{ambito,tipo}') || ':' || (p#>>'{ambito,id}') <> chiave;
  END IF;
  FOR piano IN SELECT value FROM jsonb_array_elements(p_operazione->'nuovi') LOOP
    ambito := piano->'ambito';
    dal := (piano->>'dal')::date;
    al := (piano->>'al')::date;
    IF dal IS NULL OR al IS NULL OR al - dal NOT BETWEEN 0 AND 365
      OR coalesce(jsonb_typeof(piano->'giorni'), '') <> 'array' OR jsonb_array_length(piano->'giorni') NOT BETWEEN 1 AND 366
      OR coalesce(jsonb_typeof(piano->'operai'), '') <> 'array' OR jsonb_array_length(piano->'operai') NOT BETWEEN 1 AND 100
      OR coalesce((piano->>'microOreGiorno')::integer, 0) NOT BETWEEN 1 AND 24000000
      OR coalesce((piano->>'oreGiorno')::numeric, 0) NOT BETWEEN 0.000001 AND 24
      OR NOT EXISTS (
        SELECT 1 FROM public.order_work_phases f WHERE f.id::text = ambito->>'faseId' AND f.order_id = ordine.id AND f.company_id = p_azienda
          AND CASE ambito->>'tipo'
            WHEN 'fase' THEN ambito->>'id' = f.id::text
            WHEN 'voce' THEN EXISTS (SELECT 1 FROM public.order_work_phase_voci v WHERE v.id::text = ambito->>'id' AND v.phase_id = f.id)
            WHEN 'sottofase' THEN EXISTS (SELECT 1 FROM public.order_work_subphases s WHERE s.id::text = ambito->>'id' AND s.phase_id = f.id)
            ELSE false END
      )
      OR EXISTS (SELECT 1 FROM jsonb_array_elements_text(piano->'giorni') AS g WHERE g IS NULL OR g::date NOT BETWEEN dal AND al)
      OR EXISTS (
        SELECT 1 FROM jsonb_array_elements(piano->'operai') AS p WHERE NOT (
          EXISTS (SELECT 1 FROM public.employees e WHERE e.id::text = p->>'id' AND e.company_id = p_azienda)
          OR EXISTS (SELECT 1 FROM public.hr_profili h WHERE 'hr:' || h.id::text = p->>'id' AND h.company_id = p_azienda)
        ) OR (p->>'tariffa')::numeric NOT BETWEEN 0 AND 1000000
      )
    THEN RAISE EXCEPTION 'Date, operai o lavorazione non validi per questa commessa.' USING ERRCODE = '22023'; END IF;
    chiave := (ambito->>'tipo') || ':' || (ambito->>'id');
    SELECT coalesce(jsonb_agg(p), '[]') INTO archivio.piani FROM jsonb_array_elements(archivio.piani) AS p
      WHERE (p#>>'{ambito,tipo}') || ':' || (p#>>'{ambito,id}') <> chiave;
    archivio.piani := archivio.piani || jsonb_build_array(piano);
  END LOOP;
  IF jsonb_array_length(archivio.piani) > 250 OR (SELECT sum(jsonb_array_length(p->'operai')*jsonb_array_length(p->'giorni'))
    FROM jsonb_array_elements(archivio.piani) AS p) > 200000
  THEN RAISE EXCEPTION 'Riduci lavorazioni, durata o numero di persone nel previsionale.' USING ERRCODE = '22023'; END IF;
  UPDATE private.previsionale_cantiere_commessa SET versione = archivio.versione + 1, piani = archivio.piani, ultima_operazione = operazione
    WHERE order_id = ordine.id RETURNING * INTO archivio;
  RETURN jsonb_build_object('versione', archivio.versione, 'piani', archivio.piani);
END;
$$;
REVOKE ALL ON FUNCTION private.previsionale_cantiere(uuid,uuid,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.previsionale_cantiere(uuid,uuid,jsonb) TO authenticated;

CREATE FUNCTION public.previsionale_cantiere(p_azienda uuid, p_commessa uuid, p_operazione jsonb DEFAULT NULL)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path = ''
AS $$ SELECT private.previsionale_cantiere(p_azienda, p_commessa, p_operazione); $$;
REVOKE ALL ON FUNCTION public.previsionale_cantiere(uuid,uuid,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.previsionale_cantiere(uuid,uuid,jsonb) TO authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
