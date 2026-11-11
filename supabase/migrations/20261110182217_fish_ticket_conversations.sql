-- Spoken AI conversations attached to support tickets; no audio recording enabled.
CREATE TABLE public.ticket_ai_conversations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
 ticket_id uuid REFERENCES public.tickets(id) ON DELETE CASCADE,
 agent_id uuid NOT NULL,
 source_kind text NOT NULL CHECK(source_kind IN ('crm_trial','phone')),
 source_key text NOT NULL CHECK(length(source_key) BETWEEN 1 AND 300),
 crm_trial_id uuid REFERENCES public.ai_fish_crm_trials(id) ON DELETE CASCADE,
 remote_session_id text,
 conversation_id uuid REFERENCES public.ai_conversations_v2(id) ON DELETE SET NULL,
 transcript jsonb NOT NULL DEFAULT '[]'::jsonb CHECK(jsonb_typeof(transcript)='array' AND jsonb_array_length(transcript)<=500),
 revision bigint NOT NULL DEFAULT 0 CHECK(revision>=0),
 summary text,
 status text NOT NULL DEFAULT 'in_corso' CHECK(status IN ('in_corso','completata','non_disponibile')),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(company_id,source_kind,source_key),
 FOREIGN KEY(company_id,agent_id) REFERENCES public.ai_agents_v2(company_id,id) ON DELETE CASCADE,
 CHECK((source_kind='crm_trial' AND crm_trial_id IS NOT NULL) OR (source_kind='phone' AND remote_session_id IS NOT NULL))
);
CREATE INDEX ticket_ai_conversations_ticket_idx ON public.ticket_ai_conversations(company_id,ticket_id,created_at) WHERE ticket_id IS NOT NULL;
CREATE INDEX ticket_ai_conversations_trial_idx ON public.ticket_ai_conversations(company_id,crm_trial_id);
CREATE INDEX ticket_ai_conversations_session_idx ON public.ticket_ai_conversations(company_id,remote_session_id) WHERE remote_session_id IS NOT NULL;
ALTER TABLE public.ticket_ai_conversations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ticket_ai_conversations FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.ticket_ai_conversations TO authenticated;
GRANT ALL ON public.ticket_ai_conversations TO service_role;
CREATE POLICY ticket_ai_conversation_read ON public.ticket_ai_conversations FOR SELECT TO authenticated USING (
 NOT (SELECT public.utente_bloccato()) AND EXISTS(SELECT 1 FROM public.tickets t WHERE t.id=ticket_id AND t.company_id=ticket_ai_conversations.company_id)
);
COMMENT ON TABLE public.ticket_ai_conversations IS 'Spoken text from a scoped web trial or signed phone events. Read access follows the linked ticket RLS; never stores credentials or tool payloads.';

CREATE FUNCTION public.fish_save_crm_transcript(p_company uuid,p_agent uuid,p_user uuid,p_trial uuid,p_key text,p_revision bigint,p_transcript jsonb,p_completed boolean DEFAULT false) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE trial ai_fish_crm_trials; saved uuid;
BEGIN
 SELECT * INTO trial FROM ai_fish_crm_trials WHERE id=p_trial AND company_id=p_company AND agent_id=p_agent AND requested_by=p_user;
 IF NOT FOUND OR trial.expires_at<now() THEN RAISE EXCEPTION 'Prova scaduta o non autorizzata'; END IF;
 IF p_revision<1 OR jsonb_typeof(p_transcript)<>'array' OR jsonb_array_length(p_transcript)>500 OR octet_length(p_transcript::text)>250000 THEN RAISE EXCEPTION 'Trascrizione non valida'; END IF;
 UPDATE ticket_ai_conversations SET transcript=p_transcript,revision=p_revision,ticket_id=trial.ticket_id,
 status=CASE WHEN p_completed THEN 'completata' ELSE status END,updated_at=now()
 WHERE company_id=p_company AND agent_id=p_agent AND crm_trial_id=p_trial AND source_kind='crm_trial' AND source_key=p_key AND revision<p_revision RETURNING id INTO saved;
 IF saved IS NULL AND NOT EXISTS(SELECT 1 FROM ticket_ai_conversations WHERE company_id=p_company AND agent_id=p_agent AND crm_trial_id=p_trial AND source_key=p_key AND source_kind='crm_trial') THEN RAISE EXCEPTION 'Conversazione non appartenente alla prova'; END IF;
 RETURN jsonb_build_object('saved',true,'ticket_id',trial.ticket_id);
