-- MP-WH-01 — Magazzino: Alert scadenze lotti + Valorizzazione FIFO/Medio
--
-- 1) wh_get_lotti_in_scadenza(days_ahead): lotti con expiry_date < oggi+N giorni
-- 2) wh_get_valorizzazione_magazzino(method, warehouse_id?):
--    - method='media': costo medio ponderato unit_cost × quantity
--    - method='fifo': somma layer FIFO ordinati per received_date

-- ════════════════════════════════════════════════════════════════════════════
-- 1) Alert lotti in scadenza
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.wh_get_lotti_in_scadenza(
  p_company_id uuid DEFAULT NULL,
  p_days_ahead int  DEFAULT 30
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id uuid;
  v_oggi       date := current_date;
  v_limite     date;
  v_result     jsonb;
BEGIN
  v_company_id := COALESCE(p_company_id, public.get_my_company_id());
  IF v_company_id IS NULL THEN RAISE EXCEPTION 'company_id non risolvibile'; END IF;
  IF v_company_id <> public.get_my_company_id()
     AND NOT public.has_role(auth.uid(), 'super_admin'::public.app_role) THEN
    RAISE EXCEPTION 'Accesso negato';
  END IF;

  v_limite := v_oggi + p_days_ahead;

  WITH lotti AS (
    SELECT
      lb.id,
      lb.lot_number,
      lb.expiry_date,
      lb.quantity,
      lb.unit_cost,
      ws.name           AS articolo,
      ws.internal_code,
      s.name            AS fornitore,
      (lb.expiry_date - v_oggi)::int AS giorni_residui,
      CASE
        WHEN lb.expiry_date < v_oggi                           THEN 'scaduto'
        WHEN lb.expiry_date - v_oggi <= 7                      THEN 'urgente'
        WHEN lb.expiry_date - v_oggi <= 30                     THEN 'attenzione'
        ELSE 'ok'
      END AS severita
    FROM public.warehouse_lot_batches lb
    JOIN public.warehouse_stock ws ON ws.id = lb.stock_item_id
    LEFT JOIN public.suppliers s   ON s.id = lb.supplier_id
    WHERE lb.company_id = v_company_id
      AND lb.expiry_date IS NOT NULL
      AND lb.expiry_date <= v_limite
      AND lb.quantity > 0
  )
  SELECT jsonb_build_object(
    'meta', jsonb_build_object(
      'company_id', v_company_id,
      'days_ahead', p_days_ahead,
      'data_riferimento', v_oggi,
      'data_limite', v_limite,
      'generato_il', now()
    ),
    'kpi', jsonb_build_object(
      'totale',     count(*),
      'scaduti',    count(*) FILTER (WHERE severita = 'scaduto'),
      'urgenti',    count(*) FILTER (WHERE severita = 'urgente'),
      'attenzione', count(*) FILTER (WHERE severita = 'attenzione'),
      'valore_a_rischio', COALESCE(sum(quantity * COALESCE(unit_cost, 0)), 0)
    ),
    'lotti', COALESCE(jsonb_agg(jsonb_build_object(
      'id',             id,
      'lot_number',     lot_number,
      'articolo',       articolo,
      'internal_code',  internal_code,
      'fornitore',      fornitore,
      'expiry_date',    expiry_date,
      'giorni_residui', giorni_residui,
      'quantity',       quantity,
      'unit_cost',      unit_cost,
      'valore',         (quantity * COALESCE(unit_cost, 0)),
      'severita',       severita
    ) ORDER BY expiry_date ASC), '[]'::jsonb)
  ) INTO v_result
  FROM lotti;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.wh_get_lotti_in_scadenza FROM public, anon;
GRANT EXECUTE ON FUNCTION public.wh_get_lotti_in_scadenza TO authenticated;

COMMENT ON FUNCTION public.wh_get_lotti_in_scadenza IS
  'Lotti magazzino con scadenza entro N giorni: severita scaduto/urgente/attenzione.';

-- ════════════════════════════════════════════════════════════════════════════
-- 2) Valorizzazione magazzino (FIFO + Medio ponderato)
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.wh_get_valorizzazione(
  p_company_id   uuid DEFAULT NULL,
  p_method       text DEFAULT 'media',     -- 'media' | 'fifo' | 'lifo'
  p_warehouse_id uuid DEFAULT NULL          -- opzionale: filtra magazzino
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id uuid;
  v_result     jsonb;
BEGIN
  v_company_id := COALESCE(p_company_id, public.get_my_company_id());
  IF v_company_id IS NULL THEN RAISE EXCEPTION 'company_id non risolvibile'; END IF;
  IF v_company_id <> public.get_my_company_id()
     AND NOT public.has_role(auth.uid(), 'super_admin'::public.app_role) THEN
    RAISE EXCEPTION 'Accesso negato';
  END IF;

  IF p_method NOT IN ('media','fifo','lifo') THEN
    RAISE EXCEPTION 'Metodo non valido: %. Usare media, fifo o lifo.', p_method;
  END IF;

  -- Per ogni stock item:
  --   • COSTO MEDIO PONDERATO = sum(qty*cost) / sum(qty) sui lotti
  --   • FIFO = costi dei layer più vecchi che coprono la quantità totale
  --   • LIFO = costi dei layer più nuovi
  --
  -- Se non ci sono lotti, usa warehouse_stock.unit_cost come fallback.
  WITH stock_items AS (
    SELECT ws.id, ws.name, ws.internal_code, ws.quantity AS qty_attuale,
           ws.unit_cost AS unit_cost_fallback,
           ws.warehouse_id
    FROM public.warehouse_stock ws
    WHERE ws.company_id = v_company_id
      AND (p_warehouse_id IS NULL OR ws.warehouse_id = p_warehouse_id)
  ),
  -- Lotti con quantity > 0 (residui in magazzino)
  lotti_disponibili AS (
    SELECT lb.stock_item_id, lb.received_date, lb.quantity, lb.unit_cost,
           lb.lot_number
    FROM public.warehouse_lot_batches lb
    WHERE lb.company_id = v_company_id
      AND lb.quantity > 0
      AND lb.unit_cost IS NOT NULL
  ),
  -- Calcolo costo medio ponderato per item
  media_per_item AS (
    SELECT stock_item_id,
           sum(quantity * unit_cost) / NULLIF(sum(quantity), 0) AS costo_medio,
           sum(quantity) AS qty_lotti
    FROM lotti_disponibili
    GROUP BY stock_item_id
  ),
  -- Per FIFO: lotti ordinati dal più vecchio al più recente
  -- Per LIFO: lotti ordinati dal più recente al più vecchio
  lotti_ordered AS (
    SELECT
      l.stock_item_id, l.received_date, l.quantity, l.unit_cost,
      ROW_NUMBER() OVER (
        PARTITION BY l.stock_item_id
        ORDER BY CASE WHEN p_method = 'fifo' THEN l.received_date END ASC,
                 CASE WHEN p_method = 'lifo' THEN l.received_date END DESC
      ) AS rn,
      sum(l.quantity) OVER (
        PARTITION BY l.stock_item_id
        ORDER BY CASE WHEN p_method = 'fifo' THEN l.received_date END ASC,
                 CASE WHEN p_method = 'lifo' THEN l.received_date END DESC
        ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
      ) AS qty_cumulativa
    FROM lotti_disponibili l
  ),
  -- Per ogni stock item con metodo FIFO/LIFO, prendiamo i layer fino a coprire qty_attuale
  valore_fifo_lifo AS (
    SELECT
      lo.stock_item_id,
      sum(
        CASE
          -- Layer completo se non abbiamo ancora coperto la qty richiesta
          WHEN lo.qty_cumulativa <= si.qty_attuale THEN lo.quantity * lo.unit_cost
          -- Layer parziale: prendi solo la parte che ci serve
          WHEN lo.qty_cumulativa - lo.quantity < si.qty_attuale THEN
            (si.qty_attuale - (lo.qty_cumulativa - lo.quantity)) * lo.unit_cost
          ELSE 0
        END
      ) AS valore
    FROM lotti_ordered lo
    JOIN stock_items si ON si.id = lo.stock_item_id
    WHERE p_method IN ('fifo','lifo')
    GROUP BY lo.stock_item_id
  ),
  -- Risultato finale per item
  per_item AS (
    SELECT
      si.id, si.name, si.internal_code, si.qty_attuale, si.warehouse_id,
      CASE
        WHEN p_method = 'media' AND mpi.costo_medio IS NOT NULL THEN
          si.qty_attuale * mpi.costo_medio
        WHEN p_method IN ('fifo','lifo') AND vfl.valore IS NOT NULL THEN
          vfl.valore
        ELSE
          si.qty_attuale * COALESCE(si.unit_cost_fallback, 0)
      END AS valore_calc,
      CASE
        WHEN p_method = 'media' AND mpi.costo_medio IS NOT NULL THEN mpi.costo_medio
        WHEN p_method IN ('fifo','lifo') AND vfl.valore IS NOT NULL AND si.qty_attuale > 0 THEN
          vfl.valore / si.qty_attuale
        ELSE COALESCE(si.unit_cost_fallback, 0)
      END AS unit_cost_calc,
      (mpi.costo_medio IS NOT NULL OR vfl.valore IS NOT NULL) AS ha_lotti
    FROM stock_items si
    LEFT JOIN media_per_item mpi ON mpi.stock_item_id = si.id
    LEFT JOIN valore_fifo_lifo vfl ON vfl.stock_item_id = si.id
  )
  SELECT jsonb_build_object(
    'meta', jsonb_build_object(
      'company_id', v_company_id,
      'method',     p_method,
      'warehouse_id', p_warehouse_id,
      'generato_il', now()
    ),
    'kpi', jsonb_build_object(
      'valore_totale',  COALESCE(sum(valore_calc), 0),
      'n_articoli',     count(*),
      'n_articoli_con_lotti', count(*) FILTER (WHERE ha_lotti),
      'qty_totale',     COALESCE(sum(qty_attuale), 0)
    ),
    'articoli', COALESCE(jsonb_agg(jsonb_build_object(
      'id',            id,
      'name',          name,
      'internal_code', internal_code,
      'quantity',      qty_attuale,
      'unit_cost',     round(unit_cost_calc::numeric, 2),
      'valore',        round(valore_calc::numeric, 2),
      'ha_lotti',      ha_lotti,
      'warehouse_id',  warehouse_id
    ) ORDER BY valore_calc DESC NULLS LAST), '[]'::jsonb)
  ) INTO v_result
  FROM per_item;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.wh_get_valorizzazione FROM public, anon;
GRANT EXECUTE ON FUNCTION public.wh_get_valorizzazione TO authenticated;

COMMENT ON FUNCTION public.wh_get_valorizzazione IS
  'Valorizzazione magazzino con metodi MEDIA/FIFO/LIFO. Usa lotti se disponibili, altrimenti unit_cost.';
