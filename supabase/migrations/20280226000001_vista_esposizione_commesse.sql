-- ============================================================================
-- v_ordine_esposizione — chi finanzia ogni cantiere, a livello di flotta.
--
-- Per ogni commessa: incassato (cassa vera) − uscite pagate = saldo.
-- saldo < 0 ⇒ il cantiere lo sta finanziando l'azienda, non il cliente.
--
-- Le regole replicano AL CENTESIMO quelle del frontend, che sono il canone:
-- · incassato = rate pagate LORDE (calculateCollectedGrossFromInstallments):
--   la rata "balance" è CALCOLATA (totale ivato − somma delle altre rate −
--   financing_cost), MAI il campo amount; le rate "financing" sono escluse
--   dall'incassato ma contano nella somma sottratta al saldo.
-- · commesse senza righe in order_installments → fallback sui campi legacy
--   (deposit/deposit_2/balance), stessa forma del ponte buildInstallmentsFromLegacy
--   per il payment_type standard (l'unico rimasto in circolazione sul legacy).
-- · uscite = costi della commessa realmente PAGATI: company_costs (imponibile
--   → lordo con vat_rate ?? 0: aliquota assente = esente, convenzione export
--   Costi), manodopera interna (total_cost, senza IVA), squadre esterne
--   (total_cost già lordo), provvigioni nette. Gli order_errors restano fuori:
--   misura di perdita, non un'uscita di cassa aggiuntiva.
--
-- security_invoker = on: la vista rispetta la RLS delle tabelle sotto (a
-- differenza della storica v_ordine_marginalita, che gira da owner).
-- ============================================================================

CREATE OR REPLACE VIEW public.v_ordine_esposizione
WITH (security_invoker = on) AS
WITH rate AS (
  SELECT oi.order_id,
    COUNT(*)::int AS n_rate,
    SUM(CASE WHEN oi.type <> 'balance' THEN GREATEST(oi.amount, 0) ELSE 0 END) AS non_balance_sum,
    SUM(CASE WHEN oi.is_paid AND oi.type NOT IN ('balance', 'financing') THEN GREATEST(oi.amount, 0) ELSE 0 END) AS incassato_semplice,
    BOOL_OR(oi.is_paid AND oi.type = 'balance') AS balance_pagata
  FROM public.order_installments oi
  GROUP BY oi.order_id
),
uscite AS (
  SELECT x.order_id, SUM(x.v) AS uscite_pagate FROM (
    SELECT cc.order_id, cc.amount * (1 + COALESCE(cc.vat_rate, 0) / 100.0) AS v
      FROM public.company_costs cc
     WHERE cc.order_id IS NOT NULL AND cc.is_paid
    UNION ALL
    SELECT oe.order_id, COALESCE(oe.total_cost, 0)
      FROM public.order_employees oe
     WHERE oe.order_id IS NOT NULL AND oe.is_paid
    UNION ALL
    SELECT ot.order_id, COALESCE(ot.total_cost, 0)
      FROM public.order_external_teams ot
     WHERE ot.order_id IS NOT NULL AND ot.is_paid
    UNION ALL
    SELECT os.order_id, GREATEST(GREATEST(COALESCE(os.commission_amount, 0), 0) - GREATEST(COALESCE(os.deduction_amount, 0), 0), 0)
      FROM public.order_salespeople os
     WHERE os.order_id IS NOT NULL AND os.is_paid
  ) x
  GROUP BY x.order_id
),
base AS (
  SELECT
    o.id,
    o.company_id,
    o.order_code,
    o.description,
    o.current_status_id,
    CASE
      WHEN COALESCE(r.n_rate, 0) > 0 THEN
        COALESCE(r.incassato_semplice, 0)
        + CASE WHEN r.balance_pagata
            THEN GREATEST(0,
                   COALESCE(o.total_amount, 0) * (1 + COALESCE(o.vat_rate, 22) / 100.0)
                   - COALESCE(r.non_balance_sum, 0)
                   - COALESCE(o.financing_cost, 0))
            ELSE 0 END
      ELSE
        (CASE WHEN o.deposit_paid THEN GREATEST(COALESCE(o.deposit_amount, 0), 0) ELSE 0 END)
        + (CASE WHEN o.deposit_2_paid THEN GREATEST(COALESCE(o.deposit_2_amount, 0), 0) ELSE 0 END)
        + (CASE WHEN o.balance_paid AND COALESCE(o.balance_amount, 0) > 0
             THEN GREATEST(0,
                    COALESCE(o.total_amount, 0) * (1 + COALESCE(o.vat_rate, 22) / 100.0)
                    - GREATEST(COALESCE(o.deposit_amount, 0), 0)
                    - GREATEST(COALESCE(o.deposit_2_amount, 0), 0)
                    - GREATEST(COALESCE(o.financing_amount, 0), 0)
                    - COALESCE(o.financing_cost, 0))
             ELSE 0 END)
    END AS incassato,
    COALESCE(u.uscite_pagate, 0) AS uscite_pagate
  FROM public.orders o
  LEFT JOIN rate r ON r.order_id = o.id
  LEFT JOIN uscite u ON u.order_id = o.id
)
SELECT b.id, b.company_id, b.order_code, b.description, b.current_status_id,
       b.incassato, b.uscite_pagate,
       b.incassato - b.uscite_pagate AS saldo
FROM base b;

COMMENT ON VIEW public.v_ordine_esposizione IS
  'Cassa per commessa: incassato (rate lorde, saldo calcolato) − costi pagati. saldo<0 = cantiere finanziato dall''azienda. security_invoker: rispetta la RLS di orders.';
