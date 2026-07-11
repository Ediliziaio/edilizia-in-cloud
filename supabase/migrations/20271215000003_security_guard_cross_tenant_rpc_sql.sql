-- ============================================================================
-- Hardening cross-tenant RPC — Parte 3/3: guard nelle funzioni LANGUAGE sql.
-- ----------------------------------------------------------------------------
-- Le funzioni sql non accettano l'iniezione di un PERFORM: vengono convertite in
-- plpgsql preservando header/firma/return-type e avvolgendo il corpo originale
-- con il guard (RETURN QUERY per le set-returning, RETURN (...) per gli scalari).
-- Solo funzioni-dato: i predicati booleani sql (is_cg_enabled, is_suppressed,
-- internal_chat_*_allowed, can_accountant_access_company, ...) restano intatti
-- perche' usati come predicati dentro le RLS.
-- ============================================================================

DO $mig$
DECLARE
  r record;
  header text; body text; nd text; cnt int := 0;
  targets text[] := ARRAY[
    'ddt_find_purchase_order_candidates','ddt_find_supplier_candidates','get_automation_counts','get_automation_log_recent','get_callcenter_lead_handling','get_cantieri_margine_basso','get_cash_flow_by_month','get_email_stats_by_campaign','get_email_stats_by_date','get_email_stats_summary','get_expenses_by_category','get_internal_chat_sidebar_state','get_leave_summary','get_treasury_summary','get_whatsapp_metrics','search_cantieri_by_trigram','get_company_email_usage_breakdown','silvio_lista_bozze_campagne_ads','silvio_tool_fatture_da_registrare','silvio_tool_fotovoltaico_overview','silvio_tool_manutenzione_overview','silvio_tool_richieste_preventivo','silvio_tool_sdi_overview'
  ];
BEGIN
  FOR r IN
    SELECT p.oid, p.proname, p.proretset, pg_get_functiondef(p.oid) AS def
    FROM pg_proc p
    JOIN pg_namespace ns ON ns.oid = p.pronamespace AND ns.nspname='public'
    JOIN pg_language l ON l.oid = p.prolang AND l.lanname='sql'
    WHERE p.prosecdef
      AND p.proname = ANY(targets)
      AND pg_get_function_arguments(p.oid) ILIKE '%p_company_id%uuid%'
      AND pg_get_functiondef(p.oid) NOT ILIKE '%assert_company_access%'
  LOOP
    header := regexp_replace(split_part(r.def, 'AS $function$', 1), 'LANGUAGE sql', 'LANGUAGE plpgsql');
    body := rtrim(rtrim(regexp_replace(r.def, '^.*?AS \$function\$(.*)\$function\$\s*$', '\1', 'is')), E' \n\t;');
    nd := header || 'AS $function$' || E'\nBEGIN\n  PERFORM public.assert_company_access(p_company_id);\n  '
      || CASE WHEN r.proretset THEN 'RETURN QUERY' ELSE 'RETURN (' END
      || E'\n' || body || CASE WHEN r.proretset THEN E'\n;' ELSE E'\n);' END
      || E'\nEND;\n$function$;';
    EXECUTE nd;
    cnt := cnt + 1;
  END LOOP;
  RAISE NOTICE 'Convertite+guardate % funzioni sql', cnt;
END $mig$;
