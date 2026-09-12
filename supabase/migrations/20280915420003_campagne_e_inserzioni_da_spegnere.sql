-- Quali campagne e quali inserzioni vanno spente.
--
-- La console sapeva quanto si spende in tutto e quante richieste arrivano in
-- tutto. Non sapeva QUALE campagna porta quelle richieste, quindi non poteva
-- dire dove sono i soldi buttati. Con un solo numero per account, una campagna
-- che spende 200 euro e non porta niente resta nascosta dentro la media.
--
-- Qui arriva la grana: una riga per campagna e una per inserzione, giorno per
-- giorno. La spesa la scrive il sync notturno leggendola da Meta; le richieste
-- VERE si contano dal CRM (marketing_contacts.meta_campaign_id / meta_ad_id,
-- che sono già riempiti su tutti i lead arrivati dai moduli).
--
-- Il verdetto non è un'opinione: confronta con le soglie del cliente
-- (mkt_soglie, oggi CPL 12 euro, giallo 18, rosso 24) e rispetta il campione
-- minimo del manuale — sotto una certa spesa non si giudica, si aspetta.

CREATE TABLE IF NOT EXISTS public.mkt_spesa_inserzione (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id         uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  giorno             date NOT NULL,
  canale             text NOT NULL DEFAULT 'meta',
  account_esterno_id text NOT NULL,
  livello            text NOT NULL CHECK (livello IN ('campagna', 'inserzione')),
  campagna_id        text NOT NULL,
  campagna_nome      text,
  inserzione_id      text,
  inserzione_nome    text,
  gruppo_id          text,
  gruppo_nome        text,
  spesa              numeric NOT NULL DEFAULT 0,
  impression         bigint,
  click              bigint,
  copertura          bigint,
  cpm                numeric,
  frequenza          numeric,
  lead_dichiarati    integer NOT NULL DEFAULT 0,
  stato              text,
  sincronizzato_il   timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.mkt_spesa_inserzione IS
  'Spesa e risultati per campagna e per inserzione, giorno per giorno. Livello campagna: inserzione_id NULL.';

CREATE UNIQUE INDEX IF NOT EXISTS idx_mkt_spesa_inserzione_chiave
  ON public.mkt_spesa_inserzione (company_id, giorno, canale, account_esterno_id, livello, campagna_id, coalesce(inserzione_id, ''));

CREATE INDEX IF NOT EXISTS idx_mkt_spesa_inserzione_azienda_giorno
  ON public.mkt_spesa_inserzione (company_id, giorno DESC);

ALTER TABLE public.mkt_spesa_inserzione ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "spesa inserzioni: chi amministra la piattaforma" ON public.mkt_spesa_inserzione;
CREATE POLICY "spesa inserzioni: chi amministra la piattaforma"
  ON public.mkt_spesa_inserzione
  FOR SELECT
  TO authenticated
  USING ((SELECT public.is_platform_staff()));

-- ------------------------------------------------------------------
-- Il verdetto per campagna e per inserzione
-- ------------------------------------------------------------------

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
  -- Le soglie del cliente, con la stagionalità già applicata.
  sog AS (
    SELECT s.cpl_target_effettivo AS target, s.cpl_giallo_effettivo AS giallo, s.cpl_rosso_effettivo AS rosso
      FROM public.mkt_soglia_di(p_service_client_id) s
  ),
  -- Costi e numeri dichiarati da Meta nel periodo.
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
  -- Le richieste vere nel CRM, attribuite con gli identificativi Meta.
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
  )
  SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.spesa DESC NULLS LAST, x.lead DESC), '[]'::jsonb)
    FROM (
      SELECT coalesce(sp.chiave, ld.chiave) AS id,
             coalesce(
               CASE WHEN (SELECT liv FROM p) = 'inserzione' THEN sp.inserzione_nome ELSE sp.campagna_nome END,
               'senza nome') AS nome,
             sp.campagna_nome, sp.gruppo_nome, sp.stato,
             coalesce(sp.spesa, 0) AS spesa,
             sp.impression, sp.click, sp.copertura,
             coalesce(sp.lead_dichiarati, 0) AS lead_dichiarati,
             coalesce(sp.giorni, 0) AS giorni_con_spesa,
             sp.ultimo_giorno,
             coalesce(ld.lead, 0) AS lead,
             coalesce(ld.toccati, 0) AS toccati,
             coalesce(ld.vendite, 0) AS vendite,
             coalesce(ld.valore, 0) AS valore,
             CASE WHEN sp.impression > 0 AND sp.spesa > 0 THEN round(sp.spesa / sp.impression * 1000, 2) END AS cpm,
             CASE WHEN sp.click > 0 AND sp.spesa > 0 THEN round(sp.spesa / sp.click, 2) END AS cpc,
             CASE WHEN coalesce(ld.lead, 0) > 0 AND coalesce(sp.spesa, 0) > 0 THEN round(sp.spesa / ld.lead, 2) END AS cpl,
             CASE WHEN coalesce(ld.vendite, 0) > 0 AND coalesce(sp.spesa, 0) > 0 THEN round(sp.spesa / ld.vendite, 2) END AS cpa,
             CASE WHEN coalesce(sp.spesa, 0) > 0 THEN round(coalesce(ld.valore, 0) / sp.spesa, 1) END AS roas,
             (SELECT target FROM sog) AS cpl_target,
             -- Il verdetto. Sotto tre volte il costo obiettivo non si giudica:
             -- è il campione minimo del manuale, applicato ai soldi invece che
             -- ai lead (con 12 euro di target servono almeno 36 euro spesi).
             CASE
               WHEN coalesce(sp.spesa, 0) < 3 * coalesce((SELECT target FROM sog), 12) THEN 'troppo presto'
               WHEN coalesce(ld.lead, 0) = 0 THEN 'da spegnere'
               WHEN coalesce(ld.lead, 0) >= 3 AND sp.spesa / ld.lead > coalesce((SELECT rosso FROM sog), 24) THEN 'da spegnere'
               WHEN sp.spesa / nullif(ld.lead, 0) > coalesce((SELECT giallo FROM sog), 18) THEN 'da guardare'
               ELSE 'va bene'
             END AS verdetto,
             CASE
               WHEN coalesce(sp.spesa, 0) < 3 * coalesce((SELECT target FROM sog), 12)
                 THEN 'ha speso troppo poco per dire qualcosa'
               WHEN coalesce(ld.lead, 0) = 0
                 THEN 'spende e non ha portato nessuna richiesta nel CRM'
               WHEN coalesce(ld.lead, 0) >= 3 AND sp.spesa / ld.lead > coalesce((SELECT rosso FROM sog), 24)
                 THEN 'ogni richiesta costa piu del doppio del target'
               WHEN sp.spesa / nullif(ld.lead, 0) > coalesce((SELECT giallo FROM sog), 18)
                 THEN 'costa sopra il target, da tenere d''occhio'
               ELSE 'dentro il target'
             END AS perche
        FROM sp
        FULL JOIN ld ON ld.chiave = sp.chiave
       WHERE coalesce(sp.spesa, 0) > 0 OR coalesce(ld.lead, 0) > 0
    ) x;
$$;

COMMENT ON FUNCTION public.admin_cliente_marketing_inserzioni(uuid, date, date, text) IS
  'Campagne (o inserzioni) del cliente con spesa, richieste vere nel CRM, costo per richiesta e verdetto su cosa spegnere.';

REVOKE ALL ON FUNCTION public.admin_cliente_marketing_inserzioni(uuid, date, date, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_cliente_marketing_inserzioni(uuid, date, date, text) TO authenticated, service_role;