END $$;
REVOKE ALL ON FUNCTION public.fish_save_crm_transcript(uuid,uuid,uuid,uuid,text,bigint,jsonb,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.fish_save_crm_transcript(uuid,uuid,uuid,uuid,text,bigint,jsonb,boolean) TO service_role;

CREATE OR REPLACE FUNCTION public.fish_create_trial_ticket(p_company uuid,p_agent uuid,p_user uuid,p_trial uuid,p_problem text) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE trial ai_fish_crm_trials; customer profiles; new_ticket uuid; intervention_address text; title text; spoken jsonb; consent text;
BEGIN
 SELECT * INTO trial FROM ai_fish_crm_trials WHERE id=p_trial AND company_id=p_company AND agent_id=p_agent AND requested_by=p_user FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Prova non autorizzata'; END IF;
 IF trial.ticket_id IS NOT NULL THEN RETURN jsonb_build_object('creato',true,'ticket_id',trial.ticket_id,'customer_id',trial.customer_id,'already_created',true); END IF;
 IF trial.expires_at<now() OR trial.identity_verified_at IS NULL THEN RAISE EXCEPTION 'Conferma prima nome e indirizzo'; END IF;
 SELECT transcript INTO spoken FROM ticket_ai_conversations WHERE company_id=p_company AND agent_id=p_agent AND crm_trial_id=p_trial AND source_kind='crm_trial' ORDER BY created_at DESC,id DESC LIMIT 1;
 SELECT item->>'text' INTO consent FROM jsonb_array_elements(coalesce(spoken,'[]'::jsonb)) WITH ORDINALITY x(item,pos) WHERE item->>'role'='user' ORDER BY pos DESC LIMIT 1;
 IF consent IS NULL OR consent !~* '\y(si|sì|confermo|proceda|apra|va bene|può aprire|puo aprire)\y' OR consent ~* '\yno\y|non[[:space:]]+(apra|aprire|proceda|procedere|confermo|voglio|ancora)|aspetti|attenda|corregg|rettific|un momento' THEN RAISE EXCEPTION 'Attendi il consenso dopo il riepilogo'; END IF;
 IF length(trim(p_problem))<8 OR length(p_problem)>2000 THEN RAISE EXCEPTION 'Descrizione non valida'; END IF;
 SELECT * INTO customer FROM profiles p WHERE p.id=trial.customer_id AND p.company_id=p_company AND p.deleted_at IS NULL AND p.updated_at=trial.customer_updated_at AND fish_customer_phone(p.phone,p.country)=trial.caller_phone AND EXISTS(SELECT 1 FROM user_roles r WHERE r.user_id=p.id AND r.role='customer');
 IF NOT FOUND THEN RAISE EXCEPTION 'Scheda modificata: ricomincia la verifica'; END IF;
 IF (fish_match_customer(p_company,trial.caller_phone)->>'count')::int<>1 THEN RAISE EXCEPTION 'Numero non univoco'; END IF;
 intervention_address:=trim(concat_ws(', ',coalesce(nullif(customer.site_address,''),customer.address),coalesce(nullif(customer.site_city,''),customer.city)));
 title:='[COLLAUDO AI] Assistenza — '||customer.first_name||' '||customer.last_name;
 INSERT INTO tickets(company_id,customer_id,created_by,subject,titolo,descrizione,indirizzo_intervento,status,priority,priorita,fonte,tipo)
 VALUES(p_company,customer.id,p_user,title,title,'COLLAUDO del centralino AI: nessun intervento da programmare automaticamente.'||E'\n\n'||trim(p_problem)||E'\n\nIndirizzo confermato: '||intervention_address,intervention_address,'aperto','normale','media','api','supporto') RETURNING id INTO new_ticket;
 UPDATE ai_fish_crm_trials SET ticket_id=new_ticket WHERE id=p_trial;
 UPDATE ticket_ai_conversations SET ticket_id=new_ticket,updated_at=now() WHERE company_id=p_company AND crm_trial_id=p_trial AND agent_id=p_agent;
 RETURN jsonb_build_object('creato',true,'ticket_id',new_ticket,'customer_id',customer.id,'already_created',false);
END $$;

CREATE FUNCTION public.fish_link_ticket_conversation(p_company uuid,p_agent uuid,p_session text,p_ticket uuid) RETURNS void
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM tickets WHERE company_id=p_company AND id=p_ticket) THEN RAISE EXCEPTION 'Ticket non appartenente all’azienda'; END IF;
 INSERT INTO ticket_ai_conversations(company_id,ticket_id,agent_id,source_kind,source_key,remote_session_id,conversation_id,transcript,summary,status)
 SELECT p_company,p_ticket,p_agent,'phone',p_session||':'||p_ticket::text,p_session,c.id,coalesce(v.trascrizione_json,'[]'::jsonb),v.riassunto,CASE WHEN v.terminata_il IS NULL THEN 'in_corso' ELSE 'completata' END
 FROM (SELECT 1) seed LEFT JOIN ai_fish_calls c ON c.company_id=p_company AND c.agent_id=p_agent AND c.remote_session_id=p_session LEFT JOIN ai_conversations_v2 v ON v.id=c.id AND v.company_id=p_company
 ON CONFLICT(company_id,source_kind,source_key) DO NOTHING;
