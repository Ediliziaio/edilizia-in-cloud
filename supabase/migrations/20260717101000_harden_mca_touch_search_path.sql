-- Hardening (advisor function_search_path_mutable): il trigger su
-- multi_company_access girava senza search_path fisso. SET search_path=''
-- chiude il vettore di search-path injection su una tabella di controllo accessi.
CREATE OR REPLACE FUNCTION public.mca_touch_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN NEW.updated_at := now(); RETURN NEW; END;
$function$;
