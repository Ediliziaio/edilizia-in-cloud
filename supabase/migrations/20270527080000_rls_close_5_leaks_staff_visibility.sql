-- 2026-05-27: chiusura 5 leak privacy/business cross-staff scoperti
-- dall'audit security. Aggiunge check_staff_visibility() alle policy
-- staff e gate per role/permission ai dati finanziari sensibili.

-- 1) TICKETS
DROP POLICY IF EXISTS "Staff can view company tickets" ON public.tickets;
CREATE POLICY "Staff can view company tickets" ON public.tickets
  FOR SELECT TO authenticated
  USING (
    has_permission(auth.uid(), 'can_view_tickets')
    AND company_id = get_user_company_id(auth.uid())
    AND check_staff_visibility(auth.uid(), assigned_to)
  );

DROP POLICY IF EXISTS "Staff can update company tickets" ON public.tickets;
CREATE POLICY "Staff can update company tickets" ON public.tickets
  FOR UPDATE TO authenticated
  USING (
    has_permission(auth.uid(), 'can_edit_tickets')
    AND company_id = get_user_company_id(auth.uid())
    AND check_staff_visibility(auth.uid(), assigned_to)
  );

DROP POLICY IF EXISTS "tickets_campo_select" ON public.tickets;

-- 2) SUPPORT_TICKETS
DROP POLICY IF EXISTS "support_tickets_company_read" ON public.support_tickets;
CREATE POLICY "support_tickets_company_read" ON public.support_tickets
  FOR SELECT TO authenticated
  USING (
    company_id IN (SELECT p.company_id FROM profiles p WHERE p.id = auth.uid())
    AND check_staff_visibility(auth.uid(), assigned_to)
  );

DROP POLICY IF EXISTS "support_tickets_company_update" ON public.support_tickets;
CREATE POLICY "support_tickets_company_update" ON public.support_tickets
  FOR UPDATE TO authenticated
  USING (
    company_id IN (SELECT p.company_id FROM profiles p WHERE p.id = auth.uid())
    AND check_staff_visibility(auth.uid(), assigned_to)
  );

-- 3) MARKETING_CONTACTS, OPPORTUNITIES, ACTIVITIES, NOTES, OPPORTUNITY_NOTES
DROP POLICY IF EXISTS "Staff can view marketing contacts if permitted" ON public.marketing_contacts;
CREATE POLICY "Staff can view marketing contacts if permitted" ON public.marketing_contacts
  FOR SELECT TO authenticated
  USING (
    has_permission(auth.uid(), 'can_view_orders')
    AND company_id = get_user_company_id(auth.uid())
    AND check_staff_visibility(auth.uid(), assigned_to)
  );

DROP POLICY IF EXISTS "Staff can view opportunities if permitted" ON public.marketing_opportunities;
CREATE POLICY "Staff can view opportunities if permitted" ON public.marketing_opportunities
  FOR SELECT TO authenticated
  USING (
    has_permission(auth.uid(), 'can_view_orders')
    AND company_id = get_user_company_id(auth.uid())
    AND check_staff_visibility(auth.uid(), assigned_to)
  );

DROP POLICY IF EXISTS "Staff can view contact activities if permitted" ON public.marketing_contact_activities;
CREATE POLICY "Staff can view contact activities if permitted" ON public.marketing_contact_activities
  FOR SELECT TO authenticated
  USING (
    has_permission(auth.uid(), 'can_view_orders')
    AND company_id = get_user_company_id(auth.uid())
    AND check_staff_visibility(auth.uid(), created_by)
  );

DROP POLICY IF EXISTS "Staff can view contact notes if permitted" ON public.marketing_contact_notes;
CREATE POLICY "Staff can view contact notes if permitted" ON public.marketing_contact_notes
  FOR SELECT TO authenticated
  USING (
    has_permission(auth.uid(), 'can_view_orders')
    AND company_id = get_user_company_id(auth.uid())
    AND check_staff_visibility(auth.uid(), created_by)
  );

DROP POLICY IF EXISTS "Staff can view opportunity notes if permitted" ON public.marketing_opportunity_notes;
CREATE POLICY "Staff can view opportunity notes if permitted" ON public.marketing_opportunity_notes
  FOR SELECT TO authenticated
  USING (
    has_permission(auth.uid(), 'can_view_orders')
    AND company_id = get_user_company_id(auth.uid())
    AND check_staff_visibility(auth.uid(), created_by)
  );

-- 4) MARKETING_CALENDARS
DROP POLICY IF EXISTS "Staff can view marketing calendars if permitted" ON public.marketing_calendars;
CREATE POLICY "Staff can view marketing calendars if permitted" ON public.marketing_calendars
  FOR SELECT TO authenticated
  USING (
    has_permission(auth.uid(), 'can_view_orders')
    AND company_id = get_user_company_id(auth.uid())
    AND check_staff_visibility(auth.uid(), owner_id)
  );

-- 5) QUOTES
DROP POLICY IF EXISTS "q_sel" ON public.quotes;
CREATE POLICY "q_sel" ON public.quotes
  FOR SELECT TO authenticated
  USING (
    company_id = get_my_company_id()
    AND (
      has_role(auth.uid(), 'super_admin'::app_role)
      OR has_role(auth.uid(), 'company_admin'::app_role)
      OR (
        has_permission(auth.uid(), 'can_view_orders')
        AND check_staff_visibility(auth.uid(), assigned_to)
      )
    )
  );

