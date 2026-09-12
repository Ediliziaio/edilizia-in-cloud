-- Nella stessa azienda ci possono essere piu' Business Manager, piu' account
-- pubblicitari e piu' pagine. Vanno visti separati, non sommati.
--
-- Green Energy ne e' l'esempio: una connessione sola, un account, ma DUE pagine
-- («Greenenergy Group» e «Energia Più SRL»). I lead delle due pagine finiscono
-- nello stesso mucchio e non si sa quale delle due porta cosa. Con due Business
-- Manager il problema si moltiplica: due connessioni, due token, due account, e
-- una spesa totale che non dice da dove viene.
--
-- Questa funzione rompe il totale in tre livelli:
--  - le connessioni (un Business Manager = una riga), con lo stato del token;
--  - gli account pubblicitari, con la spesa e le richieste che hanno prodotto;
--  - le pagine, con le richieste arrivate da ognuna.
--
-- Le richieste per account si attribuiscono passando dalle campagne (la stessa
-- campagna dice a quale account appartiene e quali contatti ha portato); quelle
-- per pagina dall'evento con cui il lead e' entrato, che porta il page_id.
--
-- Provata su Green Energy il 12/09/2026: 62 richieste dalla pagina «Energia Più
-- SRL» e 61 da «Greenenergy Group», che prima erano un mucchio solo.

