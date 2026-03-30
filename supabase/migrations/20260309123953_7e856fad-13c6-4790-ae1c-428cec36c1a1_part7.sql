DROP POLICY IF EXISTS "public_read_wl_assets" ON public.storage;
CREATE POLICY "public_read_wl_assets"
ON storage.objects FOR SELECT TO anon, authenticated
USING (bucket_id = 'white-label-assets');
