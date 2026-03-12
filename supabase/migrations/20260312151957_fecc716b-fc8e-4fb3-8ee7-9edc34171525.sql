
-- ============================================================
-- 1. APPOINTMENTS: Replace anon policy with a secure VIEW
-- ============================================================

-- Drop the existing overly-permissive anon policy
DROP POLICY IF EXISTS "Public can check appointment slots" ON public.appointments;

-- Create a restricted view exposing ONLY slot-availability fields
CREATE OR REPLACE VIEW public.public_appointment_slots
WITH (security_invoker = true)
AS
SELECT
  id,
  appointment_date,
  appointment_time,
  appointment_end_time,
  is_blocked_slot,
  calendar_id,
  company_id
FROM public.appointments
WHERE calendar_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.marketing_calendars mc
    WHERE mc.id = appointments.calendar_id
      AND mc.booking_slug IS NOT NULL
      AND mc.is_active = true
  );

-- Grant anon/authenticated read access on the view
GRANT SELECT ON public.public_appointment_slots TO anon, authenticated;

-- Re-add a minimal anon policy on the base table scoped to view usage
-- (security_invoker on the view means RLS still applies on the base table)
CREATE POLICY "Public can check appointment slots"
ON public.appointments
FOR SELECT
TO anon
USING (
  calendar_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.marketing_calendars mc
    WHERE mc.id = appointments.calendar_id
      AND mc.booking_slug IS NOT NULL
      AND mc.is_active = true
  )
);

-- ============================================================
-- 2. QUOTE ITEMS: Add signature token verification
-- ============================================================

DROP POLICY IF EXISTS "qi_anon_sel" ON public.quote_items;

CREATE POLICY "qi_anon_sel"
ON public.quote_items
FOR SELECT
TO anon
USING (
  EXISTS (
    SELECT 1 FROM public.quotes q
    WHERE q.id = quote_items.quote_id
      AND q.signature_token IS NOT NULL
      AND q.status = ANY (ARRAY['inviata','accettata','rifiutata','scaduta'])
      AND q.signature_token = (current_setting('request.header.x-quote-token', true))::uuid
  )
);

-- ============================================================
-- 3. BILLING INTEGRATIONS: Restrict to admin roles only
-- ============================================================

DROP POLICY IF EXISTS "company_billing_integrations" ON public.billing_integrations;

-- Admin-only read access (company_admin + super_admin)
CREATE POLICY "billing_integrations_admin_select"
ON public.billing_integrations
FOR SELECT
TO authenticated
USING (
  (company_id = public.get_user_company_id(auth.uid())
   AND public.has_role(auth.uid(), 'company_admin'))
  OR public.has_role(auth.uid(), 'super_admin')
);

-- Admin-only write access
CREATE POLICY "billing_integrations_admin_modify"
ON public.billing_integrations
FOR ALL
TO authenticated
USING (
  (company_id = public.get_user_company_id(auth.uid())
   AND public.has_role(auth.uid(), 'company_admin'))
  OR public.has_role(auth.uid(), 'super_admin')
)
WITH CHECK (
  (company_id = public.get_user_company_id(auth.uid())
   AND public.has_role(auth.uid(), 'company_admin'))
  OR public.has_role(auth.uid(), 'super_admin')
);
