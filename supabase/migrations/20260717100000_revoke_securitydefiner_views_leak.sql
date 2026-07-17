-- SECURITY P0: 3 viste SECURITY DEFINER (security_invoker=off) davano SELECT
-- diretto ad authenticated/anon aggregando dati di TUTTE le aziende senza filtro
-- azienda interno. Un utente loggato poteva interrogare la vista in diretta
-- (PostgREST /rest/v1/<view>) e leggere cross-tenant:
--   v_conversazioni_messaggi   -> email/SMS/WhatsApp/campagne di ogni azienda
--   v_subappaltatori_dashboard -> subappaltatori di ogni azienda
--   v_fv_progetti_dashboard    -> progetti fotovoltaico di ogni azienda
-- L'app NON interroga mai queste viste in diretta (solo via RPC SECURITY DEFINER
-- es. conversazione_timeline, che gira come owner e continua a funzionare).
-- Azzeriamo ogni privilegio anon/authenticated: superficie di leak eliminata.
-- Le viste *_public (ai_personas_public, referral_leaderboard_public) sono
-- pubbliche di proposito -> intatte.
REVOKE ALL ON public.v_conversazioni_messaggi FROM anon, authenticated;
REVOKE ALL ON public.v_subappaltatori_dashboard FROM anon, authenticated;
REVOKE ALL ON public.v_fv_progetti_dashboard FROM anon, authenticated;
