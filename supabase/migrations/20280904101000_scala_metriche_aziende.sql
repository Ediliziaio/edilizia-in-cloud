-- F4-01 / F4-02 — La lista aziende smette di scansionare tutto a ogni apertura.
--
-- PRIMA: ordinare per MRR, utenti, ordini o ultimo accesso scaricava fino a
-- 5.000 righe e ordinava lato client. Oltre quella soglia la classifica era
-- sbagliata e nulla lo segnalava. In più get_company_user_counts_v2 contava gli
-- utenti di TUTTE le aziende a ogni apertura della pagina, con due sottoquery
-- per riga: invisibile a 18 aziende, dominante a mille.
--
-- ORA: una vista materializzata raccoglie le metriche per azienda, aggiornata
-- ogni 15 minuti; la funzione di conteggio la legge invece di ricalcolare.
-- Firma invariata: il frontend non cambia.
--
-- NB: count(DISTINCT) sui ruoli — la prima versione contava due volte chi ha
-- più ruoli (81 staff diventavano 98).

CREATE MATERIALIZED VIEW IF NOT EXISTS public.mv_company_metrics AS
SELECT
  c.id AS company_id, c.name, c.status, c.deleted_at,
  COALESCE(sp.price_monthly, 0)::numeric AS mrr_listino,
  CASE
    WHEN COALESCE(c.billing_comped, false) THEN 0
    WHEN c.stripe_subscription_status = 'active' THEN COALESCE(sp.price_monthly, 0)
    ELSE 0
  END::numeric AS mrr_incassato,
  (SELECT count(*) FROM public.profiles p WHERE p.company_id = c.id) AS utenti_totali,
  (SELECT count(DISTINCT p.id) FROM public.profiles p
     JOIN public.user_roles ur ON ur.user_id = p.id
    WHERE p.company_id = c.id AND ur.role <> 'customer') AS utenti_staff,
  (SELECT count(DISTINCT p.id) FROM public.profiles p
     JOIN public.user_roles ur ON ur.user_id = p.id
    WHERE p.company_id = c.id AND ur.role = 'customer') AS clienti,
  (SELECT count(*) FROM public.orders o WHERE o.company_id = c.id) AS ordini,
  (SELECT max(us.last_active_at) FROM public.user_sessions us WHERE us.company_id = c.id) AS ultimo_accesso,
  (SELECT count(*) FROM public.user_sessions us
    WHERE us.company_id = c.id AND us.last_active_at > now() - interval '30 days') AS sessioni_30g,
  now() AS aggiornato_il
FROM public.companies c
LEFT JOIN public.subscription_plans sp ON sp.id = c.subscription_plan_id
WHERE COALESCE(c.is_platform_admin_company, false) = false;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_company_metrics_pk ON public.mv_company_metrics (company_id);
CREATE INDEX IF NOT EXISTS idx_mv_company_metrics_mrr ON public.mv_company_metrics (mrr_incassato DESC);
CREATE INDEX IF NOT EXISTS idx_mv_company_metrics_accesso ON public.mv_company_metrics (ultimo_accesso DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_mv_company_metrics_utenti ON public.mv_company_metrics (utenti_totali DESC);
GRANT SELECT ON public.mv_company_metrics TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_company_user_counts_v2()
RETURNS TABLE (company_id uuid, staff_count bigint, customer_count bigint, total_count bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT m.company_id, m.utenti_staff, m.clienti, m.utenti_totali
  FROM public.mv_company_metrics m
  WHERE m.deleted_at IS NULL;
$function$;

REVOKE ALL ON FUNCTION public.get_company_user_counts_v2() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_company_user_counts_v2() TO authenticated, service_role;

SELECT cron.schedule('refresh-company-metrics', '*/15 * * * *',
  $$REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_company_metrics$$);
