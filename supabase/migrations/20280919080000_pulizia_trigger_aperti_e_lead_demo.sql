-- Pulizia dall'audit del 19/09/2026.
--
-- 1. Quattro funzioni di trigger risultavano «NON CLASSIFICATA» in
--    v_funzioni_aperte_ad_anon: nate con EXECUTE a PUBLIC come ogni funzione.
--    Non erano sfruttabili (ritornano `trigger`, partono solo da un trigger),
--    ma la regola è che nascano chiuse, e ai trigger l'EXECUTE non serve.
--    Dopo: zero funzioni aperte non classificate.
--
-- 2. I lead Meta della Demo Azienda (collegamento scaduto l'08/06) si
--    accumulavano in «pending» senza tentativi: il 17/09 una coda così aveva
--    fermato i lead di tutte le aziende. Chiusi con il motivo, come allora.

revoke all on function public.crea_tetto_spesa_ads() from public, anon, authenticated;
revoke all on function public.trg_fn_order_teams_google_sync() from public, anon, authenticated;
revoke all on function public.trg_fn_orders_google_sync() from public, anon, authenticated;
revoke all on function public.warehouse_movements_completa_azienda() from public, anon, authenticated;

update public.integration_webhook_events e
   set status = 'failed',
       last_fail_reason = 'Collegamento Meta di Demo Azienda scaduto dall''08/06 (token_expired): evento non elaborabile. Tolto dalla coda il 19/09 (audit), come i 23 del 17/09.'
 where e.status = 'pending'
   and e.provider = 'meta'
   and e.company_id = (select id from public.companies where name = 'Demo Azienda S.r.l.' limit 1);
