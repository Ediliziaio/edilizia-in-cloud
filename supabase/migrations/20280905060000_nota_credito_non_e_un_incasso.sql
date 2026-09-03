-- ════════════════════════════════════════════════════════════════════════════
-- Ondata 5.4 — una nota di credito non è un incasso
-- ════════════════════════════════════════════════════════════════════════════
--
-- Quattro punti sbagliavano, in due modi opposti.
--
-- (a) Contata come entrata. `silvio_tool_quadro_incassi` e
--     `silvio_tool_company_kpi` sommano `importo_pagato` su documenti_fiscali
--     SENZA filtrare il tipo. Il rimborso pagato al cliente su una nota di
--     credito finisce fra gli incassi: soldi che escono, contati come soldi
--     che entrano.
--
-- (b) Non toglie mai niente da quello che il cliente deve. Il residuo e lo
--     scadenzario filtrano `tipo IN ('fattura','fattura_pa',
--     'fattura_riepilogativa')`: la nota di credito resta fuori dal conto e la
--     fattura continua a risultare dovuta per intero anche dopo essere stata
--     stornata. È il difetto che manderebbe un sollecito per una fattura già
--     annullata.
--
-- (c) La vista `fattura_pagamento_stato` non filtra affatto il tipo: una nota
--     di credito da 1.000 € compare come un credito da incassare di 1.000 €.
--     Da lì passa la dashboard (`useDashboardBillingKPI.ts`).
--
-- Oggi in archivio ci sono due sole note di credito, entrambe in bozza e a
-- zero: il danno non è ancora avvenuto. Lo sarebbe alla prima nota di credito
-- vera.

CREATE OR REPLACE FUNCTION public.documento_segno(p_tipo text)
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $function$
  SELECT CASE p_tipo
    -- Crediti verso il cliente
    WHEN 'fattura'               THEN  1
    WHEN 'fattura_pa'            THEN  1
    WHEN 'fattura_riepilogativa' THEN  1
    WHEN 'nota_debito'           THEN  1
    -- Storno di un credito
    WHEN 'nota_credito'          THEN -1
    -- Non sono crediti verso nessuno: preventivi e proforme non impegnano, il
    -- DDT non è un documento di pagamento, e l'autofattura l'azienda la emette
    -- a sé stessa (inversione contabile), non a un cliente.
    ELSE 0
  END;
$function$;

COMMENT ON FUNCTION public.documento_segno(text) IS
  'Come pesa un documento fiscale nei conti verso il cliente: +1 credito, -1 storno, 0 non pertinente. Serve perché sommare importi senza guardare il tipo trasforma un rimborso in un incasso.';

-- Quanto di un documento è stato stornato da note di credito collegate.
-- Le bozze non contano: una nota di credito non emessa non ha stornato niente.
CREATE OR REPLACE FUNCTION public.documento_stornato(p_documento_id uuid)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT coalesce(sum(coalesce(nc.totale_da_pagare, nc.totale_documento, 0)), 0)
    FROM public.documenti_fiscali nc
   WHERE nc.documento_correlato_id = p_documento_id
     AND nc.tipo = 'nota_credito'
     AND nc.stato NOT IN ('bozza', 'annullata')
     AND nc.deleted_at IS NULL;
$function$;

