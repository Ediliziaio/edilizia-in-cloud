-- P1 SECURITY: 3 viste erano SECURITY DEFINER + leggibili da anon → bypassavano
-- la RLS esponendo dati cross-tenant a chiunque avesse la anon key (nel bundle
-- frontend). Le tabelle base hanno RLS + grant authenticated, quindi passare a
-- security_invoker è NON-breaking per il frontend (usa JWT utente) e per l'edge
-- consumer (usa service_role, bypassa comunque la RLS).
--   v_ordine_marginalita     → margini/costi/ricavi di tutte le aziende
--   v_conversazioni_messaggi → corpi messaggi email/SMS/WhatsApp di tutte le aziende
--   portal_courses_available → contenuti corsi di tutte le aziende
ALTER VIEW public.v_ordine_marginalita     SET (security_invoker = on);
ALTER VIEW public.v_conversazioni_messaggi SET (security_invoker = on);
ALTER VIEW public.portal_courses_available SET (security_invoker = on);

-- Defense in depth: queste viste non devono essere accessibili da anon.
REVOKE SELECT ON public.v_ordine_marginalita     FROM anon;
REVOKE SELECT ON public.v_conversazioni_messaggi FROM anon;
REVOKE SELECT ON public.portal_courses_available FROM anon;