CREATE OR REPLACE FUNCTION public.admin_cliente_marketing_origini(
  p_service_client_id uuid,
  p_da date DEFAULT NULL,
  p_a date DEFAULT NULL)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH guardia AS (SELECT (SELECT public.mkt_vede_cliente(p_service_client_id)) AS ok),
  p AS (
    SELECT coalesce(p_da, coalesce(p_a, (now() AT TIME ZONE 'Europe/Rome')::date) - 29) AS da,
           coalesce(p_a, (now() AT TIME ZONE 'Europe/Rome')::date) AS a,
           ((coalesce(p_da, coalesce(p_a, (now() AT TIME ZONE 'Europe/Rome')::date) - 29))::timestamp AT TIME ZONE 'Europe/Rome') AS t_da,
           (((coalesce(p_a, (now() AT TIME ZONE 'Europe/Rome')::date)) + 1)::timestamp AT TIME ZONE 'Europe/Rome') AS t_a
  ),
  cli AS (
    SELECT sc.company_id
      FROM public.aedix_service_clients sc CROSS JOIN guardia
     WHERE sc.id = p_service_client_id AND guardia.ok AND sc.company_id IS NOT NULL
  ),
  -- Una riga per Business Manager collegato.
  conn AS (
    SELECT i.id, i.status, i.created_at, i.last_sync_at,
           (SELECT count(*) FROM public.meta_assets a WHERE a.integration_id = i.id AND a.asset_type = 'ad_account') AS account_visti,
           (SELECT count(*) FROM public.meta_assets a WHERE a.integration_id = i.id AND a.asset_type = 'ad_account' AND a.selected) AS account_scelti,
           (SELECT count(*) FROM public.meta_assets a WHERE a.integration_id = i.id AND a.asset_type = 'page' AND a.selected) AS pagine_scelte
      FROM public.integrations i JOIN cli ON cli.company_id = i.company_id
     WHERE i.provider = 'meta'
  ),
  -- Spesa per account pubblicitario.
  sp AS (
    SELECT m.account_esterno_id AS account,
           sum(m.spesa) AS spesa, sum(m.copertura) AS copertura, sum(m.click) AS click,
           sum(m.impression) AS impression, sum(m.lead_dichiarati) AS lead_dichiarati,
           max(m.giorno) AS ultimo_giorno, count(*) AS giorni
      FROM public.mkt_spesa_giornaliera m JOIN cli ON cli.company_id = m.company_id CROSS JOIN p
     WHERE m.giorno BETWEEN p.da AND p.a
     GROUP BY 1
  ),
  -- Quale campagna appartiene a quale account: e' il ponte per attribuire le
  -- richieste vere del CRM all'account che le ha pagate.
  camp AS (
    SELECT DISTINCT i.campagna_id, i.account_esterno_id AS account
      FROM public.mkt_spesa_inserzione i JOIN cli ON cli.company_id = i.company_id CROSS JOIN p
     WHERE i.giorno BETWEEN p.da AND p.a AND i.livello = 'campagna'
  ),
  ld_account AS (
    SELECT camp.account, count(*) AS lead
      FROM public.marketing_contacts mc
      JOIN cli ON cli.company_id = mc.company_id
      JOIN camp ON camp.campagna_id = mc.meta_campaign_id
      CROSS JOIN p
     WHERE mc.created_at >= p.t_da AND mc.created_at < p.t_a
     GROUP BY 1
  ),
  -- Richieste per pagina: il page_id sta nell'evento con cui il lead e' entrato.
  ld_pagina AS (
    SELECT e.payload->>'page_id' AS pagina, count(*) AS lead,
           count(*) FILTER (WHERE o.status = 'won') AS vendite,
           coalesce(sum(o.value) FILTER (WHERE o.status = 'won'), 0) AS valore,
           max(mc.created_at) AS ultimo
      FROM public.marketing_contacts mc
      JOIN cli ON cli.company_id = mc.company_id
      JOIN public.integration_webhook_events e
        ON e.company_id = mc.company_id AND e.event_id = mc.meta_lead_id::text
      CROSS JOIN p
      LEFT JOIN LATERAL (
        SELECT o2.status, o2.value FROM public.marketing_opportunities o2
         WHERE o2.contact_id = mc.id AND o2.deleted_at IS NULL
         ORDER BY (o2.status = 'won') DESC, o2.created_at DESC LIMIT 1
      ) o ON true
     WHERE mc.created_at >= p.t_da AND mc.created_at < p.t_a
       AND e.payload->>'page_id' IS NOT NULL
     GROUP BY 1
  )
  SELECT jsonb_build_object(
    'connessioni', (SELECT coalesce(jsonb_agg(jsonb_build_object(
                      'id', c.id, 'stato', c.status, 'collegata_il', c.created_at,
                      'ultima_sincronizzazione', c.last_sync_at,
                      'account_visti', c.account_visti, 'account_scelti', c.account_scelti,
                      'pagine_scelte', c.pagine_scelte) ORDER BY c.created_at), '[]'::jsonb) FROM conn c),
    'account', (SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.spesa DESC NULLS LAST), '[]'::jsonb) FROM (
        SELECT coalesce(sp.account, a.asset_id) AS id,
               coalesce(max(a.asset_name), coalesce(sp.account, a.asset_id)) AS nome,
               coalesce(max(sp.spesa), 0) AS spesa,
               max(sp.copertura) AS copertura, max(sp.click) AS click, max(sp.impression) AS impression,
               coalesce(max(sp.lead_dichiarati), 0) AS lead_dichiarati,
               coalesce(max(ld_account.lead), 0) AS lead,
               CASE WHEN coalesce(max(ld_account.lead), 0) > 0 AND coalesce(max(sp.spesa), 0) > 0
                    THEN round(max(sp.spesa) / max(ld_account.lead), 2) END AS cpl,
               max(sp.ultimo_giorno) AS ultimo_giorno,
               coalesce(max(sp.giorni), 0) AS giorni_con_spesa,
               bool_or(coalesce(a.selected, false)) AS scelto
          FROM sp
          FULL JOIN (SELECT a2.asset_id, a2.asset_name, a2.selected
                       FROM public.meta_assets a2 JOIN cli ON cli.company_id = a2.company_id
                      WHERE a2.asset_type = 'ad_account' AND a2.selected) a ON a.asset_id = sp.account
          LEFT JOIN ld_account ON ld_account.account = coalesce(sp.account, a.asset_id)
         GROUP BY coalesce(sp.account, a.asset_id)
      ) x),
    'pagine', (SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.lead DESC NULLS LAST), '[]'::jsonb) FROM (
        SELECT coalesce(lp.pagina, a.asset_id) AS id,
               coalesce(max(a.asset_name), coalesce(lp.pagina, a.asset_id)) AS nome,
               coalesce(max(lp.lead), 0) AS lead,
               coalesce(max(lp.vendite), 0) AS vendite,
               coalesce(max(lp.valore), 0) AS valore,
               max(lp.ultimo) AS ultimo
          FROM ld_pagina lp
          FULL JOIN (SELECT a2.asset_id, a2.asset_name
                       FROM public.meta_assets a2 JOIN cli ON cli.company_id = a2.company_id
                      WHERE a2.asset_type = 'page' AND a2.selected) a ON a.asset_id = lp.pagina
         GROUP BY coalesce(lp.pagina, a.asset_id)
      ) x),
    'periodo', (SELECT jsonb_build_object('da', p.da, 'a', p.a) FROM p)
  )
  WHERE (SELECT ok FROM guardia);
$$;

COMMENT ON FUNCTION public.admin_cliente_marketing_origini(uuid, date, date) IS
  'Business Manager, account pubblicitari e pagine del cliente, ognuno con la sua spesa e le sue richieste. Non sommati.';

REVOKE ALL ON FUNCTION public.admin_cliente_marketing_origini(uuid, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_cliente_marketing_origini(uuid, date, date) TO authenticated, service_role;
