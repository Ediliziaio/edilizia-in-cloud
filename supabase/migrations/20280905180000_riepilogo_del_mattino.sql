-- ════════════════════════════════════════════════════════════════════════════
-- Il riepilogo del mattino, come dati e non come racconto
-- ════════════════════════════════════════════════════════════════════════════
--
-- Un briefing del mattino esiste già ed è fatto bene: `silvio-morning-brief`
-- gira ogni giorno, raccoglie quattro fonti tramite gli strumenti
-- dell'assistente, fa scrivere il testo a un modello e — la parte migliore —
-- pre-crea le azioni in stato «da approvare», così niente parte senza che una
-- persona dica di sì.
--
-- Non ne scrivo un secondo. Gli aggiungo le sezioni che gli mancano, come dati
-- verificabili invece che come prosa: cantieri in perdita, preventivi fermi e
-- messaggi senza risposta non compaiono in quelle quattro fonti.
--
-- Perché una funzione del database e non un altro strumento AI: questi numeri
-- devono essere gli stessi che vede la schermata, devono essere verificabili
-- con una query, e non devono costare una chiamata a un modello per essere
-- letti. Il briefing può usarli come contesto; una schermata può mostrarli da
-- sola.
--
-- Ogni voce porta l'azione pronta: dove si va e cosa si fa.

