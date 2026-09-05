-- ============================================================================
-- FIX multi-tenant: viste public.* senza security_invoker.
--
-- Una vista Postgres senza `security_invoker=on` gira coi permessi del suo
-- OWNER (postgres), che bypassa la RLS delle tabelle sotto. Risultato: un
-- utente loggato di un'azienda, interrogando la vista via API senza filtro
-- company_id, leggeva le righe di TUTTE le aziende.
--
-- Verificato in prod col token di un utente demo (azienda Demo 2):
--   · v_ordine_marginalita       → 535 righe di 5 aziende  (fatturato/margini)
--   · v_cg_costi_classificati    → 468 righe di 2 aziende  (costi CdG + banca)
--   · supplier_procurement_report→  44 righe di 4 aziende  (acquisti fornitori)
-- Altre tre viste per-azienda erano prive di GRANT (403 via API): non
-- sfruttabili oggi, ma le blindiamo lo stesso — una GRANT aggiunta domani
-- riaprirebbe il buco in silenzio.
--
-- security_invoker=on fa rispettare la RLS delle tabelle sorgente (tutte
-- verificate: RLS attiva + policy per authenticated). Le edge function che
-- girano da service_role non sono toccate (service_role bypassa la RLS a
-- prescindere). Restano ESCLUSE le due viste *_public, pubbliche per disegno:
-- ai_personas_public (solo personas di sistema, nessun dato d'azienda) e
-- referral_leaderboard_public (classifica col nome mascherato).
-- ============================================================================

ALTER VIEW public.v_ordine_marginalita       SET (security_invoker = on);
ALTER VIEW public.v_cg_costi_classificati    SET (security_invoker = on);
ALTER VIEW public.supplier_procurement_report SET (security_invoker = on);
ALTER VIEW public.v_conversazioni_messaggi   SET (security_invoker = on);
ALTER VIEW public.v_fv_progetti_dashboard    SET (security_invoker = on);
ALTER VIEW public.v_subappaltatori_dashboard SET (security_invoker = on);

NOTIFY pgrst, 'reload schema';
