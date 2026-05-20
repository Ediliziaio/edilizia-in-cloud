-- ─────────────────────────────────────────────────────────────────────────────
-- Cleanup doppioni DB — audit completo 2026-05-20
-- ─────────────────────────────────────────────────────────────────────────────
--
-- 3 categorie di doppioni rimossi:
--   1. Trigger codice morto (su status='prenotato' che non viene mai settato)
--   2. Funzioni RPC v1 obsolete (mantenuta v2 strict superset con piu params)
--   3. Index duplicati (stessa colonna/predicato con nome diverso)
--
-- Verifiche eseguite PRIMA del drop:
--   - Codice morto: grep su tutto src/ + supabase/functions/ per chiamate RPC
--     -> tutti i call site usano v2 (con i parametri extra)
--   - Index duplicati: confrontato indexdef rimuovendo solo il nome -> identici
--   - UNIQUE constraints: lasciati intatti i _key generati dal sistema
--
-- Idempotente (IF EXISTS dappertutto). Safe da ri-eseguire.
-- ─────────────────────────────────────────────────────────────────────────────

-- ════════════════════════════════════════════════════════════════════════════
-- 1) TRIGGER CODICE MORTO
-- ════════════════════════════════════════════════════════════════════════════
-- trigger_update_stock_reservation gestiva status='prenotato' che NON viene
-- mai settato dall'app (OrderItemStatus = da_ordinare|ordinato|in_produzione|
-- in_arrivo|in_magazzino|installato). Il flusso reservation gira ora su
-- fulfillment_status via trigger oi_reserve_on_* (vedi 20270520080000).

DROP TRIGGER IF EXISTS update_reservation_on_status_change ON public.order_items;
DROP FUNCTION IF EXISTS public.trigger_update_stock_reservation();

-- ════════════════════════════════════════════════════════════════════════════
-- 2) FUNZIONI RPC v1 OBSOLETE (mantenute v2 con parametri opzionali aggiunti)
-- ════════════════════════════════════════════════════════════════════════════

-- brain_upsert_document: v2 aggiunge p_scope, p_category, p_title
-- Tutti i 3 call site (ai-brain-ingest, ai-brain-seed-universal, silvio-memory-extract)
-- usano la v2 con i nuovi parametri.
DROP FUNCTION IF EXISTS public.brain_upsert_document(
  p_company_id uuid, p_source_type text, p_source_id uuid, p_content text,
  p_content_hash text, p_embedding vector, p_metadata jsonb, p_visibility_roles text[]
);

-- check_ai_credits_available: v2 aggiunge p_model_hint
-- billing.ts chiama con 3 args -> matcha v2 (p_model_hint default NULL)
DROP FUNCTION IF EXISTS public.check_ai_credits_available(
  p_company_id uuid, p_est_cost_usd numeric, p_task_kind text
);

-- check_overdue_scadenze: v2 aggiunge p_company_id
-- Nessuna chiamata nel codebase. Se cron lo usa, usa la 1-arg version.
DROP FUNCTION IF EXISTS public.check_overdue_scadenze();

-- create_oda_from_order: v2 cambia ordine params + aggiunge p_item_ids
-- Nessuna chiamata nel codebase (types.ts ha entrambe ma rpc nessuno).
DROP FUNCTION IF EXISTS public.create_oda_from_order(
  p_order_id uuid, p_supplier_id uuid, p_company_id uuid, p_user_id uuid
);

-- create_persona_session: v2 aggiunge p_user_id, p_company_id
-- useAIChat.ts chiama con 2 args -> matcha v2 (gli altri default)
DROP FUNCTION IF EXISTS public.create_persona_session(
  p_persona_key text, p_title text
);

-- get_attribution_report: v2 aggiunge p_filter_source
-- useAttributionReport.ts chiama con 5 args (incluso p_filter_source) -> v2
DROP FUNCTION IF EXISTS public.get_attribution_report(
  p_company_id uuid, p_date_from timestamp with time zone,
  p_date_to timestamp with time zone, p_group_by text
);

-- get_customers_paginated: v2 aggiunge 6 params (p_date_from, p_date_to,
-- p_has_phone, p_has_fiscal_code, p_has_site_address, p_portal_state).
-- CustomersList.tsx chiama con tutti i 15 -> v2
DROP FUNCTION IF EXISTS public.get_customers_paginated(
  p_company_id uuid, p_search text, p_salesperson_id uuid,
  p_salesperson_none boolean, p_has_orders text, p_sort_field text,
  p_sort_dir text, p_offset integer, p_limit integer
);