END $$;
REVOKE ALL ON FUNCTION public.fish_link_ticket_conversation(uuid,uuid,text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.fish_link_ticket_conversation(uuid,uuid,text,uuid) TO service_role;

CREATE FUNCTION public.fish_ticket_transcript_mirror() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 UPDATE ticket_ai_conversations tc SET transcript=CASE WHEN jsonb_typeof(NEW.trascrizione_json)='array' THEN NEW.trascrizione_json ELSE tc.transcript END,
 summary=coalesce(NEW.riassunto,tc.summary),conversation_id=NEW.id,status=CASE WHEN NEW.terminata_il IS NOT NULL THEN 'completata' ELSE tc.status END,updated_at=now()
 FROM ai_fish_calls c WHERE c.id=NEW.id AND c.company_id=NEW.company_id AND tc.company_id=NEW.company_id AND tc.source_kind='phone' AND tc.remote_session_id=c.remote_session_id;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.fish_ticket_transcript_mirror() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER fish_ticket_transcript_mirror AFTER INSERT OR UPDATE OF trascrizione_json,riassunto,terminata_il ON public.ai_conversations_v2 FOR EACH ROW EXECUTE FUNCTION public.fish_ticket_transcript_mirror();

-- Earlier web trials did not retain their transcript: show that honestly, do not reconstruct it.
INSERT INTO public.ticket_ai_conversations(company_id,ticket_id,agent_id,source_kind,source_key,crm_trial_id,status)
SELECT tr.company_id,tr.ticket_id,tr.agent_id,'crm_trial','legacy:'||tr.id::text,tr.id,'non_disponibile'
FROM public.ai_fish_crm_trials tr JOIN public.tickets t ON t.id=tr.ticket_id AND t.company_id=tr.company_id WHERE tr.ticket_id IS NOT NULL
ON CONFLICT(company_id,source_kind,source_key) DO NOTHING;
