-- 4. Insert virtual Platform Admin CRM company
INSERT INTO public.companies (id, name, email, status, is_platform_admin_company)
VALUES ('00000000-0000-0000-0000-000000000001', 'Platform Admin CRM', 'platform@internal.local', 'active', true)
ON CONFLICT (id) DO NOTHING;
