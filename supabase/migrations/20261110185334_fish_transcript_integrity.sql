-- Fresh reconstruction only: production already applied these recovered files.
-- Markers are created only where a recovered patch precedes its actual dependencies.
set local lock_timeout='3s';
set local statement_timeout='60s';
create schema if not exists private;
create table if not exists private.recovered_dependency_patches(id text primary key);
alter table private.recovered_dependency_patches enable row level security;
revoke all on private.recovered_dependency_patches from public,anon,authenticated,service_role;
DO $defer_recovered_7$ BEGIN IF to_regclass('public.ticket_ai_conversations') is not null THEN
-- Phone conversations can exceed 500 turns; retain the complete signed transcript.
ALTER TABLE public.ticket_ai_conversations DROP CONSTRAINT ticket_ai_conversations_transcript_check;
ALTER TABLE public.ticket_ai_conversations ADD CONSTRAINT ticket_ai_conversations_transcript_check CHECK(jsonb_typeof(transcript)='array' AND jsonb_array_length(transcript)<=10000);

-- A partial speech recognition hypothesis is not a final consent.
CREATE OR REPLACE FUNCTION public.fish_create_trial_ticket(p_company uuid,p_agent uuid,p_user uuid,p_trial uuid,p_problem text) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE trial ai_fish_crm_trials; customer profiles; new_ticket uuid; intervention_address text; title text; spoken jsonb; consent text; consent_final boolean;
BEGIN
 SELECT * INTO trial FROM ai_fish_crm_trials WHERE id=p_trial AND company_id=p_company AND agent_id=p_agent AND requested_by=p_user FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Prova non autorizzata'; END IF;
 IF trial.ticket_id IS NOT NULL THEN RETURN jsonb_build_object('creato',true,'ticket_id',trial.ticket_id,'customer_id',trial.customer_id,'already_created',true); END IF;
 IF trial.expires_at<now() OR trial.identity_verified_at IS NULL THEN RAISE EXCEPTION 'Conferma prima nome e indirizzo'; END IF;
 SELECT transcript INTO spoken FROM ticket_ai_conversations WHERE company_id=p_company AND agent_id=p_agent AND crm_trial_id=p_trial AND source_kind='crm_trial' ORDER BY created_at DESC,id DESC LIMIT 1;
 SELECT item->>'text',(item->>'final')::boolean INTO consent,consent_final FROM jsonb_array_elements(coalesce(spoken,'[]'::jsonb)) WITH ORDINALITY x(item,pos) WHERE item->>'role'='user' ORDER BY pos DESC LIMIT 1;
 IF consent_final IS DISTINCT FROM true OR consent IS NULL OR consent !~* '\y(si|sì|confermo|proceda|apra|va bene|può aprire|puo aprire)\y' OR consent ~* '\yno\y|non[[:space:]]+(apra|aprire|proceda|procedere|confermo|voglio|ancora)|aspetti|attenda|corregg|rettific|un momento' THEN RAISE EXCEPTION 'Attendi il consenso dopo il riepilogo'; END IF;
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

ELSE INSERT INTO private.recovered_dependency_patches(id) VALUES ('20261110185334_fish_transcript_integrity.sql') ON CONFLICT DO NOTHING; END IF; END $defer_recovered_7$;
