-- Dettaglio delle voci del conto economico: somma allo stesso numero del CE (15/11/2026)
--
-- Cliccando una voce di costo del conto economico si apre il dettaglio dei
-- movimenti. Il dettaglio aveva una sua lettura dei costi, rimasta indietro:
-- data di pagamento invece che di competenza, filtri vecchi sui movimenti di
-- banca, la prima nota (che il conto economico non conta), nessuna categoria
-- scelta sul movimento. Demo 2, settembre 2026:
--   03 Acquisti            CE 167.728 €  dettaglio 472.070 €
--   05 Costi produttivi    CE  91.378 €  dettaglio 124.421 €
--   08 Costi amministrativi CE  4.967 €  dettaglio   4.367 €
--
-- Adesso righe e raggruppamento del dettaglio leggono la stessa vista del
-- conto economico (v_cg_costi_classificati), che per questo dà anche id,
-- descrizione e controparte di ogni riga (colonne aggiunte in fondo). Le voci
-- con una lettura propria (ricavi, personale dai cedolini, ammortamenti) non
-- cambiano.

set local lock_timeout = '3s';
set local statement_timeout = '60s';

create or replace view public.v_cg_costi_classificati with (security_invoker = on) as
 WITH costi_company AS (
         SELECT cc.company_id,
            COALESCE(cc.mese_competenza, cc.documento_data, fr.data_fattura, cc.due_date, cc.paid_date) AS data,
            pc.importo,
            pc.categoria AS source_value,
            'company_costs'::text AS source_table,
            NULL::text AS macro_cassa,
            NULL::text AS macro_testo,
            cc.id::text AS row_id,
            cc.name AS descrizione,
            sup.name AS controparte
           FROM company_costs cc
             LEFT JOIN fatture_ricevute fr ON fr.company_cost_id = cc.id
             LEFT JOIN suppliers sup ON sup.id = cc.supplier_id
             CROSS JOIN LATERAL costo_parti_categoria(cc.category, cc.amount, cc.ripartizione_categorie) pc(categoria, importo)
          WHERE cc.amount IS NOT NULL
        ), movimenti_bancari AS (
         SELECT bt.company_id,
            COALESCE(bt.value_date, bt.booking_date) AS data,
            q.importo,
            COALESCE(v.nome, bt.category) AS source_value,
            'bank_transactions'::text AS source_table,
            private.cassa_macro_ce(v.codice) AS macro_cassa,
            private.cassa_macro_ce(vt.codice) AS macro_testo,
            bt.id::text AS row_id,
            COALESCE(bt.description, bt.reference, '— movimento bancario —') AS descrizione,
            COALESCE(NULLIF(bt.counterparty_name, ''), bt.merchant_name, bt.creditor_name) AS controparte
           FROM bank_transactions bt
             CROSS JOIN LATERAL (
               SELECT CASE WHEN bt.cassa_voce_origine = 'proposta' THEN NULL ELSE (x.value ->> 'voce_id')::uuid END AS voce_id,
                      CASE WHEN bt.cassa_ripartizione IS NULL THEN abs(bt.amount) ELSE (x.value ->> 'cents')::numeric / 100 END AS importo
                 FROM jsonb_array_elements(COALESCE(bt.cassa_ripartizione,
                        jsonb_build_array(jsonb_build_object('voce_id', bt.cassa_voce_id)))) x(value)
             ) q
             LEFT JOIN cassa_voci v ON v.id = q.voce_id AND v.company_id = bt.company_id
             LEFT JOIN cassa_voci vt ON v.id IS NULL AND vt.company_id = bt.company_id
                                    AND vt.codice = private.cassa_codice_da_testo(bt.category)
          WHERE bt.amount < 0::numeric AND COALESCE(bt.status, 'booked') = 'booked'
            AND bt.linked_scadenza_id IS NULL AND bt.linked_cost_id IS NULL
            AND NOT EXISTS (SELECT 1 FROM bank_reconciliations br
                             WHERE br.transaction_id = bt.id AND br.unmatched_at IS NULL)
            AND NOT EXISTS (SELECT 1 FROM bank_reconciliations br
                             WHERE br.transaction_id = bt.id AND (br.invoice_id IS NOT NULL OR br.scadenza_id IS NOT NULL))
            AND NOT EXISTS (SELECT 1 FROM prima_nota_entries p
                             WHERE p.bank_transaction_id = bt.id AND p.cost_id IS NOT NULL)
            AND COALESCE(lower(bt.category), ''::text) !~~ 'girocont%'::text
            -- Pagamento a chi manda fatture: salda una fattura ricevuta, il costo è quella.
            AND NOT private.cg_paga_fornitore_con_fatture(bt.company_id,
                  COALESCE(NULLIF(bt.counterparty_name, ''), bt.creditor_name),
                  COALESCE(NULLIF(bt.counterparty_iban, ''), bt.creditor_iban))
            AND (COALESCE(v.id, vt.id) IS NULL OR (
                  COALESCE(v.sezione, vt.sezione) = 'operativa'
              AND left(COALESCE(v.codice, vt.codice), 2) NOT IN ('02', '12', '21', '23', '24', '25')
              AND NOT (left(COALESCE(v.codice, vt.codice), 2) IN ('06', '07')
                       AND EXISTS (SELECT 1 FROM cedolini ce
                                    WHERE ce.company_id = bt.company_id
                                      AND ce.anno = EXTRACT(year FROM COALESCE(bt.value_date, bt.booking_date))::integer))))
        )
 SELECT u.company_id,
    u.data,
    u.importo,
    u.source_table,
    u.source_value,
    cl.voce_chiave,
    COALESCE(u.macro_cassa, cl.macro_voce, u.macro_testo) AS macro_voce,
    COALESCE(cl.tipo, CASE WHEN COALESCE(u.macro_cassa, u.macro_testo) IN ('acquisti_materie', 'costi_produttivi') THEN 'V'
                           WHEN COALESCE(u.macro_cassa, u.macro_testo) IS NOT NULL THEN 'F' END) AS tipo,
    EXTRACT(year FROM u.data)::integer AS anno,
    EXTRACT(month FROM u.data)::integer AS mese,
    u.row_id,
    u.descrizione,
    u.controparte
   FROM ( SELECT costi_company.company_id, costi_company.data, costi_company.importo,
                 costi_company.source_value, costi_company.source_table, costi_company.macro_cassa, costi_company.macro_testo,
                 costi_company.row_id, costi_company.descrizione, costi_company.controparte
           FROM costi_company
        UNION ALL
         SELECT movimenti_bancari.company_id, movimenti_bancari.data, movimenti_bancari.importo,
                movimenti_bancari.source_value, movimenti_bancari.source_table, movimenti_bancari.macro_cassa, movimenti_bancari.macro_testo,
                movimenti_bancari.row_id, movimenti_bancari.descrizione, movimenti_bancari.controparte
           FROM movimenti_bancari) u
     LEFT JOIN LATERAL ( SELECT c.voce_chiave, c.macro_voce, c.tipo
           FROM cg_classificazione_voci c
          WHERE c.company_id = u.company_id AND c.source_table = u.source_table AND c.is_active
            AND cg_norm_voce(c.source_value) = cg_norm_voce(u.source_value)
          ORDER BY (c.source_value = u.source_value) DESC, c.voce_chiave
         LIMIT 1) cl ON true;

