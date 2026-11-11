-- Controlled, authenticated CRM trial. It never impersonates a telephone session.
CREATE FUNCTION public.fish_customer_phone(p_phone text,p_country text) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path=public AS $$
 SELECT CASE WHEN trim(p_phone) LIKE '+%' THEN '+'||regexp_replace(p_phone,'[^0-9]','','g')
 WHEN trim(p_phone) LIKE '00%' THEN '+'||substr(regexp_replace(p_phone,'[^0-9]','','g'),3)
 WHEN upper(p_country)='IT' AND length(regexp_replace(p_phone,'[^0-9]','','g'))>=7 THEN '+39'||regexp_replace(p_phone,'[^0-9]','','g') ELSE NULL END
$$;
REVOKE ALL ON FUNCTION public.fish_customer_phone(text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.fish_customer_phone(text,text) TO service_role;
CREATE INDEX fish_customer_phone_lookup_idx ON public.profiles(company_id,public.fish_customer_phone(phone,country)) WHERE deleted_at IS NULL;
CREATE FUNCTION public.fish_match_customer(p_company uuid,p_phone text) RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public AS $$
 WITH matches AS (
 SELECT p.id,p.first_name,p.last_name,p.phone,p.updated_at,
 trim(concat_ws(', ',coalesce(nullif(p.site_address,''),p.address),coalesce(nullif(p.site_city,''),p.city))) AS address
 FROM profiles p WHERE p.company_id=p_company AND p.deleted_at IS NULL
 AND public.fish_customer_phone(p.phone,p.country)=p_phone
 AND EXISTS(SELECT 1 FROM user_roles r WHERE r.user_id=p.id AND r.role='customer')
 ) SELECT jsonb_build_object('count',count(*),'customer',CASE WHEN count(*)=1 THEN (jsonb_agg(to_jsonb(matches)))->0 ELSE NULL END) FROM matches
$$;
REVOKE ALL ON FUNCTION public.fish_match_customer(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.fish_match_customer(uuid,text) TO service_role;
ALTER TABLE public.ai_fish_agents ADD COLUMN crm_preview_agent_id text,ADD COLUMN crm_preview_tool_ids jsonb NOT NULL DEFAULT '{}'::jsonb,ADD COLUMN crm_preview_fingerprint text;
CREATE TABLE public.ai_fish_crm_trials (
 id uuid PRIMARY KEY,
 company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
 agent_id uuid NOT NULL,
 requested_by uuid NOT NULL,
 customer_id uuid NOT NULL REFERENCES public.profiles(id),
 caller_phone text NOT NULL CHECK(caller_phone ~ '^\+[1-9][0-9]{7,14}$'),
 customer_updated_at timestamptz NOT NULL,
 identity_verified_at timestamptz,
 ticket_id uuid REFERENCES public.tickets(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL DEFAULT now()+interval '2 hours',
 FOREIGN KEY(company_id,agent_id) REFERENCES public.ai_agents_v2(company_id,id) ON DELETE CASCADE
);
CREATE INDEX fish_crm_trial_company_date_idx ON public.ai_fish_crm_trials(company_id,created_at DESC);
CREATE INDEX fish_crm_trial_customer_idx ON public.ai_fish_crm_trials(company_id,customer_id);
CREATE INDEX fish_crm_trial_agent_idx ON public.ai_fish_crm_trials(company_id,agent_id);
CREATE INDEX fish_crm_trial_ticket_idx ON public.ai_fish_crm_trials(ticket_id) WHERE ticket_id IS NOT NULL;
ALTER TABLE public.ai_fish_crm_trials ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ai_fish_crm_trials FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.ai_fish_crm_trials TO authenticated;
GRANT ALL ON public.ai_fish_crm_trials TO service_role;
CREATE POLICY fish_crm_trial_read ON public.ai_fish_crm_trials FOR SELECT TO authenticated USING (
 company_id=public.get_my_company_id() AND requested_by=(SELECT auth.uid()) AND EXISTS(SELECT 1 FROM user_roles WHERE user_id=(SELECT auth.uid()) AND role='company_admin')
 OR EXISTS(SELECT 1 FROM user_roles WHERE user_id=(SELECT auth.uid()) AND role='super_admin')
);
CREATE FUNCTION public.fish_create_trial_ticket(p_company uuid,p_agent uuid,p_user uuid,p_trial uuid,p_problem text) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE trial ai_fish_crm_trials; customer profiles; new_ticket uuid; intervention_address text; title text;
BEGIN
 SELECT * INTO trial FROM ai_fish_crm_trials WHERE id=p_trial AND company_id=p_company AND agent_id=p_agent AND requested_by=p_user FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Prova non autorizzata'; END IF;
 IF trial.ticket_id IS NOT NULL THEN RETURN jsonb_build_object('creato',true,'ticket_id',trial.ticket_id,'customer_id',trial.customer_id,'already_created',true); END IF;
 IF trial.expires_at<now() OR trial.identity_verified_at IS NULL THEN RAISE EXCEPTION 'Conferma prima nome e indirizzo'; END IF;
 IF length(trim(p_problem))<8 OR length(p_problem)>2000 THEN RAISE EXCEPTION 'Descrizione non valida'; END IF;
 SELECT * INTO customer FROM profiles p WHERE p.id=trial.customer_id AND p.company_id=p_company AND p.deleted_at IS NULL
 AND p.updated_at=trial.customer_updated_at AND fish_customer_phone(p.phone,p.country)=trial.caller_phone
 AND EXISTS(SELECT 1 FROM user_roles r WHERE r.user_id=p.id AND r.role='customer');
 IF NOT FOUND THEN RAISE EXCEPTION 'Scheda modificata: ricomincia la verifica'; END IF;
 IF (fish_match_customer(p_company,trial.caller_phone)->>'count')::int<>1 THEN RAISE EXCEPTION 'Numero non univoco'; END IF;
 intervention_address:=trim(concat_ws(', ',coalesce(nullif(customer.site_address,''),customer.address),coalesce(nullif(customer.site_city,''),customer.city)));
 title:='[COLLAUDO AI] Assistenza — '||customer.first_name||' '||customer.last_name;
 INSERT INTO tickets(company_id,customer_id,created_by,subject,titolo,descrizione,indirizzo_intervento,status,priority,priorita,fonte,tipo)
 VALUES(p_company,customer.id,p_user,title,title,'COLLAUDO del centralino AI: nessun intervento da programmare automaticamente.'||E'\n\n'||trim(p_problem)||E'\n\nIndirizzo confermato: '||intervention_address,intervention_address,'aperto','normale','media','api','supporto') RETURNING id INTO new_ticket;
 UPDATE ai_fish_crm_trials SET ticket_id=new_ticket WHERE id=p_trial;
 RETURN jsonb_build_object('creato',true,'ticket_id',new_ticket,'customer_id',customer.id,'already_created',false);
END $$;
REVOKE ALL ON FUNCTION public.fish_create_trial_ticket(uuid,uuid,uuid,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.fish_create_trial_ticket(uuid,uuid,uuid,uuid,text) TO service_role;
COMMENT ON TABLE public.ai_fish_crm_trials IS 'Admin-started web CRM trials with real tickets. Caller phone is selected for the trial, not obtained from a telephone carrier. Exactly one ticket per trial.';
