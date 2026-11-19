BEGIN;

CREATE TABLE private.pipeline_commesse_condivise (
  company_id uuid PRIMARY KEY REFERENCES public.companies(id) ON DELETE CASCADE,
  pipeline jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(pipeline) = 'array')
);

CREATE TABLE private.pipeline_commesse_assegnazioni (
  order_id uuid PRIMARY KEY REFERENCES public.orders(id) ON DELETE CASCADE,
  fase uuid NOT NULL
);

ALTER TABLE private.pipeline_commesse_condivise ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.pipeline_commesse_assegnazioni ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.pipeline_commesse_condivise, private.pipeline_commesse_assegnazioni FROM PUBLIC, anon, authenticated;

CREATE FUNCTION private.pipeline_commesse(p_azienda uuid, p_operazione jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$
DECLARE
  utente uuid := auth.uid();
  puo_vedere boolean;
  ordine public.orders%ROWTYPE;
  elenco jsonb;
  attuale jsonb;
  modifica jsonb;
  fasi jsonb;
  id_pipeline uuid;
  id_fase uuid;
  fase_precedente uuid;
  fase_attuale uuid;
  versione integer;
  nome text;
BEGIN
  puo_vedere := coalesce(public.has_permission_for_company(utente,'can_view_orders',p_azienda),false);
  IF utente IS NULL OR coalesce(public.utente_bloccato(),true)
    OR NOT (puo_vedere OR coalesce(public.has_permission_for_company(utente,'can_view_settings_orders',p_azienda),false))
  THEN RAISE EXCEPTION 'Pipeline della commessa non accessibile.' USING ERRCODE='42501'; END IF;
  IF p_operazione IS NULL THEN
    SELECT pipeline INTO elenco FROM private.pipeline_commesse_condivise WHERE company_id=p_azienda;
    RETURN jsonb_build_object('pipeline',coalesce(elenco,'[]'::jsonb),'fasiPerCommessa',CASE WHEN puo_vedere THEN coalesce((
      SELECT jsonb_object_agg(a.order_id,a.fase) FROM private.pipeline_commesse_assegnazioni a JOIN public.orders o ON o.id=a.order_id
      WHERE o.company_id=p_azienda AND o.deleted_at IS NULL AND private.office_visible_order(o.id)
        AND public.can_see_order(o.id,o.assigned_to,o.destination_warehouse_id)
    ),'{}'::jsonb) ELSE '{}'::jsonb END);
  END IF;
  IF coalesce(public.utente_sola_lettura(p_azienda),true) THEN RAISE EXCEPTION 'Accesso in sola lettura.' USING ERRCODE='42501'; END IF;
  IF pg_column_size(p_operazione)>65536 THEN RAISE EXCEPTION 'Pipeline troppo grande.' USING ERRCODE='22023'; END IF;

  INSERT INTO private.pipeline_commesse_condivise(company_id) VALUES(p_azienda) ON CONFLICT DO NOTHING;
  SELECT pipeline INTO STRICT elenco FROM private.pipeline_commesse_condivise WHERE company_id=p_azienda FOR UPDATE;
  IF p_operazione->>'azione'='salva' THEN
    IF NOT coalesce(public.has_permission_for_company(utente,'can_edit_settings_orders',p_azienda),false)
    THEN RAISE EXCEPTION 'Modifica delle pipeline non consentita.' USING ERRCODE='42501'; END IF;
    modifica:=p_operazione->'pipeline';
    nome:=trim(modifica->>'nome');
    id_pipeline:=(modifica->>'id')::uuid;
    fasi:=modifica->'fasi';
    IF id_pipeline IS NULL OR coalesce(length(nome),0) NOT BETWEEN 1 AND 120 OR lower(nome)='principale'
      OR coalesce(jsonb_typeof(fasi),'')<>'array' OR jsonb_array_length(fasi) NOT BETWEEN 1 AND 100
      OR EXISTS (SELECT 1 FROM jsonb_array_elements(fasi) AS f WHERE (f->>'id')::uuid IS NULL
        OR coalesce(length(trim(f->>'name')),0) NOT BETWEEN 1 AND 120 OR coalesce(f->>'color','') !~ '^#[0-9a-fA-F]{6}$')
      OR (SELECT count(DISTINCT lower(trim(f->>'name'))) FROM jsonb_array_elements(fasi) AS f)<>jsonb_array_length(fasi)
      OR (SELECT count(DISTINCT (f->>'id')::uuid) FROM jsonb_array_elements(fasi) AS f)<>jsonb_array_length(fasi)
    THEN RAISE EXCEPTION 'Controlla il nome e le fasi della pipeline.' USING ERRCODE='22023'; END IF;
    SELECT p INTO attuale FROM jsonb_array_elements(elenco) AS p WHERE (p->>'id')::uuid=id_pipeline;
    versione:=coalesce((attuale->>'versione')::integer,0);
    IF versione IS DISTINCT FROM coalesce((modifica->>'versione')::integer,0)
    THEN RAISE EXCEPTION 'La pipeline è cambiata. Riapri la modifica.' USING ERRCODE='40001'; END IF;
    IF EXISTS (SELECT 1 FROM jsonb_array_elements(elenco) AS p WHERE (p->>'id')::uuid<>id_pipeline AND (
      lower(p->>'nome')=lower(nome) OR EXISTS (
        SELECT 1 FROM jsonb_array_elements(p->'fasi') AS f JOIN jsonb_array_elements(fasi) AS n ON (f->>'id')::uuid=(n->>'id')::uuid
      )
    )) THEN RAISE EXCEPTION 'Nome o fase già in uso.' USING ERRCODE='23505'; END IF;
    IF EXISTS (
      SELECT 1 FROM private.pipeline_commesse_assegnazioni a JOIN public.orders o ON a.order_id=o.id
      JOIN jsonb_array_elements(coalesce(attuale->'fasi','[]'::jsonb)) AS f ON a.fase=(f->>'id')::uuid
      WHERE o.company_id=p_azienda AND o.deleted_at IS NULL
      AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(fasi) AS n WHERE (n->>'id')::uuid=a.fase)
    ) THEN RAISE EXCEPTION 'Sposta le commesse dalla fase prima di rimuoverla.' USING ERRCODE='40001'; END IF;
    SELECT coalesce(jsonb_agg(p),'[]'::jsonb) INTO elenco FROM jsonb_array_elements(elenco) AS p WHERE (p->>'id')::uuid<>id_pipeline;
    SELECT jsonb_agg(jsonb_build_object('id',(f->>'id')::uuid,'name',trim(f->>'name'),'color',f->>'color') ORDER BY i) INTO fasi
      FROM jsonb_array_elements(fasi) WITH ORDINALITY AS d(f,i);
    UPDATE private.pipeline_commesse_condivise SET pipeline=elenco || jsonb_build_array(
      jsonb_build_object('id',id_pipeline,'nome',nome,'versione',versione+1,'fasi',fasi)
    ) WHERE company_id=p_azienda;
  ELSIF p_operazione->>'azione'='assegna' THEN
    SELECT * INTO ordine FROM public.orders WHERE id=(p_operazione->>'commessa')::uuid AND company_id=p_azienda AND deleted_at IS NULL;
    IF ordine.id IS NULL OR NOT coalesce(public.has_permission_for_company(utente,'can_edit_orders',p_azienda),false)
      OR NOT coalesce(private.office_visible_order(ordine.id),false)
      OR NOT coalesce(public.can_see_order(ordine.id,ordine.assigned_to,ordine.destination_warehouse_id),false)
    THEN RAISE EXCEPTION 'Commessa non disponibile.' USING ERRCODE='42501'; END IF;
    id_fase:=(p_operazione->>'fase')::uuid;
    fase_precedente:=(p_operazione->>'precedente')::uuid;
    SELECT fase INTO fase_attuale FROM private.pipeline_commesse_assegnazioni WHERE order_id=ordine.id;
    IF fase_attuale IS DISTINCT FROM fase_precedente AND fase_attuale IS DISTINCT FROM id_fase
    THEN RAISE EXCEPTION 'La fase della commessa è cambiata.' USING ERRCODE='40001'; END IF;
    IF id_fase IS NULL THEN DELETE FROM private.pipeline_commesse_assegnazioni WHERE order_id=ordine.id;
    ELSIF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(elenco) AS p CROSS JOIN LATERAL jsonb_array_elements(p->'fasi') AS f WHERE (f->>'id')::uuid=id_fase)
    THEN RAISE EXCEPTION 'Fase non disponibile per questa azienda.' USING ERRCODE='22023';
    ELSE INSERT INTO private.pipeline_commesse_assegnazioni VALUES(ordine.id,id_fase)
      ON CONFLICT(order_id) DO UPDATE SET fase=excluded.fase;
    END IF;
  ELSE RAISE EXCEPTION 'Operazione non valida.' USING ERRCODE='22023'; END IF;
  RETURN '{}'::jsonb;
END;
$$;
REVOKE ALL ON FUNCTION private.pipeline_commesse(uuid,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.pipeline_commesse(uuid,jsonb) TO authenticated;

CREATE FUNCTION public.pipeline_commesse(p_azienda uuid,p_operazione jsonb DEFAULT NULL)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path=''
AS $$ SELECT private.pipeline_commesse(p_azienda,p_operazione); $$;
REVOKE ALL ON FUNCTION public.pipeline_commesse(uuid,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pipeline_commesse(uuid,jsonb) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
