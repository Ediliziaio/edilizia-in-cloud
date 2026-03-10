
-- Backfill missing permission record for flo.andriciuc
INSERT INTO super_admin_permissions (user_id, can_manage_companies, can_manage_plans, can_manage_tickets, can_manage_referrals, can_manage_admins, can_view_platform_stats, allowed_company_ids)
VALUES ('119fa4f5-59bc-4778-a14c-b3d0c23dc774', true, true, true, true, true, true, NULL)
ON CONFLICT DO NOTHING;

-- Auto-create trigger for future super_admin assignments
CREATE OR REPLACE FUNCTION public.fn_auto_create_superadmin_permissions()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.role = 'super_admin' THEN
    INSERT INTO super_admin_permissions (user_id) VALUES (NEW.user_id) ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_auto_create_superadmin_permissions
AFTER INSERT ON user_roles
FOR EACH ROW EXECUTE FUNCTION fn_auto_create_superadmin_permissions();
