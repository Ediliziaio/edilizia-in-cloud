-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.

CREATE OR REPLACE VIEW public.v_ordine_marginalita AS
SELECT
    o.id,
    o.company_id,
    o.order_code,
    o.description,
    o.total_amount AS preventivo_contratto,
    COALESCE(odv.variazioni_approvate, 0::numeric) AS variazioni_approvate,
    o.total_amount + COALESCE(odv.variazioni_approvate, 0::numeric) AS preventivo_totale,
    o.work_start_date,
    o.work_end_date,
    o.created_at,
    COALESCE((c.first_name || ' '::text) || c.last_name, ''::text) AS cliente_nome,
    COALESCE(po.costo_acquisti, 0::numeric) AS costo_acquisti,
    COALESCE(err.costo_errori, 0::numeric) AS costo_errori,
    (
        COALESCE(po.costo_acquisti, 0::numeric)
      + COALESCE(err.costo_errori, 0::numeric)
      + COALESCE(lab.costo_manodopera, 0::numeric)
      + COALESCE(comm.costo_provvigioni, 0::numeric)
    ) AS consuntivo,
    (
        o.total_amount + COALESCE(odv.variazioni_approvate, 0::numeric)
      - (
            COALESCE(po.costo_acquisti, 0::numeric)
          + COALESCE(err.costo_errori, 0::numeric)
          + COALESCE(lab.costo_manodopera, 0::numeric)
          + COALESCE(comm.costo_provvigioni, 0::numeric)
        )
    ) AS margine,
    CASE
        WHEN (o.total_amount + COALESCE(odv.variazioni_approvate, 0::numeric)) > 0::numeric
        THEN round(
            (
                o.total_amount + COALESCE(odv.variazioni_approvate, 0::numeric)
              - (
                    COALESCE(po.costo_acquisti, 0::numeric)
                  + COALESCE(err.costo_errori, 0::numeric)
                  + COALESCE(lab.costo_manodopera, 0::numeric)
                  + COALESCE(comm.costo_provvigioni, 0::numeric)
                )
            ) / (o.total_amount + COALESCE(odv.variazioni_approvate, 0::numeric)) * 100::numeric,
            1
        )
        ELSE 0::numeric
    END AS margine_perc,
    COALESCE(lab.costo_manodopera, 0::numeric) AS costo_manodopera,
    COALESCE(comm.costo_provvigioni, 0::numeric) AS costo_provvigioni
FROM orders o
    LEFT JOIN profiles c ON c.id = o.customer_id
    LEFT JOIN (
        SELECT ordini_variazione.order_id,
               sum(ordini_variazione.impatto_economico) AS variazioni_approvate
        FROM ordini_variazione
        WHERE ordini_variazione.status = 'approvato'::text
          AND ordini_variazione.order_id IS NOT NULL
        GROUP BY ordini_variazione.order_id
    ) odv ON odv.order_id = o.id
    LEFT JOIN (
        SELECT purchase_orders.order_id,
               sum(purchase_orders.subtotal) AS costo_acquisti
        FROM purchase_orders
        WHERE purchase_orders.order_id IS NOT NULL
        GROUP BY purchase_orders.order_id
    ) po ON po.order_id = o.id
    LEFT JOIN (
        SELECT order_errors.order_id,
               sum(order_errors.amount) AS costo_errori
        FROM order_errors
        GROUP BY order_errors.order_id
    ) err ON err.order_id = o.id
    LEFT JOIN (
        SELECT x.order_id, sum(x.total_cost) AS costo_manodopera
        FROM (
            SELECT order_employees.order_id, order_employees.total_cost
            FROM order_employees
            UNION ALL
            SELECT order_external_teams.order_id, order_external_teams.total_cost
            FROM order_external_teams
        ) x
        WHERE x.order_id IS NOT NULL
        GROUP BY x.order_id
    ) lab ON lab.order_id = o.id
    LEFT JOIN (
        SELECT order_salespeople.order_id,
               sum(GREATEST(
                   GREATEST(order_salespeople.commission_amount, 0::numeric)
                 - GREATEST(order_salespeople.deduction_amount, 0::numeric),
                   0::numeric
               )) AS costo_provvigioni
        FROM order_salespeople
        WHERE order_salespeople.order_id IS NOT NULL
        GROUP BY order_salespeople.order_id
    ) comm ON comm.order_id = o.id;