REVOKE ALL ON FUNCTION public.documento_segno(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.documento_stornato(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.documento_segno(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.documento_stornato(uuid) TO authenticated, service_role;

-- ── (a) e (b): le funzioni dell'assistente ───────────────────────────────────
-- Sostituzioni mirate sul catalogo: sono funzioni lunghe che non ho scritto io,
-- e ritrascriverle intere per cambiare due SELECT è il modo migliore per
-- portarsi dietro un errore di copiatura.
DO $$
DECLARE d text; n text;
BEGIN
  d := pg_get_functiondef('public.silvio_tool_quadro_incassi(uuid,integer)'::regprocedure);
  n := replace(d,
    'SELECT COALESCE(sum(coalesce(importo_pagato,0)),0) INTO v_inc_fatture
    FROM documenti_fiscali
   WHERE company_id = p_company_id AND deleted_at IS NULL AND pagato_at >= da;',
    'SELECT COALESCE(sum(coalesce(importo_pagato,0) * public.documento_segno(tipo)),0) INTO v_inc_fatture
    FROM documenti_fiscali
   WHERE company_id = p_company_id AND deleted_at IS NULL AND pagato_at >= da;');
  IF n = d THEN RAISE EXCEPTION 'somma incassi non trovata in quadro_incassi'; END IF;
  d := n;

  n := replace(d,
    'SELECT COALESCE(sum(greatest(coalesce(totale_da_pagare, totale_documento, 0) - coalesce(importo_pagato,0), 0)),0)
    INTO v_fatture_residuo
    FROM documenti_fiscali
   WHERE company_id = p_company_id AND deleted_at IS NULL
     AND tipo IN (''fattura'',''fattura_pa'',''fattura_riepilogativa'');',
    'SELECT COALESCE(sum(greatest(coalesce(totale_da_pagare, totale_documento, 0)
                                  - coalesce(importo_pagato,0)
                                  - public.documento_stornato(id), 0)),0)
    INTO v_fatture_residuo
    FROM documenti_fiscali
   WHERE company_id = p_company_id AND deleted_at IS NULL
     AND tipo IN (''fattura'',''fattura_pa'',''fattura_riepilogativa'');');
  IF n = d THEN RAISE EXCEPTION 'residuo fatture non trovato in quadro_incassi'; END IF;
  EXECUTE n;

  d := pg_get_functiondef('public.silvio_tool_company_kpi(uuid)'::regprocedure);
  n := replace(d,
    'SELECT COALESCE(sum(coalesce(importo_pagato,0)), 0) INTO v_inc_fatture_ytd',
    'SELECT COALESCE(sum(coalesce(importo_pagato,0) * public.documento_segno(tipo)), 0) INTO v_inc_fatture_ytd');
  IF n = d THEN RAISE EXCEPTION 'somma incassi non trovata in company_kpi'; END IF;
  EXECUTE n;

  d := pg_get_functiondef('public.silvio_tool_lista_scadenze(uuid,uuid,integer,boolean)'::regprocedure);
  n := replace(d,
    'GREATEST(COALESCE(d.totale_da_pagare, d.totale_documento, 0) - COALESCE(d.importo_pagato, 0), 0)::numeric,',
    'GREATEST(COALESCE(d.totale_da_pagare, d.totale_documento, 0) - COALESCE(d.importo_pagato, 0)
               - public.documento_stornato(d.id), 0)::numeric,');
  IF n = d THEN RAISE EXCEPTION 'residuo non trovato in lista_scadenze'; END IF;
  d := n;
  n := replace(d,
    'AND (NOT p_only_unpaid OR COALESCE(d.totale_da_pagare, d.totale_documento, 0) - COALESCE(d.importo_pagato, 0) > 0)',
    'AND (NOT p_only_unpaid OR COALESCE(d.totale_da_pagare, d.totale_documento, 0) - COALESCE(d.importo_pagato, 0)
                                - public.documento_stornato(d.id) > 0)');
  IF n = d THEN RAISE EXCEPTION 'filtro non pagate non trovato in lista_scadenze'; END IF;
  EXECUTE n;
END $$;

-- ── (c) La vista da cui passa la dashboard ───────────────────────────────────
-- `importo_stornato` va in fondo: CREATE OR REPLACE VIEW non sa infilare una
-- colonna in mezzo, e togliere la vista significherebbe toglierla anche a chi
-- la usa.
CREATE OR REPLACE VIEW public.fattura_pagamento_stato AS
SELECT df.id                                        AS fattura_id,
       df.company_id,
       df.totale_da_pagare                          AS importo_totale,
       COALESCE(inc.tot, 0)                         AS importo_incassato,
       COALESCE(df.totale_da_pagare, 0)
         - COALESCE(inc.tot, 0)
         - COALESCE(nc.tot, 0)                      AS importo_residuo,
       CASE
         -- Una fattura interamente stornata non è «pagata»: nessuno ha pagato.
         WHEN COALESCE(nc.tot, 0) >= COALESCE(df.totale_da_pagare, 0)
              AND COALESCE(df.totale_da_pagare, 0) > 0 THEN 'stornata'::text
         WHEN COALESCE(inc.tot, 0) + COALESCE(nc.tot, 0)
              >= COALESCE(df.totale_da_pagare, 0)          THEN 'pagata'::text
         WHEN COALESCE(inc.tot, 0) + COALESCE(nc.tot, 0) > 0 THEN 'parziale'::text
         WHEN df.data_scadenza IS NOT NULL
              AND df.data_scadenza < CURRENT_DATE          THEN 'scaduta'::text
         ELSE 'in_attesa'::text
       END                                          AS stato_pagamento,
       inc.ultimo                                   AS ultimo_incasso,
       COALESCE(inc.n, 0)::integer                  AS numero_incassi,
       COALESCE(nc.tot, 0)                          AS importo_stornato
  FROM public.documenti_fiscali df
  LEFT JOIN LATERAL (
        SELECT sum(m.importo) AS tot, max(m.data_movimento) AS ultimo, count(*) AS n
          FROM public.movimenti_cassa_native m
         WHERE m.documento_id = df.id AND m.tipo = 'entrata'
  ) inc ON true
  LEFT JOIN LATERAL (
        SELECT sum(coalesce(x.totale_da_pagare, x.totale_documento, 0)) AS tot
          FROM public.documenti_fiscali x
         WHERE x.documento_correlato_id = df.id
           AND x.tipo = 'nota_credito'
           AND x.stato NOT IN ('bozza', 'annullata')
           AND x.deleted_at IS NULL
  ) nc ON true
 WHERE df.stato <> 'annullata'
   -- Prima qui non c'era nessun filtro sul tipo: una nota di credito da
   -- 1.000 € compariva come 1.000 € da incassare, e con lei proforme,
   -- preventivi e DDT.
   AND public.documento_segno(df.tipo) = 1;

COMMENT ON VIEW public.fattura_pagamento_stato IS
  'Stato di incasso dei soli documenti che sono un credito verso il cliente, al netto delle note di credito collegate. Lo stato «stornata» è distinto da «pagata»: nel primo caso nessuno ha pagato.';
