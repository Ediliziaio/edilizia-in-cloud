-- Ready only after end-to-end tests. No changes to existing orders, totals or signatures.
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '30s';
ALTER TABLE public.order_variation_templates ADD COLUMN IF NOT EXISTS variation_kind text NOT NULL DEFAULT 'aggiunta' CHECK (variation_kind IN ('aggiunta','modifica','riduzione'));
ALTER TABLE public.staff_permissions ADD COLUMN IF NOT EXISTS can_approve_variations boolean NOT NULL DEFAULT false;
ALTER TABLE public.ordini_variazione DROP CONSTRAINT IF EXISTS ordini_variazione_status_check;
ALTER TABLE public.ordini_variazione ADD CONSTRAINT ordini_variazione_status_check CHECK (status IN ('bozza','in_attesa','approvato','rifiutato','annullato'));
ALTER TABLE public.ordini_variazione ADD COLUMN IF NOT EXISTS current_document_id uuid;
ALTER TABLE public.ordini_variazione ADD COLUMN IF NOT EXISTS link_expires_at timestamptz;
ALTER TABLE public.ordini_variazione ADD COLUMN IF NOT EXISTS link_revoked_at timestamptz;
ALTER TABLE public.ordini_variazione ADD COLUMN IF NOT EXISTS approval_channel text CHECK (approval_channel IN ('online','offline'));
ALTER TABLE public.ordini_variazione ADD COLUMN IF NOT EXISTS approved_document_hash text CHECK (approved_document_hash ~ '^[a-f0-9]{64}$');
ALTER TABLE public.ordini_variazione ADD COLUMN IF NOT EXISTS approval_recorded_at timestamptz;
ALTER TABLE public.ordini_variazione ADD COLUMN IF NOT EXISTS offline_signed_on date;
ALTER TABLE public.ordini_variazione ADD COLUMN IF NOT EXISTS work_phase_id uuid REFERENCES public.order_work_phases(id);
ALTER TABLE public.ordini_variazione ADD COLUMN IF NOT EXISTS day_unit text CHECK (day_unit IN ('calendario','lavorativi'));
CREATE UNIQUE INDEX IF NOT EXISTS variation_workspace_order_number_idx ON public.ordini_variazione(order_id,numero_odv);

