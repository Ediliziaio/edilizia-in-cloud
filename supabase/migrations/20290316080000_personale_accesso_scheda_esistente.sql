SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='30s';
CREATE OR REPLACE FUNCTION public.dipendente_accesso_prepara(p_company uuid,p_nome text,p_cognome text,p_email text,p_employee uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE e public.employees; candidati integer;
BEGIN
 IF coalesce(auth.role(),'')<>'service_role' THEN RAISE EXCEPTION 'Accesso riservato al servizio' USING ERRCODE='42501'; END IF;
 IF p_employee IS NOT NULL THEN
  SELECT * INTO e FROM public.employees WHERE id=p_employee AND company_id=p_company AND is_active;
  IF NOT FOUND THEN RAISE EXCEPTION 'Scheda del personale non disponibile in questa azienda'; END IF;
  IF e.user_id IS NOT NULL OR e.portal_user_id IS NOT NULL THEN RAISE EXCEPTION 'Questa persona ha già un accesso. Gestiscilo dalla sua scheda'; END IF;
  RETURN e.id;
 END IF;
 SELECT count(*) INTO candidati FROM public.employees WHERE company_id=p_company AND is_active
 AND ((nullif(trim(p_email),'') IS NOT NULL AND lower(trim(email))=lower(trim(p_email)))
 OR (lower(regexp_replace(trim(first_name),'\s+',' ','g'))=lower(regexp_replace(trim(p_nome),'\s+',' ','g'))
 AND lower(regexp_replace(trim(last_name),'\s+',' ','g'))=lower(regexp_replace(trim(p_cognome),'\s+',' ','g'))));
 IF candidati>0 THEN RAISE EXCEPTION 'Persona già presente in Personale. Seleziona la scheda esistente per conservare cantieri e storico; se ha già accesso, gestiscilo dalla sua scheda'; END IF;
 RETURN NULL;
END $$;
CREATE OR REPLACE FUNCTION public.collega_dipendente_accesso(p_company uuid,p_user uuid,p_employee uuid,p_nome text,p_cognome text,p_email text,p_phone text DEFAULT NULL,p_tipo text DEFAULT 'operaio')
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE selected_employee uuid; linked_employee uuid;
BEGIN
 IF coalesce(auth.role(),'')<>'service_role' THEN RAISE EXCEPTION 'Accesso riservato al servizio' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=p_user AND company_id=p_company AND deleted_at IS NULL AND NOT coalesce(is_blocked,false)) THEN RAISE EXCEPTION 'Account non valido per questa azienda'; END IF;
 -- Two concurrent creations for the same name must not both create a new row.
 PERFORM pg_advisory_xact_lock(hashtextextended(p_company::text||':'||lower(regexp_replace(trim(p_nome||' '||p_cognome),'\s+',' ','g')),0));
 selected_employee:=public.dipendente_accesso_prepara(p_company,p_nome,p_cognome,p_email,p_employee);
 IF selected_employee IS NOT NULL THEN
  UPDATE public.employees SET user_id=p_user,email=coalesce(nullif(trim(email),''),p_email),updated_at=now()
   WHERE id=selected_employee AND company_id=p_company AND user_id IS NULL AND portal_user_id IS NULL AND is_active RETURNING id INTO linked_employee;
  IF linked_employee IS NULL THEN RAISE EXCEPTION 'La scheda è stata collegata nel frattempo. Ricarica il personale'; END IF;
 ELSE
  INSERT INTO public.employees(company_id,user_id,first_name,last_name,email,phone,role_type,is_active)
   VALUES(p_company,p_user,p_nome,p_cognome,p_email,p_phone,p_tipo,true) RETURNING id INTO linked_employee;
 END IF;
 RETURN linked_employee;
END $$;
REVOKE ALL ON FUNCTION public.dipendente_accesso_prepara(uuid,text,text,text,uuid),public.collega_dipendente_accesso(uuid,uuid,uuid,text,text,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.dipendente_accesso_prepara(uuid,text,text,text,uuid),public.collega_dipendente_accesso(uuid,uuid,uuid,text,text,text,text,text) TO service_role;
NOTIFY pgrst,'reload schema';
