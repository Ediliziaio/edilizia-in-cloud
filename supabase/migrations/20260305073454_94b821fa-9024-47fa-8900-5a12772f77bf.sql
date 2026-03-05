CREATE POLICY "Super admins can manage all warehouse sections"
  ON public.warehouse_sections FOR ALL
  USING (public.has_role(auth.uid(), 'super_admin'));