-- F5-01 — Le metriche che un investitore chiede, sulla base verificata.
--
-- La dashboard mostrava MRR, churn e conversione tutti calcolati male. Corretti
-- quelli (mrr_snapshots per l'incassato, company_status_events per le uscite),
-- le metriche derivate si possono finalmente costruire senza ereditare errori:
-- ARPU, LTV, retention per coorte e adozione non sono numeri nuovi, sono
-- rapporti fra numeri che ora dicono il vero.
--
-- Ogni valore è ricavabile fino alle aziende che lo compongono: una metrica che
-- non si può aprire è una metrica di cui non ci si può fidare.

CREATE OR REPLACE FUNCTION public.admin_kpi_saas()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_mrr          numeric;
  v_regalato     numeric;
  v_contratto    numeric;
  v_paganti      int;
  v_attive       int;
  v_churn_30g    int;
  v_nuove_30g    int;
  v_vita_media   numeric;
  v_adozione     jsonb;
  v_coorti       jsonb;
BEGIN
  IF NOT public.is_super_admin(auth.uid()) AND NOT public.is_platform_staff(auth.uid()) THEN
    RAISE EXCEPTION 'Accesso riservato allo staff di piattaforma' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(mrr_stripe_cents, 0) / 100.0,
         COALESCE(mrr_regalato_cents, 0) / 100.0
    INTO v_mrr, v_regalato
    FROM public.mrr_snapshots ORDER BY data DESC LIMIT 1;

  SELECT count(*) FILTER (WHERE m.mrr_incassato > 0),
         count(*) FILTER (WHERE c.status = 'active'),
         COALESCE(sum(m.mrr_listino) FILTER (WHERE c.status = 'active'), 0)
    INTO v_paganti, v_attive, v_contratto
    FROM public.companies c
    LEFT JOIN public.mv_company_metrics m ON m.company_id = c.id
   WHERE COALESCE(c.is_platform_admin_company, false) = false
     AND c.deleted_at IS NULL;

  -- Uscite reali del mese: passaggi di stato registrati, non righe modificate.
  SELECT count(DISTINCT company_id) INTO v_churn_30g
    FROM public.company_status_events
   WHERE stato_a IN ('suspended', 'expired')
     AND avvenuto_il > now() - interval '30 days';

  SELECT count(*) INTO v_nuove_30g
    FROM public.companies
   WHERE created_at > now() - interval '30 days'
     AND COALESCE(is_platform_admin_company, false) = false
     AND deleted_at IS NULL;

  -- Vita media in mesi delle aziende uscite: base del valore di un cliente.
  SELECT round(avg(EXTRACT(EPOCH FROM (e.avvenuto_il - c.created_at)) / 2592000.0)::numeric, 1)
    INTO v_vita_media
    FROM public.company_status_events e
    JOIN public.companies c ON c.id = e.company_id
   WHERE e.stato_a IN ('suspended', 'expired');

  -- Adozione: quante aziende usano davvero ciascun modulo attivato.
  SELECT COALESCE(jsonb_agg(t ORDER BY t.aziende DESC), '[]'::jsonb) INTO v_adozione
  FROM (
    SELECT f.feature_key AS funzionalita, count(*) AS aziende
      FROM public.company_feature_overrides f
      JOIN public.companies c ON c.id = f.company_id
     WHERE COALESCE(f.is_enabled, false)
       AND c.deleted_at IS NULL
       AND COALESCE(c.is_platform_admin_company, false) = false
     GROUP BY f.feature_key
     ORDER BY count(*) DESC
     LIMIT 15
  ) t;

  -- Retention per coorte di iscrizione: quante restano attive dopo N mesi.
  SELECT COALESCE(jsonb_agg(t ORDER BY t.coorte DESC), '[]'::jsonb) INTO v_coorti
  FROM (
    SELECT date_trunc('month', c.created_at)::date AS coorte,
           count(*)                                 AS iscritte,
           count(*) FILTER (WHERE c.status = 'active') AS ancora_attive,
           round(100.0 * count(*) FILTER (WHERE c.status = 'active') / NULLIF(count(*), 0), 1) AS retention_pct
      FROM public.companies c
     WHERE COALESCE(c.is_platform_admin_company, false) = false
       AND c.deleted_at IS NULL
     GROUP BY 1
     ORDER BY 1 DESC
     LIMIT 12
  ) t;

  RETURN jsonb_build_object(
    'mrr_incassato',   v_mrr,
    'arr_incassato',   round(COALESCE(v_mrr, 0) * 12, 2),
    'mrr_regalato',    v_regalato,
    'mrr_contratto',   v_contratto,
    'aziende_paganti', v_paganti,
    'aziende_attive',  v_attive,
    -- ARPU sui soli paganti: dividerlo su tutte le attive lo diluirebbe con
    -- chi non versa nulla, ed è esattamente il tipo di numero gonfiato che
    -- questo lavoro sta togliendo di mezzo.
    'arpu',            CASE WHEN v_paganti > 0
                            THEN round(COALESCE(v_mrr, 0) / v_paganti, 2) END,
    'churn_mensile_pct', CASE WHEN v_attive > 0
                              THEN round(100.0 * v_churn_30g / v_attive, 1) END,
    'aziende_uscite_30g', v_churn_30g,
    'aziende_nuove_30g',  v_nuove_30g,
    'vita_media_mesi',    v_vita_media,
    -- LTV = ricavo medio per cliente moltiplicato per la sua vita media.
    'ltv',             CASE WHEN v_paganti > 0 AND v_vita_media IS NOT NULL
                            THEN round((COALESCE(v_mrr, 0) / v_paganti) * v_vita_media, 2) END,
    'quota_regalato_pct', CASE WHEN COALESCE(v_mrr, 0) + COALESCE(v_regalato, 0) > 0
                               THEN round(100.0 * COALESCE(v_regalato, 0)
                                          / (COALESCE(v_mrr, 0) + COALESCE(v_regalato, 0)), 1) END,
    'adozione_funzionalita', v_adozione,
    'coorti',          v_coorti,
    'calcolato_il',    now()
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_kpi_saas() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_kpi_saas() TO authenticated, service_role;
