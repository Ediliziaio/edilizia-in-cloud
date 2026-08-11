-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.

-- =============================================================
-- RLS HARDENING — audit 2026-05-27
-- L1 ai_model_config + L2 fv_function_logs + S1-S6 cross-staff
-- + 3 osservazioni sicure.
-- =============================================================

-- ─── L1 ai_model_config: cross-tenant leak ──────────────────
DROP POLICY IF EXISTS config_read_all ON public.ai_model_config;
CREATE POLICY ai_model_config_read_own ON public.ai_model_config
  FOR SELECT TO authenticated
  USING (
    company_id IS NULL
    OR company_id = get_my_company_id()
    OR has_role(auth.uid(), 'super_admin'::app_role)
  );

-- ─── L2 fv_function_logs: RLS disabled ──────────────────────
ALTER TABLE public.fv_function_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS fv_function_logs_company ON public.fv_function_logs;
CREATE POLICY fv_function_logs_company ON public.fv_function_logs
  FOR SELECT TO authenticated
  USING (
    company_id = get_my_company_id()
    OR has_role(auth.uid(), 'super_admin'::app_role)
  );
DROP POLICY IF EXISTS fv_function_logs_service ON public.fv_function_logs;
CREATE POLICY fv_function_logs_service ON public.fv_function_logs
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ─── S1 invoices: cantiere vede fatturato ───────────────────
DROP POLICY IF EXISTS company_invoices ON public.invoices;
CREATE POLICY invoices_billing_view ON public.invoices
  FOR SELECT TO authenticated
  USING (
    company_id = get_user_company_id(auth.uid())
    AND (
      has_role(auth.uid(), 'company_admin'::app_role)
      OR has_role(auth.uid(), 'super_admin'::app_role)
      OR has_role(auth.uid(), 'accountant'::app_role)
      OR has_permission(auth.uid(), 'can_view_billing')
    )
  );
CREATE POLICY invoices_billing_write ON public.invoices
  FOR ALL TO authenticated
  USING (
    company_id = get_user_company_id(auth.uid())
    AND (
      has_role(auth.uid(), 'company_admin'::app_role)
      OR has_role(auth.uid(), 'super_admin'::app_role)
      OR has_role(auth.uid(), 'accountant'::app_role)
      OR has_permission(auth.uid(), 'can_view_billing')
    )
  )
  WITH CHECK (
    company_id = get_user_company_id(auth.uid())
    AND (
      has_role(auth.uid(), 'company_admin'::app_role)
      OR has_role(auth.uid(), 'super_admin'::app_role)
      OR has_role(auth.uid(), 'accountant'::app_role)
      OR has_permission(auth.uid(), 'can_view_billing')
    )
  );

-- invoice_lines via invoice_id
DROP POLICY IF EXISTS company_invoice_lines ON public.invoice_lines;
DROP POLICY IF EXISTS invoice_lines_company ON public.invoice_lines;
CREATE POLICY invoice_lines_via_invoice ON public.invoice_lines
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.invoices i
      WHERE i.id = invoice_lines.invoice_id
        AND i.company_id = get_user_company_id(auth.uid())
        AND (
          has_role(auth.uid(), 'company_admin'::app_role)
          OR has_role(auth.uid(), 'super_admin'::app_role)
          OR has_role(auth.uid(), 'accountant'::app_role)
          OR has_permission(auth.uid(), 'can_view_billing')
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.invoices i
      WHERE i.id = invoice_lines.invoice_id
        AND i.company_id = get_user_company_id(auth.uid())
        AND (
          has_role(auth.uid(), 'company_admin'::app_role)
          OR has_role(auth.uid(), 'super_admin'::app_role)
          OR has_role(auth.uid(), 'accountant'::app_role)
          OR has_permission(auth.uid(), 'can_view_billing')
        )
    )
  );

-- invoice_payments: company_id proprio
DROP POLICY IF EXISTS company_invoice_payments ON public.invoice_payments;
DROP POLICY IF EXISTS invoice_payments_company ON public.invoice_payments;
CREATE POLICY invoice_payments_billing ON public.invoice_payments
  FOR ALL TO authenticated
  USING (
    company_id = get_user_company_id(auth.uid())
    AND (
      has_role(auth.uid(), 'company_admin'::app_role)
      OR has_role(auth.uid(), 'super_admin'::app_role)
      OR has_role(auth.uid(), 'accountant'::app_role)
      OR has_permission(auth.uid(), 'can_view_billing')
    )
  )
  WITH CHECK (
    company_id = get_user_company_id(auth.uid())
    AND (
      has_role(auth.uid(), 'company_admin'::app_role)
      OR has_role(auth.uid(), 'super_admin'::app_role)
      OR has_role(auth.uid(), 'accountant'::app_role)
      OR has_permission(auth.uid(), 'can_view_billing')
    )
  );

-- ─── S2 customer_documents ──────────────────────────────────
DROP POLICY IF EXISTS customer_documents_company_manage ON public.customer_documents;
CREATE POLICY customer_documents_staff_view ON public.customer_documents
  FOR SELECT TO authenticated
  USING (
    company_id = get_my_company_id()
    AND (
      has_role(auth.uid(), 'company_admin'::app_role)
      OR has_role(auth.uid(), 'super_admin'::app_role)
      OR has_permission(auth.uid(), 'can_view_customers')
    )
  );
