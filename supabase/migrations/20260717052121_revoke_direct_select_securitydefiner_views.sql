-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.

-- SECURITY P0: 3 viste SECURITY DEFINER (security_invoker=off) davano SELECT
-- diretto ad authenticated/anon aggregando dati di TUTTE le aziende senza filtro
-- azienda al loro interno. Un utente loggato poteva interrogare la vista diretta
-- (PostgREST /rest/v1/<view>) e leggere cross-tenant:
--   v_conversazioni_messaggi   → email/SMS/WhatsApp/campagne di ogni azienda
--   v_subappaltatori_dashboard → subappaltatori di ogni azienda
--   v_fv_progetti_dashboard    → progetti fotovoltaico di ogni azienda
-- L'app NON interroga mai queste viste in diretta: le usa solo tramite RPC
-- SECURITY DEFINER (es. conversazione_timeline), che continuano a funzionare
-- perché girano come owner. Revochiamo quindi l'accesso diretto: la superficie
-- di leak sparisce senza toccare l'app.
-- Le viste *_public (ai_personas_public, referral_leaderboard_public) sono
-- pubbliche di proposito → lasciate intatte.
REVOKE SELECT ON public.v_conversazioni_messaggi FROM anon, authenticated;
REVOKE SELECT ON public.v_subappaltatori_dashboard FROM anon, authenticated;
REVOKE SELECT ON public.v_fv_progetti_dashboard FROM anon, authenticated;
