-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.

-- P1 SECURITY: 3 viste erano SECURITY DEFINER + leggibili da anon → bypassavano
-- la RLS esponendo dati cross-tenant a chiunque avesse la anon key (nel bundle
-- frontend). Le tabelle base hanno RLS + grant authenticated, quindi passare a
-- security_invoker è NON-breaking per il frontend (usa JWT utente) e per l'edge
-- consumer (usa service_role, bypassa comunque la RLS).
--   v_ordine_marginalita     → margini/costi/ricavi di tutte le aziende
--   v_conversazioni_messaggi → corpi messaggi email/SMS/WhatsApp di tutte le aziende
--   portal_courses_available → contenuti corsi di tutte le aziende
-- Views recovered under this timestamp may be created later in a fresh replay.
DO $$ DECLARE v text; BEGIN
 FOREACH v IN ARRAY ARRAY['v_ordine_marginalita','v_conversazioni_messaggi','portal_courses_available'] LOOP
  IF to_regclass('public.'||v) IS NOT NULL THEN
   EXECUTE format('ALTER VIEW public.%I SET (security_invoker = on)',v);
   EXECUTE format('REVOKE SELECT ON public.%I FROM PUBLIC, anon',v);
  END IF;
 END LOOP;
END $$;
