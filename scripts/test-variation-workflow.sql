-- Isolated fake proposals inside an existing demo order; every mutation rolls back.
BEGIN;
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='30s';
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
DO $$
DECLARE oid uuid='597f8d35-4bc4-263d-92a4-bdf5cc0d6293'; actor uuid='1ef07662-2896-46eb-93b1-2b35ba53b808'; cid uuid; vid uuid=gen_random_uuid(); doc uuid=gen_random_uuid(); evid uuid=gen_random_uuid(); r jsonb; before_net numeric; base_net numeric; content jsonb; ctx jsonb; terms jsonb; path text; tok text; failed boolean;
BEGIN
 SELECT company_id,total_amount INTO cid,before_net FROM public.orders WHERE id=oid;
 IF cid IS DISTINCT FROM 'd2000000-0000-4000-a000-000000000002'::uuid THEN RAISE EXCEPTION 'Demo scope mismatch'; END IF;
 SELECT before_net+coalesce(sum(impatto_economico),0) INTO base_net FROM public.ordini_variazione WHERE order_id=oid AND status='approvato';
 content=jsonb_build_object('title','TEST ROLLBACK','description','Fictitious work','kind','aggiunta','amount','50','days','0','dayUnit','calendario','internalNotes','PRIVATE','lines','[]'::jsonb);
 ctx=jsonb_build_object('currentNet',base_net,'companyName','TEST COMPANY','customerName','TEST CUSTOMER');
 terms=jsonb_build_object('titolo','TEST ROLLBACK','descrizione','Fictitious work','impatto_economico',50,'impatto_giorni',0);
 r=public.variation_workflow_commit('save',actor,oid,vid,0,jsonb_build_object('content',content,'context',ctx,'terms',terms));
 IF r->'variation'->>'status'<>'bozza' OR (r->'workspace'->>'revision')::int<>1 OR r->'variation'->>'note_interne' IS NOT NULL THEN RAISE EXCEPTION 'Bad draft'; END IF;
 r=public.variation_workflow_commit('save',actor,oid,vid,0,jsonb_build_object('content',content,'context',ctx,'terms',terms));
 IF (r->'workspace'->>'revision')::int<>1 THEN RAISE EXCEPTION 'Lost response duplicates draft'; END IF;
 failed=false;BEGIN PERFORM public.variation_workflow_commit('save',actor,oid,vid,0,jsonb_build_object('content',content||'{"title":"CONFLICT"}','context',ctx,'terms',terms));EXCEPTION WHEN OTHERS THEN failed=true;END;
 IF NOT failed THEN RAISE EXCEPTION 'CAS bypass'; END IF;
 path=cid::text||'/'||oid::text||'/'||vid::text||'/'||doc::text||'/proposal.pdf';
 r=public.variation_workflow_commit('document',actor,oid,vid,1,jsonb_build_object('id',doc,'pdf_path',path,'pdf_name','TEST.pdf','pdf_size',100,'document_hash',repeat('a',64),'public_terms',terms,'attachments','[]'::jsonb));
 IF r->'document'->>'id'<>doc::text OR NOT EXISTS(SELECT 1 FROM public.order_attachments WHERE id=doc AND file_url='order-variation-documents/'||path) THEN RAISE EXCEPTION 'Original not associated'; END IF;
 failed=false;BEGIN PERFORM public.variation_workflow_commit('publish',actor,oid,vid,1,jsonb_build_object('document_hash',repeat('b',64)));EXCEPTION WHEN OTHERS THEN failed=true;END;
 IF NOT failed THEN RAISE EXCEPTION 'Document hash bypass'; END IF;
 r=public.variation_workflow_commit('publish',actor,oid,vid,1,jsonb_build_object('document_hash',repeat('a',64)));tok=r->'variation'->>'firma_token';
 IF public.odv_view_by_token(tok)->>'valid'<>'true' THEN RAISE EXCEPTION 'Published token invalid'; END IF;
 failed=false;BEGIN UPDATE public.ordini_variazione SET impatto_economico=99 WHERE id=vid;EXCEPTION WHEN OTHERS THEN failed=true;END;
 IF NOT failed THEN RAISE EXCEPTION 'Frozen proposal editable'; END IF;
 IF public.variation_sign_verified(tok,'bad','TEST CUSTOMER',repeat('a',64),true)->>'success'<>'false' THEN RAISE EXCEPTION 'Malformed PNG accepted'; END IF;
 r=public.variation_workflow_commit('evidence',actor,oid,vid,0,jsonb_build_object('id',evid,'pdf_path',cid::text||'/'||oid::text||'/'||vid::text||'/evidence/'||evid::text||'.pdf','file_name','TEST signed.pdf','file_size',100,'document_hash',repeat('c',64),'proposal_hash',repeat('a',64)));
 IF r->'variation'->>'status'<>'in_attesa' THEN RAISE EXCEPTION 'Upload silently approves'; END IF;
 r=public.variation_workflow_commit('approve_offline',actor,oid,vid,0,jsonb_build_object('evidence_id',evid,'signer_name','TEST CUSTOMER','signed_on',(now() AT TIME ZONE 'Europe/Rome')::date,'confirmed',true));
 IF r->'variation'->>'status'<>'approvato' OR r->'variation'->>'approval_channel'<>'offline' OR r->'variation'->>'firmato_il' IS NOT NULL THEN RAISE EXCEPTION 'Bad offline approval'; END IF;
 PERFORM public.variation_workflow_commit('approve_offline',actor,oid,vid,0,jsonb_build_object('evidence_id',evid,'signer_name','TEST CUSTOMER','signed_on',(now() AT TIME ZONE 'Europe/Rome')::date,'confirmed',true));
 IF (SELECT total_amount FROM public.orders WHERE id=oid) IS DISTINCT FROM before_net THEN RAISE EXCEPTION 'Base contract double increased'; END IF;
 IF public.odv_view_by_token(tok)->>'valid'<>'false' THEN RAISE EXCEPTION 'Offline approval keeps token active'; END IF;
 IF has_function_privilege('anon','public.odv_sign_with_token(text,text,text)','execute') OR has_function_privilege('authenticated','public.variation_workflow_commit(text,uuid,uuid,uuid,integer,jsonb)','execute') THEN RAISE EXCEPTION 'Public mutation bypass'; END IF;
 -- Positive online signature, refusal and expiry: synthetic proposals, still rolled back.
 vid=gen_random_uuid();tok=gen_random_uuid()::text;
 INSERT INTO public.ordini_variazione(id,order_id,company_id,numero_odv,titolo,descrizione,impatto_economico,impatto_giorni,status,created_by,firma_token,link_expires_at)
 SELECT vid,oid,cid,max(numero_odv)+1,'TEST ROLLBACK','Fictitious work',10,0,'in_attesa',actor,tok,now()+interval '1 day' FROM public.ordini_variazione WHERE order_id=oid;
 r=public.odv_view_by_token(tok);
 IF public.variation_sign_verified(tok,'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWZkAAAAASUVORK5CYII=','TEST CUSTOMER',r->>'document_hash',false)->>'success'<>'false' THEN RAISE EXCEPTION 'Missing consent accepted'; END IF;
 IF public.variation_sign_verified(tok,'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWZkAAAAASUVORK5CYII=','TEST CUSTOMER',r->>'document_hash',true)->>'success'<>'true' THEN RAISE EXCEPTION 'Valid online signature failed'; END IF;
 IF public.variation_sign_verified(tok,'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWZkAAAAASUVORK5CYII=','TEST CUSTOMER',r->>'document_hash',true)->>'success'<>'false' THEN RAISE EXCEPTION 'Double signature accepted'; END IF;
 IF (SELECT total_amount FROM public.orders WHERE id=oid) IS DISTINCT FROM before_net THEN RAISE EXCEPTION 'Online signature double increases base'; END IF;
 vid=gen_random_uuid();tok=gen_random_uuid()::text;
 INSERT INTO public.ordini_variazione(id,order_id,company_id,numero_odv,titolo,descrizione,impatto_economico,impatto_giorni,status,created_by,firma_token,link_expires_at)
 SELECT vid,oid,cid,max(numero_odv)+1,'TEST ROLLBACK','Fictitious work',10,0,'in_attesa',actor,tok,now()+interval '1 day' FROM public.ordini_variazione WHERE order_id=oid;
 IF public.odv_reject_with_token(tok,'TEST CUSTOMER')->>'success'<>'true' THEN RAISE EXCEPTION 'Refusal failed'; END IF;
 UPDATE public.ordini_variazione SET link_expires_at=now()-interval '1 day' WHERE id=vid;
 IF public.odv_view_by_token(tok)->>'valid'<>'false' THEN RAISE EXCEPTION 'Expired link accessible'; END IF;
 vid=gen_random_uuid();doc=gen_random_uuid();ctx=ctx||jsonb_build_object('currentNet',base_net+60);terms=terms||jsonb_build_object('impatto_economico',-(base_net+100));
 PERFORM public.variation_workflow_commit('save',actor,oid,vid,0,jsonb_build_object('content',content||'{"kind":"riduzione"}','context',ctx,'terms',terms));
 failed=false;BEGIN PERFORM public.variation_workflow_commit('document',actor,oid,vid,1,jsonb_build_object('id',doc,'pdf_path',cid::text||'/'||oid::text||'/'||vid::text||'/'||doc::text||'/proposal.pdf','pdf_name','TEST.pdf','pdf_size',100,'document_hash',repeat('a',64),'public_terms',terms));EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE '%riduzione%' THEN RAISE;END IF;failed=true;END;
 IF NOT failed THEN RAISE EXCEPTION 'Reduction exceeds contract';END IF;
 IF has_table_privilege('anon','public.order_variation_workspaces','SELECT') OR has_table_privilege('authenticated','public.order_variation_documents','UPDATE') THEN RAISE EXCEPTION 'Private document permissions';END IF;
END $$;
ROLLBACK;
