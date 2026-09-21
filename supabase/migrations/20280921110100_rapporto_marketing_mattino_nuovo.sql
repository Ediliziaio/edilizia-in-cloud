-- Rapporto del mattino dei clienti marketing nella forma voluta dal titolare (21/09/2026).
--
-- Il rapporto cambia forma: tre priorità del giorno, poi una scheda per brand
-- (campagne lead generation, awareness e interazione, gestione commerciale,
-- risultati, azione consigliata), clienti in pausa in fondo e riepilogo
-- economico. La forma la decide ops-canarino/clienti-marketing.ts con
-- _shared/rapportoMarketingMattino.ts; qui i numeri che mancavano:
--   - spesa lead generation e awareness separate (regola in
--     mkt_campagne_classificate, migrazione 20280921110000) e l'elenco delle
--     campagne awareness della settimana;
--   - contratti vinti ieri per brand, presenza agli appuntamenti, lead senza
--     esito sul totale del mese, lead dichiarati da Meta, sopralluoghi e
--     contratti a 30 giorni (per il tasso di chiusura), preventivi fermi;
--   - fine del contratto di servizio (aedix_service_clients.data_fine);
--   - la gravità peggiore fra gli allarmi aperti di ogni brand: è il colore
--     della scheda. Il semaforo del motore non serve a questo, perché basta un
--     componente rosso — e l'esecuzione lo era per tutti i clienti il 21/09;
--   - giorni senza lead per brand;
--   - il dettaglio numerico di ogni allarme (per scrivere l'impatto);
--   - le priorità mostrate ieri e com'è andata, da mkt_rapporto_priorita.
--
-- Il confronto «venduto del mese contro la media dei tre mesi» è stato
-- verificato e NON è entrato: lo storico delle vendite è pieno di contratti
-- registrati a blocchi (Best: i 12 di settembre tutti nello stesso giorno;
-- BeMade a giugno 58 su 93 creati e vinti lo stesso giorno, cioè importati).

SET lock_timeout = '3s';
SET statement_timeout = '30s';

-- ── Le priorità mostrate ogni mattina ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.mkt_rapporto_priorita (
  giorno date NOT NULL,
  posizione smallint NOT NULL,
  -- id dell'allarme, oppure «rinnovo:<cliente>» per un contratto in scadenza
  chiave text NOT NULL,
  allarme_id uuid REFERENCES public.mkt_allarmi(id) ON DELETE SET NULL,
  service_client_id uuid REFERENCES public.aedix_service_clients(id) ON DELETE CASCADE,
  cliente_nome text,
  titolo text NOT NULL,
  creato_il timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (giorno, posizione)
);

COMMENT ON TABLE public.mkt_rapporto_priorita IS
  'Le tre priorità del rapporto marketing del mattino, una riga per posizione e per giorno. Le scrive ops-canarino dopo l''invio; il rapporto del giorno dopo le rilegge per dire com''è andata.';

-- Solo il service role (ops-canarino) e le funzioni security definer.
ALTER TABLE public.mkt_rapporto_priorita ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.mkt_rapporto_priorita FROM PUBLIC, anon, authenticated;

-- ── I numeri del rapporto ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.mkt_rapporto_mattino(p_giorno date DEFAULT ((now() AT TIME ZONE 'Europe/Rome'::text))::date)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH guardia AS (
    SELECT (SELECT public.is_super_admin()) OR coalesce((SELECT auth.jwt() ->> 'role'), '') = 'service_role' OR auth.uid() IS NULL AS ok
  ),
  m AS (
    SELECT mg.*, sc.cliente_nome, sc.mkt_classe AS classe, sc.provvigione_scaglioni, sc.mkt_budget_mensile AS budget, sc.company_id,
           sc.data_fine AS data_fine_contratto,
           (SELECT avg(h.lead_grezzi_giorno) FROM public.mkt_metriche_giorno h WHERE h.service_client_id = mg.service_client_id AND h.giorno > p_giorno - 7 AND h.giorno <= p_giorno) AS media_lead_7g,
           -- venduto del mese per la provvigione: fatture se collegate, altrimenti vendite del CRM
           coalesce((SELECT sum((CASE WHEN i.document_type = 'credit_note' THEN -1 ELSE 1 END) * coalesce(i.subtotal, 0))
                       FROM public.invoices i WHERE i.company_id = sc.company_id AND i.deleted_at IS NULL
                        AND i.issue_date >= date_trunc('month', p_giorno)::date AND i.issue_date < (date_trunc('month', p_giorno) + interval '1 month')::date
                        AND coalesce(i.status, '') NOT IN ('draft','cancelled','annullata')),
                    CASE WHEN EXISTS (SELECT 1 FROM public.invoices i WHERE i.company_id = sc.company_id AND i.deleted_at IS NULL) THEN 0 END,
                    mg.venduto_mese) AS venduto_base
      FROM public.mkt_metriche_giorno mg
      JOIN public.aedix_service_clients sc ON sc.id = mg.service_client_id
     WHERE mg.giorno = p_giorno AND (SELECT ok FROM guardia)
  ),
  clienti AS (
    SELECT m.service_client_id, m.cliente_nome, m.classe, m.stato_cliente, m.semaforo, m.semaforo_componenti,
           m.lead_grezzi_giorno, round(m.media_lead_7g, 1) AS media_lead_7g, m.lead_grezzi_7g, m.lead_validi_7g,
           m.spesa_giorno, m.spesa_7g, m.spesa_mese, m.budget, m.copertura_budget,
           m.cpl_valido_7g, m.cpl_grezzo_7g, m.cpl_target, m.cpl_giallo, m.cpl_rosso, m.fattore_stagionale,
           m.lead_fermi, m.lead_fermo_piu_vecchio_ore, m.mediana_primo_contatto_min_7g,
           m.appuntamenti_14g, m.costo_appuntamento_14g, m.tasso_appuntamento_14g,
           m.vendite_mese, m.venduto_mese, m.venduto_base,
           public.aedix_provvigione_scaglioni(greatest(0, m.venduto_base), m.provvigione_scaglioni) AS provvigione_mese,
           m.indice_esecuzione, m.giorni_dall_ultimo_accesso, m.dati_freschi, m.ultimo_sync, m.spesa_disponibile, m.rapporto_zero, m.spesa_senza_lead, m.meta_stato, m.meta_account,
           -- Dal 21/09/2026, per il rapporto nella forma voluta dal titolare.
           -- Spesa separata: lead generation (entra nel CPL) e awareness/interazione (no).
           m.spesa_aw_giorno, m.spesa_aw_7g, m.spesa_aw_mese,
           greatest(0, m.spesa_giorno - coalesce(m.spesa_aw_giorno, 0)) AS spesa_lead_giorno,
           greatest(0, m.spesa_7g - coalesce(m.spesa_aw_7g, 0)) AS spesa_lead_7g,
           greatest(0, m.spesa_mese - coalesce(m.spesa_aw_mese, 0)) AS spesa_lead_mese,
           (SELECT coalesce(jsonb_agg(jsonb_build_object('nome', k.nome, 'obiettivo', k.obiettivo_meta, 'spesa', k.spesa_periodo) ORDER BY k.spesa_periodo DESC), '[]'::jsonb)
              FROM public.mkt_campagne_classificate(m.company_id, p_giorno - 7, p_giorno) k
             WHERE k.awareness AND k.spesa_periodo > 0) AS campagne_aw,
           -- Finché il sync non ha letto gli obiettivi, «zero awareness» non vuol dire niente.
           EXISTS (SELECT 1 FROM public.mkt_spesa_inserzione i
                    WHERE i.company_id = m.company_id AND i.livello = 'campagna'
                      AND i.giorno >= p_giorno - 7 AND i.giorno < p_giorno AND i.obiettivo IS NOT NULL) AS obiettivi_noti,
           m.lead_dichiarati_7g, m.tasso_presenza_30g, m.opp_mese, m.opp_senza_esito_mese, m.preventivi_sospesi,
           m.vendite_30g, m.sopralluoghi_30g,
           (SELECT count(*) FROM public.marketing_opportunities o WHERE o.company_id = m.company_id AND o.deleted_at IS NULL AND o.status = 'won'
                AND coalesce(o.won_at, o.updated_at) >= ((p_giorno - 1)::timestamp AT TIME ZONE 'Europe/Rome')
                AND coalesce(o.won_at, o.updated_at) < (p_giorno::timestamp AT TIME ZONE 'Europe/Rome')) AS vendite_ieri,
           (SELECT coalesce(sum(o.value), 0) FROM public.marketing_opportunities o WHERE o.company_id = m.company_id AND o.deleted_at IS NULL AND o.status = 'won'
                AND coalesce(o.won_at, o.updated_at) >= ((p_giorno - 1)::timestamp AT TIME ZONE 'Europe/Rome')
                AND coalesce(o.won_at, o.updated_at) < (p_giorno::timestamp AT TIME ZONE 'Europe/Rome')) AS venduto_ieri,
           m.data_fine_contratto,
           (m.data_fine_contratto - p_giorno) AS giorni_alla_fine_contratto,
           -- Il colore del brand nel rapporto: la gravità peggiore fra i suoi allarmi aperti.
           (SELECT a.gravita FROM public.mkt_allarmi a
             WHERE a.service_client_id = m.service_client_id AND a.chiuso_il IS NULL AND a.mostrato
               AND (a.rimandato_a IS NULL OR a.rimandato_a <= p_giorno)
             ORDER BY public.mkt_peso_gravita(a.gravita) DESC LIMIT 1) AS allarme_max,
           (p_giorno - (SELECT (max(mc.created_at) AT TIME ZONE 'Europe/Rome')::date FROM public.marketing_contacts mc
                         WHERE mc.company_id = m.company_id
                           AND coalesce(mc.source, '') NOT ILIKE 'fatturazione%' AND coalesce(mc.source_channel, '') NOT IN ('cold_import','cliente_servizio'))) AS giorni_senza_lead
      FROM m
  ),
  allarmi AS (
    SELECT a.id, a.service_client_id, c.cliente_nome, c.classe, a.regola, a.gravita, a.titolo, a.azione, a.proprietario, a.scadenza, a.aperto_il, a.mostrato, a.motivo_non_mostrato, a.dettaglio
      FROM public.mkt_allarmi a JOIN clienti c ON c.service_client_id = a.service_client_id
     WHERE a.chiuso_il IS NULL AND (a.rimandato_a IS NULL OR a.rimandato_a <= p_giorno)
  ),
  ordinati AS (
    SELECT al.*, row_number() OVER (ORDER BY public.mkt_peso_gravita(al.gravita) DESC, coalesce(al.classe, 'B'), al.aperto_il) AS rn
      FROM allarmi al WHERE al.mostrato AND al.gravita IN ('grave','rosso','giallo')
  )
  SELECT jsonb_build_object(
    'giorno', p_giorno,
    'stato', jsonb_build_object(
      'attivi', (SELECT count(*) FROM clienti WHERE stato_cliente = 'attivo'),
      'verdi', (SELECT count(*) FROM clienti WHERE stato_cliente = 'attivo' AND semaforo = 'V'),
      'gialli', (SELECT count(*) FROM clienti WHERE stato_cliente = 'attivo' AND semaforo = 'G'),
      'rossi', (SELECT count(*) FROM clienti WHERE stato_cliente = 'attivo' AND semaforo = 'R'),
      'non_leggibili', (SELECT count(*) FROM clienti WHERE stato_cliente = 'attivo' AND semaforo = 'N'),
      'aggiornato_alle', (SELECT max(calcolato_il) FROM m),
      'dati_vecchi', (SELECT coalesce(jsonb_agg(jsonb_build_object('cliente', cliente_nome, 'fermo_dalle', ultimo_sync)), '[]'::jsonb) FROM clienti WHERE spesa_disponibile AND NOT dati_freschi)),
    'clienti', (SELECT coalesce(jsonb_agg(to_jsonb(c) ORDER BY (c.stato_cliente = 'attivo') DESC, public.mkt_peso_gravita(CASE c.semaforo WHEN 'R' THEN 'rosso' WHEN 'G' THEN 'giallo' ELSE 'nota' END) DESC, c.lead_grezzi_7g DESC), '[]'::jsonb) FROM clienti c),
    'azioni', (SELECT coalesce(jsonb_agg(to_jsonb(o) ORDER BY o.rn), '[]'::jsonb) FROM ordinati o WHERE o.rn <= 5),
    'da_guardare', (SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY public.mkt_peso_gravita(x.gravita) DESC, x.aperto_il), '[]'::jsonb) FROM (
                      SELECT * FROM ordinati o WHERE o.rn > 5
                      UNION ALL SELECT al.*, NULL::bigint FROM allarmi al WHERE al.mostrato AND al.gravita = 'nota'
                    ) x),
    'altri_allarmi', (SELECT count(*) FROM allarmi WHERE NOT mostrato),
    'ieri', jsonb_build_object(
      'lead', (SELECT coalesce(sum(lead_grezzi_giorno), 0) FROM clienti WHERE stato_cliente = 'attivo'),
      'media_7g', (SELECT round(coalesce(sum(media_lead_7g), 0), 1) FROM clienti WHERE stato_cliente = 'attivo'),
      'spesa', (SELECT coalesce(sum(spesa_giorno), 0) FROM clienti WHERE stato_cliente = 'attivo'),
      'vendite_registrate', (SELECT count(*) FROM public.marketing_opportunities o JOIN m ON m.company_id = o.company_id
                              WHERE o.deleted_at IS NULL AND o.status = 'won' AND coalesce(o.won_at, o.updated_at) >= ((p_giorno - 1)::timestamp AT TIME ZONE 'Europe/Rome') AND coalesce(o.won_at, o.updated_at) < (p_giorno::timestamp AT TIME ZONE 'Europe/Rome')),
      'valore_vendite', (SELECT coalesce(sum(o.value), 0) FROM public.marketing_opportunities o JOIN m ON m.company_id = o.company_id
                          WHERE o.deleted_at IS NULL AND o.status = 'won' AND coalesce(o.won_at, o.updated_at) >= ((p_giorno - 1)::timestamp AT TIME ZONE 'Europe/Rome') AND coalesce(o.won_at, o.updated_at) < (p_giorno::timestamp AT TIME ZONE 'Europe/Rome'))),
    'denaro', jsonb_build_object(
      'provvigioni_mese', (SELECT coalesce(sum(provvigione_mese), 0) FROM clienti WHERE stato_cliente = 'attivo'),
      'fatture_scadute', (SELECT coalesce(jsonb_agg(jsonb_build_object('cliente', sc.cliente_nome, 'importo', b.importo_dovuto - coalesce(b.importo_incassato, 0), 'scaduta_da_giorni', p_giorno - ((b.periodo + interval '1 month')::date + 30))), '[]'::jsonb)
                            FROM public.aedix_service_billings b JOIN public.aedix_service_clients sc ON sc.id = b.service_client_id
                           WHERE b.service_client_id IN (SELECT service_client_id FROM clienti)
                             AND coalesce(b.importo_dovuto, 0) > coalesce(b.importo_incassato, 0) AND (b.periodo + interval '1 month')::date + 30 < p_giorno)),
    -- Le priorità mostrate ieri e com'è andata: le scrive ops-canarino dopo l'invio.
    'priorita_ieri', (SELECT coalesce(jsonb_agg(jsonb_build_object(
                          'posizione', p.posizione, 'cliente', p.cliente_nome, 'titolo', p.titolo, 'chiave', p.chiave,
                          'allarme_chiuso', a.chiuso_il IS NOT NULL, 'esito', a.esito,
                          'giorni_aperta', CASE WHEN a.id IS NOT NULL THEN p_giorno - (a.aperto_il AT TIME ZONE 'Europe/Rome')::date END
                        ) ORDER BY p.posizione), '[]'::jsonb)
                        FROM public.mkt_rapporto_priorita p LEFT JOIN public.mkt_allarmi a ON a.id = p.allarme_id
                       WHERE p.giorno = p_giorno - 1 AND (SELECT ok FROM guardia)),
    'silenzi', (SELECT coalesce(jsonb_agg(jsonb_build_object('cliente', cliente_nome, 'giorni_senza_lead', giorni_senza_lead, 'giorni_senza_accesso', giorni_dall_ultimo_accesso)), '[]'::jsonb)
                  FROM (SELECT c.cliente_nome, c.giorni_dall_ultimo_accesso,
                               (p_giorno - (SELECT (max(mc.created_at) AT TIME ZONE 'Europe/Rome')::date FROM public.marketing_contacts mc JOIN m ON m.service_client_id = c.service_client_id WHERE mc.company_id = m.company_id
                                             AND coalesce(mc.source, '') NOT ILIKE 'fatturazione%' AND coalesce(mc.source_channel, '') NOT IN ('cold_import','cliente_servizio'))) AS giorni_senza_lead
                          FROM clienti c WHERE c.stato_cliente = 'attivo') s
                 WHERE coalesce(s.giorni_senza_lead, 99) > 3 AND coalesce(s.giorni_dall_ultimo_accesso, 99) > 3)
  );
$function$;

REVOKE ALL ON FUNCTION public.mkt_rapporto_mattino(date) FROM PUBLIC, anon;