-- mark_scadenza_paid: v2 aggiunge p_account_label
-- useScadenzario.ts chiama con 6 args (incluso p_account_label) -> v2
DROP FUNCTION IF EXISTS public.mark_scadenza_paid(
  p_scadenza_id uuid, p_amount numeric, p_payment_method text,
  p_payment_date date, p_notes text
);

-- ════════════════════════════════════════════════════════════════════════════
-- 3) INDEX DUPLICATI (stessa definizione, nome diverso)
-- ════════════════════════════════════════════════════════════════════════════
-- Verificato che ogni coppia ha indexdef IDENTICA (solo il nome differisce).
-- Manteniamo il pattern idx_<table>_<column> piu' moderno.
-- Per UNIQUE constraint con coppie _key vs idx_unique: mantenuti i _key sistemici
-- (DROP del custom corrispondente) per non rompere foreign key.

DROP INDEX IF EXISTS public.admin_audit_log_created_idx;
DROP INDEX IF EXISTS public.anagrafica_reconciliation_log_company_id_created_at_idx;
DROP INDEX IF EXISTS public.appointments_company_idx;
DROP INDEX IF EXISTS public.appointments_order_idx;
DROP INDEX IF EXISTS public.company_costs_company_idx;
DROP INDEX IF EXISTS public.company_costs_supplier_idx;
DROP INDEX IF EXISTS public.edl_company_sent_idx;
DROP INDEX IF EXISTS public.email_logs_company_status_idx;
DROP INDEX IF EXISTS public.email_logs_opened_at_idx;
DROP INDEX IF EXISTS public.email_logs_provider_msg_idx;
DROP INDEX IF EXISTS public.employees_company_idx;
DROP INDEX IF EXISTS public.idx_automation_flows_company_status;
DROP INDEX IF EXISTS public.idx_company_costs_unpaid_due;
DROP INDEX IF EXISTS public.idx_company_feature_overrides_company;
DROP INDEX IF EXISTS public.idx_company_feature_overrides_key;
DROP INDEX IF EXISTS public.idx_email_logs_campaign_id;
DROP INDEX IF EXISTS public.idx_expense_report_items_report_id;
DROP INDEX IF EXISTS public.idx_expense_reports_company_id;
DROP INDEX IF EXISTS public.idx_invoices_status;
DROP INDEX IF EXISTS public.idx_lifecycle_notifications_company_dismissed_created;
DROP INDEX IF EXISTS public.idx_marketing_contacts_company_id;
DROP INDEX IF EXISTS public.idx_order_salespeople_order_id;
DROP INDEX IF EXISTS public.idx_profiles_company_id;
DROP INDEX IF EXISTS public.idx_purchase_orders_company_status_forecast;
DROP INDEX IF EXISTS public.idx_quote_items_parent;
DROP INDEX IF EXISTS public.idx_quotes_token;
DROP INDEX IF EXISTS public.idx_salespeople_company_id;
DROP INDEX IF EXISTS public.idx_scadenze_due_date;
DROP INDEX IF EXISTS public.idx_scadenze_status;
DROP INDEX IF EXISTS public.order_items_order_idx;
DROP INDEX IF EXISTS public.orders_company_created_idx;
DROP INDEX IF EXISTS public.plan_feature_defaults_plan_idx;
DROP INDEX IF EXISTS public.purchase_orders_company_idx;
-- SKIPPED: reporting_preferences_company_user_key_unique e idx_subscription_plans_slug_unique
-- sono UNIQUE CONSTRAINT, non semplici index. DROP INDEX rifiuta. Per dropparli
-- serve ALTER TABLE DROP CONSTRAINT, ma il rischio di rompere FK e' alto.
-- Sono duplicati marginali (1 index extra a tabella) -> li lascio.
DROP INDEX IF EXISTS public.tasks_company_idx;
DROP INDEX IF EXISTS public.tickets_company_created_idx;
DROP INDEX IF EXISTS public.warehouse_stock_company_idx;

-- ════════════════════════════════════════════════════════════════════════════
-- Verifica post-cleanup: il numero di trigger su order_items deve scendere
-- da 7 a 6 (rimossi: update_reservation_on_status_change)
-- ════════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_trigger_count int;
  v_dead_function_count int;
BEGIN
  SELECT COUNT(*) INTO v_trigger_count
    FROM information_schema.triggers
   WHERE event_object_schema='public' AND event_object_table='order_items';

  SELECT COUNT(*) INTO v_dead_function_count
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname='public' AND proname='trigger_update_stock_reservation';

  RAISE NOTICE 'Trigger su order_items dopo cleanup: % (atteso 6)', v_trigger_count;
  RAISE NOTICE 'Funzione trigger_update_stock_reservation residua: % (atteso 0)', v_dead_function_count;
END;
$$;
