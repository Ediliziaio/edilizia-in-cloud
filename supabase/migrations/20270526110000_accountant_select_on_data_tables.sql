-- RLS: accountant può SELECT sulle tabelle dati delle aziende clienti delegate.
--
-- Prerequisite: la funzione user_can_read_accountant_company(uuid) deve esistere
-- (creata da 20270525200000_accountant_can_read_delegated_companies.sql +
-- normalizzata da 20270526100000_accountant_fix_recursion_and_helpers.sql).
--
-- Pattern uniforme: ogni tabella riceve una nuova policy
-- "<table>_accountant_select" che aggiunge l'accesso accountant ALLE policy
-- esistenti (non le sostituisce — sono OR di policy multiple).
--
-- Idempotente: DROP IF EXISTS + CREATE.

-- ──────────────────────────────────────────────────────────────────
-- AREA CANTIERI: orders + dipendenti
-- ──────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "orders_accountant_select" ON public.orders;
CREATE POLICY "orders_accountant_select" ON public.orders
  FOR SELECT TO authenticated
  USING (public.user_can_read_accountant_company(company_id));

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

DROP POLICY IF EXISTS "work_logs_accountant_select" ON public.work_logs;
CREATE POLICY "work_logs_accountant_select" ON public.work_logs
  FOR SELECT TO authenticated
  USING (public.user_can_read_accountant_company(company_id));

DROP POLICY IF EXISTS "giornale_lavori_accountant_select" ON public.giornale_lavori;
CREATE POLICY "giornale_lavori_accountant_select" ON public.giornale_lavori
  FOR SELECT TO authenticated
  USING (public.user_can_read_accountant_company(company_id));

DROP POLICY IF EXISTS "foto_cantiere_accountant_select" ON public.foto_cantiere;
CREATE POLICY "foto_cantiere_accountant_select" ON public.foto_cantiere
  FOR SELECT TO authenticated
  USING (public.user_can_read_accountant_company(company_id));

-- ──────────────────────────────────────────────────────────────────
-- AREA MAGAZZINO
-- ──────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "warehouses_accountant_select" ON public.warehouses;
CREATE POLICY "warehouses_accountant_select" ON public.warehouses
  FOR SELECT TO authenticated
  USING (public.user_can_read_accountant_company(company_id));

DROP POLICY IF EXISTS "warehouse_stock_accountant_select" ON public.warehouse_stock;
CREATE POLICY "warehouse_stock_accountant_select" ON public.warehouse_stock
  FOR SELECT TO authenticated
  USING (public.user_can_read_accountant_company(company_id));

DROP POLICY IF EXISTS "warehouse_movements_accountant_select" ON public.warehouse_movements;
CREATE POLICY "warehouse_movements_accountant_select" ON public.warehouse_movements
  FOR SELECT TO authenticated
  USING (public.user_can_read_accountant_company(company_id));

DROP POLICY IF EXISTS "warehouse_transfers_accountant_select" ON public.warehouse_transfers;
CREATE POLICY "warehouse_transfers_accountant_select" ON public.warehouse_transfers
  FOR SELECT TO authenticated
  USING (public.user_can_read_accountant_company(company_id));

-- ──────────────────────────────────────────────────────────────────
-- AREA SUBAPPALTATORI + SICUREZZA
-- ──────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "subappaltatori_accountant_select" ON public.subappaltatori;
CREATE POLICY "subappaltatori_accountant_select" ON public.subappaltatori
  FOR SELECT TO authenticated
  USING (public.user_can_read_accountant_company(company_id));

DROP POLICY IF EXISTS "contratti_subappalto_accountant_select" ON public.contratti_subappalto;
CREATE POLICY "contratti_subappalto_accountant_select" ON public.contratti_subappalto
  FOR SELECT TO authenticated
  USING (public.user_can_read_accountant_company(company_id));

DROP POLICY IF EXISTS "duvri_documents_accountant_select" ON public.duvri_documents;
CREATE POLICY "duvri_documents_accountant_select" ON public.duvri_documents
  FOR SELECT TO authenticated
  USING (public.user_can_read_accountant_company(company_id));

DROP POLICY IF EXISTS "durc_documents_accountant_select" ON public.durc_documents;
CREATE POLICY "durc_documents_accountant_select" ON public.durc_documents
  FOR SELECT TO authenticated
  USING (public.user_can_read_accountant_company(company_id));

DROP POLICY IF EXISTS "cantiere_segnalazioni_accountant_select" ON public.cantiere_segnalazioni;
CREATE POLICY "cantiere_segnalazioni_accountant_select" ON public.cantiere_segnalazioni
  FOR SELECT TO authenticated
  USING (public.user_can_read_accountant_company(company_id));

-- ──────────────────────────────────────────────────────────────────
-- AREA ASSISTENZA + MANUTENZIONE
-- ──────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "tickets_accountant_select" ON public.tickets;
CREATE POLICY "tickets_accountant_select" ON public.tickets
  FOR SELECT TO authenticated
  USING (public.user_can_read_accountant_company(company_id));

DROP POLICY IF EXISTS "piani_manutenzione_accountant_select" ON public.piani_manutenzione;
CREATE POLICY "piani_manutenzione_accountant_select" ON public.piani_manutenzione
  FOR SELECT TO authenticated
  USING (public.user_can_read_accountant_company(company_id));

