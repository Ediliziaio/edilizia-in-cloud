
-- 1. Add can_manage_marketing to super_admin_permissions
ALTER TABLE public.super_admin_permissions
ADD COLUMN IF NOT EXISTS can_manage_marketing boolean NOT NULL DEFAULT false;

-- 2. Add is_platform_admin_company to companies
ALTER TABLE public.companies
ADD COLUMN IF NOT EXISTS is_platform_admin_company boolean NOT NULL DEFAULT false;

-- 3. Backfill existing super admins
UPDATE public.super_admin_permissions SET can_manage_marketing = true WHERE can_manage_companies = true;

-- 4. Insert virtual Platform Admin CRM company
INSERT INTO public.companies (id, name, email, status, is_platform_admin_company)
VALUES ('00000000-0000-0000-0000-000000000001', 'Platform Admin CRM', 'platform@internal.local', 'active', true)
ON CONFLICT (id) DO NOTHING;

-- 5. Insert default sales pipeline
INSERT INTO public.marketing_pipelines (id, company_id, name, position)
VALUES ('00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000001', 'Pipeline Vendita SaaS', 0)
ON CONFLICT (id) DO NOTHING;

-- 6. Insert pipeline stages (no color/is_won/is_lost columns)
INSERT INTO public.marketing_pipeline_stages (id, pipeline_id, company_id, name, position) VALUES
('00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000001', 'Lead Nuovo', 0),
('00000000-0000-0000-0000-000000000102', '00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000001', 'Contattato', 1),
('00000000-0000-0000-0000-000000000103', '00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000001', 'Demo Fissata', 2),
('00000000-0000-0000-0000-000000000104', '00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000001', 'Demo Effettuata', 3),
('00000000-0000-0000-0000-000000000105', '00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000001', 'Proposta Inviata', 4),
('00000000-0000-0000-0000-000000000106', '00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000001', 'Negoziazione', 5),
('00000000-0000-0000-0000-000000000107', '00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000001', 'Chiuso Vinto', 6),
('00000000-0000-0000-0000-000000000108', '00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000001', 'Perso', 7)
ON CONFLICT (id) DO NOTHING;

-- 7. Insert default tags
INSERT INTO public.marketing_tags (id, company_id, name, color) VALUES
('00000000-0000-0000-0000-000000000201', '00000000-0000-0000-0000-000000000001', 'Hot Lead', '#EF4444'),
('00000000-0000-0000-0000-000000000202', '00000000-0000-0000-0000-000000000001', 'Demo Richiesta', '#F59E0B'),
('00000000-0000-0000-0000-000000000203', '00000000-0000-0000-0000-000000000001', 'Trial Attivo', '#3B82F6'),
('00000000-0000-0000-0000-000000000204', '00000000-0000-0000-0000-000000000001', 'Referral', '#8B5CF6'),
('00000000-0000-0000-0000-000000000205', '00000000-0000-0000-0000-000000000001', 'Agenzia', '#10B981'),
('00000000-0000-0000-0000-000000000206', '00000000-0000-0000-0000-000000000001', 'Imprenditore', '#EC4899')
ON CONFLICT (id) DO NOTHING;

-- 8. Insert default calendar (marketing_calendars requires created_by)
INSERT INTO public.marketing_calendars (id, company_id, name, created_by)
VALUES ('00000000-0000-0000-0000-000000000301', '00000000-0000-0000-0000-000000000001', 'Demo & Sales', '00000000-0000-0000-0000-000000000000')
ON CONFLICT (id) DO NOTHING;

-- 9. Update trigger to include can_manage_marketing
CREATE OR REPLACE FUNCTION public.fn_auto_create_superadmin_permissions()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.role = 'super_admin' THEN
    INSERT INTO super_admin_permissions (user_id, can_manage_marketing)
    VALUES (NEW.user_id, true)
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;