CREATE POLICY customer_documents_staff_write ON public.customer_documents
  FOR ALL TO authenticated
  USING (
    company_id = get_my_company_id()
    AND (
      has_role(auth.uid(), 'company_admin'::app_role)
      OR has_role(auth.uid(), 'super_admin'::app_role)
      OR has_permission(auth.uid(), 'can_edit_customers')
    )
  )
  WITH CHECK (
    company_id = get_my_company_id()
    AND (
      has_role(auth.uid(), 'company_admin'::app_role)
      OR has_role(auth.uid(), 'super_admin'::app_role)
      OR has_permission(auth.uid(), 'can_edit_customers')
    )
  );

-- ─── S3 customer_interactions ───────────────────────────────
DROP POLICY IF EXISTS interactions_company_select ON public.customer_interactions;
CREATE POLICY customer_interactions_select ON public.customer_interactions
  FOR SELECT TO authenticated
  USING (
    (company_id = get_my_company_id()
      AND check_staff_visibility(auth.uid(), staff_user_id))
    OR has_role(auth.uid(), 'super_admin'::app_role)
  );

-- ─── S4 customer_messages ───────────────────────────────────
DROP POLICY IF EXISTS staff_company_messages ON public.customer_messages;
CREATE POLICY customer_messages_staff_view ON public.customer_messages
  FOR SELECT TO authenticated
  USING (
    company_id = get_my_company_id()
    AND check_staff_visibility(auth.uid(), sender_id)
  );
CREATE POLICY customer_messages_staff_write ON public.customer_messages
  FOR ALL TO authenticated
  USING (
    company_id = get_my_company_id()
    AND sender_role = 'staff'
    AND sender_id = auth.uid()
  )
  WITH CHECK (
    company_id = get_my_company_id()
    AND sender_role = 'staff'
    AND sender_id = auth.uid()
  );

-- ─── S5 contact_messages ────────────────────────────────────
DROP POLICY IF EXISTS "Users can view own company messages" ON public.contact_messages;
CREATE POLICY contact_messages_staff_view ON public.contact_messages
  FOR SELECT TO authenticated
  USING (
    company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid())
    AND (
      check_staff_visibility(auth.uid(), sent_by)
      OR has_role(auth.uid(), 'company_admin'::app_role)
      OR has_role(auth.uid(), 'super_admin'::app_role)
    )
  );

-- ─── S6 expense_reports / items ─────────────────────────────
DROP POLICY IF EXISTS expense_reports_tenant ON public.expense_reports;
DROP POLICY IF EXISTS expense_reports_company_access ON public.expense_reports;
CREATE POLICY expense_reports_self_or_admin ON public.expense_reports
  FOR ALL TO authenticated
  USING (
    company_id = get_my_company_id()
    AND (
      has_role(auth.uid(), 'company_admin'::app_role)
      OR has_role(auth.uid(), 'super_admin'::app_role)
      OR has_role(auth.uid(), 'accountant'::app_role)
      OR employee_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid())
    )
  )
  WITH CHECK (
    company_id = get_my_company_id()
    AND (
      has_role(auth.uid(), 'company_admin'::app_role)
      OR has_role(auth.uid(), 'super_admin'::app_role)
      OR employee_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS expense_report_items_tenant ON public.expense_report_items;
DROP POLICY IF EXISTS expense_report_items_company_access ON public.expense_report_items;
CREATE POLICY expense_report_items_via_report ON public.expense_report_items
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.expense_reports er
      WHERE er.id = expense_report_items.report_id
        AND er.company_id = get_my_company_id()
        AND (
          has_role(auth.uid(), 'company_admin'::app_role)
          OR has_role(auth.uid(), 'super_admin'::app_role)
          OR has_role(auth.uid(), 'accountant'::app_role)
          OR er.employee_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid())
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.expense_reports er
      WHERE er.id = expense_report_items.report_id
        AND er.company_id = get_my_company_id()
        AND (
          has_role(auth.uid(), 'company_admin'::app_role)
          OR has_role(auth.uid(), 'super_admin'::app_role)
          OR er.employee_id IN (SELECT id FROM public.employees WHERE user_id = auth.uid())
        )
    )
  );

-- ─── Osservazione: appointments_campo_select_assigned ──────
DROP POLICY IF EXISTS appointments_campo_select_assigned ON public.appointments;
CREATE POLICY appointments_campo_select_assigned ON public.appointments
  FOR SELECT TO authenticated
  USING (
    assigned_to = auth.uid()
    AND company_id = get_my_company_id()
  );

-- ─── Osservazione: cedolini_self_read buggata ──────────────
DROP POLICY IF EXISTS cedolini_self_read ON public.cedolini;

-- ─── Osservazione: hr_assenze_self_read troppo permissivo ──
DROP POLICY IF EXISTS hr_assenze_self_read ON public.hr_assenze;
CREATE POLICY hr_assenze_self_read ON public.hr_assenze
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.employees e
      WHERE e.id = hr_assenze.employee_id
        AND e.user_id = auth.uid()
    )
  );
