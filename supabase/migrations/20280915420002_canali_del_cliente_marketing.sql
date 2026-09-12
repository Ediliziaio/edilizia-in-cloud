-- Da quale canale arriva ogni euro e ogni richiesta.
--
-- Finora la scheda sommava tutto: una riga di spesa e una di lead, senza dire
-- se venivano da Facebook, da Google o da altro. Con piu' canali accesi quel
-- totale non serve a niente — un CPL medio fra un canale a 8 euro e uno a 40
-- non e' il CPL di nessuno dei due.
--
-- Due pezzi:
--  1. mkt_canale_di(): l'unica regola con cui si decide il canale di un
--     contatto. La stessa che gia' usava il riepilogo, piu' TikTok, e scritta
--     una volta sola perche' costi e richieste siano classificati allo stesso
--     modo. Prima gli identificativi certi (meta_lead_id, fbclid, gclid), poi i
--     nomi scritti nella fonte.
--  2. admin_cliente_marketing_canali(): per ogni canale, quanto e' costato,
--     quante persone ha raggiunto, quante richieste ha portato davvero nel CRM
--     e quanto ha venduto. Dice anche da dove viene il costo: sincronizzato,
--     messo a mano, o non collegato affatto (righe senza spesa ma con lead).
--
-- Oggi l'unico canale che si sincronizza da solo e' Meta. Google e TikTok
-- compaiono qui appena qualcuno collega l'account o inserisce i costi a mano:
-- la struttura non va piu' toccata.

CREATE OR REPLACE FUNCTION public.mkt_canale_di(
  p_source text,
  p_source_channel text,
  p_meta_lead_id text DEFAULT NULL,
  p_fbclid text DEFAULT NULL,
  p_gclid text DEFAULT NULL)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $fn$
  SELECT CASE
    -- Identificativi certi: non c'e' niente da interpretare.
    WHEN p_meta_lead_id IS NOT NULL OR p_fbclid IS NOT NULL THEN 'meta'
    WHEN p_gclid IS NOT NULL THEN 'google'
    -- Poi quello che c'e' scritto nella fonte.
    WHEN p_source ILIKE '%tiktok%' OR p_source ILIKE '%tik tok%'
      OR p_source_channel ILIKE '%tiktok%' THEN 'tiktok'
    WHEN p_source ILIKE '%meta%' OR p_source ILIKE '%facebook%' OR p_source ILIKE '%instagram%'
      OR p_source ILIKE '%lead ads%'
      OR lower(coalesce(p_source_channel, '')) IN ('facebook', 'meta', 'instagram') THEN 'meta'
    WHEN p_source ILIKE '%google%' OR p_source_channel ILIKE '%google%' THEN 'google'
    WHEN p_source ILIKE 'form%' OR p_source ILIKE '%sito%' OR p_source ILIKE '%website%'
      OR p_source ILIKE '%landing%'
      OR lower(coalesce(p_source_channel, '')) IN ('form', 'website', 'sito', 'landing') THEN 'form'
    ELSE 'altro'
  END;
$fn$;

COMMENT ON FUNCTION public.mkt_canale_di(text, text, text, text, text) IS
  'Il canale di un contatto: meta, google, tiktok, form, altro. Unica regola per costi e richieste.';

