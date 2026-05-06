-- IMPROVEMENT #15 — RLS test helper (usato da rls-health-check edge function)
-- ════════════════════════════════════════════════════════════════════════════
-- Esegue una count-query "as if user U" attivando RLS per la durata. Se
-- una policy ha ricorsione infinita o nega l'accesso, la funzione lo segnala.
--
-- Solo super_admin può chiamarla — è uno strumento di diagnostica.
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public._rls_test_count(
  p_table text,
  p_user_id uuid
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count bigint;
  v_allowed text[] := ARRAY[
    'orders','order_items','order_employees','order_salespeople',
    'quotes','quote_items','marketing_contacts','marketing_opportunities',
    'warehouse_stock','warehouse_movements','invoices','invoice_payments',
    'employees','subappaltatori','customer_documents','companies'
  ];
BEGIN
  -- Whitelist tabelle (security): non vogliamo che chiamante esegua su qualsiasi tabella
  IF NOT (p_table = ANY(v_allowed)) THEN
    RAISE EXCEPTION 'table_not_whitelisted: %', p_table;
  END IF;

  -- Solo super_admin può eseguire questo strumento
  IF NOT public.has_role(auth.uid(), 'super_admin'::app_role) THEN
    RAISE EXCEPTION 'unauthorized: only super_admin';
  END IF;

  -- Setta il jwt del target user per attivare le RLS sue
  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', p_user_id::text, 'role', 'authenticated')::text,
    true
  );

  -- La count viene eseguita con RLS active per p_user_id grazie al SET LOCAL
  -- Tuttavia, SECURITY DEFINER bypassa RLS per default. Per attivare RLS,
  -- dobbiamo cambiare il role temporaneamente.
  EXECUTE 'SET LOCAL ROLE authenticated';
  EXECUTE format('SELECT count(*) FROM public.%I', p_table) INTO v_count;
  EXECUTE 'RESET ROLE';

  RETURN v_count;
EXCEPTION
  WHEN OTHERS THEN
    EXECUTE 'RESET ROLE';
    RAISE;
END $$;

GRANT EXECUTE ON FUNCTION public._rls_test_count(text, uuid) TO service_role;

DO $$ BEGIN RAISE NOTICE 'RLS test helper pronto (whitelist 16 tabelle)'; END $$;
