-- ============================================================================
-- Ripristina l'accesso a due viste dashboard usate dal client — ora in
-- sicurezza, dopo il passaggio a security_invoker.
--
-- Storia: il 2026-07-17 un fix P0 (20260717100000 e sorelle) REVOCÒ la SELECT
-- ad authenticated su v_fv_progetti_dashboard e v_subappaltatori_dashboard,
-- perché allora giravano security_invoker=OFF (coi permessi dell'owner) e
-- leggevano cross-tenant. La nota della migration diceva "l'app non le
-- interroga mai in diretta": era sbagliata per queste due —
--   · src/lib/fotovoltaico/queries.ts        (dashboard fotovoltaico)
--   · src/pages/azienda/SubappaltatoriPage.tsx (pagina subappaltatori)
-- le interrogano come utente loggato. Dal 2026-07-17 quelle pagine ricevevano
-- 403 e restavano VUOTE.
--
-- Dal 20280227 entrambe le viste hanno security_invoker=on: ora rispettano la
-- RLS delle tabelle sorgente (fv_progetti filtra per get_effective_company_id;
-- contratti_subappalto/ritenute_garanzia/sal_subappaltatori/subappaltatori/
-- subappaltatori_sicurezza hanno tutte RLS+policy per-azienda). Ridare la SELECT
-- è quindi sicuro: l'utente vede SOLO la propria azienda. Verificato in prod col
-- token di un utente demo — fv 36→6 righe (1 azienda), sub 156→9 (1 azienda) —
-- e le due pagine tornano a popolarsi.
--
-- Il flag security_invoker viene RI-asserito qui apposta: grant e invoker devono
-- viaggiare insieme. Un CREATE OR REPLACE VIEW futuro senza il flag (è già
-- successo: 20271011 azzerò l'invoker della vista subappaltatori) riaprirebbe il
-- leak con la SELECT attiva. Chi ridefinisce queste viste rimetta il flag.
--
-- v_conversazioni_messaggi resta SENZA grant: nessun client la interroga.
-- ============================================================================

ALTER VIEW public.v_fv_progetti_dashboard    SET (security_invoker = on);
ALTER VIEW public.v_subappaltatori_dashboard SET (security_invoker = on);

GRANT SELECT ON public.v_fv_progetti_dashboard    TO authenticated;
GRANT SELECT ON public.v_subappaltatori_dashboard TO authenticated;

NOTIFY pgrst, 'reload schema';
