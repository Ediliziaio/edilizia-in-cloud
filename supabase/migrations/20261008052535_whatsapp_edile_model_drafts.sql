-- LOCAL ONLY. Additive conversion of a reviewed, flat classic draft into an
-- existing edile wizard. Does not send, render, overwrite the source, or guess
-- dimensions, incentives, engineering parameters or supplier catalog mappings.
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '30s';

DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['clm','ele','idr','pav','pis','rst'] LOOP
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS origine_quote_id uuid REFERENCES public.quotes(id),
      ADD COLUMN IF NOT EXISTS origine_quote_revision timestamptz,
      ADD COLUMN IF NOT EXISTS origine_quote_impronta text,
      ADD COLUMN IF NOT EXISTS origine_modello_impronta text', t || '_progetti');
    EXECUTE format('CREATE UNIQUE INDEX IF NOT EXISTS %I ON public.%I(company_id,origine_quote_id) WHERE origine_quote_id IS NOT NULL',
      t || '_wa_origine_quote_unique', t || '_progetti');
  END LOOP;
END $$;

-- Static allowlist. No table name or intervention type comes from model input.
CREATE OR REPLACE FUNCTION public.whatsapp_edile_draft_spec(p_module text, p_model text)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE spec jsonb;
BEGIN
  spec := CASE p_module
    WHEN 'climatizzazione' THEN '{"prefix":"clm","archive":"clm","types":{"monosplit":"nuovo_impianto","multisplit":"nuovo_impianto","canalizzato":"nuovo_impianto","sostituzione":"sostituzione","manutenzione":"manutenzione_ordinaria","vmc":"nuovo_impianto"}}'::jsonb
    WHEN 'elettrico' THEN '{"prefix":"ele","archive":"elt","types":{"completo":"nuovo_impianto","adeguamento":"adeguamento_norma","punti":"ampliamento","quadro":"adeguamento_norma","domotica":"domotica","videocitofonia":"ampliamento","ricarica":"ampliamento"}}'::jsonb
    WHEN 'termoidraulico' THEN '{"prefix":"idr","archive":"idr","types":{"caldaia":"sostituzione_generatore","pompa-calore":"sostituzione_generatore","ibrido":"sostituzione_generatore","radiante":"nuovo_impianto","terminali":"ampliamento","idrico":"rifacimento","acqua-calda":"sostituzione_generatore","manutenzione":"manutenzione_straordinaria"}}'::jsonb
    WHEN 'pavimenti' THEN '{"prefix":"pav","archive":"pav","types":{"sovrapposizione":"sovrapposizione","rifacimento":"rifacimento","resina":"resina_microcemento","parquet":"levigatura_lucidatura","pareti":"nuova_posa","esterni":"nuova_posa"}}'::jsonb
    WHEN 'piscine' THEN '{"prefix":"pis","archive":"psc","types":{"nuova":"nuova_costruzione","ristrutturazione":"ristrutturazione","rivestimento":"ristrutturazione","impianti":"impianto_trattamento","accessori":"copertura","manutenzione":"manutenzione"}}'::jsonb
    WHEN 'ristrutturazione' THEN '{"prefix":"rst","archive":"rst","types":{"completa":"ristrutturazione_completa","parziale":"ristrutturazione_parziale","commerciale":"ristrutturazione_completa","spazi":"ristrutturazione_parziale","computo":"altro"}}'::jsonb
    ELSE NULL END;
  IF spec IS NULL OR p_model IS NULL OR NOT (spec->'types' ? p_model) THEN
    RAISE EXCEPTION 'Modello non supportato: completa questo intervento nell app';
  END IF;
  RETURN spec || jsonb_build_object('tipo_intervento',spec->'types'->>p_model,
    'feature','modulo_'||p_module||'_attivo');
END $$;

