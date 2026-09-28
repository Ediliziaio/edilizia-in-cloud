-- Badge sidebar «Chat»: quante conversazioni (WhatsApp/email/IG/…) hanno
-- messaggi da leggere. Conteggio leggero da tenere sempre acceso nella sidebar,
-- senza scaricare tutta la lista inbox: riusa conversazioni_lista (che calcola
-- già i non_letti e fa il controllo di appartenenza all'azienda) e ne conta
-- solo le entità con almeno un messaggio non letto — lo stesso «Non lette N»
-- della pagina Chat.
CREATE OR REPLACE FUNCTION public.conversazioni_non_lette(p_company_id uuid)
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT count(*)::integer
    FROM public.conversazioni_lista(p_company_id)
   WHERE non_letti > 0;
$function$;

-- Come conversazioni_lista: chiusa ad anon, aperta a chi ha una sessione.
REVOKE ALL ON FUNCTION public.conversazioni_non_lette(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.conversazioni_non_lette(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.conversazioni_non_lette(uuid) TO service_role;
