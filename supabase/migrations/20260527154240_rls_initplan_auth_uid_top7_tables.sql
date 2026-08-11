-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.

-- =============================================================
-- PERF FIX 2026-05-27: auth.uid() → (SELECT auth.uid()) per InitPlan
-- =============================================================
-- 47 policy sulle 7 tabelle più impattanti (orders, tickets, tasks,
-- profiles, companies, hr_richieste, appointments). Stesso pattern
-- doc Supabase: https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select
-- =============================================================

-- ── appointments ────────────────────────────────────────────
DROP POLICY IF EXISTS "Company admins can manage their appointments" ON public.appointments;
CREATE POLICY "Company admins can manage their appointments" ON public.appointments
  FOR ALL TO authenticated
  USING (has_role((SELECT auth.uid()), 'company_admin'::app_role) AND company_id = get_user_company_id((SELECT auth.uid())));

DROP POLICY IF EXISTS "Staff can manage appointments if permitted" ON public.appointments;
CREATE POLICY "Staff can manage appointments if permitted" ON public.appointments
  FOR ALL TO authenticated
  USING (has_permission((SELECT auth.uid()), 'can_edit_orders'::text) AND company_id = get_user_company_id((SELECT auth.uid())) AND check_staff_visibility((SELECT auth.uid()), assigned_to));

DROP POLICY IF EXISTS "Staff can view appointments if permitted" ON public.appointments;
CREATE POLICY "Staff can view appointments if permitted" ON public.appointments
  FOR SELECT TO authenticated
  USING (has_permission((SELECT auth.uid()), 'can_view_calendar'::text) AND company_id = get_user_company_id((SELECT auth.uid())) AND check_staff_visibility((SELECT auth.uid()), assigned_to));

DROP POLICY IF EXISTS "Super admins can manage all appointments" ON public.appointments;
CREATE POLICY "Super admins can manage all appointments" ON public.appointments
  FOR ALL TO authenticated
  USING (has_role((SELECT auth.uid()), 'super_admin'::app_role));

DROP POLICY IF EXISTS "appointments_campo_select_assigned" ON public.appointments;
CREATE POLICY "appointments_campo_select_assigned" ON public.appointments
  FOR SELECT TO authenticated
  USING (assigned_to = (SELECT auth.uid()) AND company_id = get_my_company_id());

-- ── companies ───────────────────────────────────────────────
DROP POLICY IF EXISTS "Company admins can update multi-company companies" ON public.companies;
CREATE POLICY "Company admins can update multi-company companies" ON public.companies
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM multi_company_access mca WHERE mca.user_id = (SELECT auth.uid()) AND mca.company_id = companies.id AND mca.access_role = 'company_admin'::text))
  WITH CHECK (EXISTS (SELECT 1 FROM multi_company_access mca WHERE mca.user_id = (SELECT auth.uid()) AND mca.company_id = companies.id AND mca.access_role = 'company_admin'::text));

DROP POLICY IF EXISTS "Company admins can update their own company" ON public.companies;
CREATE POLICY "Company admins can update their own company" ON public.companies
  FOR UPDATE TO authenticated
  USING (id = get_user_company_id((SELECT auth.uid())))
  WITH CHECK (id = get_user_company_id((SELECT auth.uid())));

DROP POLICY IF EXISTS "Company admins can view their own company" ON public.companies;
CREATE POLICY "Company admins can view their own company" ON public.companies
  FOR SELECT TO authenticated
  USING (id = get_user_company_id((SELECT auth.uid())));

DROP POLICY IF EXISTS "Members can view multi-company companies" ON public.companies;
CREATE POLICY "Members can view multi-company companies" ON public.companies
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM multi_company_access mca WHERE mca.user_id = (SELECT auth.uid()) AND mca.company_id = companies.id));

DROP POLICY IF EXISTS "Members can view their own company" ON public.companies;
CREATE POLICY "Members can view their own company" ON public.companies
  FOR SELECT TO authenticated
  USING (id = get_user_company_id((SELECT auth.uid())));

