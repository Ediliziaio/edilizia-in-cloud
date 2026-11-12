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
 OR (lower(regexp_replace(trim(coalesce(first_name,'')||' '||coalesce(last_name,'')),'\s+',' ','g'))=lower(regexp_replace(trim(coalesce(p_nome,'')||' '||coalesce(p_cognome,'')),'\s+',' ','g'))));
 IF candidati>0 THEN RAISE EXCEPTION 'Persona già presente in Personale. Seleziona la scheda esistente per conservare cantieri e storico; se ha già accesso, gestiscilo dalla sua scheda'; END IF;
 RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.dipendente_accesso_prepara(uuid,text,text,text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.dipendente_accesso_prepara(uuid,text,text,text,uuid) TO service_role;
NOTIFY pgrst,'reload schema';
