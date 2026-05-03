-- MP-CG-01 / 2.1-2.3 — Viste analitiche per CE riclassificato e BEP
-- (adattate ai nomi reali dei campi: paid_date, value_date, issue_date, ecc.)

-- ── 2.1 v_cg_costi_classificati ──────────────────────────────────────────
-- Unione di company_costs + bank_transactions categorizzati + prima_nota_entries.
-- Ogni riga è già "risolta" sulla classificazione F/V/Z e macro_voce.

CREATE OR REPLACE VIEW public.v_cg_costi_classificati AS
WITH costi_company AS (
  SELECT cc.company_id,
         COALESCE(cc.paid_date, cc.due_date)::date AS data,
         cc.amount AS importo,
         cc.category AS source_value,
         'company_costs'::text AS source_table
  FROM public.company_costs cc
  WHERE cc.amount IS NOT NULL
),
movimenti_bancari AS (
  SELECT bt.company_id,
         COALESCE(bt.value_date, bt.booking_date)::date AS data,
         abs(bt.amount) AS importo,
         bt.category AS source_value,
         'bank_transactions'::text AS source_table
  FROM public.bank_transactions bt
  WHERE bt.amount < 0
    AND bt.id NOT IN (
      SELECT br.transaction_id FROM public.bank_reconciliations br WHERE br.invoice_id IS NOT NULL
    )
),
voci_prima_nota AS (
  SELECT pn.company_id,
         pn.entry_date::date AS data,
         pn.amount AS importo,
         pn.category AS source_value,
         'prima_nota'::text AS source_table
  FROM public.prima_nota_entries pn
  WHERE pn.direction = 'out'
)
SELECT u.company_id, u.data, u.importo, u.source_table, u.source_value,
       cl.voce_chiave, cl.macro_voce, cl.tipo,
       extract(year  FROM u.data)::int AS anno,
       extract(month FROM u.data)::int AS mese
FROM (
  SELECT * FROM costi_company
  UNION ALL SELECT * FROM movimenti_bancari
  UNION ALL SELECT * FROM voci_prima_nota
) u
LEFT JOIN public.cg_classificazione_voci cl
  ON cl.company_id = u.company_id
 AND cl.source_table = u.source_table
 AND cl.source_value = u.source_value
 AND cl.is_active = true;

GRANT SELECT ON public.v_cg_costi_classificati TO authenticated;
COMMENT ON VIEW public.v_cg_costi_classificati IS
  'Costi unificati (company_costs + bank_transactions uscite + prima_nota out) con classificazione F/V/Z e macro_voce.';

-- ── 2.2 v_cg_ricavi_classificati ─────────────────────────────────────────
-- Ricavi da fatture emesse (escluse cancellate / draft).

CREATE OR REPLACE VIEW public.v_cg_ricavi_classificati AS
SELECT i.company_id,
       i.issue_date::date AS data,
       (COALESCE(i.total, 0) - COALESCE(i.tax_amount, 0)) AS importo_imponibile,
       COALESCE(i.tax_amount, 0) AS iva_amount,
       i.document_type AS invoice_type,
       extract(year  FROM i.issue_date)::int AS anno,
       extract(month FROM i.issue_date)::int AS mese,
       i.client_id   AS cliente_id,
       i.order_id
FROM public.invoices i
WHERE i.status NOT IN ('cancelled','draft','annullata','bozza')
  AND i.issue_date IS NOT NULL;

GRANT SELECT ON public.v_cg_ricavi_classificati TO authenticated;
COMMENT ON VIEW public.v_cg_ricavi_classificati IS
  'Ricavi da invoices emesse (escluse cancellate/draft).';

-- ── 2.3 mv_cg_storico_24m ────────────────────────────────────────────────
-- Aggregato pre-calcolato 24 mesi: refresh giornaliero via cron (vedi MP-CG-XX).

CREATE MATERIALIZED VIEW IF NOT EXISTS public.mv_cg_storico_24m AS
WITH base AS (
  SELECT company_id, anno, mese,
         sum(importo) FILTER (WHERE source_table='__ricavi__')                  AS ricavi,
         sum(importo) FILTER (WHERE macro_voce='acquisti_materie')              AS acquisti,
         sum(importo) FILTER (WHERE macro_voce='costi_produttivi')              AS costi_prod,
         sum(importo) FILTER (WHERE macro_voce='costo_personale')               AS costo_pers,
         sum(importo) FILTER (WHERE macro_voce='costi_commerciali')             AS costi_comm,
         sum(importo) FILTER (WHERE macro_voce='costi_amministrativi')          AS costi_amm,
         sum(importo) FILTER (WHERE macro_voce='ammortamenti')                  AS ammortamenti,
         sum(importo) FILTER (WHERE macro_voce='oneri_tributari')               AS oneri_trib,
         sum(importo) FILTER (WHERE macro_voce='oneri_finanziari')              AS oneri_fin,
         sum(importo) FILTER (WHERE tipo='F') AS costi_fissi,
         sum(importo) FILTER (WHERE tipo='V') AS costi_variabili
  FROM (
    SELECT company_id, anno, mese, importo_imponibile AS importo,
           '__ricavi__'::text AS source_table, NULL::text AS macro_voce, NULL::text AS tipo
    FROM public.v_cg_ricavi_classificati
    UNION ALL
    SELECT company_id, anno, mese, importo, source_table, macro_voce, tipo
    FROM public.v_cg_costi_classificati
  ) x
  WHERE make_date(anno, mese, 1) >= (current_date - interval '25 months')
  GROUP BY company_id, anno, mese
)
SELECT * FROM base;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_cg_storico ON public.mv_cg_storico_24m(company_id, anno, mese);

-- Refresh function (chiamata da cron giornaliero)
CREATE OR REPLACE FUNCTION public.refresh_mv_cg_storico_24m()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_cg_storico_24m;
END;
$$;

COMMENT ON MATERIALIZED VIEW public.mv_cg_storico_24m IS
  'Storico 24 mesi aggregato per company. Refresh via refresh_mv_cg_storico_24m().';