DROP POLICY IF EXISTS "contratti_manutenzione_accountant_select" ON public.contratti_manutenzione;
CREATE POLICY "contratti_manutenzione_accountant_select" ON public.contratti_manutenzione
  FOR SELECT TO authenticated
  USING (public.user_can_read_accountant_company(company_id));

DROP POLICY IF EXISTS "esecuzioni_manutenzione_accountant_select" ON public.esecuzioni_manutenzione;
CREATE POLICY "esecuzioni_manutenzione_accountant_select" ON public.esecuzioni_manutenzione
  FOR SELECT TO authenticated
  USING (public.user_can_read_accountant_company(company_id));

-- ──────────────────────────────────────────────────────────────────
-- AREA FINANZA: fatturazione, scadenzario, prima nota, costi, tesoreria
-- ──────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "fatture_ricevute_accountant_select" ON public.fatture_ricevute;
CREATE POLICY "fatture_ricevute_accountant_select" ON public.fatture_ricevute
  FOR SELECT TO authenticated
  USING (public.user_can_read_accountant_company(company_id));

DROP POLICY IF EXISTS "fattura_ordine_accountant_select" ON public.fattura_ordine;
CREATE POLICY "fattura_ordine_accountant_select" ON public.fattura_ordine
  FOR SELECT TO authenticated
  USING (public.user_can_read_accountant_company(company_id));

DROP POLICY IF EXISTS "purchase_orders_accountant_select" ON public.purchase_orders;
CREATE POLICY "purchase_orders_accountant_select" ON public.purchase_orders
  FOR SELECT TO authenticated
  USING (public.user_can_read_accountant_company(company_id));

DROP POLICY IF EXISTS "scadenze_accountant_select" ON public.scadenze;
CREATE POLICY "scadenze_accountant_select" ON public.scadenze
  FOR SELECT TO authenticated
  USING (public.user_can_read_accountant_company(company_id));

DROP POLICY IF EXISTS "prima_nota_entries_accountant_select" ON public.prima_nota_entries;
CREATE POLICY "prima_nota_entries_accountant_select" ON public.prima_nota_entries
  FOR SELECT TO authenticated
  USING (public.user_can_read_accountant_company(company_id));

DROP POLICY IF EXISTS "company_costs_accountant_select" ON public.company_costs;
CREATE POLICY "company_costs_accountant_select" ON public.company_costs
  FOR SELECT TO authenticated
  USING (public.user_can_read_accountant_company(company_id));

DROP POLICY IF EXISTS "cost_categories_accountant_select" ON public.cost_categories;
CREATE POLICY "cost_categories_accountant_select" ON public.cost_categories
  FOR SELECT TO authenticated
  USING (public.user_can_read_accountant_company(company_id));

DROP POLICY IF EXISTS "cost_budgets_accountant_select" ON public.cost_budgets;
CREATE POLICY "cost_budgets_accountant_select" ON public.cost_budgets
  FOR SELECT TO authenticated
  USING (public.user_can_read_accountant_company(company_id));

DROP POLICY IF EXISTS "bank_transactions_accountant_select" ON public.bank_transactions;
CREATE POLICY "bank_transactions_accountant_select" ON public.bank_transactions
  FOR SELECT TO authenticated
  USING (public.user_can_read_accountant_company(company_id));

DROP POLICY IF EXISTS "cashflow_forecast_snapshots_accountant_select" ON public.cashflow_forecast_snapshots;
CREATE POLICY "cashflow_forecast_snapshots_accountant_select" ON public.cashflow_forecast_snapshots
  FOR SELECT TO authenticated
  USING (public.user_can_read_accountant_company(company_id));

DROP POLICY IF EXISTS "documenti_fiscali_accountant_select" ON public.documenti_fiscali;
CREATE POLICY "documenti_fiscali_accountant_select" ON public.documenti_fiscali
  FOR SELECT TO authenticated
  USING (public.user_can_read_accountant_company(company_id));

-- ──────────────────────────────────────────────────────────────────
-- AREA PERSONE & HR
-- ──────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "employees_accountant_select" ON public.employees;
CREATE POLICY "employees_accountant_select" ON public.employees
  FOR SELECT TO authenticated
  USING (public.user_can_read_accountant_company(company_id));

DROP POLICY IF EXISTS "hr_cedolini_accountant_select" ON public.hr_cedolini;
CREATE POLICY "hr_cedolini_accountant_select" ON public.hr_cedolini
  FOR SELECT TO authenticated
  USING (public.user_can_read_accountant_company(company_id));

DROP POLICY IF EXISTS "hr_timbrature_accountant_select" ON public.hr_timbrature;
CREATE POLICY "hr_timbrature_accountant_select" ON public.hr_timbrature
  FOR SELECT TO authenticated
  USING (public.user_can_read_accountant_company(company_id));

-- ──────────────────────────────────────────────────────────────────
-- NOTA: alcune tabelle (es. order_status_history, order_employees,
-- order_salespeople) sono filtrate via JOIN su orders, quindi sono
-- automaticamente accessibili se orders è leggibile. Se in futuro
-- emergono blocchi specifici, aggiungere policy granulari simili a
-- order_items_accountant_select.
