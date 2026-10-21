-- Conto economico: i giroconti tra conti propri non sono costi.
--
-- v_cg_costi_classificati prende le uscite di banca non collegate a scadenze,
-- costi o fatture. Un giroconto (soldi spostati da un conto all'altro della
-- stessa azienda) finiva lì, senza voce, nei «Costi non classificati», che il
-- CE sottrae dall'EBITDA. Demo 2 2026: 54.380 € di costi non classificati, di
-- cui 35.000 € di giroconti → EBITDA sottostimato di 35.000 €.
--
-- Cambio: le uscite di banca con categoria «Giroconto» (qualsiasi maiuscola,
-- anche «Giroconti», «giroconto interno») restano fuori. Il resto della vista
-- è identico. Nessuna riga scritta: solo CREATE OR REPLACE VIEW.
--
-- Verifica dopo l'applicazione (Demo 2, anno 2026):
--   select sum(importo) from v_cg_costi_classificati
--    where company_id = 'd2000000-0000-4000-a000-000000000002' and anno = 2026
--      and macro_voce is null;     -- da 54.380 a 19.380

SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '60s';

-- security_invoker come oggi: la vista rispetta le regole di sicurezza di chi legge.
CREATE OR REPLACE VIEW public.v_cg_costi_classificati WITH (security_invoker = on) AS
 WITH costi_company AS (
         SELECT cc.company_id,
            COALESCE(cc.paid_date, cc.due_date) AS data,
            cc.amount AS importo,
            cc.category AS source_value,
            'company_costs'::text AS source_table
           FROM company_costs cc
          WHERE cc.amount IS NOT NULL
        ), movimenti_bancari AS (
         SELECT bt.company_id,
            COALESCE(bt.value_date, bt.booking_date) AS data,
            abs(bt.amount) AS importo,
            bt.category AS source_value,
            'bank_transactions'::text AS source_table
           FROM bank_transactions bt
          WHERE bt.amount < 0::numeric AND bt.linked_scadenza_id IS NULL AND bt.linked_cost_id IS NULL
            AND NOT (bt.id IN ( SELECT br.transaction_id
                   FROM bank_reconciliations br
                  WHERE br.invoice_id IS NOT NULL OR br.scadenza_id IS NOT NULL))
            AND COALESCE(lower(bt.category), '') NOT LIKE 'girocont%'
        )
 SELECT u.company_id,
    u.data,
    u.importo,
    u.source_table,
    u.source_value,
    cl.voce_chiave,
    cl.macro_voce,
    cl.tipo,
    EXTRACT(year FROM u.data)::integer AS anno,
    EXTRACT(month FROM u.data)::integer AS mese
   FROM ( SELECT costi_company.company_id,
            costi_company.data,
            costi_company.importo,
            costi_company.source_value,
            costi_company.source_table
           FROM costi_company
        UNION ALL
         SELECT movimenti_bancari.company_id,
            movimenti_bancari.data,
            movimenti_bancari.importo,
            movimenti_bancari.source_value,
            movimenti_bancari.source_table
           FROM movimenti_bancari) u
     LEFT JOIN cg_classificazione_voci cl ON cl.company_id = u.company_id AND cl.source_table = u.source_table AND cl.source_value = u.source_value AND cl.is_active = true;
