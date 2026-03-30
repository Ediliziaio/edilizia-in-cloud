DROP POLICY IF EXISTS "Super admins manage all internal automation nodes" ON public.internal_automation_nodes;
CREATE POLICY "Super admins manage all internal automation nodes" ON public.internal_automation_nodes FOR ALL USING (has_role(auth.uid(), 'super_admin'));
