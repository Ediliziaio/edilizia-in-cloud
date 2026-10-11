SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='60s';
CREATE UNIQUE INDEX IF NOT EXISTS ai_campaign_contacts_campaign_phone_unique ON public.ai_campaign_contacts(campaign_id,telefono);
CREATE OR REPLACE FUNCTION public.voice_campaign_runtime_ready() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT EXISTS(SELECT 1 FROM cron.job WHERE jobname='voice-campaign-dispatch' AND active);
$$;
REVOKE ALL ON FUNCTION public.voice_campaign_runtime_ready() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.voice_campaign_runtime_ready() TO service_role;

CREATE OR REPLACE FUNCTION public.control_voice_campaign(p_company_id uuid,p_campaign_id uuid,p_updated_at timestamptz,p_action text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE c public.ai_campaigns_v2%ROWTYPE; n integer; agent_ok boolean;
BEGIN
 IF NOT public.voice_campaign_runtime_ready() THEN RAISE EXCEPTION 'Esecutore campagne non ancora pubblicato'; END IF;
 SELECT * INTO c FROM public.ai_campaigns_v2 WHERE id=p_campaign_id AND company_id=p_company_id FOR UPDATE;
 IF NOT FOUND OR c.aggiornato_il IS DISTINCT FROM p_updated_at THEN RAISE EXCEPTION 'Campagna cambiata: ricarica prima di procedere'; END IF;
 IF p_action='pause' AND c.stato='in_corso' THEN
   UPDATE public.ai_campaigns_v2 SET stato='pausa' WHERE id=c.id;
   RETURN jsonb_build_object('paused',true);
 END IF;
 IF p_action<>'start' OR c.tipo<>'chiamata' OR c.stato NOT IN ('bozza','pausa') THEN RAISE EXCEPTION 'Azione non disponibile'; END IF;
 IF c.data_fine IS NOT NULL AND c.data_fine<now() THEN RAISE EXCEPTION 'La campagna e scaduta: aggiorna la pianificazione'; END IF;
 IF EXISTS(SELECT 1 FROM public.ai_campaign_contacts WHERE campaign_id=c.id AND stato='esito_incerto') THEN
   RAISE EXCEPTION 'Esito incerto: controlla lo storico prima di riprendere, nessuna ripetizione automatica';
 END IF;
 SELECT EXISTS(SELECT 1 FROM public.ai_agents_v2 a JOIN public.ai_phone_numbers_v2 p ON p.agent_id=a.id AND p.company_id=a.company_id
   WHERE a.id=c.agent_id AND a.company_id=p_company_id AND a.stato='attivo' AND a.elevenlabs_agent_id IS NOT NULL
    AND a.durata_max_secondi BETWEEN 30 AND 3600 AND p.attivo AND p.elevenlabs_phone_id IS NOT NULL) INTO agent_ok;
 IF NOT agent_ok THEN RAISE EXCEPTION 'Attiva un agente vocale con durata massima e numero collegato'; END IF;
 IF c.orario_inizio IS NULL OR c.orario_fine IS NULL OR c.orario_inizio>=c.orario_fine
  OR cardinality(c.giorni_settimana)=0 OR NOT c.giorni_settimana <@ ARRAY[0,1,2,3,4,5,6]
  OR NOT EXISTS(SELECT 1 FROM pg_timezone_names WHERE name=c.fuso_orario) THEN RAISE EXCEPTION 'Orari campagna non validi'; END IF;
 IF c.stato='bozza' THEN
  IF jsonb_typeof(c.metadata->'preparazione_destinatari'->'recipients') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Prepara i destinatari'; END IF;
  n:=jsonb_array_length(c.metadata->'preparazione_destinatari'->'recipients');
  IF n<1 OR n>500 THEN RAISE EXCEPTION 'Seleziona da 1 a 500 destinatari'; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_to_recordset(c.metadata->'preparazione_destinatari'->'recipients') r(contact_id uuid,nome text,telefono text)
   LEFT JOIN public.marketing_contacts m ON m.id=r.contact_id AND m.company_id=p_company_id
   WHERE m.id IS NULL OR m.deleted_at IS NOT NULL OR m.marketing_consent IS DISTINCT FROM true
    OR coalesce(m.optout_call,false) OR coalesce(m.opt_out,false) OR m.ricontatta_dopo>now()
    OR r.telefono IS DISTINCT FROM regexp_replace(regexp_replace(m.phone,'[[:space:]().-]','','g'),'^00','+')
  ) THEN RAISE EXCEPTION 'Destinatari cambiati: prepara nuovamente la lista'; END IF;
  IF EXISTS(SELECT 1 FROM public.ai_campaign_contacts WHERE campaign_id=c.id) THEN RAISE EXCEPTION 'Coda gia presente'; END IF;
  INSERT INTO public.ai_campaign_contacts(campaign_id,contact_id,nome,telefono)
    SELECT c.id,r.contact_id,r.nome,r.telefono FROM jsonb_to_recordset(c.metadata->'preparazione_destinatari'->'recipients') r(contact_id uuid,nome text,telefono text);
  UPDATE public.ai_campaigns_v2 SET totale_contatti=n WHERE id=c.id;
 END IF;
 UPDATE public.ai_campaigns_v2 SET stato='in_corso',metadata=coalesce(metadata,'{}')-'errore_esecuzione' WHERE id=c.id;
 RETURN jsonb_build_object('started',true);
