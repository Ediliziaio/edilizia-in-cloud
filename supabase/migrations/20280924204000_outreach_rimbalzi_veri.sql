-- Rimbalzi veri: un'iscrizione chiusa per rimbalzo senza email partite da
-- quel flusso non è un rimbalzo del flusso (24/09/2026).
--
-- Quando un indirizzo rimbalza con un brand, gli altri flussi lo chiudono come
-- «bounced» senza avergli scritto (outreach-imap-poll, applicaBounce): è il
-- blocco che deve esserci. Ma Pipeline, scheda della campagna e Statistiche li
-- contavano come rimbalzi del flusso: 243 «rimbalzi» su 5.673 email, 121 veri
-- (2,1%). «EiC · Tutti gli altri» mostrava l'11,8% (vero 2,1%), ThermoDMR S
-- l'8,0% (vero 0,9%), e il badge rosso della Pipeline avrebbe acceso 7 flussi
-- su 10 invece di 2.
--
-- Una fase in più, «escluso»: chiuso per rimbalzo, o per dominio senza posta,
-- senza tentativi d'invio da questo flusso. «rimbalzato» resta per chi ha avuto
-- almeno un tentativo. Fasi, contatti e riepilogo delle campagne leggono le
-- fasi da qui: «rimbalzati» del riepilogo diventa il numero vero senza toccarli.
-- Le Statistiche aggiungono «esclusi» ai totali.
--
-- CREATE OR REPLACE con la stessa firma: permessi e SECURITY DEFINER restano.

