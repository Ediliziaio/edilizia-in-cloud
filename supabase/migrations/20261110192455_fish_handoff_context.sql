ALTER TABLE public.passaggi_chiamata ADD COLUMN contesto_ai jsonb CHECK(contesto_ai IS NULL OR (jsonb_typeof(contesto_ai)='object' AND octet_length(contesto_ai::text)<=12000));

CREATE OR REPLACE FUNCTION public.fish_reserve_operator(p_company uuid,p_agent uuid,p_session text,p_phone text,p_name text,p_summary text) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE destinations jsonb; v_user uuid; v_phone text; v_label text; v_name text; pass uuid; old_pass passaggi_chiamata;
BEGIN
 SELECT b.transfer_destinations INTO destinations FROM ai_fish_agents b JOIN ai_agents_v2 a ON a.id=b.agent_id AND a.company_id=b.company_id WHERE b.company_id=p_company AND b.agent_id=p_agent AND a.tools_config->'fish'->>'routing'='first_available';
 IF destinations IS NULL THEN RETURN jsonb_build_object('trovato',false,'risposta','Il passaggio al primo operatore non è configurato. Proponi un richiamo.'); END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_company::text||':fish-transfer:'||p_session,0));
 SELECT * INTO old_pass FROM passaggi_chiamata WHERE company_id=p_company AND conversation_id='fish:'||p_session ORDER BY creato_il DESC LIMIT 1;
 IF FOUND THEN
   IF old_pass.operatore_id IS NOT NULL AND old_pass.stato='in_attesa' AND old_pass.creato_il>now()-interval '2 minutes' THEN
    SELECT fish_customer_phone(op.telefono,'IT') INTO v_phone FROM operatori_presenza op WHERE op.company_id=p_company AND op.user_id=old_pass.operatore_id;
    SELECT x->>'label' INTO v_label FROM jsonb_array_elements(destinations) x WHERE x->>'phone_number'=v_phone LIMIT 1;
    IF v_label IS NOT NULL THEN RETURN jsonb_build_object('trovato',true,'numero_operatore',v_phone,'destinazione',v_label,'passaggio_id',old_pass.id,'risposta','Il collega è già stato riservato per questa chiamata. Tenta soltanto il passaggio autorizzato.'); END IF;
   END IF;
   RETURN jsonb_build_object('trovato',false,'risposta','Il tentativo di passaggio è già stato gestito. Proponi un richiamo, senza riservare un secondo collega.');
 END IF;
 SELECT op.user_id,fish_customer_phone(op.telefono,'IT'),d.value->>'label' INTO v_user,v_phone,v_label
 FROM operatori_presenza op CROSS JOIN LATERAL jsonb_array_elements(destinations) d(value)
 WHERE op.company_id=p_company AND op.disponibile AND op.ultimo_segnale>now()-interval '3 minutes'
 AND (op.occupato_fino_a IS NULL OR op.occupato_fino_a<now()) AND fish_customer_phone(op.telefono,'IT')=d.value->>'phone_number'
 AND NOT EXISTS(SELECT 1 FROM passaggi_chiamata active WHERE active.company_id=p_company AND active.operatore_id=op.user_id AND active.stato='risposto' AND active.chiuso_il IS NULL AND active.contesto_ai->>'provider'='fish_audio')
 ORDER BY op.ultimo_passaggio_at NULLS FIRST,op.ultimo_segnale DESC,op.user_id LIMIT 1 FOR UPDATE OF op SKIP LOCKED;
 IF v_user IS NULL THEN
  INSERT INTO passaggi_chiamata(company_id,nome_cliente,telefono_cliente,riassunto,stato,conversation_id) VALUES(p_company,p_name,p_phone,p_summary,'persa','fish:'||p_session) RETURNING id INTO pass;
  RETURN jsonb_build_object('trovato',false,'passaggio_id',pass,'risposta','Nessun collega configurato è libero adesso. Proponi un richiamo e non avviare un trasferimento.');
 END IF;
 SELECT trim(concat_ws(' ',first_name,last_name)) INTO v_name FROM profiles WHERE id=v_user AND company_id=p_company;
 UPDATE operatori_presenza SET occupato_fino_a=now()+interval '2 minutes',ultimo_passaggio_at=now(),aggiornato_il=now() WHERE company_id=p_company AND user_id=v_user;
 INSERT INTO passaggi_chiamata(company_id,operatore_id,nome_cliente,telefono_cliente,riassunto,stato,conversation_id) VALUES(p_company,v_user,p_name,p_phone,p_summary,'in_attesa','fish:'||p_session) RETURNING id INTO pass;
 RETURN jsonb_build_object('trovato',true,'operatore',coalesce(nullif(v_name,''),'Un collega'),'numero_operatore',v_phone,'destinazione',v_label,'passaggio_id',pass,'risposta','Un collega è libero e il contesto è pronto. Tenta il trasferimento assistito alla destinazione autorizzata; considera riuscito il passaggio soltanto dopo la conferma del sistema.');