DROP POLICY IF EXISTS "Super admins can do everything with companies" ON public.companies;
CREATE POLICY "Super admins can do everything with companies" ON public.companies
  FOR ALL TO authenticated
  USING (has_role((SELECT auth.uid()), 'super_admin'::app_role));

-- ── hr_richieste ────────────────────────────────────────────
DROP POLICY IF EXISTS "hr_richieste_admin" ON public.hr_richieste;
CREATE POLICY "hr_richieste_admin" ON public.hr_richieste
  FOR ALL TO authenticated
  USING (company_id = get_my_company_id() AND (has_role((SELECT auth.uid()), 'company_admin'::app_role) OR has_role((SELECT auth.uid()), 'super_admin'::app_role)))
  WITH CHECK (company_id = get_my_company_id() AND (has_role((SELECT auth.uid()), 'company_admin'::app_role) OR has_role((SELECT auth.uid()), 'super_admin'::app_role)));

DROP POLICY IF EXISTS "hr_richieste_self_insert" ON public.hr_richieste;
CREATE POLICY "hr_richieste_self_insert" ON public.hr_richieste
  FOR INSERT TO authenticated
  WITH CHECK (profilo_id IN (SELECT hr_profili.id FROM hr_profili WHERE hr_profili.user_id = (SELECT auth.uid())));

DROP POLICY IF EXISTS "hr_richieste_self_read" ON public.hr_richieste;
CREATE POLICY "hr_richieste_self_read" ON public.hr_richieste
  FOR SELECT TO authenticated
  USING (profilo_id IN (SELECT hr_profili.id FROM hr_profili WHERE hr_profili.user_id = (SELECT auth.uid())));

DROP POLICY IF EXISTS "hr_richieste_self_update" ON public.hr_richieste;
CREATE POLICY "hr_richieste_self_update" ON public.hr_richieste
  FOR UPDATE TO authenticated
  USING (profilo_id IN (SELECT hr_profili.id FROM hr_profili WHERE hr_profili.user_id = (SELECT auth.uid())));

DROP POLICY IF EXISTS "hr_richieste_super_admin" ON public.hr_richieste;
CREATE POLICY "hr_richieste_super_admin" ON public.hr_richieste
  FOR ALL TO authenticated
  USING (has_role((SELECT auth.uid()), 'super_admin'::app_role))
  WITH CHECK (has_role((SELECT auth.uid()), 'super_admin'::app_role));

DROP POLICY IF EXISTS "richieste_campo_insert" ON public.hr_richieste;
CREATE POLICY "richieste_campo_insert" ON public.hr_richieste
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "richieste_campo_select" ON public.hr_richieste;
CREATE POLICY "richieste_campo_select" ON public.hr_richieste
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);

-- ── orders ──────────────────────────────────────────────────
DROP POLICY IF EXISTS "Campo users can view assigned orders" ON public.orders;
CREATE POLICY "Campo users can view assigned orders" ON public.orders
  FOR SELECT TO authenticated
  USING (id IN (SELECT order_campo_assignments.order_id FROM order_campo_assignments WHERE order_campo_assignments.user_id = (SELECT auth.uid())));

DROP POLICY IF EXISTS "Company admins can manage their company orders" ON public.orders;
CREATE POLICY "Company admins can manage their company orders" ON public.orders
  FOR ALL TO authenticated
  USING (has_role((SELECT auth.uid()), 'company_admin'::app_role) AND company_id = get_user_company_id((SELECT auth.uid())));