do $p$
declare
  vecchio text := pg_get_functiondef('public.cg_get_dettaglio_voce_mese'::regproc);
  inizio integer;
  fine integer;
  nuovo text;
begin
  if position('FROM public.v_cg_costi_classificati v' in vecchio) > 0 then
    return;
  end if;
  inizio := position($a$  IF v_macro_voce IS NOT NULL THEN
    WITH base AS ($a$ in vecchio);
  fine := position($a$    ) g;
  END IF;$a$ in vecchio);
  if inizio = 0 or fine = 0 or fine < inizio then
    raise exception 'Dettaglio voce: blocco dei costi non trovato, la funzione è cambiata';
  end if;
  nuovo := left(vecchio, inizio - 1) || $b$  IF v_macro_voce IS NOT NULL THEN
    -- Stessa fonte e stesse regole del conto economico.
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
             'id', v.row_id, 'source_table', v.source_table, 'data', v.data,
             'descrizione', v.descrizione, 'controparte', v.controparte,
             'voce_chiave', v.voce_chiave, 'categoria', v.source_value, 'importo', v.importo
           ) ORDER BY v.data DESC, v.importo DESC), '[]'::jsonb),
           COALESCE(sum(v.importo), 0)
      INTO v_righe, v_totale
      FROM public.v_cg_costi_classificati v
     WHERE v.company_id = v_company_id AND v.anno = p_anno
       AND (p_mese IS NULL OR v.mese = p_mese)
       AND v.macro_voce = v_macro_voce;

    SELECT COALESCE(jsonb_agg(jsonb_build_object(
             'etichetta', g.etichetta, 'totale', g.tot, 'count', g.n
           ) ORDER BY g.tot DESC), '[]'::jsonb)
      INTO v_raggr
      FROM (
        SELECT COALESCE(v.voce_chiave, v.source_value, '— non classificato —') AS etichetta,
               sum(v.importo) AS tot, count(*) AS n
          FROM public.v_cg_costi_classificati v
         WHERE v.company_id = v_company_id AND v.anno = p_anno
           AND (p_mese IS NULL OR v.mese = p_mese)
           AND v.macro_voce = v_macro_voce
         GROUP BY 1
      ) g;
  END IF;$b$ || substr(vecchio, fine + length($a$    ) g;
  END IF;$a$));
  execute nuovo;
end $p$;