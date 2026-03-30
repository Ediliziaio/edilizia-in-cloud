-- Permette agli utenti autenticati di leggere solo meta_app_id
-- (non il secret, che rimane riservato ai super_admin)
DROP POLICY IF EXISTS "authenticated_read_meta_app_id" ON public.platform_settings;
CREATE POLICY "authenticated_read_meta_app_id"
  ON public.platform_settings
  FOR SELECT
  TO authenticated
  USING (key = 'meta_app_id');
