-- MP-AIE-02 v2 — Popola allowed_tools sulle 18 personas
-- ════════════════════════════════════════════════════════════════════════════
-- Mappa ogni persona ai tool del registry centrale (silvioTools.ts) appropriati
-- al suo dominio. Le personas usano i tool quando l'utente chatta con loro
-- via ai-orchestrator (canale 'web_persona') — il filtering finale è anche
-- canale-aware, quindi i tool dichiarati qui devono ALMENO essere abilitati
-- per il canale 'web_persona' (la maggior parte lo è).
--
-- Tool esistenti (36 totali):
--   KPI: get_company_kpi, get_executive_snapshot, get_industry_benchmark
--   Cantiere: get_orders_summary, search_orders, get_foto_cantiere_summary,
--             get_warehouse_status
--   Finanza: get_revenue_forecast, get_overdue_payments, get_cashflow_status,
--            get_cashflow_forecast_90d, get_pricing_history, get_received_invoices
--   Preventivi: get_quotes_summary, analyze_quote, analyze_computo_metrico,
--               create_quote_draft (yellow)
--   CRM: get_customers_ltv_top, get_customers_at_risk, get_top_customers
--   HR: get_employees_workload, get_team_summary, lista_dipendenti_oggi
--   Filiera: get_suppliers_summary, get_subappaltatori_summary
--   Anomalie: detect_frodi_anomalie
--   Generative: create_invoice_draft (yellow), analyze_image
--   Knowledge: search_brain, universal_search
--   HITL: propose_action
--   Phase2: lista_scadenze, lista_transazioni, verifica_durc,
--           lista_email_thread, trova_slot_liberi
-- ════════════════════════════════════════════════════════════════════════════

-- Silvio (META — accesso a TUTTI i tool, è il cervello universale)
UPDATE public.ai_personas
   SET allowed_tools = jsonb_build_array(
     'get_company_kpi','get_executive_snapshot','get_industry_benchmark',
     'get_orders_summary','search_orders','get_foto_cantiere_summary','get_warehouse_status',
     'get_revenue_forecast','get_overdue_payments','get_cashflow_status',
     'get_cashflow_forecast_90d','get_pricing_history','get_received_invoices',
     'get_quotes_summary','analyze_quote','analyze_computo_metrico','create_quote_draft',
     'get_customers_ltv_top','get_customers_at_risk','get_top_customers',
     'get_employees_workload','get_team_summary','lista_dipendenti_oggi',
     'get_suppliers_summary','get_subappaltatori_summary',
     'detect_frodi_anomalie','create_invoice_draft','analyze_image',
     'search_brain','universal_search','propose_action',
     'lista_scadenze','lista_transazioni','verifica_durc',
     'lista_email_thread','trova_slot_liberi',
     'genera_reportino_settimanale_committente'
   )
 WHERE persona_key = 'silvio';

-- CFO (finanza + KPI)
UPDATE public.ai_personas
   SET allowed_tools = jsonb_build_array(
     'get_company_kpi','get_executive_snapshot','get_industry_benchmark',
     'get_revenue_forecast','get_overdue_payments','get_cashflow_status',
     'get_cashflow_forecast_90d','get_received_invoices',
     'lista_scadenze','lista_transazioni',
     'detect_frodi_anomalie','search_brain'
   )
 WHERE persona_key = 'cfo';

-- Controller (analisi + budget + KPI)
UPDATE public.ai_personas
   SET allowed_tools = jsonb_build_array(
     'get_company_kpi','get_revenue_forecast','get_overdue_payments',
     'get_cashflow_status','get_cashflow_forecast_90d','get_pricing_history',
     'get_received_invoices','lista_scadenze','lista_transazioni',
     'detect_frodi_anomalie','get_industry_benchmark','search_brain'
   )
 WHERE persona_key = 'controller';

-- Amministrazione (fatture, scadenze, banking, email amm.)
UPDATE public.ai_personas
   SET allowed_tools = jsonb_build_array(
     'get_overdue_payments','get_received_invoices','lista_scadenze',
     'lista_transazioni','create_invoice_draft','verifica_durc',
     'lista_email_thread','search_brain','propose_action'
   )
 WHERE persona_key = 'amministrazione';

-- Commercialista (compliance + fattura)
UPDATE public.ai_personas
   SET allowed_tools = jsonb_build_array(
     'get_overdue_payments','get_received_invoices','lista_scadenze',
     'verifica_durc','search_brain'
   )
 WHERE persona_key = 'commercialista';

-- PM Cantiere (operations cantiere)
UPDATE public.ai_personas
   SET allowed_tools = jsonb_build_array(
     'get_orders_summary','search_orders','get_foto_cantiere_summary',
     'get_warehouse_status','get_employees_workload','lista_dipendenti_oggi',
     'get_subappaltatori_summary','analyze_image','trova_slot_liberi',
     'verifica_durc','search_brain','propose_action',
     'genera_reportino_settimanale_committente'
   )
 WHERE persona_key = 'pm_cantiere';