DROP POLICY IF EXISTS "Customers can view their own orders" ON public.orders;
CREATE POLICY "Customers can view their own orders" ON public.orders
  FOR SELECT TO authenticated
  USING (customer_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Employees can view their assigned orders" ON public.orders;
CREATE POLICY "Employees can view their assigned orders" ON public.orders
  FOR SELECT TO authenticated
  USING (order_has_employee_for_user(id, (SELECT auth.uid())));

DROP POLICY IF EXISTS "Salespeople can view their assigned orders" ON public.orders;
CREATE POLICY "Salespeople can view their assigned orders" ON public.orders
  FOR SELECT TO authenticated
  USING (order_has_salesperson_for_user(id, (SELECT auth.uid())));

DROP POLICY IF EXISTS "Staff can manage orders if permitted" ON public.orders;
CREATE POLICY "Staff can manage orders if permitted" ON public.orders
  FOR ALL TO authenticated
  USING (has_permission((SELECT auth.uid()), 'can_edit_orders'::text) AND company_id = get_user_company_id((SELECT auth.uid())) AND check_staff_visibility((SELECT auth.uid()), assigned_to));

DROP POLICY IF EXISTS "Staff can manage their company orders" ON public.orders;
CREATE POLICY "Staff can manage their company orders" ON public.orders
  FOR ALL TO authenticated
  USING (has_permission((SELECT auth.uid()), 'can_edit_orders'::text) AND company_id = get_user_company_id((SELECT auth.uid())));

DROP POLICY IF EXISTS "Staff can view orders if permitted" ON public.orders;
CREATE POLICY "Staff can view orders if permitted" ON public.orders
  FOR SELECT TO authenticated
  USING (has_permission((SELECT auth.uid()), 'can_view_orders'::text) AND company_id = get_user_company_id((SELECT auth.uid())) AND check_staff_visibility((SELECT auth.uid()), assigned_to));

DROP POLICY IF EXISTS "Staff can view their company orders" ON public.orders;
CREATE POLICY "Staff can view their company orders" ON public.orders
  FOR SELECT TO authenticated
  USING (has_permission((SELECT auth.uid()), 'can_view_orders'::text) AND company_id = get_user_company_id((SELECT auth.uid())));

DROP POLICY IF EXISTS "Super admins can manage all orders" ON public.orders;
CREATE POLICY "Super admins can manage all orders" ON public.orders
  FOR ALL TO authenticated
  USING (has_role((SELECT auth.uid()), 'super_admin'::app_role));

-- ── profiles ────────────────────────────────────────────────
DROP POLICY IF EXISTS "Company admins can manage profiles in their company" ON public.profiles;
CREATE POLICY "Company admins can manage profiles in their company" ON public.profiles
  FOR ALL TO authenticated
  USING (has_role((SELECT auth.uid()), 'company_admin'::app_role) AND company_id = get_user_company_id((SELECT auth.uid())));

DROP POLICY IF EXISTS "Company admins can view profiles in their company" ON public.profiles;
CREATE POLICY "Company admins can view profiles in their company" ON public.profiles
  FOR SELECT TO authenticated
  USING (has_role((SELECT auth.uid()), 'company_admin'::app_role) AND company_id = get_user_company_id((SELECT auth.uid())));

DROP POLICY IF EXISTS "Staff can view company profiles if permitted" ON public.profiles;
CREATE POLICY "Staff can view company profiles if permitted" ON public.profiles
  FOR SELECT TO authenticated
  USING (has_permission((SELECT auth.uid()), 'can_view_orders'::text) AND company_id = get_user_company_id((SELECT auth.uid())));

DROP POLICY IF EXISTS "Super admins can do everything with profiles" ON public.profiles;
CREATE POLICY "Super admins can do everything with profiles" ON public.profiles
  FOR ALL TO authenticated
  USING (has_role((SELECT auth.uid()), 'super_admin'::app_role));

DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
CREATE POLICY "Users can update their own profile" ON public.profiles
  FOR UPDATE TO authenticated
  USING (id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
CREATE POLICY "Users can view their own profile" ON public.profiles
  FOR SELECT TO authenticated
  USING (id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "profiles_same_company_select" ON public.profiles;
CREATE POLICY "profiles_same_company_select" ON public.profiles
  FOR SELECT TO authenticated
  USING (company_id = get_user_company_id((SELECT auth.uid())));

-- ── tasks ───────────────────────────────────────────────────
DROP POLICY IF EXISTS "Company admins can manage their tasks" ON public.tasks;
CREATE POLICY "Company admins can manage their tasks" ON public.tasks
  FOR ALL TO authenticated
  USING (has_role((SELECT auth.uid()), 'company_admin'::app_role) AND company_id = get_user_company_id((SELECT auth.uid())));

DROP POLICY IF EXISTS "Employees can create own tasks" ON public.tasks;
CREATE POLICY "Employees can create own tasks" ON public.tasks
  FOR INSERT TO authenticated
  WITH CHECK (assigned_to = (SELECT auth.uid()) AND company_id = get_user_company_id((SELECT auth.uid())));

DROP POLICY IF EXISTS "Employees can update assigned tasks" ON public.tasks;
CREATE POLICY "Employees can update assigned tasks" ON public.tasks
  FOR UPDATE TO authenticated
  USING (assigned_to = (SELECT auth.uid()))
  WITH CHECK (assigned_to = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Employees can view assigned tasks" ON public.tasks;
CREATE POLICY "Employees can view assigned tasks" ON public.tasks
  FOR SELECT TO authenticated
  USING (assigned_to = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Staff can manage tasks if permitted" ON public.tasks;
CREATE POLICY "Staff can manage tasks if permitted" ON public.tasks
  FOR ALL TO authenticated
  USING (has_permission((SELECT auth.uid()), 'can_edit_orders'::text) AND company_id = get_user_company_id((SELECT auth.uid())) AND check_staff_visibility((SELECT auth.uid()), assigned_to));

DROP POLICY IF EXISTS "Staff can view tasks if permitted" ON public.tasks;
CREATE POLICY "Staff can view tasks if permitted" ON public.tasks
  FOR SELECT TO authenticated
  USING (has_permission((SELECT auth.uid()), 'can_view_orders'::text) AND company_id = get_user_company_id((SELECT auth.uid())) AND check_staff_visibility((SELECT auth.uid()), assigned_to));

DROP POLICY IF EXISTS "Super admins can manage all tasks" ON public.tasks;
CREATE POLICY "Super admins can manage all tasks" ON public.tasks
  FOR ALL TO authenticated
  USING (has_role((SELECT auth.uid()), 'super_admin'::app_role));

-- ── tickets ─────────────────────────────────────────────────
DROP POLICY IF EXISTS "Company admins can manage their company tickets" ON public.tickets;
CREATE POLICY "Company admins can manage their company tickets" ON public.tickets
  FOR ALL TO authenticated
  USING (has_role((SELECT auth.uid()), 'company_admin'::app_role) AND company_id = get_user_company_id((SELECT auth.uid())));

DROP POLICY IF EXISTS "Customers can manage their own tickets" ON public.tickets;
CREATE POLICY "Customers can manage their own tickets" ON public.tickets
  FOR ALL TO authenticated
  USING (customer_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Staff can insert company tickets" ON public.tickets;
CREATE POLICY "Staff can insert company tickets" ON public.tickets
  FOR INSERT TO authenticated
  WITH CHECK (has_permission((SELECT auth.uid()), 'can_edit_tickets'::text) AND company_id = get_user_company_id((SELECT auth.uid())));

DROP POLICY IF EXISTS "Staff can update company tickets" ON public.tickets;
CREATE POLICY "Staff can update company tickets" ON public.tickets
  FOR UPDATE TO authenticated
  USING (has_permission((SELECT auth.uid()), 'can_edit_tickets'::text) AND company_id = get_user_company_id((SELECT auth.uid())) AND check_staff_visibility((SELECT auth.uid()), assigned_to));

DROP POLICY IF EXISTS "Staff can view company tickets" ON public.tickets;
CREATE POLICY "Staff can view company tickets" ON public.tickets
  FOR SELECT TO authenticated
  USING (has_permission((SELECT auth.uid()), 'can_view_tickets'::text) AND company_id = get_user_company_id((SELECT auth.uid())) AND check_staff_visibility((SELECT auth.uid()), assigned_to));

DROP POLICY IF EXISTS "Super admins can manage all tickets" ON public.tickets;
CREATE POLICY "Super admins can manage all tickets" ON public.tickets
  FOR ALL TO authenticated
  USING (has_role((SELECT auth.uid()), 'super_admin'::app_role));

DROP POLICY IF EXISTS "tickets_campo_insert" ON public.tickets;
CREATE POLICY "tickets_campo_insert" ON public.tickets
  FOR INSERT TO authenticated
  WITH CHECK (created_by = (SELECT auth.uid()) OR customer_id = (SELECT auth.uid()));
