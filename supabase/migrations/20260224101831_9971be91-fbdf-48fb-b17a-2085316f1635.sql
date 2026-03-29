-- Fix article_templates policies: change from public to authenticated role
DROP POLICY IF EXISTS "Company admins can manage their article templates" ON public.article_templates;