-- Capocantiere (operativo cantiere)
UPDATE public.ai_personas
   SET allowed_tools = jsonb_build_array(
     'get_orders_summary','get_foto_cantiere_summary','get_warehouse_status',
     'lista_dipendenti_oggi','analyze_image','search_brain',
     'genera_reportino_settimanale_committente'
   )
 WHERE persona_key = 'capocantiere';

-- Ufficio Tecnico (preventivi + analisi)
UPDATE public.ai_personas
   SET allowed_tools = jsonb_build_array(
     'analyze_quote','analyze_computo_metrico','get_pricing_history',
     'get_warehouse_status','analyze_image','search_brain'
   )
 WHERE persona_key = 'tecnico';

-- Acquisti (filiera + preventivi)
UPDATE public.ai_personas
   SET allowed_tools = jsonb_build_array(
     'get_suppliers_summary','get_subappaltatori_summary','get_received_invoices',
     'get_warehouse_status','get_pricing_history','search_brain','propose_action'
   )
 WHERE persona_key = 'acquisti';

-- Direttore Vendite (CRM + preventivi + KPI commerciali)
UPDATE public.ai_personas
   SET allowed_tools = jsonb_build_array(
     'get_quotes_summary','analyze_quote','create_quote_draft',
     'get_customers_ltv_top','get_customers_at_risk','get_top_customers',
     'get_pricing_history','trova_slot_liberi','search_brain','propose_action'
   )
 WHERE persona_key = 'direttore_vendite';

-- Sales (CRM + preventivi)
UPDATE public.ai_personas
   SET allowed_tools = jsonb_build_array(
     'get_quotes_summary','analyze_quote','create_quote_draft',
     'get_top_customers','search_orders','trova_slot_liberi',
     'analyze_image','search_brain','propose_action'
   )
 WHERE persona_key = 'sales';

-- Cliente Tutor (CRM + comunicazione cliente)
UPDATE public.ai_personas
   SET allowed_tools = jsonb_build_array(
     'get_customers_at_risk','get_top_customers','lista_email_thread',
     'search_brain','propose_action'
   )
 WHERE persona_key = 'cliente_tutor';

-- Assistente Cliente (supporto cliente)
UPDATE public.ai_personas
   SET allowed_tools = jsonb_build_array(
     'get_customers_at_risk','lista_email_thread','search_brain','propose_action'
   )
 WHERE persona_key = 'assistente_cliente';

-- Direttore Marketing (CRM + benchmark)
UPDATE public.ai_personas
   SET allowed_tools = jsonb_build_array(
     'get_customers_ltv_top','get_customers_at_risk','get_top_customers',
     'get_industry_benchmark','search_brain'
   )
 WHERE persona_key = 'direttore_marketing';

-- HR (risorse umane)
UPDATE public.ai_personas
   SET allowed_tools = jsonb_build_array(
     'get_team_summary','get_employees_workload','lista_dipendenti_oggi',
     'search_brain'
   )
 WHERE persona_key = 'hr';

-- Compliance (DURC + sicurezza + filiera)
UPDATE public.ai_personas
   SET allowed_tools = jsonb_build_array(
     'verifica_durc','get_subappaltatori_summary','search_brain','propose_action'
   )
 WHERE persona_key = 'compliance';

-- Legale (KB + verifica)
UPDATE public.ai_personas
   SET allowed_tools = jsonb_build_array(
     'verifica_durc','search_brain','universal_search'
   )
 WHERE persona_key = 'legale';

-- Brain Aziendale (RAG-only, search universale)
UPDATE public.ai_personas
   SET allowed_tools = jsonb_build_array(
     'search_brain','universal_search'
   )
 WHERE persona_key = 'brain';

-- Assistente Imprenditore (cervello strategico — ha quasi tutto in lettura)
UPDATE public.ai_personas
   SET allowed_tools = jsonb_build_array(
     'get_company_kpi','get_executive_snapshot','get_industry_benchmark',
     'get_orders_summary','get_revenue_forecast','get_overdue_payments',
     'get_cashflow_status','get_cashflow_forecast_90d','get_quotes_summary',
     'get_customers_ltv_top','get_top_customers','get_team_summary',
     'get_suppliers_summary','get_subappaltatori_summary',
     'detect_frodi_anomalie','lista_scadenze','universal_search','search_brain',
     'propose_action','genera_reportino_settimanale_committente'
   )
 WHERE persona_key = 'assistente_imprenditore';

-- Verifica copertura: nessuna persona deve essere rimasta a [] (tranne brain
-- che ha solo 2 tool, ok)
DO $$
DECLARE
  v_empty_count int;
BEGIN
  SELECT COUNT(*) INTO v_empty_count
    FROM public.ai_personas
   WHERE jsonb_array_length(allowed_tools) = 0;
  IF v_empty_count > 0 THEN
    RAISE WARNING 'MP-AIE-02 v2: % personas hanno ancora allowed_tools vuoto', v_empty_count;
  ELSE
    RAISE NOTICE 'MP-AIE-02 v2: tutte le personas hanno allowed_tools popolato';
  END IF;
END $$;
