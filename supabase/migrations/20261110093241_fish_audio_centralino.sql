-- Fish is a voice runtime; the existing phone provider (e.g. Telnyx) stays separate.
-- All bindings, prices, call attempts and webhook writes are server-owned.
ALTER TABLE public.ai_conversations_v2 ADD COLUMN IF NOT EXISTS voice_provider text;
CREATE UNIQUE INDEX ai_agents_v2_fish_tenant_key ON public.ai_agents_v2(company_id,id);
CREATE UNIQUE INDEX ai_phone_numbers_v2_fish_tenant_key ON public.ai_phone_numbers_v2(company_id,id);
CREATE TABLE public.ai_fish_agents (
  agent_id uuid PRIMARY KEY REFERENCES public.ai_agents_v2(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  fish_agent_id text UNIQUE,
  voice_id text NOT NULL,
  published boolean NOT NULL DEFAULT false,
  enabled boolean NOT NULL DEFAULT false,
  real_per_min_eur numeric CHECK (real_per_min_eur >= 0 AND real_per_min_eur < 1000),
  billed_per_min_eur numeric CHECK (billed_per_min_eur >= 0 AND billed_per_min_eur < 1000),
  tool_ids jsonb NOT NULL DEFAULT '{}',
  transfer_destinations jsonb NOT NULL DEFAULT '[]',
  config_fingerprint text,
  test_ids jsonb NOT NULL DEFAULT '{}',
  test_batches jsonb NOT NULL DEFAULT '[]',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(company_id,agent_id),
  FOREIGN KEY(company_id,agent_id) REFERENCES public.ai_agents_v2(company_id,id) ON DELETE CASCADE
);
CREATE TABLE public.ai_fish_numbers (
  phone_id uuid PRIMARY KEY REFERENCES public.ai_phone_numbers_v2(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  agent_id uuid NOT NULL,
  fish_phone_id text UNIQUE NOT NULL,
  supports_outbound boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(company_id,agent_id) REFERENCES public.ai_fish_agents(company_id,agent_id) ON DELETE CASCADE,
  FOREIGN KEY(company_id,phone_id) REFERENCES public.ai_phone_numbers_v2(company_id,id) ON DELETE CASCADE
);
CREATE TABLE public.ai_fish_calls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  agent_id uuid NOT NULL,
  phone_id uuid REFERENCES public.ai_phone_numbers_v2(id) ON DELETE SET NULL,
  contact_id uuid REFERENCES public.marketing_contacts(id) ON DELETE SET NULL,
  remote_session_id text UNIQUE,
  request_key text,
  to_number text,
  direction text NOT NULL CHECK(direction IN ('inbound','outbound')),
  state text NOT NULL DEFAULT 'prepared',
  terminal boolean NOT NULL DEFAULT false,
  duration_seconds integer CHECK(duration_seconds >= 0),
  real_per_min_eur numeric NOT NULL CHECK(real_per_min_eur >= 0 AND real_per_min_eur < 1000),
  billed_per_min_eur numeric NOT NULL CHECK(billed_per_min_eur >= 0 AND billed_per_min_eur < 1000),
  billed boolean NOT NULL DEFAULT false,
  analysis_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(company_id,request_key),
  FOREIGN KEY(company_id,agent_id) REFERENCES public.ai_fish_agents(company_id,agent_id) ON DELETE CASCADE
);
CREATE TABLE public.ai_fish_events (
  event_id text PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  call_id uuid NOT NULL REFERENCES public.ai_fish_calls(id) ON DELETE CASCADE,
  received_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.ai_fish_tool_results (
  operation_key text PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  session_id text NOT NULL,
  result jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.ai_fish_rates (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  agent_id uuid NOT NULL REFERENCES public.ai_fish_agents(agent_id) ON DELETE CASCADE,
  effective_at timestamptz NOT NULL DEFAULT now(),
  real_per_min_eur numeric NOT NULL,
  billed_per_min_eur numeric NOT NULL
);
ALTER TABLE public.ai_fish_rates ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ai_fish_rates FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.ai_fish_rates TO service_role;
GRANT USAGE,SELECT ON SEQUENCE public.ai_fish_rates_id_seq TO service_role;
CREATE FUNCTION public.fish_capture_rate() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF NEW.real_per_min_eur IS NOT NULL AND NEW.billed_per_min_eur IS NOT NULL AND
  (TG_OP='INSERT' OR NEW.real_per_min_eur IS DISTINCT FROM OLD.real_per_min_eur OR NEW.billed_per_min_eur IS DISTINCT FROM OLD.billed_per_min_eur) THEN
  INSERT INTO public.ai_fish_rates(agent_id,real_per_min_eur,billed_per_min_eur) VALUES(NEW.agent_id,NEW.real_per_min_eur,NEW.billed_per_min_eur);
 END IF;
 RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.fish_capture_rate() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER fish_rate_history AFTER INSERT OR UPDATE OF real_per_min_eur,billed_per_min_eur ON public.ai_fish_agents FOR EACH ROW EXECUTE FUNCTION public.fish_capture_rate();
CREATE INDEX ai_fish_calls_company_date ON public.ai_fish_calls(company_id,created_at DESC);

ALTER TABLE public.ai_fish_agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_fish_numbers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_fish_calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_fish_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_fish_tool_results ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ai_fish_tool_results FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.ai_fish_tool_results TO service_role;
REVOKE ALL ON public.ai_fish_agents,public.ai_fish_numbers,public.ai_fish_calls,public.ai_fish_events FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.ai_fish_agents,public.ai_fish_numbers,public.ai_fish_calls TO authenticated;
GRANT ALL ON public.ai_fish_agents,public.ai_fish_numbers,public.ai_fish_calls,public.ai_fish_events TO service_role;
CREATE POLICY fish_agents_read ON public.ai_fish_agents FOR SELECT TO authenticated USING (
  company_id=public.get_my_company_id() OR EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=auth.uid() AND role='super_admin'));
CREATE POLICY fish_numbers_read ON public.ai_fish_numbers FOR SELECT TO authenticated USING (
  company_id=public.get_my_company_id() OR EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=auth.uid() AND role='super_admin'));
CREATE POLICY fish_calls_read ON public.ai_fish_calls FOR SELECT TO authenticated USING (
  company_id=public.get_my_company_id() OR EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=auth.uid() AND role='super_admin'));

