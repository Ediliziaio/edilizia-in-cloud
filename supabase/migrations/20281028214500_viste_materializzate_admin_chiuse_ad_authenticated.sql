-- Le due viste materializzate di piattaforma non si leggono più dal browser.
--
-- Il controllo di Supabase le segnalava da tempo (materialized_view_in_api) e il
-- 28/10/2026 la prova è questa: `set role authenticated; select count(*) from
-- public.mv_company_metrics` → 28 righe, con mrr_listino, mrr_incassato, utenti,
-- clienti, ordini e ultimo accesso di OGNI azienda. Una vista materializzata non
-- rispetta le policy RLS: col GRANT a `authenticated` qualunque utente loggato di
-- qualunque azienda poteva chiederla a PostgREST. Lo stesso per
-- admin_dashboard_summary.
--
-- Nessuno dei lettori veri perde l'accesso: le sette funzioni che le
-- interrogano (admin_order_companies, admin_home_aziende, admin_home_soldi,
-- admin_kpi_saas, admin_consumi_aziende, admin_briefing_operativo,
-- get_company_user_counts_v2) sono tutte SECURITY DEFINER, e
-- admin_dashboard_summary la legge solo la edge function admin-dashboard-data
-- col service role. Il privilegio del chiamante non viene controllato.
--
-- Solo privilegi: nessuna riga scritta, nessun lock su tabelle grandi.
REVOKE SELECT ON public.mv_company_metrics FROM anon, authenticated;
REVOKE SELECT ON public.admin_dashboard_summary FROM anon, authenticated;