DROP POLICY IF EXISTS "q_upd" ON public.quotes;
CREATE POLICY "q_upd" ON public.quotes
  FOR UPDATE TO authenticated
  USING (
    company_id = get_my_company_id()
    AND (
      has_role(auth.uid(), 'super_admin'::app_role)
      OR has_role(auth.uid(), 'company_admin'::app_role)
      OR (
        has_permission(auth.uid(), 'can_edit_orders')
        AND check_staff_visibility(auth.uid(), assigned_to)
      )
    )
  );

DROP POLICY IF EXISTS "q_del" ON public.quotes;
CREATE POLICY "q_del" ON public.quotes
  FOR DELETE TO authenticated
  USING (
    company_id = get_my_company_id()
    AND (
      has_role(auth.uid(), 'super_admin'::app_role)
      OR has_role(auth.uid(), 'company_admin'::app_role)
    )
  );

DROP POLICY IF EXISTS "q_ins" ON public.quotes;
CREATE POLICY "q_ins" ON public.quotes
  FOR INSERT TO authenticated
  WITH CHECK (
    company_id = get_my_company_id()
    AND (
      has_role(auth.uid(), 'super_admin'::app_role)
      OR has_role(auth.uid(), 'company_admin'::app_role)
      OR has_permission(auth.uid(), 'can_edit_orders')
    )
  );

-- 6) BANK_TRANSACTIONS
DROP POLICY IF EXISTS "Company users can view own bank transactions" ON public.bank_transactions;
CREATE POLICY "Company users can view own bank transactions" ON public.bank_transactions
  FOR SELECT TO authenticated
  USING (
    company_id IN (SELECT profiles.company_id FROM profiles WHERE profiles.id = auth.uid())
    AND (
      has_role(auth.uid(), 'super_admin'::app_role)
      OR has_role(auth.uid(), 'company_admin'::app_role)
      OR has_permission(auth.uid(), 'can_view_tesoreria')
    )
  );

-- 7) PRIMA_NOTA_ENTRIES
DROP POLICY IF EXISTS "prima_nota_tenant_select" ON public.prima_nota_entries;
CREATE POLICY "prima_nota_tenant_select" ON public.prima_nota_entries
  FOR SELECT TO authenticated
  USING (
    company_id = get_my_company_id()
    AND (
      has_role(auth.uid(), 'super_admin'::app_role)
      OR has_role(auth.uid(), 'company_admin'::app_role)
      OR has_permission(auth.uid(), 'can_view_prima_nota')
    )
  );

DROP POLICY IF EXISTS "prima_nota_tenant_insert" ON public.prima_nota_entries;
CREATE POLICY "prima_nota_tenant_insert" ON public.prima_nota_entries
  FOR INSERT TO authenticated
  WITH CHECK (
    company_id = get_my_company_id()
    AND (
      has_role(auth.uid(), 'super_admin'::app_role)
      OR has_role(auth.uid(), 'company_admin'::app_role)
      OR has_permission(auth.uid(), 'can_view_prima_nota')
    )
  );

DROP POLICY IF EXISTS "prima_nota_tenant_update" ON public.prima_nota_entries;
CREATE POLICY "prima_nota_tenant_update" ON public.prima_nota_entries
  FOR UPDATE TO authenticated
  USING (
    company_id = get_my_company_id()
    AND (
      has_role(auth.uid(), 'super_admin'::app_role)
      OR has_role(auth.uid(), 'company_admin'::app_role)
      OR has_permission(auth.uid(), 'can_view_prima_nota')
    )
  );

DROP POLICY IF EXISTS "prima_nota_tenant_delete" ON public.prima_nota_entries;
CREATE POLICY "prima_nota_tenant_delete" ON public.prima_nota_entries
  FOR DELETE TO authenticated
  USING (
    company_id = get_my_company_id()
    AND (
      has_role(auth.uid(), 'super_admin'::app_role)
      OR has_role(auth.uid(), 'company_admin'::app_role)
    )
  );

-- 8) CUSTOMER_COMPLAINTS
DROP POLICY IF EXISTS "complaints_company" ON public.customer_complaints;
CREATE POLICY "complaints_company_admin" ON public.customer_complaints
  FOR ALL TO authenticated
  USING (
    company_id = get_my_company_id()
    AND (
      has_role(auth.uid(), 'super_admin'::app_role)
      OR has_role(auth.uid(), 'company_admin'::app_role)
    )
  );

CREATE POLICY "complaints_staff_view" ON public.customer_complaints
  FOR SELECT TO authenticated
  USING (
    company_id = get_my_company_id()
    AND has_permission(auth.uid(), 'can_view_tickets')
    AND check_staff_visibility(auth.uid(), assigned_to)
  );

CREATE POLICY "complaints_staff_update" ON public.customer_complaints
  FOR UPDATE TO authenticated
  USING (
    company_id = get_my_company_id()
    AND has_permission(auth.uid(), 'can_edit_tickets')
    AND check_staff_visibility(auth.uid(), assigned_to)
  );