CREATE FUNCTION public.fish_prepare_outbound(p_company uuid,p_agent uuid,p_phone uuid,p_to text,p_key text,p_contact uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE b public.ai_fish_agents%ROWTYPE; n public.ai_fish_numbers%ROWTYPE; c public.ai_fish_calls%ROWTYPE;
BEGIN
  IF p_key IS NULL OR length(p_key) NOT BETWEEN 8 AND 128 OR p_to !~ '^\+[1-9][0-9]{6,14}$' THEN RAISE EXCEPTION 'Tentativo o numero non valido'; END IF;
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

CREATE FUNCTION public.fish_select_provider(p_company uuid,p_agent uuid,p_enabled boolean)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE b public.ai_fish_agents%ROWTYPE;
BEGIN
 SELECT * INTO b FROM public.ai_fish_agents WHERE company_id=p_company AND agent_id=p_agent FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Collegamento Fish assente'; END IF;
 IF p_enabled AND (NOT b.published OR b.fish_agent_id IS NULL OR b.real_per_min_eur IS NULL OR b.billed_per_min_eur IS NULL OR NOT EXISTS(
  SELECT 1 FROM public.ai_fish_numbers n JOIN public.ai_phone_numbers_v2 p ON p.id=n.phone_id
  WHERE n.company_id=p_company AND n.agent_id=p_agent AND p.company_id=p_company AND p.agent_id=p_agent AND p.attivo
 )) THEN RAISE EXCEPTION 'Pubblica Fish, verifica le tariffe e collega una linea prima di attivarlo'; END IF;
 UPDATE public.ai_fish_agents SET enabled=p_enabled WHERE company_id=p_company AND agent_id=p_agent;
 UPDATE public.ai_agents_v2 SET tools_config=coalesce(tools_config,'{}')||'{"voice_provider":"fish_audio"}'::jsonb,
   stato=CASE WHEN p_enabled THEN 'attivo' ELSE 'pausa' END WHERE id=p_agent AND company_id=p_company;
 IF NOT FOUND THEN RAISE EXCEPTION 'Agente non appartenente all azienda'; END IF;
 RETURN true;
END; $$;
REVOKE ALL ON FUNCTION public.fish_select_provider(uuid,uuid,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.fish_select_provider(uuid,uuid,boolean) TO service_role;

-- A single transaction handles retries, out-of-order events, mirrors, usage and credit.
-- p_snapshot is normalized by the signed webhook handler, never by an end-user client.
CREATE FUNCTION public.fish_record_event(p_agent text,p_session text,p_event text,p_snapshot jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE b public.ai_fish_agents%ROWTYPE; c public.ai_fish_calls%ROWTYPE;
 first_terminal boolean; changed integer; mins numeric; real_cost numeric; billed_cost numeric; bal jsonb;
 next_state text; final_event boolean; event_duration integer; old_analysis timestamptz; can_analyze boolean;
 old_duration integer; rate public.ai_fish_rates%ROWTYPE; matched_contact uuid; human_phone text;
BEGIN
 IF coalesce(p_session,'')='' OR coalesce(p_event,'')='' THEN RAISE EXCEPTION 'Evento non valido'; END IF;
 SELECT * INTO b FROM public.ai_fish_agents WHERE fish_agent_id=p_agent FOR SHARE;
 IF NOT FOUND OR b.real_per_min_eur IS NULL OR b.billed_per_min_eur IS NULL THEN RAISE EXCEPTION 'Associazione Fish o tariffa assente'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_session,0));
 IF EXISTS(SELECT 1 FROM public.ai_fish_events WHERE event_id=p_event) THEN RETURN jsonb_build_object('duplicate',true); END IF;
 SELECT * INTO c FROM public.ai_fish_calls WHERE remote_session_id=p_session FOR UPDATE;
 IF NOT FOUND AND nullif(p_snapshot->>'attempt_id','') IS NOT NULL THEN
   SELECT * INTO c FROM public.ai_fish_calls WHERE id=(p_snapshot->>'attempt_id')::uuid AND company_id=b.company_id AND agent_id=b.agent_id FOR UPDATE;
   IF FOUND AND c.remote_session_id IS NOT NULL AND c.remote_session_id<>p_session THEN RAISE EXCEPTION 'Tentativo gia associato'; END IF;
 END IF;
 IF c.id IS NULL THEN
   SELECT * INTO rate FROM public.ai_fish_rates WHERE agent_id=b.agent_id AND effective_at<=coalesce((p_snapshot->>'started_at')::timestamptz,now()) ORDER BY effective_at DESC,id DESC LIMIT 1;
   IF NOT FOUND THEN RAISE EXCEPTION 'Tariffa all inizio della chiamata non disponibile'; END IF;
   INSERT INTO public.ai_fish_calls(company_id,agent_id,remote_session_id,direction,to_number,real_per_min_eur,billed_per_min_eur)
   VALUES(b.company_id,b.agent_id,p_session,coalesce(p_snapshot->>'direction','inbound'),CASE WHEN p_snapshot->>'direction'='outbound' THEN p_snapshot->>'called' ELSE p_snapshot->>'caller' END,rate.real_per_min_eur,rate.billed_per_min_eur) RETURNING * INTO c;
 END IF;
 IF c.company_id<>b.company_id OR c.agent_id<>b.agent_id THEN RAISE EXCEPTION 'Sessione di altra azienda'; END IF;
 IF c.contact_id IS NULL THEN
  human_phone:=CASE WHEN c.direction='outbound' THEN p_snapshot->>'called' ELSE p_snapshot->>'caller' END;
  IF human_phone ~ '^\+[1-9][0-9]{6,14}$' THEN
   SELECT CASE WHEN count(*)=1 THEN (array_agg(id))[1] END INTO matched_contact FROM public.marketing_contacts
    WHERE company_id=b.company_id AND regexp_replace(phone,'[^+0-9]','','g')=human_phone;
   IF matched_contact IS NOT NULL THEN UPDATE public.ai_fish_calls SET contact_id=matched_contact WHERE id=c.id RETURNING * INTO c; END IF;
  END IF;
 END IF;
 final_event:=coalesce((p_snapshot->>'terminal')::boolean,false);
 next_state:=coalesce(p_snapshot->>'state','in_corso');
 IF next_state NOT IN ('in_corso','completata','fallita','no_risposta','occupato') THEN RAISE EXCEPTION 'Stato Fish non valido'; END IF;
 event_duration:=(p_snapshot->>'duration')::integer;
 IF event_duration<0 THEN RAISE EXCEPTION 'Durata non valida'; END IF;
 IF c.billed AND event_duration IS NOT NULL AND event_duration<>c.duration_seconds THEN
   RAISE EXCEPTION 'Durata diversa dopo l addebito: riconciliazione richiesta';
 END IF;
 first_terminal:=final_event AND NOT c.terminal;
 old_duration:=coalesce(c.duration_seconds,0);
 old_analysis:=c.analysis_at;
 can_analyze:=p_snapshot ? 'transcript' AND (old_analysis IS NULL OR coalesce((p_snapshot->>'analysis_at')::timestamptz,now())>=old_analysis);
 UPDATE public.ai_fish_calls SET remote_session_id=p_session,
   terminal=terminal OR final_event,
   state=CASE WHEN terminal AND NOT final_event THEN state ELSE next_state END,
   duration_seconds=CASE WHEN event_duration IS NULL THEN duration_seconds ELSE greatest(coalesce(duration_seconds,0),event_duration) END,
   analysis_at=CASE WHEN can_analyze THEN coalesce((p_snapshot->>'analysis_at')::timestamptz,now()) ELSE analysis_at END
 WHERE id=c.id RETURNING * INTO c;
 INSERT INTO public.ai_fish_events(event_id,company_id,call_id) VALUES(p_event,b.company_id,c.id);

 INSERT INTO public.ai_agent_conversations(id,company_id,agent_v2_id,contact_id,status,duration_seconds,messages_count,call_direction,metadata)
 VALUES(c.id,b.company_id,b.agent_id,c.contact_id,CASE WHEN c.terminal THEN 'completed' ELSE 'in_progress' END,coalesce(c.duration_seconds,0),0,c.direction,
  jsonb_build_object('voice_provider','fish_audio','fish_session_id',p_session,'call_direction',c.direction))
 ON CONFLICT(id) DO UPDATE SET status=excluded.status,duration_seconds=excluded.duration_seconds,contact_id=excluded.contact_id;
 INSERT INTO public.ai_conversations_v2(id,company_id,agent_id,contact_id,canale,voice_provider,direzione,stato,durata_secondi,numero_chiamante,numero_chiamato,iniziata_il,terminata_il)
 VALUES(c.id,b.company_id,b.agent_id,c.contact_id,'voce','fish_audio',c.direction,c.state,c.duration_seconds,p_snapshot->>'caller',p_snapshot->>'called',
  coalesce((p_snapshot->>'started_at')::timestamptz,c.created_at),CASE WHEN c.terminal THEN coalesce((p_snapshot->>'ended_at')::timestamptz,now()) END)
 ON CONFLICT(id) DO UPDATE SET stato=excluded.stato,durata_secondi=excluded.durata_secondi,
   contact_id=coalesce(ai_conversations_v2.contact_id,excluded.contact_id),
   numero_chiamante=coalesce(excluded.numero_chiamante,ai_conversations_v2.numero_chiamante),
   numero_chiamato=coalesce(excluded.numero_chiamato,ai_conversations_v2.numero_chiamato),
   terminata_il=coalesce(ai_conversations_v2.terminata_il,excluded.terminata_il);
 IF can_analyze THEN
   UPDATE public.ai_agent_conversations SET transcript=p_snapshot->'transcript',summary=p_snapshot->>'summary',
     messages_count=jsonb_array_length(p_snapshot->'transcript') WHERE id=c.id;
   UPDATE public.ai_conversations_v2 SET trascrizione_json=p_snapshot->'transcript',riassunto=p_snapshot->>'summary' WHERE id=c.id;
 END IF;
 IF first_terminal THEN PERFORM public.increment_agent_stats(b.agent_id,1,CASE WHEN c.state='completata' THEN 1 ELSE 0 END,coalesce(c.duration_seconds,0)::numeric/60,0,0); END IF;
 IF c.terminal AND NOT first_terminal AND coalesce(c.duration_seconds,0)>old_duration THEN
  PERFORM public.increment_agent_stats(b.agent_id,0,0,(c.duration_seconds-old_duration)::numeric/60,0,0);
 END IF;
 IF c.terminal AND c.duration_seconds IS NOT NULL AND NOT c.billed THEN
   mins:=c.duration_seconds::numeric/60;
   real_cost:=round(mins*c.real_per_min_eur,4); billed_cost:=round(mins*c.billed_per_min_eur,4);
   bal:=public.deduct_ai_credits(b.company_id,billed_cost);
   INSERT INTO public.ai_credit_usage(company_id,conversation_id,agent_v2_id,duration_sec,duration_min,llm_model,tts_model,
    cost_real_per_min,cost_billed_per_min,cost_real_total,cost_billed_total,margin_total,balance_before,balance_after,call_direction)
   VALUES(b.company_id,c.id,b.agent_id,c.duration_seconds,mins,'fish_agents','fish_audio',c.real_per_min_eur,c.billed_per_min_eur,
    real_cost,billed_cost,billed_cost-real_cost,(bal->>'balance_before')::numeric,(bal->>'balance_after')::numeric,c.direction);
   UPDATE public.ai_fish_calls SET billed=true WHERE id=c.id;
   UPDATE public.ai_conversations_v2 SET costo_crediti=billed_cost WHERE id=c.id;
   UPDATE public.ai_agent_conversations SET metadata=metadata||'{"voice_billing_settled":true}'::jsonb WHERE id=c.id;
   PERFORM public.increment_agent_stats(b.agent_id,0,0,0,0,billed_cost);
 END IF;
 RETURN jsonb_build_object('id',c.id,'company_id',b.company_id,'duplicate',false,'terminal',c.terminal);
END; $$;
REVOKE ALL ON FUNCTION public.fish_record_event(text,text,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.fish_record_event(text,text,text,jsonb) TO service_role;
