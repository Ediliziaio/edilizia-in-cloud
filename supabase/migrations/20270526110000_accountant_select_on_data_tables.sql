-- RLS: accountant può SELECT sulle tabelle dati delle aziende clienti delegate.
--
-- Prerequisite: user_can_read_accountant_company(uuid) deve esistere
-- (vedi 20270525200000 + 20270526100000).
--
-- ROBUSTNESS: ogni policy è creata via DO block + introspection in
-- information_schema. Se una tabella manca o usa una colonna diversa
-- (tenant_id, azienda_id) il block skippa silenziosamente invece di
-- abortire la migration intera.

CREATE OR REPLACE FUNCTION public._tmp_create_accountant_select_policy(
  p_table text,
  p_company_col text DEFAULT 'company_id'
) RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_policy_name text := p_table || '_accountant_select';
  v_table_exists boolean;
  v_column_exists boolean;
BEGIN
  -- 1. tabella public.<p_table> esiste?
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = p_table
  ) INTO v_table_exists;
  IF NOT v_table_exists THEN
    RAISE NOTICE '[accountant-rls] skip: tabella public.% non esiste', p_table;
    RETURN;
  END IF;

  -- 2. colonna company_id (o equivalente) esiste?
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = p_table AND column_name = p_company_col
  ) INTO v_column_exists;
  IF NOT v_column_exists THEN
    RAISE NOTICE '[accountant-rls] skip: colonna %.% non esiste', p_table, p_company_col;
    RETURN;
  END IF;

  -- 3. drop + create policy
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', v_policy_name, p_table);
  EXECUTE format(
    'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.user_can_read_accountant_company(%I))',
    v_policy_name, p_table, p_company_col
  );
  RAISE NOTICE '[accountant-rls] ok: % policy creata', p_table;
END $$;

-- Applica a tutte le 28 tabelle candidate. Le mancanti vengono skippate.
DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    -- CANTIERI
    'orders', 'work_logs', 'giornale_lavori', 'foto_cantiere',
    -- MAGAZZINO
    'warehouses', 'warehouse_stock', 'warehouse_movements', 'warehouse_transfers',
    -- SUBAPPALTATORI + SICUREZZA
    'subappaltatori', 'contratti_subappalto', 'duvri_documents', 'durc_documents',
    'cantiere_segnalazioni',
    -- ASSISTENZA + MANUTENZIONE
    'tickets', 'piani_manutenzione', 'contratti_manutenzione', 'esecuzioni_manutenzione',
    -- FINANZA
    'fatture_ricevute', 'fattura_ordine', 'purchase_orders', 'scadenze',
    'prima_nota_entries', 'company_costs', 'cost_categories', 'cost_budgets',
    'bank_transactions', 'cashflow_forecast_snapshots', 'documenti_fiscali',
    -- PERSONE HR
    'employees', 'hr_cedolini', 'hr_timbrature'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    PERFORM public._tmp_create_accountant_select_policy(t, 'company_id');
  END LOOP;
END $$;

-- order_items: company filtering via JOIN su orders (no colonna company_id diretta)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='order_items')
     AND EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='orders') THEN
    DROP POLICY IF EXISTS "order_items_accountant_select" ON public.order_items;
    CREATE POLICY "order_items_accountant_select" ON public.order_items
      FOR SELECT TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM public.orders o
          WHERE o.id = order_items.order_id
            AND public.user_can_read_accountant_company(o.company_id)
        )
      );
    RAISE NOTICE '[accountant-rls] ok: order_items policy creata (via JOIN)';
  END IF;
END $$;

-- Cleanup: rimuovi il helper temporaneo
DROP FUNCTION IF EXISTS public._tmp_create_accountant_select_policy(text, text);
