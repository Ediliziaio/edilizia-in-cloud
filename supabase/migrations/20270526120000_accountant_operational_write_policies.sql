-- RLS: accountant può fare INSERT/UPDATE/DELETE quando ha
-- access_mode='operational' sulla company.
--
-- Helper SECURITY DEFINER: verifica se l'utente loggato è commercialista
-- ATTIVO operational sulla company X.

CREATE OR REPLACE FUNCTION public.user_can_write_accountant_company(p_company_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.accountant_company_access aca
    JOIN public.accountant_firm_members fm
      ON fm.firm_id = aca.firm_id
     AND fm.user_id = auth.uid()
     AND fm.status = 'active'
    WHERE aca.company_id = p_company_id
      AND aca.status = 'active'
      AND aca.access_mode = 'operational'
  );
$$;

GRANT EXECUTE ON FUNCTION public.user_can_write_accountant_company(uuid) TO authenticated;

-- Helper temporaneo per creare policy in modo idempotente e robusto
CREATE OR REPLACE FUNCTION public._tmp_create_accountant_write_policies(
  p_table text,
  p_company_col text DEFAULT 'company_id'
) RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_table_exists boolean;
  v_column_exists boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = p_table
  ) INTO v_table_exists;
  IF NOT v_table_exists THEN
    RAISE NOTICE '[accountant-write] skip: tabella public.% non esiste', p_table;
    RETURN;
  END IF;
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = p_table AND column_name = p_company_col
  ) INTO v_column_exists;
  IF NOT v_column_exists THEN
    RAISE NOTICE '[accountant-write] skip: colonna %.% non esiste', p_table, p_company_col;
    RETURN;
  END IF;

  -- INSERT: la nuova riga deve appartenere a una company dove accountant ha write
  EXECUTE format(
    'DROP POLICY IF EXISTS %I ON public.%I',
    p_table || '_accountant_insert', p_table
  );
  EXECUTE format(
    'CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (public.user_can_write_accountant_company(%I))',
    p_table || '_accountant_insert', p_table, p_company_col
  );

  -- UPDATE: riga esistente accessibile + riga aggiornata sempre nella stessa azienda
  EXECUTE format(
    'DROP POLICY IF EXISTS %I ON public.%I',
    p_table || '_accountant_update', p_table
  );
  EXECUTE format(
    'CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (public.user_can_write_accountant_company(%I)) WITH CHECK (public.user_can_write_accountant_company(%I))',
    p_table || '_accountant_update', p_table, p_company_col, p_company_col
  );

  -- DELETE: stesso check
  EXECUTE format(
    'DROP POLICY IF EXISTS %I ON public.%I',
    p_table || '_accountant_delete', p_table
  );
  EXECUTE format(
    'CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (public.user_can_write_accountant_company(%I))',
    p_table || '_accountant_delete', p_table, p_company_col
  );

  RAISE NOTICE '[accountant-write] ok: % INSERT/UPDATE/DELETE policy create', p_table;
END $$;

-- Tabelle a cui il commercialista operational deve poter scrivere.
-- Lista ridotta vs SELECT (escluse HR sensibili come cedolini/timbrature
-- e archivi documenti fiscali che restano sola lettura).
DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    -- CANTIERI: solo notes/work_logs/foto (no orders direct: ci penseremo)
    'work_logs', 'giornale_lavori', 'foto_cantiere',
    'cantiere_segnalazioni',
    -- TICKETS (assistenza)
    'tickets',
    -- FINANZA operativa: prima nota, scadenze, costi, transazioni bancarie
    'scadenze', 'prima_nota_entries', 'company_costs',
    'cost_categories', 'cost_budgets', 'bank_transactions',
    -- DOCUMENTI fiscali: solo upload, non delete (delete è bloccato a
    -- livello edge function, ma RLS comunque permissiva qui)
    'documenti_fiscali'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    PERFORM public._tmp_create_accountant_write_policies(t, 'company_id');
  END LOOP;
END $$;

DROP FUNCTION IF EXISTS public._tmp_create_accountant_write_policies(text, text);
