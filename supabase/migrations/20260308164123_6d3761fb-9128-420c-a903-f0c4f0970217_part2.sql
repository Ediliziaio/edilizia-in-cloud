-- RLS: company members can read their own subscription
DROP POLICY IF EXISTS "Users can read own company ai_subscriptions" ON public.ai_subscriptions;
CREATE POLICY "Users can read own company ai_subscriptions"
  ON public.ai_subscriptions FOR SELECT TO authenticated
  USING (
    company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid())
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
  );