CREATE OR REPLACE FUNCTION public.riepilogo_mattino(
  p_company_id uuid,
  p_giorni_preventivo integer DEFAULT 7
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_scadenze   jsonb;
  v_cantieri   jsonb;
  v_preventivi jsonb;
  v_silenzi    jsonb;
BEGIN
  IF public.user_can_access_company(p_company_id) IS NOT TRUE THEN
    RAISE EXCEPTION 'Accesso negato' USING ERRCODE = '42501';
  END IF;

  -- ── 1. Quello che è scaduto e non è stato incassato ───────────────────────
  -- Le fatture al netto delle note di credito: una fattura stornata non è un
  -- credito, e sollecitarla è il modo migliore per perdere un cliente.
  SELECT coalesce(jsonb_agg(x ORDER BY x ->> 'scaduta_da' DESC), '[]'::jsonb)
    INTO v_scadenze
    FROM (
      SELECT jsonb_build_object(
               'tipo', 'fattura',
               'riferimento', coalesce(d.numero, '—'),
               'cliente', coalesce(nullif(btrim(d.cliente_snapshot ->> 'denominazione'), ''), 'senza nome'),
               'importo', round(coalesce(d.totale_da_pagare, d.totale_documento, 0)
                                - coalesce(d.importo_pagato, 0)
                                - public.documento_stornato(d.id), 2),
               'scadenza', d.data_scadenza,
               'scaduta_da', (CURRENT_DATE - d.data_scadenza),
               'azione', 'Sollecita il pagamento',
               'dove', '/azienda/documenti/' || d.id::text) AS x
        FROM public.documenti_fiscali d
       WHERE d.company_id = p_company_id AND d.deleted_at IS NULL
         AND public.documento_segno(d.tipo) = 1
         AND d.data_scadenza IS NOT NULL AND d.data_scadenza < CURRENT_DATE
         AND coalesce(d.totale_da_pagare, d.totale_documento, 0)
             - coalesce(d.importo_pagato, 0) - public.documento_stornato(d.id) > 0
       UNION ALL
      SELECT jsonb_build_object(
               'tipo', 'rata di commessa',
               'riferimento', coalesce(r.label, 'rata'),
               'cliente', coalesce(nullif(btrim(r.client_name), ''), 'senza nome'),
               'importo', round(coalesce(r.amount, 0), 2),
               'scadenza', r.expected_date,
               'scaduta_da', (CURRENT_DATE - r.expected_date),
               'azione', 'Verifica l''incasso della rata',
               'dove', '/azienda/commesse/' || r.order_id::text)
        FROM public.v_rate_commesse_unificate r
       WHERE r.company_id = p_company_id AND NOT r.is_paid
         AND r.expected_date IS NOT NULL AND r.expected_date < CURRENT_DATE
       ORDER BY 1 DESC
       LIMIT 15
    ) s;

  -- ── 2. I cantieri che stanno perdendo ─────────────────────────────────────
  SELECT coalesce(jsonb_agg(x ORDER BY (x ->> 'margine_perc')::numeric ASC), '[]'::jsonb)
    INTO v_cantieri
    FROM (
      SELECT jsonb_build_object(
               'commessa', coalesce(v.order_code, '—'),
               'cliente', nullif(btrim(v.cliente_nome), ''),
               'preventivo', round(v.preventivo_totale, 2),
               'consuntivo', round(v.consuntivo, 2),
               'margine', round(v.margine, 2),
               'margine_perc', round(v.margine_perc, 2),
               'stato', coalesce(st.semaforo,
                          CASE WHEN v.margine_perc < 0 THEN 'rosso' ELSE 'giallo' END),
               'ultima_causa', st.ultima_causa,
               'azione', CASE WHEN v.margine_perc < 0
                              THEN 'Il cantiere è in perdita: rivedi i costi o chiedi una variante'
                              ELSE 'Margine sotto soglia: controlla le voci di costo' END,
               'dove', '/azienda/commesse/' || v.id::text) AS x
        FROM public.v_ordine_marginalita v
        LEFT JOIN public.ordine_margine_stato st ON st.order_id = v.id
       WHERE v.company_id = p_company_id
         AND v.preventivo_totale > 0
         AND v.margine_perc < coalesce(
               (SELECT g.marginalita_soglia_perc FROM public.company_governance_settings g
                 WHERE g.company_id = p_company_id), 15)
       ORDER BY v.margine_perc ASC
       LIMIT 10
    ) s;

  -- ── 3. I preventivi fermi ─────────────────────────────────────────────────
  SELECT coalesce(jsonb_agg(x ORDER BY (x ->> 'fermo_da')::int DESC), '[]'::jsonb)
    INTO v_preventivi
    FROM (
      SELECT jsonb_build_object(
               'cliente', coalesce(nullif(btrim(q.client_name), ''),
                                   nullif(btrim(q.client_company), ''), 'senza nome'),
               'importo', round(coalesce(q.total, 0), 2),
               'stato', q.status,
               'visto_dal_cliente', q.viewed_at IS NOT NULL,
               'inviato_il', q.sent_at::date,
               'fermo_da', (CURRENT_DATE - q.sent_at::date),
               'scade_il', q.expires_at::date,
               -- «visto» non è uno stato: il normalizzatore lo riporta a
               -- 'inviata' e segna viewed_at. La differenza sta lì.
               'azione', CASE WHEN q.viewed_at IS NOT NULL
                              THEN 'L''ha aperto e non ha risposto: chiama'
                              ELSE 'Inviato e nessuna risposta: fai un sollecito' END,
               'dove', '/azienda/preventivi/' || q.id::text) AS x
        FROM public.quotes q
       WHERE q.company_id = p_company_id
         -- Il vocabolario degli stati è doppio: le righe scritte prima della
         -- normalizzazione hanno ancora 'inviato' e 'visto'. Passando dal
         -- normalizzatore si prendono entrambe.
         AND public.normalizza_stato_preventivo(q.status) = 'inviata'
         AND q.sent_at IS NOT NULL
         AND q.sent_at::date <= CURRENT_DATE - greatest(p_giorni_preventivo, 1)
       ORDER BY q.sent_at ASC
       LIMIT 10
    ) s;

  -- ── 4. Chi ha scritto e non ha avuto risposta ─────────────────────────────
  SELECT coalesce(jsonb_agg(x ORDER BY (x ->> 'da_ore')::numeric DESC), '[]'::jsonb)
    INTO v_silenzi
    FROM (
      SELECT jsonb_build_object(
               'canale', 'WhatsApp',
               'da', m.from_phone,
               'ricevuto', m.created_at,
               'da_ore', round(extract(epoch FROM (now() - m.created_at)) / 3600.0, 1),
               'azione', 'Nessuna risposta dopo questo messaggio: rispondi',
               'dove', '/azienda/marketing/whatsapp') AS x
        FROM public.whatsapp_messages m
       WHERE m.company_id = p_company_id
         AND m.direction = 'inbound'
         AND m.created_at > now() - interval '7 days'
         AND NOT EXISTS (
               SELECT 1 FROM public.whatsapp_messages o
                WHERE o.company_id = m.company_id
                  AND o.direction <> 'inbound'
                  AND o.to_phone = m.from_phone
                  AND o.created_at > m.created_at)
       ORDER BY m.created_at ASC
       LIMIT 10
    ) s;

  RETURN jsonb_build_object(
    'company_id', p_company_id,
    'generato_il', now(),
    'scadenze_non_incassate', coalesce(v_scadenze, '[]'::jsonb),
    'cantieri_sotto_soglia', coalesce(v_cantieri, '[]'::jsonb),
    'preventivi_fermi', coalesce(v_preventivi, '[]'::jsonb),
    'messaggi_senza_risposta', coalesce(v_silenzi, '[]'::jsonb),
    'quante', jsonb_build_object(
      'scadenze', jsonb_array_length(coalesce(v_scadenze, '[]'::jsonb)),
      'cantieri', jsonb_array_length(coalesce(v_cantieri, '[]'::jsonb)),
      'preventivi', jsonb_array_length(coalesce(v_preventivi, '[]'::jsonb)),
      'messaggi', jsonb_array_length(coalesce(v_silenzi, '[]'::jsonb))),
    'nota', 'Ogni voce porta l''azione e dove si va. Le fatture sono al netto delle note di credito emesse.');
END $function$;

COMMENT ON FUNCTION public.riepilogo_mattino(uuid, integer) IS
  'Le quattro cose da guardare al mattino, come dati verificabili: scaduti non incassati, cantieri sotto soglia, preventivi fermi, messaggi senza risposta. Ogni voce porta l''azione e la destinazione. Completa silvio-morning-brief, non lo sostituisce.';

REVOKE ALL ON FUNCTION public.riepilogo_mattino(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.riepilogo_mattino(uuid, integer) TO authenticated, service_role;
