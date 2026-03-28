-- 3. Backfill existing super admins
UPDATE public.super_admin_permissions SET can_manage_marketing = true WHERE can_manage_companies = true;
