-- Create storage bucket for company logos
INSERT INTO storage.buckets (id, name, public)
VALUES ('company-logos', 'company-logos', true);

-- RLS: Company admin can upload their logo
CREATE POLICY "Company admins can upload their logo"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'company-logos' AND
  (storage.foldername(name))[1] = get_user_company_id(auth.uid())::text
);

-- RLS: Company admin can update their logo
CREATE POLICY "Company admins can update their logo"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'company-logos' AND
  (storage.foldername(name))[1] = get_user_company_id(auth.uid())::text
);

-- RLS: Company admin can delete their logo
CREATE POLICY "Company admins can delete their logo"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'company-logos' AND
  (storage.foldername(name))[1] = get_user_company_id(auth.uid())::text
);

-- RLS: Super admin can manage all logos
CREATE POLICY "Super admins can manage all logos"
ON storage.objects FOR ALL
TO authenticated
USING (
  bucket_id = 'company-logos' AND
  has_role(auth.uid(), 'super_admin')
);

-- RLS: Anyone can view logos (public bucket)
CREATE POLICY "Anyone can view logos"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'company-logos');