CREATE OR REPLACE FUNCTION public.whatsapp_edile_draft_access(p_company uuid,p_user uuid,p_module text,p_model text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE roles text[]; spec jsonb; feature jsonb; plan_id uuid; slug text; enabled boolean;
BEGIN
  IF public.ai_is_service_role() IS DISTINCT FROM true THEN RAISE EXCEPTION 'Service execution required' USING ERRCODE='42501'; END IF;
  roles := public.silvio_context_actor_roles(p_company,p_user);
  IF NOT COALESCE(roles && ARRAY['super_admin','company_admin','company_staff','salesperson']::text[],false) THEN
    RAISE EXCEPTION 'Quote permission denied' USING ERRCODE='42501';
  END IF;
  IF NOT (roles && ARRAY['super_admin','company_admin','salesperson']::text[]) AND NOT EXISTS (
    SELECT 1 FROM public.staff_permissions s WHERE s.company_id=p_company AND s.user_id=p_user
      AND s.sola_lettura IS FALSE AND s.can_view_preventivi IS TRUE AND s.can_edit_preventivi IS TRUE
      AND s.only_assigned IS FALSE AND s.only_my_warehouse IS FALSE
  ) THEN RAISE EXCEPTION 'Quote permission denied' USING ERRCODE='42501'; END IF;
  spec := public.whatsapp_edile_draft_spec(p_module,p_model);
  SELECT to_jsonb(o) INTO feature FROM public.company_feature_overrides o
    WHERE o.company_id=p_company AND o.feature_key=spec->>'feature' AND o.is_enabled IS NOT NULL
      AND (o.expires_at IS NULL OR o.expires_at>now());
  IF feature IS NULL THEN
    SELECT c.subscription_plan_id,p.slug INTO plan_id,slug FROM public.companies c
      LEFT JOIN public.subscription_plans p ON p.id=c.subscription_plan_id WHERE c.id=p_company;
    SELECT to_jsonb(d) INTO feature FROM public.plan_feature_defaults d
      WHERE d.plan_id=plan_id AND d.feature_key=spec->>'feature';
  END IF;
  IF feature IS NOT NULL THEN
    enabled := COALESCE(feature->>'access_level'='enabled',false) OR COALESCE((feature->>'is_enabled')::boolean,false);
  ELSE
    SELECT COALESCE(f.default_value,false) OR COALESCE(to_jsonb(f.plans_included) ? slug,false)
      INTO enabled FROM public.platform_feature_flags f WHERE f.key=spec->>'feature';
  END IF;
  IF enabled IS DISTINCT FROM true THEN RAISE EXCEPTION 'Modulo non abilitato'; END IF;
  RETURN spec;
END $$;

-- Both preview and creation use the very same DB snapshot and fingerprint.
-- Lock the parent and children briefly, including the parent FK against new
-- items. Hash every source field so same-total edits cannot reuse confirmation.
CREATE OR REPLACE FUNCTION public.whatsapp_review_edile_quote(
  p_company_id uuid,p_user_id uuid,p_quote_id uuid,p_module text,p_model_id text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' SET lock_timeout='3s' AS $$
DECLARE q public.quotes%ROWTYPE; spec jsonb; model jsonb; template jsonb;
  items jsonb; preview_items jsonb; n int; rate numeric; net numeric; gross numeric;
BEGIN
  spec := public.whatsapp_edile_draft_access(p_company_id,p_user_id,p_module,p_model_id);
  SELECT * INTO q FROM public.quotes WHERE id=p_quote_id AND company_id=p_company_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND OR q.status IS DISTINCT FROM 'bozza' OR COALESCE(q.source,'') LIKE 'modulo:%' THEN
    RAISE EXCEPTION 'Bozza classica non convertibile';
  END IF;
  SELECT contenuto INTO model FROM public.modelli_libreria_azienda
    WHERE company_id=p_company_id AND chiave='eic:full-'||(spec->>'archive')||'-module:v1:'||p_company_id::text||':'||p_model_id FOR SHARE;
  template := model->'template';
  IF NOT COALESCE(model->>'version'='1' AND model->>'companyId'=p_company_id::text
    AND model->>'moduleId'=p_model_id AND jsonb_typeof(template)='object'
    AND template->>'company_id'=p_company_id::text AND template#>>'{pdf_blocchi,modulo_intervento}'=p_model_id
    AND length(trim(template->>'cover_title'))>0 AND octet_length(model::text)<=8388608
    AND jsonb_typeof(template->'esigenze')='array' AND jsonb_typeof(template->'soluzione')='array'
    AND jsonb_typeof(template->'usp')='array' AND jsonb_typeof(template->'percorso')='array'
    AND jsonb_typeof(template->'garanzie')='array' AND jsonb_typeof(template->'faq')='array'
    AND jsonb_typeof(template->'cronoprogramma')='array' AND jsonb_typeof(template->'testimonianze')='array',false) THEN
    RAISE EXCEPTION 'Modello aziendale non pubblicato o incompleto';
  END IF;
  IF model->>'savedAt' IS NULL THEN RAISE EXCEPTION 'Revisione modello mancante'; END IF;
  IF NOT isfinite((model->>'savedAt')::timestamptz) THEN RAISE EXCEPTION 'Revisione modello non valida'; END IF;
  PERFORM 1 FROM public.quote_items WHERE quote_id=q.id FOR SHARE;
  SELECT jsonb_agg(to_jsonb(i) ORDER BY i.sort_order,i.id),count(*),min(vat_rate),sum(round(quantity*unit_price,2))
    INTO items,n,rate,net FROM public.quote_items i WHERE quote_id=q.id;
  IF n NOT BETWEEN 1 AND 200 OR (SELECT count(DISTINCT vat_rate) FROM public.quote_items WHERE quote_id=q.id)<>1 THEN
    RAISE EXCEPTION 'Computo vuoto, troppo lungo o IVA mista: completa nell app';
  END IF;
  IF octet_length(items::text)>1048576 THEN RAISE EXCEPTION 'Computo troppo grande: completa nell app'; END IF;
  IF EXISTS (SELECT 1 FROM public.quote_items i WHERE i.quote_id=q.id AND (
    i.company_id IS DISTINCT FROM p_company_id OR i.quantity IS NULL OR i.quantity<=0 OR i.quantity::text IN ('NaN','Infinity','-Infinity')
    OR i.unit_price IS NULL OR i.unit_price<0 OR i.unit_price::text IN ('NaN','Infinity','-Infinity')
    OR i.vat_rate IS NULL OR i.vat_rate NOT BETWEEN 0 AND 100 OR i.vat_rate::text='NaN'
    OR i.item_type IS NULL OR i.item_type NOT IN ('material','labor')
    OR COALESCE(i.is_optional,false) OR COALESCE(i.discount_percent,0)<>0
    OR length(trim(COALESCE(NULLIF(trim(i.description),''),i.name,'')))=0
    OR lower(trim(COALESCE(i.unit_of_measure,''))) NOT IN ('','corpo','a corpo','fisso','cad','pz','pezzo','n','mq','m2','m²','ml','m','h','ora','ore')
    -- Composite/configurable products and private line images need a lossless
    -- product adapter, not blind copying into a simple computo.
    OR to_jsonb(i)->>'parent_item_id' IS NOT NULL OR to_jsonb(i)->>'article_template_id' IS NOT NULL
    OR to_jsonb(i)->>'supplier_product_line_id' IS NOT NULL OR to_jsonb(i)->>'computo_voce_id' IS NOT NULL
    OR to_jsonb(i)->>'tariffa_id' IS NOT NULL OR to_jsonb(i)->>'supplier_catalog_id' IS NOT NULL
    OR to_jsonb(i)->>'family_id' IS NOT NULL OR to_jsonb(i)->>'image_url' IS NOT NULL
    OR to_jsonb(i)->>'codice_prezzario' IS NOT NULL
    OR COALESCE(to_jsonb(i)->'axis_selections','null'::jsonb) NOT IN ('null'::jsonb,'{}'::jsonb,'[]'::jsonb)
    OR COALESCE(to_jsonb(i)->'custom_field_values','null'::jsonb) NOT IN ('null'::jsonb,'{}'::jsonb)
    OR COALESCE((to_jsonb(i)->>'mostra_nel_pdf')::boolean,true)=false
    OR COALESCE((to_jsonb(i)->>'misura_x')::numeric,0)<>0 OR COALESCE((to_jsonb(i)->>'misura_y')::numeric,0)<>0
    OR COALESCE((to_jsonb(i)->>'overhead_importo')::numeric,0)<>0
    OR COALESCE((to_jsonb(i)->>'prezzo_acquisto')::numeric,0)<0
    OR (to_jsonb(i)->>'prezzo_acquisto') IN ('NaN','Infinity','-Infinity')
    OR (to_jsonb(i)->>'line_total' IS NOT NULL AND (to_jsonb(i)->>'line_total')::numeric IS DISTINCT FROM round(i.quantity*i.unit_price,2))
  )) OR COALESCE(q.prezzo_manuale,0)<>0 OR COALESCE(q.discount_percent,0)<>0
    OR COALESCE((to_jsonb(q)->>'discount_amount')::numeric,0)<>0
    OR COALESCE((to_jsonb(q)->>'totale_overhead')::numeric,0)<>0
    OR (to_jsonb(q)->>'totale_costo_interno' IS NOT NULL AND (to_jsonb(q)->>'totale_costo_interno')::numeric IS DISTINCT FROM
      (SELECT sum(i.quantity*COALESCE((to_jsonb(i)->>'prezzo_acquisto')::numeric,0)) FROM public.quote_items i WHERE i.quote_id=q.id))
    OR COALESCE(to_jsonb(q)->'bonus_lines','null'::jsonb) NOT IN ('null'::jsonb,'[]'::jsonb)
    OR to_jsonb(q)->>'financing_table_id' IS NOT NULL OR COALESCE((to_jsonb(q)->>'financing_amount')::numeric,0)<>0
    OR COALESCE((to_jsonb(q)->>'financing_num_installments')::numeric,0)<>0 THEN
    RAISE EXCEPTION 'Computo non convertibile senza perdita: usa il preventivatore nell app';
  END IF;
  gross := round(net*(1+rate/100),2);
  IF q.subtotal IS DISTINCT FROM net OR q.total IS DISTINCT FROM gross OR q.vat_amount IS DISTINCT FROM gross-net THEN
    RAISE EXCEPTION 'Totali non coincidono';
  END IF;
  -- Preserve/hash full source rows internally, but return only sale-side fields
  -- to chat. A PDF grant alone is not a grant to disclose internal purchase costs.
  SELECT jsonb_agg(jsonb_build_object('id',i.id,'company_id',i.company_id,'quote_id',i.quote_id,
    'name',i.name,'description',i.description,'quantity',i.quantity,'unit_price',i.unit_price,
    'unit_of_measure',i.unit_of_measure,'vat_rate',i.vat_rate,'item_type',i.item_type) ORDER BY i.sort_order,i.id)
    INTO preview_items FROM public.quote_items i WHERE quote_id=q.id;
  RETURN jsonb_build_object('company_id',p_company_id,'quote_id',q.id,'module_id',p_module,'model_id',p_model_id,
    'quote_number',q.quote_number,'cliente',q.client_name,'revisione_preventivo',q.updated_at,
    'revisione_modello',model->>'savedAt','totale',gross,'imponibile',net,'iva_pct',rate,
    'impronta_preventivo',encode(sha256(convert_to(jsonb_build_object('quote',to_jsonb(q),'items',items)::text,'UTF8')),'hex'),
    'impronta_modello',encode(sha256(convert_to(model::text,'UTF8')),'hex'),
    'voci_da_mostrare',preview_items,'pdf_generato',false,'dati_tecnici_da_completare',true);
END $$;

CREATE OR REPLACE FUNCTION public.whatsapp_prepare_edile_quote(
  p_company_id uuid,p_user_id uuid,p_quote_id uuid,p_module text,p_model_id text,
  p_model_revision text,p_quote_revision timestamptz,p_quote_fingerprint text,p_model_fingerprint text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' SET lock_timeout='3s' AS $$
DECLARE spec jsonb; q public.quotes%ROWTYPE; review jsonb; existing jsonb;
  v_id uuid := gen_random_uuid(); template jsonb; snapshot jsonb; prefix text; rev timestamptz; result jsonb; other_prefix text; used boolean;
BEGIN
  spec := public.whatsapp_edile_draft_access(p_company_id,p_user_id,p_module,p_model_id);
  IF p_quote_fingerprint IS NULL OR p_quote_fingerprint !~ '^[a-f0-9]{64}$'
    OR p_model_fingerprint IS NULL OR p_model_fingerprint !~ '^[a-f0-9]{64}$'
    OR p_model_revision IS NULL OR p_quote_revision IS NULL THEN RAISE EXCEPTION 'Conferma completa richiesta'; END IF;
  prefix := spec->>'prefix';
  SELECT * INTO q FROM public.quotes WHERE id=p_quote_id AND company_id=p_company_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Bozza classica non trovata'; END IF;
  EXECUTE format('SELECT to_jsonb(p) FROM public.%I p WHERE company_id=$1 AND origine_quote_id=$2 FOR UPDATE',prefix||'_progetti')
    INTO existing USING p_company_id,p_quote_id;
  IF existing IS NOT NULL THEN
    IF existing->>'deleted_at' IS NOT NULL OR (existing->>'origine_quote_revision')::timestamptz IS DISTINCT FROM p_quote_revision
      OR existing->>'origine_quote_impronta' IS DISTINCT FROM p_quote_fingerprint
      OR existing->>'origine_modello_impronta' IS DISTINCT FROM p_model_fingerprint
      OR existing#>>'{modello_snapshot,modelId}' IS DISTINCT FROM p_model_id
      OR existing#>>'{modello_snapshot,sourceRevision}' IS DISTINCT FROM p_model_revision THEN
      RAISE EXCEPTION 'Conversione esistente diversa o eliminata: nessuna copia creata';
    END IF;
    RETURN jsonb_build_object('success',true,'company_id',p_company_id,'quote_id',p_quote_id,'module_id',p_module,
      'progetto_id',existing->>'id','model_id',p_model_id,'project_revision',existing->>'updated_at',
      'reused',true,'pdf_generated',false,'dati_tecnici_da_completare',true);
  END IF;
  -- Parent lock serializes conversions across these six adapters too. A model
  -- for a different area must not produce another offer from the same source.
  FOREACH other_prefix IN ARRAY ARRAY['clm','ele','idr','pav','pis','rst'] LOOP
    IF other_prefix <> prefix THEN
      EXECUTE format('SELECT EXISTS(SELECT 1 FROM public.%I WHERE company_id=$1 AND origine_quote_id=$2)',other_prefix||'_progetti')
        INTO used USING p_company_id,p_quote_id;
      IF used THEN RAISE EXCEPTION 'Bozza gia convertita in altro preventivatore: verifica il progetto esistente'; END IF;
    END IF;
  END LOOP;
  review := public.whatsapp_review_edile_quote(p_company_id,p_user_id,p_quote_id,p_module,p_model_id);
  IF (review->>'revisione_preventivo')::timestamptz IS DISTINCT FROM p_quote_revision
    OR review->>'revisione_modello' IS DISTINCT FROM p_model_revision
    OR review->>'impronta_preventivo' IS DISTINCT FROM p_quote_fingerprint
    OR review->>'impronta_modello' IS DISTINCT FROM p_model_fingerprint THEN
    RAISE EXCEPTION 'Preventivo o modello modificato: verifica e richiedi nuova conferma';
  END IF;
  SELECT contenuto->'template' INTO template FROM public.modelli_libreria_azienda WHERE company_id=p_company_id
    AND chiave='eic:full-'||(spec->>'archive')||'-module:v1:'||p_company_id::text||':'||p_model_id;
  template := jsonb_set(template,'{pdf_blocchi}',(template->'pdf_blocchi')-'modulo_defaults'-'modulo_foto');
  snapshot := jsonb_build_object('version',1,'companyId',p_company_id,'modelId',p_model_id,'capturedAt',now(),
    'sourceRevision',p_model_revision,'template',template);
  EXECUTE format('INSERT INTO public.%I(id,company_id,code,stato,tipo_intervento,cliente_nome,cliente_email,cliente_telefono,
    cantiere_indirizzo,iva_pct,sconto_pct,detrazione_pct,totale_imponibile,totale,note,created_by,modello_snapshot,
    origine_quote_id,origine_quote_revision,origine_quote_impronta,origine_modello_impronta)
    VALUES($1,$2,$3,''bozza'',$4,$5,$6,$7,$8,$9,0,0,$10,$11,$12,$13,$14,$15,$16,$17,$18) RETURNING updated_at',prefix||'_progetti')
    INTO rev USING v_id,p_company_id,upper(prefix)||'-WA-'||v_id::text,spec->>'tipo_intervento',q.client_name,q.client_email,q.client_phone,
      q.indirizzo_lavori,(review->>'iva_pct')::numeric,(review->>'imponibile')::numeric,(review->>'totale')::numeric,
      'Da preventivo '||q.quote_number||'. Dati tecnici e condizioni da verificare nel preventivatore.',p_user_id,snapshot,
      q.id,q.updated_at,p_quote_fingerprint,p_model_fingerprint;
  EXECUTE format('INSERT INTO public.%I(progetto_id,company_id,capitolo_nome,descrizione,unita_misura,quantita,prezzo_unitario,
      importo,costo_materiali,costo_manodopera,sconto_pct,ordine)
    SELECT $1,$2,CASE WHEN item_type=''labor'' THEN ''Manodopera'' ELSE ''Forniture'' END,
      COALESCE(NULLIF(trim(description),''''),name),
      CASE lower(trim(COALESCE(unit_of_measure,''''))) WHEN ''mq'' THEN ''mq'' WHEN ''m2'' THEN ''mq'' WHEN ''m²'' THEN ''mq''
        WHEN ''ml'' THEN ''ml'' WHEN ''m'' THEN ''ml'' WHEN ''h'' THEN ''ora'' WHEN ''ora'' THEN ''ora'' WHEN ''ore'' THEN ''ora''
        WHEN ''cad'' THEN ''cad'' WHEN ''pz'' THEN ''cad'' WHEN ''pezzo'' THEN ''cad'' WHEN ''n'' THEN ''cad'' ELSE ''corpo'' END,
      quantity,unit_price,round(quantity*unit_price,2),
      CASE WHEN item_type=''material'' THEN COALESCE((to_jsonb(i)->>''prezzo_acquisto'')::numeric,0) ELSE 0 END,
      CASE WHEN item_type=''labor'' THEN COALESCE((to_jsonb(i)->>''prezzo_acquisto'')::numeric,0) ELSE 0 END,
      0,row_number() OVER(ORDER BY sort_order,id)-1 FROM public.quote_items i WHERE quote_id=$3',prefix||'_computo_voci')
    USING v_id,p_company_id,q.id;
  result := jsonb_build_object('success',true,'company_id',p_company_id,'quote_id',p_quote_id,'module_id',p_module,'model_id',p_model_id,
    'progetto_id',v_id,'project_revision',rev,'reused',false,'items_count',jsonb_array_length(review->'voci_da_mostrare'),
    'total',(review->>'totale')::numeric,'pdf_generated',false,'dati_tecnici_da_completare',true);
  RETURN result;
END $$;

REVOKE ALL ON FUNCTION public.whatsapp_edile_draft_spec(text,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.whatsapp_edile_draft_access(uuid,uuid,text,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.whatsapp_review_edile_quote(uuid,uuid,uuid,text,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.whatsapp_prepare_edile_quote(uuid,uuid,uuid,text,text,text,timestamptz,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.whatsapp_edile_draft_spec(text,text),
  public.whatsapp_edile_draft_access(uuid,uuid,text,text),
  public.whatsapp_review_edile_quote(uuid,uuid,uuid,text,text),
  public.whatsapp_prepare_edile_quote(uuid,uuid,uuid,text,text,text,timestamptz,text,text) TO service_role;