CREATE OR REPLACE FUNCTION public.outreach_campagna_iscrizioni(p_company uuid, p_sequence uuid DEFAULT NULL)
RETURNS TABLE (
  enrollment_id uuid, contact_id uuid, sequence_id uuid, stato text, fase text,
  inviati integer, ultimo_invio_at timestamptz, prossimo_invio_at timestamptz, ultima_casella uuid,
  risposta_at timestamptz, risposta_intent text, risposta_testo text,
  motivo_stop text, iscritto_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH e AS (
    SELECT e.id, e.contact_id, e.sequence_id, e.status, e.stop_reason, e.enrolled_at
      FROM public.outreach_enrollments e
     WHERE e.company_id = p_company
       AND (p_sequence IS NULL OR e.sequence_id = p_sequence)
       AND (SELECT public.is_super_admin())
  ),
  q AS (
    SELECT q.enrollment_id,
           count(*) FILTER (WHERE q.status = 'sent')::int AS inviati,
           -- Tentativi d'invio da QUESTO flusso: email spedite, o rifiutate dal
           -- server all'invio (skipped col testo del server). Non quelle fermate
           -- dal linter dei testi, che non sono mai uscite.
           count(*) FILTER (WHERE coalesce(q.channel, 'email') = 'email'
                              AND (q.status = 'sent'
                                   OR (q.status = 'skipped' AND coalesce(q.last_error, '') NOT LIKE 'copy bloccata%')))::int AS tentati,
           max(q.sent_at) FILTER (WHERE q.status = 'sent') AS ultimo_at,
           min(q.scheduled_for) FILTER (WHERE q.status IN ('queued', 'sending')) AS prossimo_at,
           (array_agg(q.sender_account_id ORDER BY q.sent_at DESC) FILTER (WHERE q.status = 'sent'))[1] AS casella
      FROM public.outreach_send_queue q
     WHERE q.enrollment_id IN (SELECT e.id FROM e)
       AND coalesce(q.kind, 'send') = 'send'
     GROUP BY q.enrollment_id
  ),
  -- Risposte legate all'iscrizione, oppure al contatto (senza iscrizione) e
  -- arrivate dopo l'iscrizione: due rami separati per usare gli indici.
  r0 AS (
    SELECT e.id AS enrollment_id, rr.intent, rr.received_at, rr.snippet
      FROM e JOIN public.outreach_replies rr ON rr.enrollment_id = e.id
    UNION ALL
    SELECT e.id, rr.intent, rr.received_at, rr.snippet
      FROM e JOIN public.outreach_replies rr
        ON rr.enrollment_id IS NULL AND rr.contact_id = e.contact_id
       AND rr.company_id = p_company AND rr.received_at >= e.enrolled_at
  ),
  r AS (
    SELECT DISTINCT ON (r0.enrollment_id) r0.enrollment_id, r0.intent, r0.received_at, r0.snippet
      FROM r0
     WHERE coalesce(r0.intent, '') NOT IN ('auto_reply', 'out_of_office')
     ORDER BY r0.enrollment_id, r0.received_at DESC
  )
  SELECT e.id, e.contact_id, e.sequence_id, e.status,
         CASE
           -- Chiuso per un rimbalzo senza che da qui sia partito niente: l'indirizzo
           -- era già rimbalzato con un altro flusso, o il dominio non riceve posta.
           WHEN e.status = 'bounced' AND coalesce(q.tentati, 0) = 0 THEN 'escluso'
           WHEN e.status = 'bounced' THEN 'rimbalzato'
           WHEN e.status = 'opted_out' THEN 'disiscritto'
           WHEN r.enrollment_id IS NOT NULL OR e.status = 'replied' THEN 'risposta_' ||
             CASE WHEN r.intent = 'interested' THEN 'interessato'
                  WHEN r.intent = 'question' THEN 'domanda'
                  WHEN r.intent IN ('not_interested', 'unsubscribe') THEN 'non_interessato'
                  ELSE 'altro' END
           WHEN e.status = 'stopped' THEN 'fermato'
           WHEN e.status = 'completed' THEN 'completato'
           WHEN coalesce(q.inviati, 0) = 0 THEN 'da_contattare'
           ELSE 'passo_' || q.inviati
         END,
         coalesce(q.inviati, 0), q.ultimo_at, q.prossimo_at, q.casella,
         r.received_at, r.intent, r.snippet, e.stop_reason, e.enrolled_at
    FROM e
    LEFT JOIN q ON q.enrollment_id = e.id
    LEFT JOIN r ON r.enrollment_id = e.id;
$$;

CREATE OR REPLACE FUNCTION public.outreach_campagna_statistiche(p_company uuid, p_sequence uuid DEFAULT NULL::uuid, p_tz text DEFAULT 'Europe/Rome'::text, p_giorni integer DEFAULT 14)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH i AS (
    SELECT * FROM public.outreach_campagna_iscrizioni(p_company, p_sequence)
  ),
  opp AS (
    SELECT o.id, o.won_at
      FROM public.marketing_opportunities o
      JOIN public.outreach_replies r ON r.id = o.source_ref_id AND o.source_ref_table = 'outreach_replies'
     WHERE r.enrollment_id IN (SELECT i.enrollment_id FROM i)
       AND o.deleted_at IS NULL
  ),
  inv AS (
    SELECT q.enrollment_id, q.sent_at, q.opened_at, q.sender_account_id,
           row_number() OVER (PARTITION BY q.enrollment_id ORDER BY q.sent_at, q.id)::int AS passo
      FROM public.outreach_send_queue q
     WHERE q.enrollment_id IN (SELECT i.enrollment_id FROM i)
       AND q.status = 'sent' AND coalesce(q.kind, 'send') = 'send'
  ),
  prog AS (
    SELECT q.scheduled_for, q.sender_account_id
      FROM public.outreach_send_queue q
     WHERE q.enrollment_id IN (SELECT i.enrollment_id FROM i)
       AND q.status IN ('queued', 'sending') AND coalesce(q.kind, 'send') = 'send'
  ),
  risp AS (
    SELECT i.enrollment_id, i.risposta_at, i.fase,
           (SELECT count(*) FROM inv WHERE inv.enrollment_id = i.enrollment_id AND inv.sent_at <= i.risposta_at)::int AS dopo_passo,
           (SELECT inv.sender_account_id FROM inv
             WHERE inv.enrollment_id = i.enrollment_id AND inv.sent_at <= i.risposta_at
             ORDER BY inv.sent_at DESC LIMIT 1) AS casella,
           (SELECT min(inv.sent_at) FROM inv WHERE inv.enrollment_id = i.enrollment_id) AS primo_at
      FROM i
     WHERE starts_with(i.fase, 'risposta_') AND i.risposta_at IS NOT NULL
  ),
  passi_def AS (
    SELECT row_number() OVER (ORDER BY st.step_order)::int AS passo, st.channel, st.subject, st.delay_days
      FROM public.outreach_sequence_steps st
     WHERE p_sequence IS NOT NULL AND st.sequence_id = p_sequence
       AND coalesce(st.node_type, st.channel) IN ('email', 'whatsapp', 'sms', 'call')
  ),
  passi_n AS (
    SELECT generate_series(1, greatest(
             coalesce((SELECT max(passo) FROM passi_def), 0),
             coalesce((SELECT max(passo) FROM inv), 0))) AS passo
  ),
  inv_passo AS (
    SELECT passo, count(*) AS inviati, count(*) FILTER (WHERE opened_at IS NOT NULL) AS aperti
      FROM inv GROUP BY passo
  ),
  risp_passo AS (
    SELECT dopo_passo AS passo, count(*) AS risposte,
           count(*) FILTER (WHERE fase IN ('risposta_interessato', 'risposta_domanda')) AS interessati
      FROM risp GROUP BY dopo_passo
  ),
  usciti_passo AS (
    SELECT inviati AS passo,
           count(*) FILTER (WHERE fase = 'rimbalzato') AS rimbalzi,
           count(*) FILTER (WHERE fase = 'disiscritto') AS disiscritti,
           count(*) FILTER (WHERE fase = 'passo_' || inviati) AS in_attesa
      FROM i GROUP BY inviati
  ),
  giorni AS (
    SELECT d::date AS giorno
      FROM generate_series(
             (now() AT TIME ZONE p_tz)::date - (greatest(p_giorni, 1) - 1),
             (now() AT TIME ZONE p_tz)::date + greatest(p_giorni, 1),
             interval '1 day') d
  ),
  inv_g AS (SELECT (sent_at AT TIME ZONE p_tz)::date AS giorno, count(*) AS n FROM inv GROUP BY 1),
  prog_g AS (SELECT (scheduled_for AT TIME ZONE p_tz)::date AS giorno, count(*) AS n FROM prog GROUP BY 1),
  risp_g AS (SELECT (risposta_at AT TIME ZONE p_tz)::date AS giorno, count(*) AS n FROM risp GROUP BY 1),
  cas_inv AS (SELECT sender_account_id AS id, count(*) AS n FROM inv WHERE sender_account_id IS NOT NULL GROUP BY 1),
  cas_prog AS (SELECT sender_account_id AS id, count(*) AS n FROM prog WHERE sender_account_id IS NOT NULL GROUP BY 1),
  cas_risp AS (SELECT casella AS id, count(*) AS n FROM risp WHERE casella IS NOT NULL GROUP BY 1),
  cas_rimb AS (SELECT ultima_casella AS id, count(*) AS n FROM i WHERE fase = 'rimbalzato' AND ultima_casella IS NOT NULL GROUP BY 1)
  SELECT jsonb_build_object(
    'aperture_tracciate', coalesce((
        SELECT bool_or(s.track_opens) FROM public.outreach_sequences s
         WHERE s.company_id = p_company AND (p_sequence IS NULL OR s.id = p_sequence)), false),
    'totali', (SELECT jsonb_build_object(
        'iscritti', count(*),
        'contattati', count(*) FILTER (WHERE i.inviati > 0),
        'da_contattare', count(*) FILTER (WHERE i.fase = 'da_contattare'),
        'in_corso', count(*) FILTER (WHERE starts_with(i.fase, 'passo_')),
        'completati', count(*) FILTER (WHERE i.fase = 'completato'),
        'risposte', count(*) FILTER (WHERE starts_with(i.fase, 'risposta_')),
        'interessati', count(*) FILTER (WHERE i.fase IN ('risposta_interessato', 'risposta_domanda')),
        'non_interessati', count(*) FILTER (WHERE i.fase = 'risposta_non_interessato'),
        'rimbalzati', count(*) FILTER (WHERE i.fase = 'rimbalzato'),
        'esclusi', count(*) FILTER (WHERE i.fase = 'escluso'),
        'disiscritti', count(*) FILTER (WHERE i.fase = 'disiscritto'),
        'fermati', count(*) FILTER (WHERE i.fase = 'fermato'),
        'in_pausa', count(*) FILTER (WHERE i.stato = 'paused'),
        'opportunita_create', (SELECT count(*) FROM opp),
        'opportunita_vinte', (SELECT count(*) FROM opp WHERE won_at IS NOT NULL)) FROM i),
    'messaggi', jsonb_build_object(
        'inviati', (SELECT count(*) FROM inv),
        'aperti', (SELECT count(*) FROM inv WHERE inv.opened_at IS NOT NULL),
        'programmati', (SELECT count(*) FROM prog),
        'primo_invio', (SELECT min(inv.sent_at) FROM inv),
        'ultimo_invio', (SELECT max(inv.sent_at) FROM inv),
        'prossimo_invio', (SELECT min(prog.scheduled_for) FROM prog),
        'ultimo_programmato', (SELECT max(prog.scheduled_for) FROM prog),
        'ore_mediane_risposta', (
          SELECT round((percentile_cont(0.5) WITHIN GROUP (
                   ORDER BY extract(epoch FROM (risp.risposta_at - risp.primo_at)) / 3600.0))::numeric, 1)
            FROM risp WHERE risp.primo_at IS NOT NULL AND risp.risposta_at >= risp.primo_at)),
    'passi', (SELECT coalesce(jsonb_agg(jsonb_build_object(
        'passo', n.passo,
        'canale', coalesce(d.channel, 'email'),
        'oggetto', d.subject,
        'giorno', d.delay_days,
        'inviati', coalesce(ip.inviati, 0),
        'aperti', coalesce(ip.aperti, 0),
        'risposte', coalesce(rp.risposte, 0),
        'interessati', coalesce(rp.interessati, 0),
        'rimbalzi', coalesce(up.rimbalzi, 0),
        'disiscritti', coalesce(up.disiscritti, 0),
        'in_attesa', coalesce(up.in_attesa, 0)
      ) ORDER BY n.passo), '[]'::jsonb)
      FROM passi_n n
      LEFT JOIN passi_def d ON d.passo = n.passo
      LEFT JOIN inv_passo ip ON ip.passo = n.passo
      LEFT JOIN risp_passo rp ON rp.passo = n.passo
      LEFT JOIN usciti_passo up ON up.passo = n.passo),
    'giorni', (SELECT coalesce(jsonb_agg(jsonb_build_object(
        'giorno', to_char(g.giorno, 'YYYY-MM-DD'),
        'inviati', coalesce(a.n, 0),
        'programmati', coalesce(b.n, 0),
        'risposte', coalesce(c.n, 0)
      ) ORDER BY g.giorno), '[]'::jsonb)
      FROM giorni g
      LEFT JOIN inv_g a ON a.giorno = g.giorno
      LEFT JOIN prog_g b ON b.giorno = g.giorno
      LEFT JOIN risp_g c ON c.giorno = g.giorno),
    'caselle', (SELECT coalesce(jsonb_agg(jsonb_build_object(
        'id', sa.id, 'email', sa.email, 'stato', sa.status,
        'inviati', coalesce(ci.n, 0), 'programmati', coalesce(cp.n, 0),
        'risposte', coalesce(cr.n, 0), 'rimbalzi', coalesce(cb.n, 0)
      ) ORDER BY coalesce(ci.n, 0) DESC, coalesce(cp.n, 0) DESC, sa.email), '[]'::jsonb)
      FROM public.outreach_sender_accounts sa
      LEFT JOIN cas_inv ci ON ci.id = sa.id
      LEFT JOIN cas_prog cp ON cp.id = sa.id
      LEFT JOIN cas_risp cr ON cr.id = sa.id
      LEFT JOIN cas_rimb cb ON cb.id = sa.id
     WHERE sa.company_id = p_company AND (ci.n IS NOT NULL OR cp.n IS NOT NULL)),
    'esiti', (SELECT coalesce(jsonb_agg(jsonb_build_object('esito', x.esito, 'contatti', x.n) ORDER BY x.n DESC), '[]'::jsonb)
      FROM (
        SELECT CASE WHEN i.risposta_intent = 'interested' THEN 'interessato'
                    WHEN i.risposta_intent = 'question' THEN 'domanda'
                    WHEN i.risposta_intent = 'not_interested' THEN 'non_interessato'
                    WHEN i.risposta_intent = 'unsubscribe' THEN 'disiscrizione'
                    WHEN i.risposta_intent IS NULL THEN 'da_classificare'
                    ELSE 'altro' END AS esito,
               count(*) AS n
          FROM i WHERE starts_with(i.fase, 'risposta_')
         GROUP BY 1) x)
  )
  WHERE (SELECT public.is_super_admin());
$function$;

-- I permessi restano quelli di 20280915220000; ripetuti per chi applica da zero.
REVOKE ALL ON FUNCTION public.outreach_campagna_iscrizioni(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.outreach_campagna_statistiche(uuid, uuid, text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.outreach_campagna_iscrizioni(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.outreach_campagna_statistiche(uuid, uuid, text, integer) TO authenticated, service_role;
