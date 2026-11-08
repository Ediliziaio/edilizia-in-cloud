-- Audit e classificazione atomici: l'audit non accetta INSERT diretti dal browser.
-- Mantiene i requisiti delle policy company_tags: superadmin e account non bloccato.
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='60s';
CREATE OR REPLACE FUNCTION public.admin_set_company_group(p_company_ids uuid[], p_group text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE company uuid; group_name text := btrim(coalesce(p_group,''));
BEGIN
 IF public.is_super_admin(auth.uid()) IS NOT TRUE OR public.utente_bloccato() IS TRUE THEN
   RAISE EXCEPTION 'Operazione riservata al superadmin' USING ERRCODE='42501';
 END IF;
 IF coalesce(cardinality(p_company_ids),0) NOT BETWEEN 1 AND 200 OR length(group_name)>80 THEN
   RAISE EXCEPTION 'Selezionare da 1 a 200 aziende; nome gruppo massimo 80 caratteri';
 END IF;
 FOR company IN SELECT DISTINCT x FROM unnest(p_company_ids) x ORDER BY x LOOP
   PERFORM pg_advisory_xact_lock(hashtextextended(company::text, 712));
   DELETE FROM public.company_tags WHERE company_id=company AND tag LIKE 'Gruppo: %';
   IF group_name<>'' THEN
     INSERT INTO public.company_tags(company_id,tag,color) VALUES(company,'Gruppo: '||group_name,'#6366f1');
   END IF;
 END LOOP;
 INSERT INTO public.admin_audit_log(user_id,action,target_type,details)
 VALUES(auth.uid(),'set_company_group','company',jsonb_build_object('company_ids',p_company_ids,'group',nullif(group_name,'')));
END $$;
REVOKE ALL ON FUNCTION public.admin_set_company_group(uuid[],text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_company_group(uuid[],text) TO authenticated;


