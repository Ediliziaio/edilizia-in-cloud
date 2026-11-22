-- One support journey per verified Fish phone session; no second executor.
-- Writes remain service-only. Reads follow company, ticket and calendar permissions.
CREATE TABLE public.ai_fish_assistance (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
 agent_id uuid NOT NULL,
 session_id text NOT NULL CHECK(length(session_id) BETWEEN 1 AND 256),
 task_id uuid NOT NULL UNIQUE REFERENCES public.silvio_task(id) ON DELETE CASCADE,
 calendar_id uuid REFERENCES public.marketing_calendars(id) ON DELETE SET NULL,
 customer_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
 customer_updated_at timestamptz,
 identity_verified_at timestamptz,
 ticket_id uuid REFERENCES public.tickets(id) ON DELETE SET NULL,
 ticket_action text CHECK(ticket_action IN ('created','updated')),
 appointment_id uuid REFERENCES public.appointments(id) ON DELETE SET NULL,
 stage text NOT NULL DEFAULT 'identifying' CHECK(stage IN ('identifying','awaiting_ticket','awaiting_appointment','scheduled','needs_office')),
 reason text CHECK(reason IN ('identity','calendar','declined','no_slots','booking','call_ended','operator','callback')),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(company_id,agent_id,session_id),
 FOREIGN KEY(company_id,agent_id) REFERENCES public.ai_agents_v2(company_id,id) ON DELETE CASCADE
);
CREATE INDEX fish_assistance_recent_idx ON public.ai_fish_assistance(company_id,updated_at DESC,id);
CREATE INDEX fish_assistance_agent_idx ON public.ai_fish_assistance(agent_id);
CREATE INDEX fish_assistance_customer_idx ON public.ai_fish_assistance(customer_id);
CREATE INDEX fish_assistance_ticket_idx ON public.ai_fish_assistance(ticket_id);
CREATE INDEX fish_assistance_appointment_idx ON public.ai_fish_assistance(appointment_id);
CREATE INDEX fish_assistance_calendar_idx ON public.ai_fish_assistance(calendar_id);
ALTER TABLE public.ai_fish_assistance ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ai_fish_assistance FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.ai_fish_assistance TO authenticated;
GRANT ALL ON public.ai_fish_assistance TO service_role;
CREATE POLICY fish_assistance_read ON public.ai_fish_assistance FOR SELECT TO authenticated USING (
 company_id=(SELECT public.get_effective_company_id()) AND NOT (SELECT public.utente_bloccato())
 AND (SELECT public.has_permission(auth.uid(),'can_view_tickets'))
 AND (ticket_id IS NULL OR EXISTS(SELECT 1 FROM public.tickets t WHERE t.id=ticket_id AND t.company_id=ai_fish_assistance.company_id))
);
COMMENT ON TABLE public.ai_fish_assistance IS 'Support journey linking a signed phone session to Silvio task, verified customer, ticket and booked appointment. Never authorizes a business action.';

CREATE FUNCTION public.fish_assistance_sync(p_case uuid) RETURNS void
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE c ai_fish_assistance;
BEGIN
 SELECT * INTO STRICT c FROM ai_fish_assistance WHERE id=p_case;
 UPDATE silvio_task SET stato=CASE c.stage WHEN 'scheduled' THEN 'completato' WHEN 'needs_office' THEN 'bloccato' ELSE 'in_corso' END,
 passo_corrente=CASE WHEN c.ticket_id IS NOT NULL THEN 2 WHEN c.identity_verified_at IS NOT NULL THEN 1 ELSE 0 END,updated_at=now() WHERE id=c.task_id AND company_id=c.company_id;
 UPDATE silvio_task_passi SET stato=CASE ordine
 WHEN 0 THEN CASE WHEN c.identity_verified_at IS NOT NULL THEN 'fatto' WHEN c.reason='identity' THEN 'fallito' ELSE 'da_fare' END
 WHEN 1 THEN CASE WHEN c.ticket_id IS NOT NULL THEN 'fatto' WHEN c.identity_verified_at IS NOT NULL THEN 'attende_conferma' ELSE 'da_fare' END
 ELSE CASE WHEN c.appointment_id IS NOT NULL THEN 'fatto' WHEN c.stage='needs_office' THEN 'attende_conferma' ELSE 'da_fare' END END,
 eseguito_at=CASE WHEN (ordine=0 AND c.identity_verified_at IS NOT NULL) OR (ordine=1 AND c.ticket_id IS NOT NULL) OR (ordine=2 AND c.appointment_id IS NOT NULL) THEN coalesce(eseguito_at,now()) ELSE NULL END
 WHERE task_id=c.task_id;
