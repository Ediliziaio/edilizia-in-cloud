-- F0-07 — Chiusura (selettiva e verificata) della superficie RPC pubblica.
--
-- Il ruolo `anon` poteva eseguire centinaia di funzioni SECURITY DEFINER.
-- Quelle che muovono valore hanno un controllo interno (assert_company_access),
-- ma restavano esposte funzioni che permettono a un utente NON autenticato di
-- enumerare la piattaforma: dato un elenco di UUID, scoprire chi è
-- amministratore, a quale azienda appartiene un utente, chi è referente di
-- magazzino.
--
-- PERCHÉ SELETTIVA E NON TOTALE — vincolo verificato, non prudenza generica:
-- has_role compare in 431 policy RLS che si applicano a PUBLIC (quindi anche ad
-- anon), get_user_company_id in 131, is_super_admin in 59,
-- order_has_employee_for_user in 3. Revocarne l'esecuzione NON le renderebbe
-- private: farebbe fallire quelle policy con "permission denied for function",
-- rompendo ogni accesso anonimo legittimo dell'app.
-- Per chiuderle davvero bisogna prima riscrivere quelle policy come
-- TO authenticated: intervento ampio e da collaudare, previsto in Fase 4.

DO $$
DECLARE
  v_sig text;
BEGIN
  FOR v_sig IN
    SELECT p.oid::regprocedure::text
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef
      AND has_function_privilege('anon', p.oid, 'EXECUTE')
      AND p.proname IN (
        'hr_profilo_da_user', 'is_platform_staff', 'superadmin_can_access_company',
        'is_warehouse_referente', 'order_has_salesperson_for_user',
        'accountant_accessible_company_ids', 'is_scopri_plan', 'is_cg_enabled',
        '_cg_assert_enabled', 'internal_chat_company_allowed',
        'internal_chat_membership_allowed', 'internal_chat_can_manage_members',
        'internal_chat_is_order_channel', 'is_survey_assignee', 'aziende_con_permesso',
        'can_access_company_people', 'can_manage_company_people', 'can_view_company_people',
        'can_accountant_access_company', 'check_staff_visibility',
        'get_company_customer_count', 'crm_cold_db_health',
        'silvio_get_customer_history', 'admin_support_last_message_by_company'
      )
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon', v_sig);
  END LOOP;
END $$;