REVOKE ALL ON FUNCTION public.mkt_canale_di(text, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mkt_canale_di(text, text, text, text, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.admin_cliente_marketing_canali(
  p_service_client_id uuid,
  p_da date DEFAULT NULL,
  p_a date DEFAULT NULL)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH guardia AS (
    SELECT (SELECT public.mkt_vede_cliente(p_service_client_id)) AS ok
  ),
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
  -- Costi importati dalle piattaforme, gia' divisi per canale.
  sp AS (
    SELECT lower(m.canale) AS canale,
           sum(m.spesa) AS spesa,
           sum(m.copertura) AS copertura,
           sum(m.interazioni) AS interazioni,
           sum(m.click) AS click,
           sum(m.impression) AS impression,
           sum(m.lead_dichiarati) AS lead_dichiarati,
           max(m.sincronizzato_il) AS aggiornato_il,
           count(*) AS giorni_con_dati
      FROM public.mkt_spesa_giornaliera m JOIN cli ON cli.company_id = m.company_id CROSS JOIN p
     WHERE m.giorno BETWEEN p.da AND p.a
     GROUP BY 1
  ),
  -- Costi messi a mano: la fonte scritta a mano passa dalla stessa regola.
  man AS (
    SELECT public.mkt_canale_di(k.source, NULL, NULL, NULL, NULL) AS canale,
           sum(coalesce(k.spend_amount, 0)) AS spesa
      FROM public.campaign_costs k JOIN cli ON cli.company_id = k.company_id CROSS JOIN p
     WHERE k.date BETWEEN p.da AND p.a
     GROUP BY 1
  ),
  -- Le richieste vere nel CRM, classificate con la stessa regola.
  ld AS (
    SELECT public.mkt_canale_di(mc.source, mc.source_channel, mc.meta_lead_id::text, mc.fbclid, mc.gclid) AS canale,
           count(*) AS lead,
           count(*) FILTER (WHERE o.id IS NOT NULL) AS con_opportunita,
           count(*) FILTER (WHERE o.status = 'won') AS vendite,
           coalesce(sum(o.value) FILTER (WHERE o.status = 'won'), 0) AS valore
      FROM public.marketing_contacts mc
      JOIN cli ON cli.company_id = mc.company_id
      CROSS JOIN p
      LEFT JOIN LATERAL (
        SELECT o2.id, o2.status, o2.value
          FROM public.marketing_opportunities o2
         WHERE o2.contact_id = mc.id AND o2.deleted_at IS NULL
         ORDER BY (o2.status = 'won') DESC, o2.created_at DESC
         LIMIT 1
      ) o ON true
     WHERE mc.created_at >= p.t_da AND mc.created_at < p.t_a
       AND coalesce(mc.source, '') NOT ILIKE 'fatturazione%'
       AND coalesce(mc.source_channel, '') NOT IN ('cold_import', 'cliente_servizio')
     GROUP BY 1
  ),
  canali AS (
    SELECT coalesce(sp.canale, man.canale, ld.canale) AS canale,
           coalesce(sp.spesa, 0) + coalesce(man.spesa, 0) AS spesa,
           coalesce(sp.spesa, 0) AS spesa_importata,
           coalesce(man.spesa, 0) AS spesa_a_mano,
           sp.copertura, sp.interazioni, sp.click, sp.impression,
           coalesce(sp.lead_dichiarati, 0) AS lead_dichiarati,
           sp.aggiornato_il, coalesce(sp.giorni_con_dati, 0) AS giorni_con_dati,
           coalesce(ld.lead, 0) AS lead,
           coalesce(ld.con_opportunita, 0) AS con_opportunita,
           coalesce(ld.vendite, 0) AS vendite,
           coalesce(ld.valore, 0) AS valore
      FROM sp
      FULL JOIN man ON man.canale = sp.canale
      FULL JOIN ld ON ld.canale = coalesce(sp.canale, man.canale)
  )
  SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.spesa DESC, x.lead DESC), '[]'::jsonb)
    FROM (
      SELECT c.canale,
             CASE c.canale
               WHEN 'meta' THEN 'Facebook e Instagram'
               WHEN 'google' THEN 'Google'
               WHEN 'tiktok' THEN 'TikTok'
               WHEN 'form' THEN 'Sito e moduli'
               ELSE 'Altro'
             END AS nome,
             c.spesa, c.spesa_importata, c.spesa_a_mano,
             c.copertura, c.interazioni, c.click, c.impression,
             c.lead_dichiarati, c.lead, c.con_opportunita, c.vendite, c.valore,
             c.aggiornato_il, c.giorni_con_dati,
             CASE WHEN c.impression > 0 AND c.spesa_importata > 0 THEN round(c.spesa_importata / c.impression * 1000, 2) END AS cpm,
             CASE WHEN c.click > 0 AND c.spesa_importata > 0 THEN round(c.spesa_importata / c.click, 2) END AS cpc,
             CASE WHEN c.lead > 0 AND c.spesa > 0 THEN round(c.spesa / c.lead, 2) END AS cpl,
             CASE WHEN c.vendite > 0 AND c.spesa > 0 THEN round(c.spesa / c.vendite, 2) END AS cpa,
             CASE WHEN c.spesa > 0 THEN round(c.valore / c.spesa, 1) END AS roas,
             -- Da dove viene il costo: e' la riga che spiega un CPL assurdo.
             CASE
               WHEN c.giorni_con_dati > 0 AND c.spesa_a_mano > 0 THEN 'importato e a mano'
               WHEN c.giorni_con_dati > 0 THEN 'importato'
               WHEN c.spesa_a_mano > 0 THEN 'a mano'
               ELSE 'nessun costo'
             END AS origine_costo
        FROM canali c
       WHERE c.spesa > 0 OR c.lead > 0
    ) x;
$$;

COMMENT ON FUNCTION public.admin_cliente_marketing_canali(uuid, date, date) IS
  'Per ogni canale del cliente: costo, copertura, interazioni, richieste vere, vendite e da dove viene il costo.';

REVOKE ALL ON FUNCTION public.admin_cliente_marketing_canali(uuid, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_cliente_marketing_canali(uuid, date, date) TO authenticated, service_role;
