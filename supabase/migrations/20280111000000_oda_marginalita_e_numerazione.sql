-- ODA: due incoerenze di fondo emerse dall'audit del 2026-08-05.
--
-- 1) v_ordine_marginalita contava TUTTI gli ordini d'acquisto come costo
--    commessa, incluse le bozze (non ancora impegni) e gli annullati (non
--    saranno mai costi). OrderEconomicsSummary nel frontend li esclude:
--    stessa commessa, due numeri diversi di "costo materiali" a seconda
--    della schermata. Si allinea la vista alla regola del frontend:
--    contano inviato/confermato/parziale/ricevuto.
--
-- 2) generate_oda_number usava COUNT(*)+1: dopo una cancellazione il
--    conteggio regredisce e il numero successivo collide con uno esistente
--    (violazione di uq_oda_number_company); due inserimenti concorrenti
--    leggono lo stesso COUNT. Si passa a MAX(suffisso)+1, che non riusa
--    mai un numero gia' visto.

-- ────────────────────────────────────────────────────────────────────────────
-- 1. Vista marginalita': solo ODA emessi (niente bozze, niente annullati)
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW public.v_ordine_marginalita AS
 SELECT o.id,
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
    COALESCE(po.costo_acquisti, 0::numeric) + COALESCE(err.costo_errori, 0::numeric) + COALESCE(lab.costo_manodopera, 0::numeric) + COALESCE(comm.costo_provvigioni, 0::numeric) AS consuntivo,
    o.total_amount + COALESCE(odv.variazioni_approvate, 0::numeric) - (COALESCE(po.costo_acquisti, 0::numeric) + COALESCE(err.costo_errori, 0::numeric) + COALESCE(lab.costo_manodopera, 0::numeric) + COALESCE(comm.costo_provvigioni, 0::numeric)) AS margine,
        CASE
            WHEN (o.total_amount + COALESCE(odv.variazioni_approvate, 0::numeric)) > 0::numeric THEN round((o.total_amount + COALESCE(odv.variazioni_approvate, 0::numeric) - (COALESCE(po.costo_acquisti, 0::numeric) + COALESCE(err.costo_errori, 0::numeric) + COALESCE(lab.costo_manodopera, 0::numeric) + COALESCE(comm.costo_provvigioni, 0::numeric))) / (o.total_amount + COALESCE(odv.variazioni_approvate, 0::numeric)) * 100::numeric, 1)
            ELSE 0::numeric
        END AS margine_perc,
    COALESCE(lab.costo_manodopera, 0::numeric) AS costo_manodopera,
    COALESCE(comm.costo_provvigioni, 0::numeric) AS costo_provvigioni
   FROM orders o
     LEFT JOIN profiles c ON c.id = o.customer_id
     LEFT JOIN ( SELECT ordini_variazione.order_id,
            sum(ordini_variazione.impatto_economico) AS variazioni_approvate
           FROM ordini_variazione
          WHERE ordini_variazione.status = 'approvato'::text AND ordini_variazione.order_id IS NOT NULL
          GROUP BY ordini_variazione.order_id) odv ON odv.order_id = o.id
     LEFT JOIN ( SELECT purchase_orders.order_id,
            sum(purchase_orders.subtotal) AS costo_acquisti
           FROM purchase_orders
          WHERE purchase_orders.order_id IS NOT NULL
            -- stessa regola di OrderEconomicsSummary: una bozza non e' un
            -- impegno, un annullato non e' un costo
            AND purchase_orders.status = ANY (ARRAY['inviato'::text, 'confermato'::text, 'parziale'::text, 'ricevuto'::text])
          GROUP BY purchase_orders.order_id) po ON po.order_id = o.id
     LEFT JOIN ( SELECT order_errors.order_id,
            sum(order_errors.amount) AS costo_errori
           FROM order_errors
          GROUP BY order_errors.order_id) err ON err.order_id = o.id
     LEFT JOIN ( SELECT x.order_id,
            sum(x.total_cost) AS costo_manodopera
           FROM ( SELECT order_employees.order_id,
                    order_employees.total_cost
                   FROM order_employees
                UNION ALL
                 SELECT order_external_teams.order_id,
                    order_external_teams.total_cost
                   FROM order_external_teams) x
          WHERE x.order_id IS NOT NULL
          GROUP BY x.order_id) lab ON lab.order_id = o.id
     LEFT JOIN ( SELECT order_salespeople.order_id,
            sum(GREATEST(GREATEST(order_salespeople.commission_amount, 0::numeric) - GREATEST(order_salespeople.deduction_amount, 0::numeric), 0::numeric)) AS costo_provvigioni
           FROM order_salespeople
          WHERE order_salespeople.order_id IS NOT NULL
          GROUP BY order_salespeople.order_id) comm ON comm.order_id = o.id;

-- ────────────────────────────────────────────────────────────────────────────
-- 2. Numerazione: MAX del suffisso, mai riusare un numero
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.generate_oda_number(p_company_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_year TEXT;
  v_next INTEGER;
BEGIN
  v_year := EXTRACT(YEAR FROM CURRENT_DATE)::TEXT;

  -- MAX del suffisso numerico, non COUNT(*): il conteggio regredisce quando
  -- si cancella un ODA e il numero "nuovo" collide con uno esistente.
  SELECT COALESCE(MAX(substring(oda_number FROM '^ODA-' || v_year || '-(\d+)$')::INTEGER), 0) + 1
    INTO v_next
  FROM purchase_orders
  WHERE company_id = p_company_id
    AND oda_number ~ ('^ODA-' || v_year || '-\d+$');

  RETURN 'ODA-' || v_year || '-' || LPAD(v_next::TEXT, 4, '0');
END;
$function$;
