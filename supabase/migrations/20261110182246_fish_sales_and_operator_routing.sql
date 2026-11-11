CREATE TABLE public.ai_fish_opportunity_outcomes (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
 call_id uuid NOT NULL REFERENCES ai_fish_calls(id), opportunity_id uuid NOT NULL REFERENCES marketing_opportunities(id),
 outcome text NOT NULL CHECK(outcome IN ('interessato','da_richiamare','non_interessato','numero_errato')),
 note text NOT NULL, next_action text, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(company_id,call_id)
);
ALTER TABLE public.ai_fish_opportunity_outcomes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ai_fish_opportunity_outcomes FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.ai_fish_opportunity_outcomes TO authenticated;
GRANT ALL ON public.ai_fish_opportunity_outcomes TO service_role;
CREATE POLICY fish_opportunity_outcome_read ON public.ai_fish_opportunity_outcomes FOR SELECT TO authenticated USING(
 NOT (SELECT public.utente_bloccato()) AND EXISTS(SELECT 1 FROM marketing_opportunities o WHERE o.id=opportunity_id AND o.company_id=ai_fish_opportunity_outcomes.company_id)
);
CREATE INDEX fish_opportunity_outcome_opportunity_idx ON public.ai_fish_opportunity_outcomes(company_id,opportunity_id,created_at);
CREATE FUNCTION public.fish_save_opportunity_outcome(p_company uuid,p_agent uuid,p_session text,p_outcome text,p_note text,p_next_action text,p_confirmed boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE c ai_fish_calls; ids uuid[]; previous ai_fish_opportunity_outcomes;
BEGIN
 IF p_confirmed IS DISTINCT FROM true THEN RETURN jsonb_build_object('aggiornata',false,'risposta','Prima riepiloga l’esito e chiedi conferma.'); END IF;
 IF p_outcome NOT IN ('interessato','da_richiamare','non_interessato','numero_errato') OR length(trim(p_note)) NOT BETWEEN 8 AND 2000 OR length(coalesce(p_next_action,''))>500 THEN RAISE EXCEPTION 'Esito non valido'; END IF;
 SELECT * INTO c FROM ai_fish_calls WHERE company_id=p_company AND agent_id=p_agent AND remote_session_id=p_session AND direction='outbound' FOR UPDATE;
 IF NOT FOUND OR c.contact_id IS NULL THEN RETURN jsonb_build_object('aggiornata',false,'risposta','La chiamata non è collegata a un contatto commerciale autorizzato. Serve una verifica dell’ufficio.'); END IF;
 SELECT * INTO previous FROM ai_fish_opportunity_outcomes WHERE company_id=p_company AND call_id=c.id;
 IF FOUND THEN RETURN jsonb_build_object('aggiornata',true,'already_saved',true,'opportunity_id',previous.opportunity_id,'risposta','L’esito di questa chiamata è già stato registrato. Nessun secondo aggiornamento.'); END IF;
 IF NOT EXISTS(SELECT 1 FROM marketing_contacts mc WHERE mc.id=c.contact_id AND mc.company_id=p_company AND mc.deleted_at IS NULL AND fish_customer_phone(mc.phone,mc.country)=c.to_number) THEN RETURN jsonb_build_object('aggiornata',false,'risposta','Il recapito della scheda è cambiato o non coincide: non aggiorno l’opportunità.'); END IF;
 SELECT array_agg(id) INTO ids FROM marketing_opportunities WHERE company_id=p_company AND contact_id=c.contact_id AND status='open' AND deleted_at IS NULL;
 IF coalesce(cardinality(ids),0)<>1 THEN RETURN jsonb_build_object('aggiornata',false,'risposta','Non c’è una sola opportunità aperta per questo contatto. L’ufficio deve scegliere la pratica corretta.'); END IF;
 UPDATE marketing_opportunities SET notes=concat_ws(E'\n\n',nullif(notes,''),'[Telefonata assistente AI · '||p_outcome||'] '||trim(p_note)),
 next_action=coalesce(nullif(trim(p_next_action),''),next_action),last_activity_at=now(),updated_at=now() WHERE id=ids[1] AND company_id=p_company;
 INSERT INTO ai_fish_opportunity_outcomes(company_id,call_id,opportunity_id,outcome,note,next_action) VALUES(p_company,c.id,ids[1],p_outcome,trim(p_note),nullif(trim(p_next_action),''));
 RETURN jsonb_build_object('aggiornata',true,'opportunity_id',ids[1],'risposta','Ho salvato l’esito e il prossimo passo nell’opportunità. Fase, importo e stato commerciale non sono stati modificati.');
END $$;
REVOKE ALL ON FUNCTION public.fish_save_opportunity_outcome(uuid,uuid,text,text,text,text,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.fish_save_opportunity_outcome(uuid,uuid,text,text,text,text,boolean) TO service_role;

-- The published destinations are an allowlist, not numbers supplied by the model.
CREATE FUNCTION public.fish_reserve_operator(p_company uuid,p_agent uuid,p_session text,p_phone text,p_name text,p_summary text) RETURNS jsonb
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