END;
$$;
REVOKE ALL ON FUNCTION public.control_voice_campaign(uuid,uuid,timestamptz,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.control_voice_campaign(uuid,uuid,timestamptz,text) TO service_role;

CREATE OR REPLACE FUNCTION public.claim_voice_campaign_contact() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE c public.ai_campaigns_v2%ROWTYPE; r public.ai_campaign_contacts%ROWTYPE; token uuid:=gen_random_uuid();
BEGIN
 IF NOT public.voice_campaign_runtime_ready() THEN RETURN NULL; END IF;
 -- Never retry a stranded/ambiguous attempt. Pause it for human verification.
 UPDATE public.ai_campaigns_v2 c0 SET stato='pausa',metadata=coalesce(c0.metadata,'{}') ||
  '{"errore_esecuzione":"Chiamata senza esito: controlla lo storico. Nessuna ripetizione automatica."}'::jsonb
 WHERE c0.stato='in_corso' AND c0.id IN (SELECT r0.campaign_id FROM public.ai_campaign_contacts r0
   WHERE r0.stato IN ('prenotata','in_chiamata') AND r0.ultimo_tentativo_il<now()-interval '75 minutes' LIMIT 50);
 UPDATE public.ai_campaigns_v2 SET stato='pausa',metadata=coalesce(metadata,'{}') ||
  '{"errore_esecuzione":"Periodo campagna terminato: aggiorna la pianificazione prima di riprendere."}'::jsonb
 WHERE id IN (SELECT id FROM public.ai_campaigns_v2 WHERE stato='in_corso' AND data_fine<now() LIMIT 50);
 UPDATE public.ai_campaign_contacts r0 SET stato='esito_incerto' WHERE r0.stato IN ('prenotata','in_chiamata')
  AND r0.id IN (SELECT id FROM public.ai_campaign_contacts WHERE stato IN ('prenotata','in_chiamata')
    AND ultimo_tentativo_il<now()-interval '75 minutes' LIMIT 50);
 SELECT * INTO c FROM public.ai_campaigns_v2 c0 WHERE c0.stato='in_corso' AND c0.tipo='chiamata'
  AND (c0.schedulata_il IS NULL OR c0.schedulata_il<=now())
  AND (c0.data_inizio IS NULL OR c0.data_inizio<=now())
  AND (c0.data_fine IS NULL OR c0.data_fine>=now())
  AND extract(dow FROM now() AT TIME ZONE c0.fuso_orario)::integer=ANY(c0.giorni_settimana)
  AND (now() AT TIME ZONE c0.fuso_orario)::time>=c0.orario_inizio
  AND (now() AT TIME ZONE c0.fuso_orario)::time<c0.orario_fine
  AND NOT EXISTS(SELECT 1 FROM public.ai_campaign_contacts r0 JOIN public.ai_campaigns_v2 other ON other.id=r0.campaign_id
    WHERE other.company_id=c0.company_id AND r0.stato IN ('prenotata','in_chiamata','esito_incerto'))
  AND EXISTS(SELECT 1 FROM public.ai_campaign_contacts r0 WHERE r0.campaign_id=c0.id AND r0.stato='in_coda')
  ORDER BY c0.aggiornato_il,c0.id LIMIT 1 FOR UPDATE SKIP LOCKED;
 IF NOT FOUND THEN RETURN NULL; END IF;
 -- Company advisory lock closes the race between two different campaigns of the same tenant.
 IF NOT pg_try_advisory_xact_lock(hashtextextended('voice-campaign:'||c.company_id,0)) THEN RETURN NULL; END IF;
 IF EXISTS(SELECT 1 FROM public.ai_campaign_contacts r0 JOIN public.ai_campaigns_v2 other ON other.id=r0.campaign_id
    WHERE other.company_id=c.company_id AND r0.stato IN ('prenotata','in_chiamata','esito_incerto')) THEN RETURN NULL; END IF;
 SELECT * INTO r FROM public.ai_campaign_contacts WHERE campaign_id=c.id AND stato='in_coda' ORDER BY creato_il,id LIMIT 1 FOR UPDATE SKIP LOCKED;
 IF NOT FOUND THEN RETURN NULL; END IF;
 UPDATE public.ai_campaign_contacts SET stato='prenotata',tentativo_corrente=1,ultimo_tentativo_il=now(),
   metadata=coalesce(metadata,'{}')||jsonb_build_object('claim_token',token) WHERE id=r.id;
 UPDATE public.ai_campaigns_v2 SET aggiornato_il=now() WHERE id=c.id;
 RETURN jsonb_build_object('id',r.id,'campaign_id',c.id,'company_id',c.company_id,'agent_id',c.agent_id,'contact_id',r.contact_id,'claim_token',token);
END;
$$;
REVOKE ALL ON FUNCTION public.claim_voice_campaign_contact() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_voice_campaign_contact() TO service_role;

CREATE OR REPLACE FUNCTION public.begin_voice_campaign_call(p_company_id uuid,p_recipient_id uuid,p_token uuid,p_agent_id uuid,p_contact_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE n integer;
BEGIN
 UPDATE public.ai_campaign_contacts r SET stato='in_chiamata'
 FROM public.ai_campaigns_v2 c WHERE c.id=r.campaign_id AND c.company_id=p_company_id AND c.agent_id=p_agent_id
   AND c.stato='in_corso' AND r.id=p_recipient_id AND r.contact_id=p_contact_id AND r.stato='prenotata'
   AND r.metadata->>'claim_token'=p_token::text
   AND EXISTS(SELECT 1 FROM public.marketing_contacts m WHERE m.id=p_contact_id AND m.company_id=p_company_id
     AND m.deleted_at IS NULL AND m.marketing_consent=true AND NOT coalesce(m.optout_call,false)
     AND NOT coalesce(m.opt_out,false) AND (m.ricontatta_dopo IS NULL OR m.ricontatta_dopo<=now()))
   AND (c.data_fine IS NULL OR c.data_fine>=now()) AND (c.data_inizio IS NULL OR c.data_inizio<=now())
   AND extract(dow FROM now() AT TIME ZONE c.fuso_orario)::integer=ANY(c.giorni_settimana)
   AND (now() AT TIME ZONE c.fuso_orario)::time>=c.orario_inizio AND (now() AT TIME ZONE c.fuso_orario)::time<c.orario_fine;
 GET DIAGNOSTICS n=ROW_COUNT; RETURN n=1;
END;
$$;
REVOKE ALL ON FUNCTION public.begin_voice_campaign_call(uuid,uuid,uuid,uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.begin_voice_campaign_call(uuid,uuid,uuid,uuid,uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.finish_voice_campaign_attempt(p_recipient_id uuid,p_token uuid,p_state text,p_conversation_id text DEFAULT NULL,p_note text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE campaign uuid;
BEGIN
 IF p_state NOT IN ('in_chiamata','fallita','escluso','esito_incerto','in_coda') THEN RAISE EXCEPTION 'Esito non valido'; END IF;
 UPDATE public.ai_campaign_contacts SET stato=p_state,note=left(p_note,500),
   metadata=coalesce(metadata,'{}')||jsonb_build_object('conversation_id',p_conversation_id)
 WHERE id=p_recipient_id AND metadata->>'claim_token'=p_token::text AND stato IN ('prenotata','in_chiamata')
 RETURNING campaign_id INTO campaign;
  IF campaign IS NULL THEN RETURN; END IF;
 IF p_state='in_chiamata' AND p_conversation_id IS NOT NULL THEN
  -- Provider webhook can arrive before the outbound placeholder was inserted.
  -- Link an already-settled record as well: the trigger reconciles it immediately.
  UPDATE public.ai_agent_conversations v SET metadata=coalesce(v.metadata,'{}') ||
   jsonb_build_object('campaign_recipient_id',p_recipient_id,'campaign_claim_token',p_token)
  FROM public.ai_campaigns_v2 c JOIN public.ai_campaign_contacts r ON r.campaign_id=c.id
  WHERE r.id=p_recipient_id AND c.id=campaign AND v.company_id=c.company_id AND v.agent_v2_id=c.agent_id
   AND v.elevenlabs_conversation_id=p_conversation_id;
 END IF;
 IF p_state IN ('esito_incerto','in_coda') THEN
  UPDATE public.ai_campaigns_v2 SET stato='pausa',metadata=coalesce(metadata,'{}')||jsonb_build_object('errore_esecuzione',left(p_note,500)) WHERE id=campaign;
 END IF;
 UPDATE public.ai_campaigns_v2 SET
  chiamate_effettuate=(SELECT count(*) FROM public.ai_campaign_contacts WHERE campaign_id=campaign AND metadata->>'conversation_id' IS NOT NULL),
  contatti_falliti=(SELECT count(*) FROM public.ai_campaign_contacts WHERE campaign_id=campaign AND stato='fallita')
 WHERE id=campaign;
 IF NOT EXISTS(SELECT 1 FROM public.ai_campaign_contacts WHERE campaign_id=campaign AND stato IN ('in_coda','prenotata','in_chiamata','esito_incerto')) THEN
  UPDATE public.ai_campaigns_v2 SET stato='completata',completata_il=now() WHERE id=campaign;
 END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.finish_voice_campaign_attempt(uuid,uuid,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.finish_voice_campaign_attempt(uuid,uuid,text,text,text) TO service_role;

-- A settled conversation completes the queue in the same billing transaction.
CREATE OR REPLACE FUNCTION public.voice_campaign_conversation_settled() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE campaign uuid;
BEGIN
 IF NEW.metadata->>'voice_billing_settled' IS DISTINCT FROM 'true' OR
    NEW.metadata->>'campaign_recipient_id' IS NULL THEN RETURN NEW; END IF;
 UPDATE public.ai_campaign_contacts r SET stato=CASE WHEN NEW.status='completed' THEN 'completata' ELSE 'fallita' END,
   risposta=NEW.status='completed',durata_secondi=NEW.duration_seconds,
   metadata=coalesce(r.metadata,'{}')||jsonb_build_object('conversation_id',NEW.elevenlabs_conversation_id,'provider_status',NEW.status,'cost',(
    SELECT cost_billed_total FROM public.ai_credit_usage WHERE conversation_id=NEW.id LIMIT 1))
 FROM public.ai_campaigns_v2 c WHERE c.id=r.campaign_id AND c.company_id=NEW.company_id AND c.agent_id=NEW.agent_v2_id
   AND r.id::text=NEW.metadata->>'campaign_recipient_id' AND r.metadata->>'claim_token'=NEW.metadata->>'campaign_claim_token'
   AND r.stato IN ('prenotata','in_chiamata','esito_incerto') RETURNING c.id INTO campaign;
 IF campaign IS NULL THEN RETURN NEW; END IF;
 UPDATE public.ai_campaigns_v2 SET
  chiamate_effettuate=(SELECT count(*) FROM public.ai_campaign_contacts WHERE campaign_id=campaign AND metadata->>'conversation_id' IS NOT NULL),
  chiamate_completate=(SELECT count(*) FROM public.ai_campaign_contacts WHERE campaign_id=campaign AND stato='completata'),
  chiamate_no_risposta=(SELECT count(*) FROM public.ai_campaign_contacts WHERE campaign_id=campaign AND metadata->>'provider_status' IN ('no_answer','busy','voicemail')),
  contatti_falliti=(SELECT count(*) FROM public.ai_campaign_contacts WHERE campaign_id=campaign AND stato='fallita'),
  crediti_utilizzati=(SELECT coalesce(sum((metadata->>'cost')::numeric),0) FROM public.ai_campaign_contacts WHERE campaign_id=campaign)
  WHERE id=campaign;
 UPDATE public.ai_campaigns_v2 SET tasso_risposta=CASE WHEN chiamate_effettuate>0
  THEN chiamate_completate::numeric/chiamate_effettuate*100 ELSE 0 END WHERE id=campaign;
 IF NOT EXISTS(SELECT 1 FROM public.ai_campaign_contacts WHERE campaign_id=campaign AND stato IN ('in_coda','prenotata','in_chiamata','esito_incerto')) THEN
  UPDATE public.ai_campaigns_v2 SET stato='completata',completata_il=now() WHERE id=campaign;
 END IF;
 RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.voice_campaign_conversation_settled() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS voice_campaign_settled ON public.ai_agent_conversations;
CREATE TRIGGER voice_campaign_settled AFTER UPDATE OF metadata ON public.ai_agent_conversations FOR EACH ROW
 WHEN (NEW.metadata->>'voice_billing_settled'='true') EXECUTE FUNCTION public.voice_campaign_conversation_settled();

-- Created paused. Activation is a separate step AFTER the new worker has deployed.
DO $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM cron.job WHERE jobname='voice-campaign-dispatch') THEN
  PERFORM cron.schedule('voice-campaign-dispatch','* * * * *', $job$
   SELECT net.http_post(url:='https://rsbrguhkodgnqfomrevo.supabase.co/functions/v1/voice-campaign-dispatch',
    headers:=jsonb_build_object('Content-Type','application/json','x-cron-secret',
      (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='cron_secret')),
    body:='{}'::jsonb,timeout_milliseconds:=15000);
  $job$);
  PERFORM cron.alter_job(job_id:=(SELECT jobid FROM cron.job WHERE jobname='voice-campaign-dispatch'),active:=false);
 END IF;
END;
$$;
