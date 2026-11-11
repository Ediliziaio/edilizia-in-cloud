CREATE INDEX IF NOT EXISTS marketing_contacts_voice_optout_phone_idx ON public.marketing_contacts(company_id,public.fish_customer_phone(phone,'IT')) WHERE optout_call OR opt_out;
-- Reuses the existing phone opt-out; email, SMS and WhatsApp consent are untouched.
CREATE FUNCTION public.fish_record_call_optout(p_company uuid,p_agent uuid,p_session text,p_reason text DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE called text; changed int;
BEGIN
 SELECT to_number INTO called FROM ai_fish_calls WHERE company_id=p_company AND agent_id=p_agent AND remote_session_id=p_session AND direction='outbound';
 IF called IS NULL OR called !~ '^\+[1-9][0-9]{6,14}$' THEN RETURN jsonb_build_object('registrato',false,'risposta','Non posso associare questa opposizione a una chiamata in uscita verificata. Non dichiarare il blocco riuscito: serve verifica manuale.'); END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_company::text||':voice-optout:'||called,0));
 UPDATE marketing_contacts SET optout_at=coalesce(optout_at,now()),optout_reason=CASE WHEN coalesce(optout_call,false) THEN optout_reason ELSE left(coalesce(nullif(trim(p_reason),''),'Richiesta esplicita di non ricevere altre telefonate'),1000) END,optout_call=true
 WHERE company_id=p_company AND deleted_at IS NULL AND fish_customer_phone(phone,'IT')=called;
 GET DIAGNOSTICS changed=ROW_COUNT;
 IF changed=0 THEN RETURN jsonb_build_object('registrato',false,'risposta','Non ho potuto registrare il blocco nella scheda. Non promettere che sia salvato o proporre altre chiamate: l’ufficio deve verificare manualmente.'); END IF;
 RETURN jsonb_build_object('registrato',true,'bloccato',true,'risposta','Richiesta di non ricevere altre telefonate registrata per questo numero nell’azienda. Le nuove chiamate Fish saranno bloccate. Gli altri canali non sono stati modificati. Chiudi senza insistere.');
END $$;
REVOKE ALL ON FUNCTION public.fish_record_call_optout(uuid,uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.fish_record_call_optout(uuid,uuid,text,text) TO service_role;

CREATE OR REPLACE FUNCTION public.fish_prepare_outbound(p_company uuid,p_agent uuid,p_phone uuid,p_to text,p_key text,p_contact uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE b public.ai_fish_agents%ROWTYPE; n public.ai_fish_numbers%ROWTYPE; c public.ai_fish_calls%ROWTYPE;
BEGIN
  IF p_key IS NULL OR length(p_key) NOT BETWEEN 8 AND 128 OR p_to !~ '^\+[1-9][0-9]{6,14}$' THEN RAISE EXCEPTION 'Tentativo o numero non valido'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_company::text||':voice-optout:'||p_to,0));
  IF EXISTS(SELECT 1 FROM marketing_contacts mc WHERE mc.company_id=p_company AND (mc.id=p_contact OR fish_customer_phone(mc.phone,'IT')=p_to) AND (coalesce(mc.optout_call,false) OR coalesce(mc.opt_out,false))) THEN RAISE EXCEPTION 'Il contatto ha chiesto di non ricevere chiamate'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_company::text||p_key,0));
  SELECT * INTO b FROM public.ai_fish_agents WHERE company_id=p_company AND agent_id=p_agent AND published AND enabled FOR SHARE;
  IF NOT FOUND OR b.real_per_min_eur IS NULL OR b.billed_per_min_eur IS NULL THEN RAISE EXCEPTION 'Agente Fish o tariffa non pronti'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.ai_agents_v2 WHERE id=p_agent AND company_id=p_company AND stato='attivo' AND tools_config->>'voice_provider'='fish_audio') THEN RAISE EXCEPTION 'Agente non attivo su Fish'; END IF;
  SELECT * INTO n FROM public.ai_fish_numbers WHERE phone_id=p_phone AND company_id=p_company AND agent_id=p_agent AND supports_outbound;
  IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM public.ai_phone_numbers_v2 WHERE id=p_phone AND company_id=p_company AND agent_id=p_agent AND attivo) THEN RAISE EXCEPTION 'Numero Fish non abilitato'; END IF;
  IF p_contact IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.marketing_contacts WHERE id=p_contact AND company_id=p_company) THEN RAISE EXCEPTION 'Contatto non appartenente all azienda'; END IF;
  SELECT * INTO c FROM public.ai_fish_calls WHERE company_id=p_company AND request_key=p_key FOR UPDATE;
  IF FOUND THEN
    IF c.agent_id<>p_agent OR c.phone_id<>p_phone OR c.to_number<>p_to OR c.contact_id IS DISTINCT FROM p_contact THEN RAISE EXCEPTION 'Chiave riutilizzata con dati diversi'; END IF;
    IF c.remote_session_id IS NULL AND c.created_at<now()-interval '23 hours' THEN RAISE EXCEPTION 'Tentativo scaduto: riconciliare prima di richiamare'; END IF;
  ELSE
    INSERT INTO public.ai_fish_calls(company_id,agent_id,phone_id,contact_id,request_key,to_number,direction,real_per_min_eur,billed_per_min_eur)
    VALUES(p_company,p_agent,p_phone,p_contact,p_key,p_to,'outbound',b.real_per_min_eur,b.billed_per_min_eur) RETURNING * INTO c;
  END IF;
  RETURN to_jsonb(c)||jsonb_build_object('fish_agent_id',b.fish_agent_id,'fish_phone_id',n.fish_phone_id,
    'from_number',(SELECT numero FROM public.ai_phone_numbers_v2 WHERE id=p_phone AND company_id=p_company));
END; $$;
REVOKE ALL ON FUNCTION public.fish_prepare_outbound(uuid,uuid,uuid,text,text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.fish_prepare_outbound(uuid,uuid,uuid,text,text,uuid) TO service_role;
