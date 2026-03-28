-- 2. Add is_platform_admin_company to companies
ALTER TABLE public.companies
ADD COLUMN IF NOT EXISTS is_platform_admin_company boolean NOT NULL DEFAULT false;
