-- Aggiorna esclusivamente misure e voci già esistenti. Tutti i cambiamenti
-- vengono annullati se una riga è cambiata o se un controllo non passa.
CREATE OR REPLACE FUNCTION public.planimetria_aggiorna_misure_computo(
  p_upload_id uuid, p_righe jsonb, p_voci jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' SET statement_timeout = '20s'
AS $$
DECLARE
  u public.computo_uploads%ROWTYPE;
  m public.computo_voci_misure%ROWTYPE;
  v public.computo_voci_estratte%ROWTYPE;
  r record;
  attesa record;
  n integer;
  delta numeric;
  quantita_nuova numeric;
BEGIN
  IF auth.uid() IS NULL OR NOT public.puo_modificare_computo(p_upload_id) THEN
    RAISE EXCEPTION 'Serve il permesso di modificare il computo.' USING ERRCODE = '42501';
  END IF;
  IF jsonb_typeof(p_righe) IS DISTINCT FROM 'array' OR jsonb_typeof(p_voci) IS DISTINCT FROM 'array'
     OR jsonb_array_length(p_righe) NOT BETWEEN 1 AND 500 OR jsonb_array_length(p_voci) NOT BETWEEN 1 AND 500 THEN
    RAISE EXCEPTION 'Seleziona da 1 a 500 righe di misura.' USING ERRCODE = '22023';
  END IF;
  IF (SELECT count(DISTINCT x->>'id') FROM jsonb_array_elements(p_righe) x) <> jsonb_array_length(p_righe)
     OR (SELECT count(DISTINCT x->>'id') FROM jsonb_array_elements(p_voci) x) <> jsonb_array_length(p_voci) THEN
    RAISE EXCEPTION 'Righe duplicate o non riconosciute.' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO u FROM public.computo_uploads WHERE id = p_upload_id FOR UPDATE;
  IF NOT FOUND OR u.stato NOT IN ('bozza', 'verificato') THEN
    RAISE EXCEPTION 'Il computo non è modificabile. Riapri il confronto.' USING ERRCODE = '40001';
  END IF;
  -- Ordine stabile dei lock; verifica anche quantità e prezzi mostrati nel confronto.
  FOR attesa IN SELECT * FROM jsonb_to_recordset(p_voci) AS x(id uuid, quantita numeric, prezzo numeric) ORDER BY id LOOP
    SELECT * INTO v FROM public.computo_voci_estratte
      WHERE id = attesa.id AND computo_upload_id = u.id AND company_id = u.company_id FOR UPDATE;
    IF NOT FOUND OR v.quantita IS DISTINCT FROM attesa.quantita OR v.prezzo_unitario_computo IS DISTINCT FROM attesa.prezzo THEN
      RAISE EXCEPTION 'Una voce è cambiata nel frattempo. Ricarica il computo e ripeti il confronto.' USING ERRCODE = '40001';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(p_righe) x WHERE x->>'voce_id' = v.id::text) THEN
      RAISE EXCEPTION 'Voce senza misure selezionate.' USING ERRCODE = '22023';
    END IF;
  END LOOP;
  FOR r IN SELECT * FROM jsonb_to_recordset(p_righe) AS x(
    id uuid, voce_id uuid, vecchia numeric, nuova numeric, vecchia_versione integer,
    vecchia_pianta uuid, pianta_id uuid, versione integer, chiavi jsonb
  ) ORDER BY id LOOP
    IF r.nuova IS NULL OR r.nuova::text IN ('NaN','Infinity','-Infinity') OR r.vecchia IS NULL
       OR r.pianta_id IS NULL OR r.versione IS NULL OR jsonb_typeof(r.chiavi) IS DISTINCT FROM 'array' OR jsonb_array_length(r.chiavi) = 0 THEN
      RAISE EXCEPTION 'Misura incompleta o non valida.' USING ERRCODE = '22023';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(p_voci) x WHERE x->>'id' = r.voce_id::text) THEN
      RAISE EXCEPTION 'La voce della misura non è nel confronto.' USING ERRCODE = '22023';
    END IF;
    PERFORM 1 FROM public.planimetrie p WHERE p.id = r.pianta_id AND p.company_id = u.company_id
      AND p.deleted_at IS NULL AND p.versione_corrente = r.versione FOR SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'La planimetria è cambiata o non è disponibile. Riapri il confronto.' USING ERRCODE = '40001';
    END IF;
    SELECT mi.* INTO m FROM public.computo_voci_misure mi JOIN public.computo_voci_estratte ve ON ve.id = mi.voce_id
      WHERE mi.id = r.id AND mi.voce_id = r.voce_id AND mi.company_id = u.company_id
        AND ve.computo_upload_id = u.id AND ve.company_id = u.company_id FOR UPDATE OF mi;
    IF NOT FOUND OR m.quantita IS DISTINCT FROM r.vecchia OR m.planimetria_versione IS DISTINCT FROM r.vecchia_versione
       OR m.planimetria_id IS DISTINCT FROM r.vecchia_pianta OR (m.planimetria_id IS NOT NULL AND m.planimetria_id <> r.pianta_id)
       OR (m.planimetria_id IS NOT NULL AND to_jsonb(m.planimetria_chiavi) IS DISTINCT FROM r.chiavi) THEN
      RAISE EXCEPTION 'Una misura è cambiata nel frattempo. Ricarica il computo e ripeti il confronto.' USING ERRCODE = '40001';
    END IF;
    UPDATE public.computo_voci_misure SET quantita = r.nuova, planimetria_versione = r.versione,
      planimetria_id = r.pianta_id, planimetria_chiavi = ARRAY(SELECT jsonb_array_elements_text(r.chiavi)) WHERE id = m.id;
    GET DIAGNOSTICS n = ROW_COUNT;
    IF n <> 1 THEN RAISE EXCEPTION 'Misura non aggiornata.' USING ERRCODE = '42501'; END IF;
  END LOOP;
  FOR attesa IN SELECT * FROM jsonb_to_recordset(p_voci) AS x(id uuid, quantita numeric, prezzo numeric) ORDER BY id LOOP
    SELECT * INTO STRICT v FROM public.computo_voci_estratte WHERE id = attesa.id AND computo_upload_id = u.id;
    SELECT sum(x.nuova - x.vecchia) INTO delta FROM jsonb_to_recordset(p_righe) AS x(voce_id uuid, vecchia numeric, nuova numeric) WHERE x.voce_id = v.id;
    quantita_nuova := round(coalesce(v.quantita, 0) + coalesce(delta, 0), 2);
    IF quantita_nuova < 0 AND NOT coalesce(v.is_detrazione, false) THEN
      RAISE EXCEPTION 'La quantità della voce diventerebbe negativa.' USING ERRCODE = '22023';
    END IF;
    UPDATE public.computo_voci_estratte SET quantita = quantita_nuova,
      importo_computo = CASE WHEN v.prezzo_unitario_computo IS NULL THEN NULL ELSE round(quantita_nuova * v.prezzo_unitario_computo / CASE WHEN btrim(coalesce(v.unita_misura, '')) = '%' THEN 100 ELSE 1 END, 2) END,
      is_modified = true WHERE id = v.id;
    GET DIAGNOSTICS n = ROW_COUNT;
    IF n <> 1 THEN RAISE EXCEPTION 'Voce non aggiornata.' USING ERRCODE = '42501'; END IF;
  END LOOP;
  UPDATE public.computo_uploads SET totale_calcolato = (SELECT round(coalesce(sum(importo_computo),0),2)
    FROM public.computo_voci_estratte WHERE computo_upload_id = u.id) WHERE id = u.id;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'Totale non aggiornato.' USING ERRCODE = '42501'; END IF;
  RETURN jsonb_build_object('righe', jsonb_array_length(p_righe), 'voci', jsonb_array_length(p_voci));
END;
$$;
REVOKE ALL ON FUNCTION public.planimetria_aggiorna_misure_computo(uuid,jsonb,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.planimetria_aggiorna_misure_computo(uuid,jsonb,jsonb) TO authenticated;
