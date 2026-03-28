-- Also allow super_admin
CREATE POLICY "Super admins can update webhook events"
ON public.integration_webhook_events
FOR UPDATE
USING (public.has_role(auth.uid(), 'super_admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role));