END $$;

CREATE FUNCTION public.fish_assistance_start(p_company uuid,p_agent uuid,p_session text) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE c ai_fish_assistance; t uuid; cal uuid;
BEGIN
 IF p_session IS NULL OR length(p_session) NOT BETWEEN 1 AND 256 THEN RAISE EXCEPTION 'Sessione non valida'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_company::text||p_agent::text||p_session,0));
 SELECT * INTO c FROM ai_fish_assistance WHERE company_id=p_company AND agent_id=p_agent AND session_id=p_session;
 IF FOUND THEN RETURN to_jsonb(c); END IF;
 SELECT nullif(tools_config#>>'{fish,calendar_id}','')::uuid INTO cal FROM ai_agents_v2
 WHERE id=p_agent AND company_id=p_company AND tools_config#>>'{fish,flow_id}'='support_appointment' AND tools_config->>'voice_provider'='fish_audio';
 IF NOT FOUND THEN RAISE EXCEPTION 'Flusso assistenza non configurato'; END IF;
 IF cal IS NOT NULL AND NOT EXISTS(SELECT 1 FROM marketing_calendars WHERE id=cal AND company_id=p_company AND is_active) THEN RAISE EXCEPTION 'Calendario non disponibile'; END IF;
 INSERT INTO silvio_task(company_id,titolo,origine,stato,contesto) VALUES(p_company,'Assistenza dal centralino','trigger','in_corso','{}') RETURNING id INTO t;
 INSERT INTO ai_fish_assistance(company_id,agent_id,session_id,task_id,calendar_id) VALUES(p_company,p_agent,p_session,t,cal) RETURNING * INTO c;
 UPDATE silvio_task SET contesto=jsonb_build_object('source','fish_assistance','assistance_id',c.id) WHERE id=t;
 INSERT INTO silvio_task_passi(task_id,ordine,azione_chiave) VALUES(t,0,'verifica_cliente'),(t,1,'gestisci_ticket'),(t,2,'prenota_assistenza');
 RETURN to_jsonb(c);
END $$;

-- The handler verifies declared name/address before this service-only transition.
CREATE FUNCTION public.fish_assistance_identity(p_case uuid,p_company uuid,p_customer uuid,p_revision timestamptz,p_phone text) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE c ai_fish_assistance; matched jsonb;
BEGIN
 SELECT * INTO STRICT c FROM ai_fish_assistance WHERE id=p_case AND company_id=p_company FOR UPDATE;
 matched:=fish_match_customer(p_company,p_phone);
 IF (matched->>'count')::int<>1 OR (matched#>>'{customer,id}')::uuid IS DISTINCT FROM p_customer
 OR NOT EXISTS(SELECT 1 FROM profiles WHERE id=p_customer AND company_id=p_company AND updated_at=p_revision AND deleted_at IS NULL)
 OR (c.customer_id IS NOT NULL AND c.customer_id<>p_customer) THEN RAISE EXCEPTION 'Identita da verificare'; END IF;
 IF c.ticket_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM tickets WHERE id=c.ticket_id AND company_id=p_company AND customer_id=p_customer) THEN RAISE EXCEPTION 'Pratica da verificare'; END IF;
 UPDATE ai_fish_assistance SET customer_id=p_customer,customer_updated_at=p_revision,identity_verified_at=now(),
 stage=CASE WHEN appointment_id IS NOT NULL THEN 'scheduled' WHEN ticket_id IS NOT NULL THEN 'awaiting_appointment' ELSE 'awaiting_ticket' END,reason=NULL,updated_at=now() WHERE id=c.id RETURNING * INTO c;
 PERFORM fish_assistance_sync(c.id); RETURN to_jsonb(c);
END $$;

CREATE FUNCTION public.fish_assistance_office(p_case uuid,p_company uuid,p_reason text) RETURNS void
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
BEGIN
 IF p_reason NOT IN ('identity','calendar','declined','no_slots','booking','call_ended','operator','callback') THEN RAISE EXCEPTION 'Motivo non valido'; END IF;
 UPDATE ai_fish_assistance SET stage='needs_office',reason=p_reason,identity_verified_at=CASE WHEN p_reason='identity' THEN NULL ELSE identity_verified_at END,updated_at=now() WHERE id=p_case AND company_id=p_company AND stage<>'scheduled';
 IF FOUND THEN PERFORM fish_assistance_sync(p_case); END IF;
END $$;

CREATE FUNCTION public.fish_assistance_ticket(p_case uuid,p_company uuid,p_phone text,p_description text,p_urgent boolean,p_existing uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE c ai_fish_assistance; customer profiles; new_ticket uuid; result jsonb; title text;
BEGIN
 SELECT * INTO STRICT c FROM ai_fish_assistance WHERE id=p_case AND company_id=p_company FOR UPDATE;
 SELECT * INTO customer FROM profiles WHERE id=c.customer_id AND company_id=p_company AND updated_at=c.customer_updated_at AND deleted_at IS NULL;
 IF NOT FOUND OR c.identity_verified_at IS NULL OR (fish_match_customer(p_company,p_phone)#>>'{customer,id}')::uuid IS DISTINCT FROM c.customer_id THEN RAISE EXCEPTION 'Verifica prima nome e indirizzo'; END IF;
 IF c.ticket_id IS NOT NULL THEN
  IF p_existing IS NOT NULL AND p_existing<>c.ticket_id THEN RAISE EXCEPTION 'La chiamata ha gia una pratica collegata'; END IF;
  RETURN jsonb_build_object('creato',c.ticket_action='created','aggiornato',c.ticket_action='updated','ticket_id',c.ticket_id,'customer_id',c.customer_id,'already_saved',true,'risposta','La richiesta e gia salvata. Prosegui con l’appuntamento, senza creare un secondo ticket.');
 END IF;
 IF p_description IS NULL OR length(trim(p_description)) NOT BETWEEN 8 AND 2000 THEN RAISE EXCEPTION 'Descrivi e conferma il problema'; END IF;
 IF p_existing IS NOT NULL THEN
  result:=fish_apply_ticket_update(p_company,c.customer_id,c.agent_id,'phone',c.session_id,p_existing,p_description,true);
  IF result->>'aggiornato'<>'true' THEN RETURN result; END IF;
  new_ticket:=p_existing;
 ELSE
  title:='Assistenza — '||concat_ws(' ',customer.first_name,customer.last_name);
  INSERT INTO tickets(company_id,customer_id,subject,titolo,descrizione,indirizzo_intervento,status,priority,priorita,fonte,tipo)
  VALUES(p_company,c.customer_id,title,title,trim(p_description),fish_match_customer(p_company,p_phone)#>>'{customer,address}','aperto',CASE WHEN p_urgent THEN 'urgente' ELSE 'normale' END,CASE WHEN p_urgent THEN 'alta' ELSE 'media' END,'api','supporto') RETURNING id INTO new_ticket;
 END IF;
 PERFORM fish_link_ticket_conversation(p_company,c.agent_id,c.session_id,new_ticket);
 UPDATE ai_fish_assistance SET ticket_id=new_ticket,ticket_action=CASE WHEN p_existing IS NULL THEN 'created' ELSE 'updated' END,stage='awaiting_appointment',reason=NULL,updated_at=now() WHERE id=c.id;
 PERFORM fish_assistance_sync(c.id);
 RETURN jsonb_build_object('creato',p_existing IS NULL,'aggiornato',p_existing IS NOT NULL,'ticket_id',new_ticket,'customer_id',c.customer_id,'conversation_linked',true,'risposta','Segnalazione '||upper(left(new_ticket::text,8))||' salvata e collegata al cliente. Chiedi se desidera concordare un appuntamento: nessun intervento e ancora prenotato.');
END $$;

-- Reservation, customer/ticket link and Silvio progress commit together.
-- Reuses the calendar's atomic booking, availability and owner/team rules.
CREATE FUNCTION public.fish_reserve_assistance_booking(p_case_id uuid,p_phone text,p_calendar_id uuid,p_company_id uuid,p_data date,p_inizio time,p_fine time,p_buffer_prima integer,p_buffer_dopo integer,p_durata_min integer,p_riga jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE c ai_fish_assistance; customer profiles; t tickets; result jsonb; a appointments;
BEGIN
 SELECT * INTO STRICT c FROM ai_fish_assistance WHERE id=p_case_id AND company_id=p_company_id FOR UPDATE;
 IF c.stage='scheduled' AND c.appointment_id IS NULL THEN RAISE EXCEPTION 'Appuntamento da verificare con l’ufficio'; END IF;
 IF c.identity_verified_at IS NULL OR c.ticket_id IS NULL OR c.calendar_id IS DISTINCT FROM p_calendar_id THEN RAISE EXCEPTION 'Verifica cliente, ticket e calendario prima di prenotare'; END IF;
 SELECT * INTO customer FROM profiles WHERE id=c.customer_id AND company_id=p_company_id AND updated_at=c.customer_updated_at AND deleted_at IS NULL;
 IF NOT FOUND OR (fish_match_customer(p_company_id,p_phone)#>>'{customer,id}')::uuid IS DISTINCT FROM c.customer_id THEN RAISE EXCEPTION 'Scheda cambiata: ripeti la verifica'; END IF;
 SELECT * INTO t FROM tickets WHERE id=c.ticket_id AND company_id=p_company_id AND customer_id=c.customer_id;
 IF NOT FOUND OR t.status::text IN ('chiuso','risolto','annullato') THEN RAISE EXCEPTION 'Segnalazione da verificare con l’ufficio'; END IF;
 IF c.appointment_id IS NOT NULL THEN
  SELECT * INTO a FROM appointments WHERE id=c.appointment_id AND company_id=p_company_id;
  IF NOT FOUND OR a.status IN ('annullato','cancellato','cancelled','disdetto') THEN RAISE EXCEPTION 'Appuntamento da verificare con l’ufficio'; END IF;
  RETURN jsonb_build_object('id',a.id,'duplicate',true,'data',a.appointment_date,'ora',to_char(a.appointment_time,'HH24:MI'));
 END IF;
 result:=reserve_calendar_booking(p_calendar_id,p_company_id,p_data,p_inizio,p_fine,p_buffer_prima,p_buffer_dopo,p_durata_min,
 p_riga||jsonb_build_object('request_key','fish-assistance:'||c.id::text,'appointment_id',NULL,'opportunity_id',NULL,
 'title','Assistenza · '||upper(left(t.id::text,8)),'description','Ticket: '||t.id::text||E'\nCliente: '||concat_ws(' ',customer.first_name,customer.last_name)||E'\nIndirizzo verificato: '||(fish_match_customer(p_company_id,p_phone)#>>'{customer,address}')||E'\nProblema: '||left(t.descrizione,1500)));
 IF result IS NULL THEN RETURN NULL; END IF;
 SELECT * INTO STRICT a FROM appointments WHERE id=(result->>'id')::uuid AND company_id=p_company_id AND calendar_id=p_calendar_id;
 UPDATE ai_fish_assistance SET appointment_id=a.id,stage='scheduled',reason=NULL,updated_at=now() WHERE id=c.id;
 PERFORM fish_assistance_sync(c.id);
 RETURN result||jsonb_build_object('data',a.appointment_date,'ora',to_char(a.appointment_time,'HH24:MI'));
END $$;

CREATE FUNCTION public.fish_assistance_end(p_company uuid,p_agent uuid,p_session text) RETURNS void
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE c ai_fish_assistance;
BEGIN
 SELECT * INTO c FROM ai_fish_assistance WHERE company_id=p_company AND agent_id=p_agent AND session_id=p_session FOR UPDATE;
 IF FOUND AND c.stage NOT IN ('scheduled','needs_office') THEN PERFORM fish_assistance_office(c.id,p_company,'call_ended'); END IF;
END $$;
REVOKE ALL ON FUNCTION public.fish_assistance_end(uuid,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.fish_assistance_end(uuid,uuid,text) TO service_role;

REVOKE ALL ON FUNCTION public.fish_assistance_sync(uuid), public.fish_assistance_start(uuid,uuid,text), public.fish_assistance_identity(uuid,uuid,uuid,timestamptz,text), public.fish_assistance_office(uuid,uuid,text), public.fish_assistance_ticket(uuid,uuid,text,text,boolean,uuid), public.fish_reserve_assistance_booking(uuid,text,uuid,uuid,date,time,time,integer,integer,integer,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.fish_assistance_sync(uuid), public.fish_assistance_start(uuid,uuid,text), public.fish_assistance_identity(uuid,uuid,uuid,timestamptz,text), public.fish_assistance_office(uuid,uuid,text), public.fish_assistance_ticket(uuid,uuid,text,text,boolean,uuid), public.fish_reserve_assistance_booking(uuid,text,uuid,uuid,date,time,time,integer,integer,integer,jsonb) TO service_role;
