-- ════════════════════════════════════════════════════════════════════════════
-- "Vede solo le sue" non funzionava: la policy gemella senza controllo vinceva
-- ════════════════════════════════════════════════════════════════════════════
-- Su `orders` vivevano DUE coppie di policy quasi identiche: una col controllo
-- di visibilità (check_staff_visibility) e una senza. Le policy permissive di
-- Postgres si sommano in OR: bastava quella senza controllo a far vedere tutto,
-- e `staff_permissions.only_assigned` era di fatto una casella morta.
--
-- Provato in produzione prima del fix: un utente con only_assigned = true e
-- ZERO commesse assegnate ne vedeva 65 su 65. Dopo: 0, mentre lo staff senza
-- il flag e gli admin continuano a vederle tutte e 65.
--
-- Stesso difetto in variante su tre tabelle marketing: lì la policy "manage" è
-- FOR ALL (quindi copre anche la lettura) e non passava dal controllo. Non si
-- droppa — toglierebbe la scrittura — si ricrea col controllo dentro.
--
-- check_staff_visibility restituisce true per super_admin, company_admin e per
-- chiunque NON abbia only_assigned: per tutti gli altri utenti non cambia nulla.
-- ════════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "Staff can view their company orders" ON public.orders;
DROP POLICY IF EXISTS "Staff can manage their company orders" ON public.orders;

DROP POLICY IF EXISTS "Staff can manage contact activities if permitted" ON public.marketing_contact_activities;
CREATE POLICY "Staff can manage contact activities if permitted"
  ON public.marketing_contact_activities FOR ALL TO authenticated
  USING (
    has_permission_for_company((SELECT auth.uid()), 'can_edit_marketing_contacts', company_id)
    AND check_staff_visibility((SELECT auth.uid()), created_by)
  )
  WITH CHECK (
    has_permission_for_company((SELECT auth.uid()), 'can_edit_marketing_contacts', company_id)
    AND check_staff_visibility((SELECT auth.uid()), created_by)
  );

DROP POLICY IF EXISTS "Staff can manage contact notes if permitted" ON public.marketing_contact_notes;
CREATE POLICY "Staff can manage contact notes if permitted"
  ON public.marketing_contact_notes FOR ALL TO authenticated
  USING (
    has_permission_for_company((SELECT auth.uid()), 'can_edit_marketing_contacts', company_id)
    AND check_staff_visibility((SELECT auth.uid()), created_by)
  )
  WITH CHECK (
    has_permission_for_company((SELECT auth.uid()), 'can_edit_marketing_contacts', company_id)
    AND check_staff_visibility((SELECT auth.uid()), created_by)
  );

DROP POLICY IF EXISTS "Staff can manage opportunity notes if permitted" ON public.marketing_opportunity_notes;
CREATE POLICY "Staff can manage opportunity notes if permitted"
  ON public.marketing_opportunity_notes FOR ALL TO authenticated
  USING (
    has_permission_for_company((SELECT auth.uid()), 'can_edit_marketing_opportunities', company_id)
    AND check_staff_visibility((SELECT auth.uid()), created_by)
  )
  WITH CHECK (
    has_permission_for_company((SELECT auth.uid()), 'can_edit_marketing_opportunities', company_id)
    AND check_staff_visibility((SELECT auth.uid()), created_by)
  );
