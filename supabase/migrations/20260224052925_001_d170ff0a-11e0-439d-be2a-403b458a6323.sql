-- Fix 4: Add UPDATE RLS policy on integration_webhook_events for retry functionality
CREATE POLICY "Company admins can update webhook events"
ON public.integration_webhook_events
FOR UPDATE
USING (
  public.has_role(auth.uid(), 'company_admin'::app_role) 
  AND company_id = public.get_user_company_id(auth.uid())
)
WITH CHECK (
  public.has_role(auth.uid(), 'company_admin'::app_role) 
  AND company_id = public.get_user_company_id(auth.uid())
);
