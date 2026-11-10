ALTER TABLE public.human_call_logs ADD COLUMN customer_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.ai_conversations_v2 ADD COLUMN customer_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.ai_agent_conversations ADD COLUMN customer_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;
CREATE INDEX ON public.human_call_logs(company_id,customer_id,started_at DESC) WHERE customer_id IS NOT NULL;
CREATE INDEX ON public.ai_conversations_v2(company_id,customer_id,creato_il DESC) WHERE customer_id IS NOT NULL;

-- Identity matching uses a complete number and a unique record in the same company.
-- A shared switchboard/duplicate number never selects an arbitrary customer.
CREATE FUNCTION public.centralino_link_call_parties() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE human_phone text; digits text; linked uuid;
BEGIN
 IF NEW.contact_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM marketing_contacts WHERE id=NEW.contact_id AND company_id=NEW.company_id) THEN
   RAISE EXCEPTION 'Contatto di altra azienda';
 END IF;
 IF NEW.customer_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM profiles p JOIN user_roles r ON r.user_id=p.id AND r.role='customer' WHERE p.id=NEW.customer_id AND p.company_id=NEW.company_id) THEN
   RAISE EXCEPTION 'Cliente non appartenente all azienda';
 END IF;
 IF TG_TABLE_NAME='human_call_logs' THEN
   human_phone:=CASE WHEN NEW.direction='inbound' THEN NEW.from_number ELSE NEW.to_number END;
 ELSIF TG_TABLE_NAME='ai_conversations_v2' THEN
   human_phone:=CASE WHEN NEW.direzione='outbound' THEN NEW.numero_chiamato ELSE NEW.numero_chiamante END;
 ELSE human_phone:=NULL;
 END IF;
 digits:=regexp_replace(coalesce(human_phone,''),'[^0-9]','','g');
 IF NEW.contact_id IS NULL AND length(digits)>=7 THEN
   SELECT CASE WHEN count(*)=1 THEN (array_agg(id))[1] END INTO linked FROM marketing_contacts
     WHERE company_id=NEW.company_id AND regexp_replace(phone,'[^0-9]','','g')=digits;
   NEW.contact_id:=linked;
 END IF;
 IF NEW.customer_id IS NULL THEN
   SELECT CASE WHEN count(DISTINCT p.id)=1 THEN (array_agg(DISTINCT p.id))[1] END INTO linked
     FROM profiles p JOIN user_roles r ON r.user_id=p.id AND r.role='customer'
     WHERE p.company_id=NEW.company_id AND ((NEW.contact_id IS NOT NULL AND p.marketing_contact_id=NEW.contact_id)
       OR (length(digits)>=7 AND regexp_replace(p.phone,'[^0-9]','','g')=digits));
   NEW.customer_id:=linked;
 END IF;
 RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.centralino_link_call_parties() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER centralino_human_parties BEFORE INSERT OR UPDATE OF from_number,to_number,contact_id,customer_id ON public.human_call_logs FOR EACH ROW EXECUTE FUNCTION public.centralino_link_call_parties();
CREATE TRIGGER centralino_ai_parties BEFORE INSERT OR UPDATE OF numero_chiamante,numero_chiamato,contact_id,customer_id ON public.ai_conversations_v2 FOR EACH ROW EXECUTE FUNCTION public.centralino_link_call_parties();
CREATE TRIGGER centralino_legacy_parties BEFORE INSERT OR UPDATE OF contact_id,customer_id ON public.ai_agent_conversations FOR EACH ROW EXECUTE FUNCTION public.centralino_link_call_parties();

