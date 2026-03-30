DROP POLICY IF EXISTS "audits_admin" ON public.inventory_audits;
CREATE POLICY "audits_admin" ON public.inventory_audits FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'super_admin'));