CREATE TABLE IF NOT EXISTS public.order_variation_workspaces (
 variation_id uuid PRIMARY KEY REFERENCES public.ordini_variazione(id) ON DELETE CASCADE,
 company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
 order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
 revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
 content jsonb NOT NULL CHECK (jsonb_typeof(content)='object' AND octet_length(content::text) <= 200000),
 context jsonb NOT NULL CHECK (jsonb_typeof(context)='object' AND octet_length(context::text) <= 20000),
 current_document_id uuid,
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS variation_workspaces_scope_idx ON public.order_variation_workspaces(company_id,order_id);
CREATE TABLE IF NOT EXISTS public.order_variation_documents (
 id uuid PRIMARY KEY,
 variation_id uuid NOT NULL REFERENCES public.ordini_variazione(id) ON DELETE CASCADE,
 company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
 order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
 source_revision integer NOT NULL CHECK (source_revision > 0),
 pdf_path text NOT NULL UNIQUE,
 pdf_name text NOT NULL CHECK (length(pdf_name) BETWEEN 1 AND 180),
 pdf_size integer NOT NULL CHECK (pdf_size BETWEEN 5 AND 10485760),
 document_hash text NOT NULL CHECK (document_hash ~ '^[a-f0-9]{64}$'),
 public_terms jsonb NOT NULL CHECK (jsonb_typeof(public_terms)='object' AND octet_length(public_terms::text) <= 200000),
 context jsonb NOT NULL CHECK (jsonb_typeof(context)='object' AND octet_length(context::text) <= 20000),
 attachments jsonb NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(attachments)='array' AND jsonb_array_length(attachments)<=10),
 created_by uuid NOT NULL REFERENCES public.profiles(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE (variation_id,source_revision),
 CHECK (pdf_path=company_id::text||'/'||order_id::text||'/'||variation_id::text||'/'||id::text||'/proposal.pdf')
);
CREATE INDEX IF NOT EXISTS variation_documents_scope_idx ON public.order_variation_documents(company_id,order_id,variation_id);
CREATE TABLE IF NOT EXISTS public.order_variation_evidence (
 id uuid PRIMARY KEY,
 variation_id uuid NOT NULL REFERENCES public.ordini_variazione(id) ON DELETE CASCADE,
 document_id uuid NOT NULL REFERENCES public.order_variation_documents(id),
 company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
 order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
 pdf_path text NOT NULL UNIQUE,
 file_name text NOT NULL CHECK (length(file_name) BETWEEN 1 AND 180),
 file_size integer NOT NULL CHECK (file_size BETWEEN 5 AND 10485760),
 document_hash text NOT NULL CHECK (document_hash ~ '^[a-f0-9]{64}$'),
 uploaded_by uuid NOT NULL REFERENCES public.profiles(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 CHECK (pdf_path=company_id::text||'/'||order_id::text||'/'||variation_id::text||'/evidence/'||id::text||'.pdf')
);
CREATE INDEX IF NOT EXISTS variation_evidence_scope_idx ON public.order_variation_evidence(company_id,order_id,variation_id);
ALTER TABLE public.ordini_variazione ADD COLUMN IF NOT EXISTS approval_evidence_id uuid REFERENCES public.order_variation_evidence(id);
ALTER TABLE public.order_variation_workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_variation_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_variation_evidence ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.order_variation_workspaces,public.order_variation_documents,public.order_variation_evidence FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.order_variation_workspaces,public.order_variation_documents,public.order_variation_evidence TO authenticated;
GRANT ALL ON public.order_variation_workspaces,public.order_variation_documents,public.order_variation_evidence TO service_role;
DROP POLICY IF EXISTS variation_workspace_read ON public.order_variation_workspaces;
CREATE POLICY variation_workspace_read ON public.order_variation_workspaces FOR SELECT TO authenticated USING (
 NOT (SELECT public.utente_bloccato()) AND NOT (SELECT public.utente_e_cliente_esterno()) AND
 public.has_permission_for_company((SELECT auth.uid()),'can_edit_orders',company_id) AND
 EXISTS (SELECT 1 FROM public.orders o WHERE o.id=order_id AND o.company_id=order_variation_workspaces.company_id)
);
DROP POLICY IF EXISTS variation_document_read ON public.order_variation_documents;
CREATE POLICY variation_document_read ON public.order_variation_documents FOR SELECT TO authenticated USING (
 NOT (SELECT public.utente_bloccato()) AND NOT (SELECT public.utente_e_cliente_esterno()) AND
 (public.has_permission_for_company((SELECT auth.uid()),'can_view_orders',company_id) OR public.has_permission_for_company((SELECT auth.uid()),'can_edit_orders',company_id)) AND
 EXISTS (SELECT 1 FROM public.orders o WHERE o.id=order_id AND o.company_id=order_variation_documents.company_id)
);
DROP POLICY IF EXISTS variation_evidence_read ON public.order_variation_evidence;
CREATE POLICY variation_evidence_read ON public.order_variation_evidence FOR SELECT TO authenticated USING (
 NOT (SELECT public.utente_bloccato()) AND NOT (SELECT public.utente_e_cliente_esterno()) AND
 (public.has_permission_for_company((SELECT auth.uid()),'can_view_orders',company_id) OR public.has_permission_for_company((SELECT auth.uid()),'can_edit_orders',company_id)) AND
 EXISTS (SELECT 1 FROM public.orders o WHERE o.id=order_id AND o.company_id=order_variation_evidence.company_id)
);
INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types) VALUES ('order-variation-documents','order-variation-documents',false,10485760,ARRAY['application/pdf']) ON CONFLICT (id) DO NOTHING;
DO $$ BEGIN IF EXISTS (SELECT 1 FROM storage.buckets WHERE id='order-variation-documents' AND (public OR file_size_limit IS DISTINCT FROM 10485760 OR allowed_mime_types IS DISTINCT FROM ARRAY['application/pdf'])) THEN RAISE EXCEPTION 'Variation bucket configuration differs'; END IF; END $$;
DROP POLICY IF EXISTS variation_document_storage_guard ON storage.objects;
CREATE POLICY variation_document_storage_guard ON storage.objects AS RESTRICTIVE FOR ALL TO authenticated
 USING (bucket_id <> 'order-variation-documents' OR (NOT (SELECT public.utente_bloccato()) AND EXISTS (
 SELECT 1 FROM public.orders o WHERE o.id::text=(storage.foldername(objects.name))[2] AND o.company_id::text=(storage.foldername(objects.name))[1] AND (
 public.has_permission_for_company((SELECT auth.uid()),'can_view_orders',o.company_id) OR public.has_permission_for_company((SELECT auth.uid()),'can_edit_orders',o.company_id) OR
 (o.customer_id=(SELECT auth.uid()) AND EXISTS (SELECT 1 FROM public.order_attachments a WHERE a.order_id=o.id AND a.visible_to_customer AND a.file_url='order-variation-documents/'||objects.name))
 )))) WITH CHECK (bucket_id <> 'order-variation-documents');
DROP POLICY IF EXISTS variation_document_storage_read ON storage.objects;
CREATE POLICY variation_document_storage_read ON storage.objects FOR SELECT TO authenticated USING (bucket_id='order-variation-documents');
DROP POLICY IF EXISTS variation_document_storage_anon ON storage.objects;
CREATE POLICY variation_document_storage_anon ON storage.objects AS RESTRICTIVE FOR ALL TO anon USING (bucket_id <> 'order-variation-documents') WITH CHECK (bucket_id <> 'order-variation-documents');
DROP POLICY IF EXISTS variation_document_storage_delete ON storage.objects;
CREATE POLICY variation_document_storage_delete ON storage.objects AS RESTRICTIVE FOR DELETE TO authenticated USING (bucket_id <> 'order-variation-documents');

-- All transitions commit atomically. Only the authenticated, permission-checked edge calls this RPC.
CREATE OR REPLACE FUNCTION public.variation_workflow_commit(p_action text,p_actor uuid,p_order uuid,p_id uuid,p_revision integer,p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE o public.orders%ROWTYPE; v public.ordini_variazione%ROWTYPE; w public.order_variation_workspaces%ROWTYPE;
 d public.order_variation_documents%ROWTYPE; e public.order_variation_evidence%ROWTYPE; item jsonb; base_net numeric; next_num integer; token text;
BEGIN
 IF p_actor IS NULL OR p_id IS NULL OR p_order IS NULL OR p_revision IS NULL OR p_revision<0 OR p_action NOT IN ('save','document','publish','evidence','approve_offline','cancel') THEN RAISE EXCEPTION 'Richiesta non valida'; END IF;
 -- Lock the parent first, including on signing, to serialize numbering and budget reductions.
 SELECT * INTO o FROM public.orders WHERE id=p_order FOR UPDATE;
 IF NOT FOUND OR NOT public.has_permission_for_company(p_actor,'can_edit_orders',o.company_id) OR EXISTS (SELECT 1 FROM public.profiles WHERE id=p_actor AND coalesce(is_blocked,false)) THEN RAISE EXCEPTION 'Commessa non autorizzata'; END IF;
 IF EXISTS (SELECT 1 FROM public.user_roles WHERE user_id=p_actor AND role::text IN ('customer','cliente')) THEN RAISE EXCEPTION 'Utente esterno non autorizzato'; END IF;
 SELECT * INTO v FROM public.ordini_variazione WHERE id=p_id AND order_id=o.id AND company_id=o.company_id FOR UPDATE;
 SELECT * INTO w FROM public.order_variation_workspaces WHERE variation_id=p_id AND order_id=o.id AND company_id=o.company_id FOR UPDATE;
 SELECT o.total_amount+coalesce(sum(x.impatto_economico),0) INTO base_net FROM public.ordini_variazione x WHERE x.order_id=o.id AND x.company_id=o.company_id AND x.status='approvato';
 IF p_action='save' THEN
  IF jsonb_typeof(p_payload->'content')<>'object' OR jsonb_typeof(p_payload->'context')<>'object' OR jsonb_typeof(p_payload->'terms')<>'object' THEN RAISE EXCEPTION 'Bozza non valida'; END IF;
  IF v.id IS NOT NULL AND (v.status<>'bozza' OR w.variation_id IS NULL) THEN RAISE EXCEPTION 'La proposta non è modificabile. Crea una nuova edizione'; END IF;
  IF w.variation_id IS NOT NULL AND w.revision<>p_revision THEN
   IF w.content=p_payload->'content' AND w.context=p_payload->'context' THEN RETURN jsonb_build_object('variation',to_jsonb(v),'workspace',to_jsonb(w)); END IF;
   RAISE EXCEPTION 'Bozza modificata da un altro utente. Riaprila';
  END IF;
  IF w.variation_id IS NULL AND p_revision<>0 THEN RAISE EXCEPTION 'Versione iniziale non valida'; END IF;
  IF nullif(p_payload->'content'->>'phaseId','') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.order_work_phases f WHERE f.id=(p_payload->'content'->>'phaseId')::uuid AND f.order_id=o.id AND f.company_id=o.company_id) THEN RAISE EXCEPTION 'Lavorazione di un’altra commessa'; END IF;
  IF v.id IS NULL THEN
   SELECT coalesce(max(numero_odv),0)+1 INTO next_num FROM public.ordini_variazione WHERE order_id=o.id;
   INSERT INTO public.ordini_variazione(id,order_id,company_id,numero_odv,titolo,descrizione,impatto_economico,impatto_giorni,status,created_by)
   VALUES(p_id,o.id,o.company_id,next_num,p_payload->'terms'->>'titolo',p_payload->'terms'->>'descrizione',0,0,'bozza',p_actor) RETURNING * INTO v;
  END IF;
  UPDATE public.ordini_variazione SET titolo=p_payload->'terms'->>'titolo',descrizione=p_payload->'terms'->>'descrizione',motivazione=p_payload->'terms'->>'motivazione',
   impatto_economico=(p_payload->'terms'->>'impatto_economico')::numeric,impatto_giorni=(p_payload->'terms'->>'impatto_giorni')::integer,richiesto_da=p_payload->'terms'->>'richiesto_da',
   work_phase_id=nullif(p_payload->'content'->>'phaseId','')::uuid,day_unit=p_payload->'content'->>'dayUnit',current_document_id=NULL,note_interne=NULL
   WHERE id=v.id RETURNING * INTO v;
  INSERT INTO public.order_variation_workspaces(variation_id,order_id,company_id,revision,content,context)
   VALUES(v.id,o.id,o.company_id,1,p_payload->'content',p_payload->'context')
   ON CONFLICT(variation_id) DO UPDATE SET content=excluded.content,context=excluded.context,revision=order_variation_workspaces.revision+1,current_document_id=NULL,updated_at=now() RETURNING * INTO w;
 ELSIF p_action='document' THEN
  IF v.status IS DISTINCT FROM 'bozza' OR w.variation_id IS NULL OR w.revision<>p_revision THEN RAISE EXCEPTION 'Bozza cambiata durante la generazione. Riaprila'; END IF;
  IF (w.context->>'currentNet')::numeric IS DISTINCT FROM base_net THEN RAISE EXCEPTION 'Importo della commessa cambiato. Salva di nuovo la bozza'; END IF;
  IF base_net+v.impatto_economico<0 THEN RAISE EXCEPTION 'La riduzione supera il contratto'; END IF;
  IF (p_payload->'public_terms'->>'titolo',p_payload->'public_terms'->>'descrizione',(p_payload->'public_terms'->>'impatto_economico')::numeric,(p_payload->'public_terms'->>'impatto_giorni')::integer) IS DISTINCT FROM (v.titolo,v.descrizione,v.impatto_economico,v.impatto_giorni) THEN RAISE EXCEPTION 'Il PDF non corrisponde alla bozza registrata'; END IF;
  INSERT INTO public.order_variation_documents(id,variation_id,company_id,order_id,source_revision,pdf_path,pdf_name,pdf_size,document_hash,public_terms,context,attachments,created_by)
   VALUES((p_payload->>'id')::uuid,v.id,o.company_id,o.id,w.revision,p_payload->>'pdf_path',p_payload->>'pdf_name',(p_payload->>'pdf_size')::integer,p_payload->>'document_hash',p_payload->'public_terms',w.context,coalesce(p_payload->'attachments','[]'),p_actor)
   ON CONFLICT(variation_id,source_revision) DO NOTHING;
  SELECT * INTO d FROM public.order_variation_documents WHERE variation_id=v.id AND source_revision=w.revision;
  UPDATE public.order_variation_workspaces SET current_document_id=d.id WHERE variation_id=v.id RETURNING * INTO w;
  UPDATE public.ordini_variazione SET current_document_id=d.id WHERE id=v.id RETURNING * INTO v;
  INSERT INTO public.order_attachments(id,order_id,file_name,file_url,file_type,file_size,uploaded_by,visible_to_customer)
   VALUES(d.id,o.id,d.pdf_name,'order-variation-documents/'||d.pdf_path,'application/pdf',d.pdf_size,p_actor,false) ON CONFLICT(id) DO NOTHING;
  FOR item IN SELECT value FROM jsonb_array_elements(d.attachments) LOOP
   IF item->>'path' <> o.company_id::text||'/'||o.id::text||'/'||v.id::text||'/'||d.id::text||'/'||(item->>'id')||'.pdf' THEN RAISE EXCEPTION 'Percorso allegato non valido'; END IF;
   INSERT INTO public.order_attachments(id,order_id,file_name,file_url,file_type,file_size,uploaded_by,visible_to_customer)
    VALUES((item->>'id')::uuid,o.id,item->>'name','order-variation-documents/'||(item->>'path'),'application/pdf',(item->>'size')::integer,p_actor,false) ON CONFLICT(id) DO NOTHING;
  END LOOP;
 ELSIF p_action='publish' THEN
  SELECT * INTO d FROM public.order_variation_documents WHERE id=v.current_document_id AND variation_id=v.id AND company_id=o.company_id AND order_id=o.id;
  IF v.status='in_attesa' AND d.id IS NOT NULL AND v.link_revoked_at IS NULL AND v.link_expires_at>now() AND d.document_hash=p_payload->>'document_hash' THEN RETURN jsonb_build_object('variation',to_jsonb(v),'workspace',to_jsonb(w),'document',to_jsonb(d)); END IF;
  IF v.status IS DISTINCT FROM 'bozza' OR w.revision<>p_revision OR d.id IS NULL OR d.source_revision<>w.revision OR d.document_hash IS DISTINCT FROM p_payload->>'document_hash' THEN RAISE EXCEPTION 'Controlla e conserva il PDF aggiornato prima di creare il link'; END IF;
  IF base_net+v.impatto_economico<0 THEN RAISE EXCEPTION 'La riduzione supera il contratto'; END IF;
  token=gen_random_uuid()::text;
  UPDATE public.ordini_variazione SET status='in_attesa',firma_token=token,link_expires_at=now()+interval '30 days',richiesto_il=now(),link_revoked_at=NULL WHERE id=v.id RETURNING * INTO v;
 ELSIF p_action='evidence' THEN
  SELECT * INTO d FROM public.order_variation_documents WHERE id=v.current_document_id AND variation_id=v.id AND company_id=o.company_id AND order_id=o.id;
  IF v.status NOT IN ('bozza','in_attesa') OR d.id IS NULL OR d.document_hash IS DISTINCT FROM p_payload->>'proposal_hash' THEN RAISE EXCEPTION 'La proposta è cambiata. Riapri il documento prima di caricare la copia'; END IF;
  INSERT INTO public.order_variation_evidence(id,variation_id,document_id,company_id,order_id,pdf_path,file_name,file_size,document_hash,uploaded_by)
   VALUES((p_payload->>'id')::uuid,v.id,d.id,o.company_id,o.id,p_payload->>'pdf_path',p_payload->>'file_name',(p_payload->>'file_size')::integer,p_payload->>'document_hash',p_actor) RETURNING * INTO e;
  INSERT INTO public.order_attachments(id,order_id,file_name,file_url,file_type,file_size,uploaded_by,visible_to_customer)
   VALUES(e.id,o.id,'Copia caricata - '||left(e.file_name,150),'order-variation-documents/'||e.pdf_path,'application/pdf',e.file_size,p_actor,false);
 ELSIF p_action='approve_offline' THEN
  IF NOT public.has_permission_for_company(p_actor,'can_approve_variations',o.company_id) THEN RAISE EXCEPTION 'Non hai il permesso di registrare approvazioni'; END IF;
  SELECT * INTO e FROM public.order_variation_evidence WHERE id=(p_payload->>'evidence_id')::uuid AND variation_id=v.id AND company_id=o.company_id AND order_id=o.id AND document_id=v.current_document_id;
  SELECT * INTO d FROM public.order_variation_documents WHERE id=v.current_document_id AND variation_id=v.id;
  IF p_payload->>'confirmed' IS DISTINCT FROM 'true' OR e.id IS NULL OR d.id IS NULL OR length(btrim(coalesce(p_payload->>'signer_name','')))<2 OR length(p_payload->>'signer_name')>200 OR coalesce(p_payload->>'signed_on','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' OR (p_payload->>'signed_on')::date>(now() AT TIME ZONE 'Europe/Rome')::date THEN RAISE EXCEPTION 'Conferma la copia firmata, il firmatario e la data'; END IF;
  IF v.status='approvato' AND v.approval_evidence_id=e.id THEN RETURN jsonb_build_object('variation',to_jsonb(v),'workspace',to_jsonb(w),'document',to_jsonb(d),'evidence',to_jsonb(e)); END IF;
  IF v.status NOT IN ('bozza','in_attesa') OR base_net+v.impatto_economico<0 THEN RAISE EXCEPTION 'Variante non più approvabile'; END IF;
  UPDATE public.ordini_variazione SET status='approvato',approval_channel='offline',approval_evidence_id=e.id,approved_document_hash=d.document_hash,
   firmato_da=btrim(p_payload->>'signer_name'),offline_signed_on=(p_payload->>'signed_on')::date,approval_recorded_at=now(),link_revoked_at=now() WHERE id=v.id RETURNING * INTO v;
 ELSIF p_action='cancel' THEN
  IF v.status NOT IN ('bozza','in_attesa','annullato') THEN RAISE EXCEPTION 'La variante non può essere annullata'; END IF;
  UPDATE public.ordini_variazione SET status='annullato',link_revoked_at=now() WHERE id=v.id RETURNING * INTO v;
 END IF;
 IF v.id IS NULL THEN RAISE EXCEPTION 'Variante non trovata'; END IF;
 IF d.id IS NULL AND v.current_document_id IS NOT NULL THEN SELECT * INTO d FROM public.order_variation_documents WHERE id=v.current_document_id AND variation_id=v.id AND company_id=o.company_id AND order_id=o.id; END IF;
 INSERT INTO public.user_action_log(company_id,user_id,azione,tabella,record_id,etichetta,campi_modificati)
 VALUES(o.company_id,p_actor,'update','ordini_variazione',v.id::text,'Variante #'||v.numero_odv||' · '||p_action,ARRAY[p_action]);
 RETURN jsonb_build_object('variation',to_jsonb(v),'workspace',CASE WHEN w.variation_id IS NULL THEN NULL ELSE to_jsonb(w) END,'document',CASE WHEN d.id IS NULL THEN NULL ELSE to_jsonb(d) END,'evidence',CASE WHEN e.id IS NULL THEN NULL ELSE to_jsonb(e) END);
END $$;
REVOKE ALL ON FUNCTION public.variation_workflow_commit(text,uuid,uuid,uuid,integer,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.variation_workflow_commit(text,uuid,uuid,uuid,integer,jsonb) TO service_role;

-- Frozen terms never change after publication; approval/cancellation are server transitions.
CREATE OR REPLACE FUNCTION public.variation_frozen_guard() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF TG_OP='UPDATE' AND OLD.status<>'bozza' AND (NEW.company_id,NEW.order_id,NEW.numero_odv,NEW.titolo,NEW.descrizione,NEW.motivazione,NEW.impatto_economico,NEW.impatto_giorni,NEW.work_phase_id,NEW.day_unit,NEW.richiesto_da,NEW.note_interne) IS DISTINCT FROM (OLD.company_id,OLD.order_id,OLD.numero_odv,OLD.titolo,OLD.descrizione,OLD.motivazione,OLD.impatto_economico,OLD.impatto_giorni,OLD.work_phase_id,OLD.day_unit,OLD.richiesto_da,OLD.note_interne) THEN RAISE EXCEPTION 'La proposta è congelata. Crea una nuova edizione'; END IF;
 IF current_user NOT IN ('service_role','postgres') THEN
  IF TG_OP='INSERT' AND (NEW.status NOT IN ('bozza','in_attesa') OR NEW.firma_cliente IS NOT NULL OR NEW.firmato_da IS NOT NULL OR NEW.firmato_il IS NOT NULL OR NEW.current_document_id IS NOT NULL OR NEW.approval_channel IS NOT NULL OR NEW.approval_evidence_id IS NOT NULL) THEN RAISE EXCEPTION 'Usa il flusso di approvazione verificato'; END IF;
  IF TG_OP='UPDATE' AND ((NEW.status,NEW.firma_token,NEW.current_document_id,NEW.firma_cliente,NEW.firmato_da,NEW.firmato_il,NEW.approval_channel,NEW.approval_evidence_id,NEW.link_expires_at,NEW.link_revoked_at,NEW.approved_document_hash,NEW.offline_signed_on,NEW.approval_recorded_at) IS DISTINCT FROM (OLD.status,OLD.firma_token,OLD.current_document_id,OLD.firma_cliente,OLD.firmato_da,OLD.firmato_il,OLD.approval_channel,OLD.approval_evidence_id,OLD.link_expires_at,OLD.link_revoked_at,OLD.approved_document_hash,OLD.offline_signed_on,OLD.approval_recorded_at) OR EXISTS(SELECT 1 FROM public.order_variation_workspaces WHERE variation_id=OLD.id)) THEN RAISE EXCEPTION 'Usa il flusso di approvazione verificato'; END IF;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.variation_frozen_guard() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS variation_frozen_guard ON public.ordini_variazione;
CREATE TRIGGER variation_frozen_guard BEFORE INSERT OR UPDATE ON public.ordini_variazione FOR EACH ROW EXECUTE FUNCTION public.variation_frozen_guard();
DROP POLICY IF EXISTS variation_insert_permission ON public.ordini_variazione;
CREATE POLICY variation_insert_permission ON public.ordini_variazione AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (NOT (SELECT public.utente_bloccato()) AND NOT (SELECT public.utente_e_cliente_esterno()) AND public.has_permission_for_company((SELECT auth.uid()),'can_edit_orders',company_id) AND EXISTS(SELECT 1 FROM public.orders o WHERE o.id=order_id AND o.company_id=ordini_variazione.company_id));
DROP POLICY IF EXISTS variation_update_permission ON public.ordini_variazione;
CREATE POLICY variation_update_permission ON public.ordini_variazione AS RESTRICTIVE FOR UPDATE TO authenticated USING (NOT (SELECT public.utente_bloccato()) AND NOT (SELECT public.utente_e_cliente_esterno()) AND public.has_permission_for_company((SELECT auth.uid()),'can_edit_orders',company_id)) WITH CHECK (NOT (SELECT public.utente_bloccato()) AND NOT (SELECT public.utente_e_cliente_esterno()) AND public.has_permission_for_company((SELECT auth.uid()),'can_edit_orders',company_id));
DROP POLICY IF EXISTS variation_no_delete ON public.ordini_variazione;
CREATE POLICY variation_no_delete ON public.ordini_variazione AS RESTRICTIVE FOR DELETE TO authenticated USING (false);
CREATE UNIQUE INDEX IF NOT EXISTS variation_token_unique_idx ON public.ordini_variazione(firma_token) WHERE firma_token IS NOT NULL;

-- A token scopes one proposal, not a company. Legacy links get a 30-day maximum as well.
CREATE OR REPLACE FUNCTION public.odv_view_by_token(p_token text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v public.ordini_variazione%ROWTYPE; d public.order_variation_documents%ROWTYPE; h text;
BEGIN
 IF coalesce(p_token,'') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN RETURN jsonb_build_object('valid',false); END IF;
 SELECT * INTO v FROM public.ordini_variazione WHERE firma_token=p_token;
 IF NOT FOUND OR v.status='bozza' OR v.status='annullato' OR v.link_revoked_at IS NOT NULL OR coalesce(v.link_expires_at,v.created_at+interval '30 days')<=now() THEN RETURN jsonb_build_object('valid',false); END IF;
 SELECT * INTO d FROM public.order_variation_documents WHERE id=v.current_document_id AND variation_id=v.id AND company_id=v.company_id AND order_id=v.order_id;
 h=coalesce(d.document_hash,encode(extensions.digest(jsonb_build_object('id',v.id,'numero',v.numero_odv,'titolo',v.titolo,'descrizione',v.descrizione,'importo',v.impatto_economico,'giorni',v.impatto_giorni)::text,'sha256'),'hex'));
 RETURN jsonb_build_object('valid',true,'gia_firmato',v.status<>'in_attesa','id',v.id,'numero_odv',v.numero_odv,'titolo',v.titolo,'descrizione',v.descrizione,'motivazione',v.motivazione,'impatto_economico',v.impatto_economico,'impatto_giorni',v.impatto_giorni,'richiesto_da',v.richiesto_da,'richiesto_il',v.richiesto_il,'status',v.status,'document_hash',h,'has_document',d.id IS NOT NULL,'attachments',coalesce((SELECT jsonb_agg(jsonb_build_object('id',x->>'id','name',x->>'name','size',x->'size')) FROM jsonb_array_elements(d.attachments) x),'[]'::jsonb));
END $$;
REVOKE ALL ON FUNCTION public.odv_view_by_token(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.odv_view_by_token(text) TO anon,authenticated,service_role;

-- The database also validates name, PNG structure, size, expiry and pending state.
-- Remove the publicly callable mutation bypass. Existing service-side callers retain their API.
CREATE OR REPLACE FUNCTION public.odv_sign_with_token(p_token text,p_firma_base64 text,p_firmato_da text DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE v public.ordini_variazione%ROWTYPE; d public.order_variation_documents%ROWTYPE; img bytea; oid uuid; total numeric;
BEGIN
 IF coalesce(p_token,'') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' OR length(btrim(coalesce(p_firmato_da,''))) NOT BETWEEN 2 AND 200 OR length(coalesce(p_firma_base64,''))>1000000 OR coalesce(p_firma_base64,'') !~ '^data:image/png;base64,iVBORw0KGgo[A-Za-z0-9+/=]+$' THEN RETURN jsonb_build_object('success',false,'reason','dati_non_validi'); END IF;
 BEGIN img=decode(split_part(p_firma_base64,',',2),'base64'); EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('success',false,'reason','firma_non_valida'); END;
 IF octet_length(img)<67 OR encode(substring(img FROM 1 FOR 8),'hex')<>'89504e470d0a1a0a' OR encode(substring(img FROM 13 FOR 4),'hex')<>'49484452' OR encode(substring(img FROM octet_length(img)-7 FOR 8),'hex')<>'49454e44ae426082' THEN RETURN jsonb_build_object('success',false,'reason','firma_non_valida'); END IF;
 SELECT order_id INTO oid FROM public.ordini_variazione WHERE firma_token=p_token;
 IF oid IS NULL THEN RETURN jsonb_build_object('success',false,'reason','odv_non_firmabile'); END IF;
 PERFORM 1 FROM public.orders WHERE id=oid FOR UPDATE;
 SELECT * INTO v FROM public.ordini_variazione WHERE firma_token=p_token AND status='in_attesa' FOR UPDATE;
 IF NOT FOUND OR v.link_revoked_at IS NOT NULL OR coalesce(v.link_expires_at,v.created_at+interval '30 days')<=now() THEN RETURN jsonb_build_object('success',false,'reason','odv_non_firmabile'); END IF;
 SELECT * INTO d FROM public.order_variation_documents WHERE id=v.current_document_id AND variation_id=v.id AND company_id=v.company_id AND order_id=v.order_id;
 IF v.current_document_id IS NOT NULL AND (d.id IS NULL OR (d.public_terms->>'impatto_economico')::numeric IS DISTINCT FROM v.impatto_economico OR d.public_terms->>'descrizione' IS DISTINCT FROM v.descrizione) THEN RETURN jsonb_build_object('success',false,'reason','documento_cambiato'); END IF;
 SELECT o.total_amount+coalesce((SELECT sum(impatto_economico) FROM public.ordini_variazione WHERE order_id=o.id AND status='approvato'),0)+v.impatto_economico INTO total FROM public.orders o WHERE o.id=v.order_id;
 IF total<0 THEN RETURN jsonb_build_object('success',false,'reason','riduzione_supera_contratto'); END IF;
 UPDATE public.ordini_variazione SET status='approvato',firma_cliente=p_firma_base64,firmato_da=btrim(p_firmato_da),firmato_il=now(),approval_channel='online',approved_document_hash=d.document_hash,approval_recorded_at=now() WHERE id=v.id;
 RETURN jsonb_build_object('success',true);
END $$;
REVOKE ALL ON FUNCTION public.odv_sign_with_token(text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.odv_sign_with_token(text,text,text) TO service_role;

CREATE OR REPLACE FUNCTION public.variation_sign_verified(p_token text,p_firma_base64 text,p_firmato_da text,p_document_hash text,p_accepted boolean) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE view jsonb;
BEGIN
 view=public.odv_view_by_token(p_token);
 IF p_accepted IS DISTINCT FROM true OR view->>'valid' IS DISTINCT FROM 'true' OR view->>'gia_firmato' IS DISTINCT FROM 'false' OR view->>'document_hash' IS DISTINCT FROM p_document_hash THEN RETURN jsonb_build_object('success',false,'reason','consenso_o_documento_non_validi'); END IF;
 RETURN public.odv_sign_with_token(p_token,p_firma_base64,p_firmato_da);
END $$;
REVOKE ALL ON FUNCTION public.variation_sign_verified(text,text,text,text,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.variation_sign_verified(text,text,text,text,boolean) TO service_role;

CREATE OR REPLACE FUNCTION public.odv_reject_with_token(p_token text,p_firmato_da text DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v public.ordini_variazione%ROWTYPE; oid uuid;
BEGIN
 IF coalesce(p_token,'') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' OR length(coalesce(p_firmato_da,''))>200 THEN RETURN jsonb_build_object('success',false); END IF;
 SELECT order_id INTO oid FROM public.ordini_variazione WHERE firma_token=p_token;
 IF oid IS NULL THEN RETURN jsonb_build_object('success',false); END IF;
 PERFORM 1 FROM public.orders WHERE id=oid FOR UPDATE;
 SELECT * INTO v FROM public.ordini_variazione WHERE firma_token=p_token AND status='in_attesa' FOR UPDATE;
 IF NOT FOUND OR v.link_revoked_at IS NOT NULL OR coalesce(v.link_expires_at,v.created_at+interval '30 days')<=now() THEN RETURN jsonb_build_object('success',false); END IF;
 UPDATE public.ordini_variazione SET status='rifiutato',firmato_da=nullif(btrim(coalesce(p_firmato_da,'')),''),firmato_il=now() WHERE id=v.id;
 RETURN jsonb_build_object('success',true);
END $$;
REVOKE ALL ON FUNCTION public.odv_reject_with_token(text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.odv_reject_with_token(text,text) TO anon,authenticated,service_role;