CREATE FUNCTION public.centralino_mirror_call_parties() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
BEGIN
 UPDATE ai_agent_conversations SET contact_id=NEW.contact_id,customer_id=NEW.customer_id WHERE id=NEW.id AND company_id=NEW.company_id;
 IF NEW.voice_provider='fish_audio' THEN UPDATE ai_fish_calls SET contact_id=NEW.contact_id WHERE id=NEW.id AND company_id=NEW.company_id; END IF;
 RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.centralino_mirror_call_parties() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER centralino_ai_party_mirror AFTER INSERT OR UPDATE OF contact_id,customer_id ON public.ai_conversations_v2 FOR EACH ROW EXECUTE FUNCTION public.centralino_mirror_call_parties();

-- Only the authenticated management Edge Function can call this transaction.
CREATE FUNCTION public.centralino_associate_call(p_company uuid,p_kind text,p_call uuid,p_contact uuid DEFAULT NULL,p_customer uuid DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE contact uuid:=p_contact;
BEGIN
 IF p_contact IS NOT NULL AND NOT EXISTS(SELECT 1 FROM marketing_contacts WHERE id=p_contact AND company_id=p_company) THEN RAISE EXCEPTION 'Contatto non valido'; END IF;
 IF p_customer IS NOT NULL THEN
   IF NOT EXISTS(SELECT 1 FROM profiles p JOIN user_roles r ON r.user_id=p.id AND r.role='customer' WHERE p.id=p_customer AND p.company_id=p_company) THEN RAISE EXCEPTION 'Cliente non valido'; END IF;
   IF contact IS NULL THEN SELECT p.marketing_contact_id INTO contact FROM profiles p JOIN marketing_contacts m ON m.id=p.marketing_contact_id AND m.company_id=p_company WHERE p.id=p_customer AND p.company_id=p_company; END IF;
 END IF;
 IF p_kind='human' THEN
   UPDATE human_call_logs SET contact_id=contact,customer_id=p_customer WHERE id=p_call AND company_id=p_company;
   IF NOT FOUND THEN RAISE EXCEPTION 'Chiamata non trovata'; END IF;
 ELSIF p_kind='ai' THEN
   UPDATE ai_conversations_v2 SET contact_id=contact,customer_id=p_customer WHERE id=p_call AND company_id=p_company;
   IF NOT FOUND THEN RAISE EXCEPTION 'Chiamata non trovata'; END IF;
   UPDATE ai_agent_conversations SET contact_id=contact,customer_id=p_customer WHERE id=p_call AND company_id=p_company;
   UPDATE ai_fish_calls SET contact_id=contact WHERE id=p_call AND company_id=p_company;
 ELSE RAISE EXCEPTION 'Tipo chiamata non valido';
 END IF;
 RETURN true;
END; $$;
REVOKE ALL ON FUNCTION public.centralino_associate_call(uuid,text,uuid,uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.centralino_associate_call(uuid,text,uuid,uuid,uuid) TO service_role;

CREATE FUNCTION public.centralino_search_parties(p_company uuid,p_search text) RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public AS $$
 SELECT coalesce(jsonb_agg(row_to_json(found)),'[]'::jsonb) FROM (
   SELECT p.id,'customer'::text kind,coalesce(nullif(p.business_name,''),concat_ws(' ',p.first_name,p.last_name)) name,p.phone
   FROM profiles p WHERE p.company_id=p_company AND length(trim(p_search))>=2
     AND EXISTS(SELECT 1 FROM user_roles r WHERE r.user_id=p.id AND r.role='customer')
     AND concat_ws(' ',p.first_name,p.last_name,p.business_name,p.phone) ILIKE '%'||left(p_search,80)||'%'
   UNION ALL
   SELECT id,'contact'::text,concat_ws(' ',first_name,last_name),phone FROM marketing_contacts
     WHERE company_id=p_company AND length(trim(p_search))>=2
     AND concat_ws(' ',first_name,last_name,phone) ILIKE '%'||left(p_search,80)||'%'
   LIMIT 30
 ) found;
$$;
REVOKE ALL ON FUNCTION public.centralino_search_parties(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.centralino_search_parties(uuid,text) TO service_role;
