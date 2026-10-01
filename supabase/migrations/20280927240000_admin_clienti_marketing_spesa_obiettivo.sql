-- Console «Clienti marketing»: la spesa Meta divisa per obiettivo di campagna.
-- Il titolare vuole tenere separata la spesa delle campagne di CONVERSIONE
-- (lead form o conversione sul sito) da quella che non porta richieste dirette
-- (traffico, video, interazioni, notorietà), così il costo per lead non è
-- gonfiato dalla spesa di brand.
--
-- Il dato per campagna con l'obiettivo Meta c'è già: lo scrive giorno per giorno
-- meta-ads-sync-insights in mkt_spesa_inserzione (livello='campagna', colonna
-- obiettivo). Questa RPC lo somma sulla stessa finestra della console
-- (mese, oppure l'intervallo p_da/p_a) e lo divide in tre: conversione, altro,
-- non classificata (campagne senza obiettivo noto). Sui giorni coperti la somma
-- coincide con il totale account della console.
--
-- Classificazione robusta sulla stringa dell'obiettivo (ODAX e legacy):
--   conversione = contiene LEAD / SALES / CONVERSION
--                 (OUTCOME_LEADS, LEAD_GENERATION, OUTCOME_SALES, CONVERSIONS…)
--   altro       = ogni altro obiettivo noto (OUTCOME_TRAFFIC, OUTCOME_ENGAGEMENT,
--                 OUTCOME_AWARENESS, VIDEO_VIEWS, REACH, MESSAGES…)
-- L'ambito (chi vede quali clienti) è lo stesso della console: piattaforma vede
-- tutti, il commerciale solo i suoi.
CREATE OR REPLACE FUNCTION public.admin_clienti_marketing_spesa_obiettivo(
  p_mese date DEFAULT (date_trunc('month'::text, now()))::date,
  p_da date DEFAULT NULL,
  p_a date DEFAULT NULL
)
 RETURNS TABLE(company_id uuid, spesa_conversione numeric, spesa_altro numeric, spesa_non_classificata numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH par AS (
    SELECT coalesce(p_da, date_trunc('month', p_mese)::date) AS m0,
           coalesce((p_a + 1), (date_trunc('month', p_mese) + interval '1 month')::date) AS m1
  ),
  cli AS (
    SELECT DISTINCT c.company_id
      FROM public.aedix_service_clients c
      JOIN public.companies co ON co.id = c.company_id
      JOIN public.aedix_product_lines l ON l.id = c.product_line_id
     WHERE c.company_id IS NOT NULL
       AND l.categoria IN ('agenzia', 'performance')
       AND ((SELECT public.mkt_vede_tutto())
            OR ((SELECT public.is_platform_staff()) AND c.commerciale_id = (SELECT auth.uid())))
  )
  SELECT i.company_id,
         coalesce(sum(i.spesa) FILTER (WHERE i.obiettivo ILIKE '%LEAD%' OR i.obiettivo ILIKE '%SALES%' OR i.obiettivo ILIKE '%CONVERSION%'), 0) AS spesa_conversione,
         coalesce(sum(i.spesa) FILTER (WHERE i.obiettivo IS NOT NULL AND NOT (i.obiettivo ILIKE '%LEAD%' OR i.obiettivo ILIKE '%SALES%' OR i.obiettivo ILIKE '%CONVERSION%')), 0) AS spesa_altro,
         coalesce(sum(i.spesa) FILTER (WHERE i.obiettivo IS NULL), 0) AS spesa_non_classificata
    FROM public.mkt_spesa_inserzione i
    JOIN cli ON cli.company_id = i.company_id
    JOIN par ON true
   WHERE i.canale = 'meta' AND i.livello = 'campagna'
     AND i.giorno >= par.m0 AND i.giorno < par.m1
   GROUP BY i.company_id;
$function$;

-- Come la console: chiusa ad anon, aperta a chi ha una sessione.
REVOKE ALL ON FUNCTION public.admin_clienti_marketing_spesa_obiettivo(date, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_clienti_marketing_spesa_obiettivo(date, date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_clienti_marketing_spesa_obiettivo(date, date, date) TO service_role;