END $$;
REVOKE ALL ON FUNCTION public.fish_reserve_operator(uuid,uuid,text,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.fish_reserve_operator(uuid,uuid,text,text,text,text) TO service_role;

CREATE FUNCTION public.fish_operator_window_open(p_config jsonb,p_now timestamptz DEFAULT now()) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=public AS $$
DECLARE hours jsonb; local_time timestamp; first_time time; last_time time; weekday int; previous_day int; days int[];
BEGIN
 hours:=p_config->'routing_hours';
 IF coalesce((hours->>'enabled')::boolean,false)=false THEN RETURN true; END IF;
 local_time:=p_now AT TIME ZONE coalesce(p_config->>'timezone','Europe/Rome');weekday:=extract(isodow FROM local_time)::int;previous_day:=CASE WHEN weekday=1 THEN 7 ELSE weekday-1 END;
 first_time:=(hours->>'start')::time;last_time:=(hours->>'end')::time;
 SELECT array_agg(value::int) INTO days FROM jsonb_array_elements_text(hours->'days');
 IF first_time IS NULL OR last_time IS NULL OR first_time=last_time OR coalesce(cardinality(days),0)=0 THEN RETURN false; END IF;
 IF first_time<last_time THEN RETURN weekday=ANY(days) AND local_time::time>=first_time AND local_time::time<last_time; END IF;
 RETURN (weekday=ANY(days) AND local_time::time>=first_time) OR (previous_day=ANY(days) AND local_time::time<last_time);
EXCEPTION WHEN OTHERS THEN RETURN false;
END $$;
REVOKE ALL ON FUNCTION public.fish_operator_window_open(jsonb,timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.fish_operator_window_open(jsonb,timestamptz) TO service_role;

CREATE FUNCTION public.fish_reserve_operator_with_context(p_company uuid,p_agent uuid,p_session text,p_phone text,p_name text,p_summary text,p_context jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE cfg jsonb; result jsonb; pass uuid;
BEGIN
 IF jsonb_typeof(p_context) IS DISTINCT FROM 'object' OR p_context->>'provider' IS DISTINCT FROM 'fish_audio' OR octet_length(p_context::text)>12000 THEN RAISE EXCEPTION 'Contesto non valido'; END IF;
 SELECT tools_config->'fish' INTO cfg FROM ai_agents_v2 WHERE id=p_agent AND company_id=p_company;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_company::text||':fish-transfer:'||p_session,0));
 IF NOT fish_operator_window_open(cfg,now()) AND NOT EXISTS(SELECT 1 FROM passaggi_chiamata WHERE company_id=p_company AND conversation_id='fish:'||p_session AND stato='in_attesa' AND creato_il>now()-interval '2 minutes') THEN
  SELECT id INTO pass FROM passaggi_chiamata WHERE company_id=p_company AND conversation_id='fish:'||p_session ORDER BY creato_il DESC LIMIT 1;
  IF pass IS NULL THEN INSERT INTO passaggi_chiamata(company_id,nome_cliente,telefono_cliente,riassunto,stato,conversation_id,contesto_ai) VALUES(p_company,p_name,p_phone,p_summary,'persa','fish:'||p_session,p_context) RETURNING id INTO pass; END IF;
  RETURN jsonb_build_object('trovato',false,'passaggio_id',pass,'motivo','fuori_orario','risposta','Il reparto non è nel suo orario di passaggio. Proponi un richiamo, senza tentare il trasferimento.');
 END IF;
 result:=fish_reserve_operator(p_company,p_agent,p_session,p_phone,p_name,p_summary);
 IF result->>'passaggio_id' IS NOT NULL THEN
  UPDATE passaggi_chiamata SET contesto_ai=p_context WHERE id=(result->>'passaggio_id')::uuid AND company_id=p_company AND conversation_id='fish:'||p_session;
 END IF;
 RETURN result||jsonb_build_object('contesto_ai',p_context);
END $$;
REVOKE ALL ON FUNCTION public.fish_reserve_operator_with_context(uuid,uuid,text,text,text,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.fish_reserve_operator_with_context(uuid,uuid,text,text,text,text,jsonb) TO service_role;

-- Staff can acknowledge only the Fish handoff assigned to them. No new company-wide access.
CREATE FUNCTION public.fish_operator_handoff_status(p_company uuid,p_handoff uuid,p_action text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE handoff passaggi_chiamata; actor uuid;
BEGIN
 actor:=(SELECT auth.uid());
 IF actor IS NULL OR (SELECT utente_bloccato()) OR NOT user_can_access_company(p_company) THEN RAISE EXCEPTION 'Operazione non autorizzata'; END IF;
 SELECT * INTO handoff FROM passaggi_chiamata WHERE id=p_handoff AND company_id=p_company AND operatore_id=actor AND contesto_ai->>'provider'='fish_audio' FOR UPDATE;
 IF NOT FOUND OR p_action NOT IN ('answer','finish','missed') THEN RAISE EXCEPTION 'Passaggio non assegnato all’operatore'; END IF;
 IF handoff.chiuso_il IS NOT NULL THEN RETURN jsonb_build_object('saved',true,'closed',true); END IF;
 IF p_action='answer' THEN
  UPDATE passaggi_chiamata SET stato='risposto' WHERE id=p_handoff;
  UPDATE operatori_presenza SET occupato_fino_a=greatest(coalesce(occupato_fino_a,now()),now()+interval '30 minutes'),aggiornato_il=now() WHERE company_id=p_company AND user_id=actor;
 ELSE
  UPDATE passaggi_chiamata SET stato=CASE WHEN p_action='missed' THEN 'persa' ELSE 'risposto' END,chiuso_il=now() WHERE id=p_handoff;
  IF NOT EXISTS(SELECT 1 FROM passaggi_chiamata WHERE company_id=p_company AND operatore_id=actor AND id<>p_handoff AND creato_il>handoff.creato_il AND stato IN ('in_attesa','risposto') AND chiuso_il IS NULL) THEN
   UPDATE operatori_presenza SET occupato_fino_a=NULL,aggiornato_il=now() WHERE company_id=p_company AND user_id=actor;
  END IF;
 END IF;
 RETURN jsonb_build_object('saved',true,'closed',p_action<>'answer');
END $$;
REVOKE ALL ON FUNCTION public.fish_operator_handoff_status(uuid,uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.fish_operator_handoff_status(uuid,uuid,text) TO authenticated;

CREATE FUNCTION public.fish_protect_handoff_context() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
BEGIN
 IF current_user IN ('anon','authenticated') THEN
  IF (TG_OP='INSERT' AND NEW.contesto_ai IS NOT NULL) OR (TG_OP='UPDATE' AND NEW.contesto_ai IS DISTINCT FROM OLD.contesto_ai) THEN RAISE EXCEPTION 'Il contesto verificato è scritto soltanto dal backend'; END IF;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.fish_protect_handoff_context() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER fish_protect_handoff_context BEFORE INSERT OR UPDATE OF contesto_ai ON public.passaggi_chiamata FOR EACH ROW EXECUTE FUNCTION public.fish_protect_handoff_context();
