-- Prima di dire «spegnila», bisogna essere sicuri di cosa si sta guardando.
--
-- Green Energy, campagna «TOFU | paga tra un anno | 50€»: 763 euro spesi, Meta
-- dichiara 94 richieste, nel CRM ne sono arrivate 5. Il verdetto usciva
-- «da spegnere» a 152 euro per richiesta. Ma la campagna gemella da 40 euro,
-- stessa offerta, dichiara 67 e ne consegna 55: la differenza non e' il
-- rendimento, e' che di quelle 94 non ne arriva quasi nessuna.
--
-- Quando i due numeri divergono cosi' tanto il costo per richiesta non misura
-- piu' la campagna, misura un tubo rotto: un modulo spento, un obiettivo
-- diverso (le campagne verso Messenger dichiarano «lead» senza che nessuno
-- compili un modulo), un'integrazione che non consegna. Spegnere in quel caso
-- puo' voler dire spegnere la campagna che funziona meglio.
--
-- Nasce un quarto verdetto, «da capire», che scatta prima di tutti gli altri e
-- dice cosa controllare invece di dare un ordine sbagliato con sicurezza.

CREATE OR REPLACE FUNCTION public.admin_cliente_marketing_inserzioni(
  p_service_client_id uuid,
  p_da date DEFAULT NULL,
  p_a date DEFAULT NULL,
  p_livello text DEFAULT 'campagna')
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
           (((coalesce(p_a, (now() AT TIME ZONE 'Europe/Rome')::date)) + 1)::timestamp AT TIME ZONE 'Europe/Rome') AS t_a,
           CASE WHEN p_livello = 'inserzione' THEN 'inserzione' ELSE 'campagna' END AS liv
  ),
  cli AS (
    SELECT sc.company_id
      FROM public.aedix_service_clients sc CROSS JOIN guardia
     WHERE sc.id = p_service_client_id AND guardia.ok AND sc.company_id IS NOT NULL
  ),
  sog AS (
    SELECT s.cpl_target_effettivo AS target, s.cpl_giallo_effettivo AS giallo, s.cpl_rosso_effettivo AS rosso
      FROM public.mkt_soglia_di(p_service_client_id) s
  ),
  sp AS (
    SELECT CASE WHEN (SELECT liv FROM p) = 'inserzione' THEN i.inserzione_id ELSE i.campagna_id END AS chiave,
           max(i.campagna_nome) AS campagna_nome,
           max(i.inserzione_nome) AS inserzione_nome,
           max(i.gruppo_nome) AS gruppo_nome,
           max(i.campagna_id) AS campagna_id,
           sum(i.spesa) AS spesa,
           sum(i.impression) AS impression,
           sum(i.click) AS click,
           sum(i.copertura) AS copertura,
           sum(i.lead_dichiarati) AS lead_dichiarati,
           count(*) AS giorni,
           max(i.giorno) AS ultimo_giorno,
           (array_agg(i.stato ORDER BY i.giorno DESC) FILTER (WHERE i.stato IS NOT NULL))[1] AS stato
      FROM public.mkt_spesa_inserzione i
      JOIN cli ON cli.company_id = i.company_id
      CROSS JOIN p
     WHERE i.giorno BETWEEN p.da AND p.a
       AND i.livello = p.liv
       AND (p.liv = 'campagna' OR i.inserzione_id IS NOT NULL)
     GROUP BY 1
  ),
  ld AS (
    SELECT CASE WHEN (SELECT liv FROM p) = 'inserzione' THEN mc.meta_ad_id ELSE mc.meta_campaign_id END AS chiave,
           count(*) AS lead,
           count(*) FILTER (WHERE o.prima IS NOT NULL) AS toccati,
           count(*) FILTER (WHERE o.status = 'won') AS vendite,
           coalesce(sum(o.value) FILTER (WHERE o.status = 'won'), 0) AS valore
      FROM public.marketing_contacts mc
      JOIN cli ON cli.company_id = mc.company_id
      CROSS JOIN p
      LEFT JOIN LATERAL (
        SELECT o2.status, o2.value,
               (SELECT min(a.created_at) FROM public.marketing_contact_activities a
                 WHERE a.contact_id = mc.id AND a.company_id = mc.company_id
                   AND a.created_at > o2.created_at + interval '2 minutes'
                   AND a.activity_type NOT IN ('contact_created','opportunity_created','contact_assigned','opportunity_assigned','updated','opportunity_auto_created')) AS prima
          FROM public.marketing_opportunities o2
         WHERE o2.contact_id = mc.id AND o2.deleted_at IS NULL
         ORDER BY (o2.status = 'won') DESC, o2.created_at DESC
         LIMIT 1
      ) o ON true
     WHERE mc.created_at >= p.t_da AND mc.created_at < p.t_a
       AND (CASE WHEN (SELECT liv FROM p) = 'inserzione' THEN mc.meta_ad_id ELSE mc.meta_campaign_id END) IS NOT NULL
     GROUP BY 1
  ),
  -- Un passaggio in piu' per non ripetere gli stessi conti in cinque posti.
  base AS (
    SELECT coalesce(sp.chiave, ld.chiave) AS id,
           coalesce(
             CASE WHEN (SELECT liv FROM p) = 'inserzione' THEN sp.inserzione_nome ELSE sp.campagna_nome END,
             'senza nome') AS nome,
           sp.campagna_nome, sp.gruppo_nome, sp.stato,
           coalesce(sp.spesa, 0) AS spesa,
           sp.impression, sp.click, sp.copertura,
           coalesce(sp.lead_dichiarati, 0) AS dichiarati,
           coalesce(sp.giorni, 0) AS giorni_con_spesa,
           sp.ultimo_giorno,
           coalesce(ld.lead, 0) AS lead,
           coalesce(ld.toccati, 0) AS toccati,
           coalesce(ld.vendite, 0) AS vendite,
           coalesce(ld.valore, 0) AS valore,
           (SELECT target FROM sog) AS target,
           (SELECT giallo FROM sog) AS giallo,
           (SELECT rosso FROM sog) AS rosso
      FROM sp
      FULL JOIN ld ON ld.chiave = sp.chiave
     WHERE coalesce(sp.spesa, 0) > 0 OR coalesce(ld.lead, 0) > 0
  )
  SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.spesa DESC NULLS LAST, x.lead DESC), '[]'::jsonb)
    FROM (
      SELECT b.id, b.nome, b.campagna_nome, b.gruppo_nome, b.stato, b.spesa,
             b.impression, b.click, b.copertura,
             b.dichiarati AS lead_dichiarati, b.giorni_con_spesa, b.ultimo_giorno,
             b.lead, b.toccati, b.vendite, b.valore,
             CASE WHEN b.impression > 0 AND b.spesa > 0 THEN round(b.spesa / b.impression * 1000, 2) END AS cpm,
             CASE WHEN b.click > 0 AND b.spesa > 0 THEN round(b.spesa / b.click, 2) END AS cpc,
             CASE WHEN b.lead > 0 AND b.spesa > 0 THEN round(b.spesa / b.lead, 2) END AS cpl,
             CASE WHEN b.vendite > 0 AND b.spesa > 0 THEN round(b.spesa / b.vendite, 2) END AS cpa,
             CASE WHEN b.spesa > 0 THEN round(b.valore / b.spesa, 1) END AS roas,
             b.target AS cpl_target,
             CASE
               -- 1. Troppo pochi soldi per dire qualcosa: e' il campione minimo.
               WHEN b.spesa < 3 * coalesce(b.target, 12) THEN 'troppo presto'
               -- 2. I due conteggi non tornano: qui il costo per richiesta non
               --    misura la campagna, misura un tubo rotto.
               WHEN b.dichiarati >= 10 AND b.dichiarati >= 3 * greatest(b.lead, 1) THEN 'da capire'
               WHEN b.lead = 0 THEN 'da spegnere'
               WHEN b.lead >= 3 AND b.spesa / b.lead > coalesce(b.rosso, 24) THEN 'da spegnere'
               WHEN b.spesa / nullif(b.lead, 0) > coalesce(b.giallo, 18) THEN 'da guardare'
               ELSE 'va bene'
             END AS verdetto,
             CASE
               WHEN b.spesa < 3 * coalesce(b.target, 12)
                 THEN 'ha speso troppo poco per dire qualcosa'
               WHEN b.dichiarati >= 10 AND b.dichiarati >= 3 * greatest(b.lead, 1)
                 THEN format('Meta dichiara %s richieste, nel CRM ne sono arrivate %s: prima di spegnere, controllare il modulo e l''obiettivo della campagna', b.dichiarati, b.lead)
               WHEN b.lead = 0
                 THEN 'spende e non ha portato nessuna richiesta nel CRM'
               WHEN b.lead >= 3 AND b.spesa / b.lead > coalesce(b.rosso, 24)
                 THEN 'ogni richiesta costa piu del doppio del target'
               WHEN b.spesa / nullif(b.lead, 0) > coalesce(b.giallo, 18)
                 THEN 'costa sopra il target, da tenere d''occhio'
               ELSE 'dentro il target'
             END AS perche
        FROM base b
    ) x;
$$;

COMMENT ON FUNCTION public.admin_cliente_marketing_inserzioni(uuid, date, date, text) IS
  'Campagne (o inserzioni) del cliente con spesa, richieste vere nel CRM, costo per richiesta e verdetto: va bene, da guardare, da spegnere, da capire (i conteggi non tornano), troppo presto.';
