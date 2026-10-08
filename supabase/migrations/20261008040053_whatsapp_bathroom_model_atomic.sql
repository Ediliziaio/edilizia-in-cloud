-- LOCAL PREPARATION ONLY. Requires bgn schema, library archive and actor guards.
-- Never updates the source quote, existing module offer, or its signed PDF.
ALTER TABLE public.bgn_progetti ADD COLUMN IF NOT EXISTS origine_quote_id uuid REFERENCES public.quotes(id);
ALTER TABLE public.bgn_progetti ADD COLUMN IF NOT EXISTS origine_quote_revision timestamptz;
CREATE UNIQUE INDEX IF NOT EXISTS bgn_origine_quote_unique ON public.bgn_progetti(company_id, origine_quote_id)
  WHERE origine_quote_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.whatsapp_prepare_bathroom_quote(
  p_company_id uuid, p_user_id uuid, p_quote_id uuid, p_model_id text,
  p_model_revision text, p_quote_revision timestamptz
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  q public.quotes%ROWTYPE;
  existing public.bgn_progetti%ROWTYPE;
  model jsonb;
  template jsonb;
  snapshot jsonb;
  v_roles text[];
  v_project uuid := gen_random_uuid();
  v_count int;
  v_rate numeric;
  v_base numeric;
  v_net numeric;
  v_total numeric;
  v_feature jsonb;
  v_plan uuid;
  v_slug text;
  v_enabled boolean;
BEGIN
  IF NOT public.ai_is_service_role() THEN RAISE EXCEPTION 'Service execution required' USING ERRCODE = '42501'; END IF;
  v_roles := public.silvio_context_actor_roles(p_company_id, p_user_id);
  IF NOT COALESCE(v_roles && ARRAY['super_admin','company_admin','company_staff','salesperson']::text[], false) THEN
    RAISE EXCEPTION 'Quote permission denied' USING ERRCODE = '42501';
  END IF;
  IF NOT (v_roles && ARRAY['super_admin','company_admin','salesperson']::text[]) AND NOT EXISTS (
    SELECT 1 FROM public.staff_permissions s WHERE s.company_id = p_company_id AND s.user_id = p_user_id
      AND s.sola_lettura IS FALSE AND s.can_view_preventivi IS TRUE AND s.can_edit_preventivi IS TRUE
      AND s.only_assigned IS FALSE AND s.only_my_warehouse IS FALSE
  ) THEN RAISE EXCEPTION 'Quote permission denied' USING ERRCODE = '42501'; END IF;
  IF p_model_id IS NULL OR p_model_id NOT IN ('completo','vasca-doccia','doccia','sanitari','accessibilita','rinnovo') THEN
    RAISE EXCEPTION 'Modello bagno non valido';
  END IF;
  -- Same feature priority as moduloAttivo.ts, repeated here to protect direct RPC calls.
  SELECT to_jsonb(o) INTO v_feature FROM public.company_feature_overrides o
    WHERE o.company_id = p_company_id AND o.feature_key = 'modulo_bagni_attivo'
      AND o.is_enabled IS NOT NULL AND (o.expires_at IS NULL OR o.expires_at > now());
  IF v_feature IS NULL THEN
    SELECT c.subscription_plan_id, p.slug INTO v_plan, v_slug FROM public.companies c
      LEFT JOIN public.subscription_plans p ON p.id = c.subscription_plan_id WHERE c.id = p_company_id;
    SELECT to_jsonb(d) INTO v_feature FROM public.plan_feature_defaults d
      WHERE d.plan_id = v_plan AND d.feature_key = 'modulo_bagni_attivo';
  END IF;
  IF v_feature IS NOT NULL THEN
    v_enabled := COALESCE(v_feature->>'access_level' = 'enabled', false) OR COALESCE((v_feature->>'is_enabled')::boolean, false);
  ELSE
    SELECT COALESCE(f.default_value, false) OR COALESCE(to_jsonb(f.plans_included) ? v_slug, false)
      INTO v_enabled FROM public.platform_feature_flags f WHERE f.key = 'modulo_bagni_attivo';
  END IF;
  IF v_enabled IS DISTINCT FROM true THEN RAISE EXCEPTION 'Modulo Bagni non abilitato'; END IF;
  SELECT * INTO q FROM public.quotes WHERE id = p_quote_id AND company_id = p_company_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Preventivo non trovato'; END IF;
  SELECT * INTO existing FROM public.bgn_progetti WHERE company_id = p_company_id AND origine_quote_id = q.id;
  IF FOUND THEN
    IF existing.deleted_at IS NOT NULL OR existing.origine_quote_revision IS DISTINCT FROM p_quote_revision
      OR existing.modello_snapshot->>'modelId' IS DISTINCT FROM p_model_id
      OR existing.modello_snapshot->>'sourceRevision' IS DISTINCT FROM p_model_revision THEN
      RAISE EXCEPTION 'Conversione esistente diversa o eliminata: verifica il progetto, nessuna copia creata';
    END IF;
    RETURN jsonb_build_object('success',true,'progetto_id',existing.id,'model_id',p_model_id,
      'project_revision',existing.updated_at,'reused',true,'pdf_generated',false);
  END IF;
  IF q.updated_at IS DISTINCT FROM p_quote_revision OR q.status <> 'bozza' OR COALESCE(q.source, '') LIKE 'modulo:%' THEN
    RAISE EXCEPTION 'Preventivo modificato o non convertibile: richiedi nuova conferma';
  END IF;
  SELECT contenuto INTO model FROM public.modelli_libreria_azienda
    WHERE company_id = p_company_id AND chiave = 'eic:full-bgn-module:v1:' || p_company_id::text || ':' || p_model_id FOR SHARE;
  template := model->'template';
  IF NOT COALESCE(model->>'version' = '1' AND model->>'companyId' = p_company_id::text
    AND model->>'moduleId' = p_model_id AND model->>'savedAt' = p_model_revision
    AND jsonb_typeof(template) = 'object' AND template->>'company_id' = p_company_id::text
    AND template#>>'{pdf_blocchi,modulo_intervento}' = p_model_id
    AND length(trim(template->>'cover_title')) > 0
    AND jsonb_typeof(template->'esigenze') = 'array' AND jsonb_typeof(template->'soluzione') = 'array'
    AND jsonb_typeof(template->'usp') = 'array' AND jsonb_typeof(template->'percorso') = 'array'
    AND jsonb_typeof(template->'garanzie') = 'array' AND jsonb_typeof(template->'faq') = 'array'
    AND jsonb_typeof(template->'cronoprogramma') = 'array' AND jsonb_typeof(template->'testimonianze') = 'array', false) THEN
    RAISE EXCEPTION 'Modello non pubblicato, modificato o non valido: richiedi nuova conferma';
  END IF;
  -- Check timestamp as well as text equality; bad library data must not create an offer.
  PERFORM (model->>'savedAt')::timestamptz;
  PERFORM 1 FROM public.quote_items WHERE quote_id = q.id FOR SHARE;
  IF EXISTS (SELECT 1 FROM public.quote_items i WHERE i.quote_id = q.id AND
    (i.company_id IS DISTINCT FROM p_company_id OR i.quantity IS NULL OR i.quantity <= 0
      OR i.unit_price IS NULL OR i.unit_price < 0 OR i.vat_rate IS NULL OR i.vat_rate NOT BETWEEN 0 AND 100
      OR COALESCE(i.is_optional,false) OR COALESCE(i.discount_percent,0) <> 0
      OR length(trim(COALESCE(i.description,i.name,''))) = 0
      OR lower(trim(COALESCE(i.unit_of_measure,''))) NOT IN ('','corpo','a corpo','fisso','cad','pz','pezzo','n','mq','m2','m²','ml','m','h','ora','ore')))
    OR COALESCE(q.prezzo_manuale,0) > 0 OR COALESCE(q.discount_percent,0) <> 0 THEN
    RAISE EXCEPTION 'Computo non convertibile senza revisione: prezzi manuali, sconti, optional o unita non supportate';
  END IF;
  SELECT count(*), min(vat_rate), sum(round(quantity * unit_price,2)) INTO v_count,v_rate,v_base
    FROM public.quote_items WHERE quote_id = q.id;
  IF v_count NOT BETWEEN 1 AND 200 OR (SELECT count(DISTINCT vat_rate) FROM public.quote_items WHERE quote_id = q.id) <> 1 THEN
    RAISE EXCEPTION 'Computo vuoto o IVA mista: completa il preventivo nell app';
  END IF;
  v_net := v_base;
  v_total := round(v_base * (1 + v_rate / 100),2);
  IF q.subtotal IS DISTINCT FROM v_base OR q.total IS DISTINCT FROM v_total
    OR q.vat_amount IS DISTINCT FROM (v_total - v_net) THEN
    RAISE EXCEPTION 'Totali non coincidono: nessun progetto incompleto creato';
  END IF;
  template := jsonb_set(template,'{pdf_blocchi}', (template->'pdf_blocchi') - 'modulo_defaults' - 'modulo_foto');
  snapshot := jsonb_build_object('version',1,'modelId',p_model_id,'companyId',p_company_id,
    'capturedAt',now(),'sourceRevision',p_model_revision,'template',template);
  INSERT INTO public.bgn_progetti(id,company_id,code,stato,tipo_intervento,numero_bagni,
    cliente_nome,cliente_email,cliente_telefono,cantiere_indirizzo,iva_pct,sconto_pct,detrazione_pct,
    totale_imponibile,totale,note,created_by,modello_snapshot,origine_quote_id,origine_quote_revision)
  VALUES(v_project,p_company_id,'BGN-WA-'||v_project::text,'bozza',
    CASE p_model_id WHEN 'completo' THEN 'rifacimento_completo' WHEN 'vasca-doccia' THEN 'vasca_in_doccia'
      WHEN 'sanitari' THEN 'sostituzione_sanitari' WHEN 'accessibilita' THEN 'abbattimento_barriere' ELSE 'rifacimento_parziale' END,
    1,q.client_name,q.client_email,q.client_phone,q.indirizzo_lavori,v_rate,0,0,v_net,v_total,
    'Da preventivo '||q.quote_number,p_user_id,snapshot,q.id,q.updated_at);
  INSERT INTO public.bgn_computo_voci(progetto_id,company_id,capitolo_nome,descrizione,unita_misura,
    quantita,prezzo_unitario,importo,costo_materiali,costo_manodopera,sconto_pct,ordine)
  SELECT v_project,p_company_id,CASE WHEN item_type = 'labor' THEN 'Manodopera' ELSE 'Forniture' END,
    COALESCE(NULLIF(trim(description),''),name),
    CASE lower(trim(COALESCE(unit_of_measure,''))) WHEN 'mq' THEN 'mq' WHEN 'm2' THEN 'mq' WHEN 'm²' THEN 'mq'
      WHEN 'ml' THEN 'ml' WHEN 'm' THEN 'ml' WHEN 'h' THEN 'ora' WHEN 'ora' THEN 'ora' WHEN 'ore' THEN 'ora'
      WHEN 'cad' THEN 'cad' WHEN 'pz' THEN 'cad' WHEN 'pezzo' THEN 'cad' WHEN 'n' THEN 'cad' ELSE 'corpo' END,
    quantity,unit_price,round(quantity*unit_price,2),0,0,0,
    row_number() OVER (ORDER BY sort_order,id) - 1
    FROM public.quote_items WHERE quote_id = q.id;
  RETURN jsonb_build_object('success',true,'progetto_id',v_project,'model_id',p_model_id,
    'project_revision',(SELECT updated_at FROM public.bgn_progetti WHERE id=v_project),
    'items_count',v_count,'total',v_total,'reused',false,'pdf_generated',false);
END;
$$;
REVOKE ALL ON FUNCTION public.whatsapp_prepare_bathroom_quote(uuid,uuid,uuid,text,text,timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.whatsapp_prepare_bathroom_quote(uuid,uuid,uuid,text,text,timestamptz) TO service_role;
