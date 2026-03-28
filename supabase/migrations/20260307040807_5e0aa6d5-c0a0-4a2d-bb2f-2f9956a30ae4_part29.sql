CREATE POLICY "platform_el_config_super_admin" ON public.platform_elevenlabs_config
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'));
