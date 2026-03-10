

## Problem

The user `flo.andriciuc@gmail.com` (id: `119fa4f5-...`) has the `super_admin` role but **no row** in `super_admin_permissions`. Since there are 2 super admins total, the `useSuperAdminPermissions` hook returns `NO_ACCESS` (deny-by-default), blocking the entire dashboard.

The auto-create trigger referenced in memory (`trg_auto_create_superadmin_permissions`) does not exist in the database, so permission records are never created automatically.

## Plan

### 1. Database migration: Create missing permission record + trigger

- **INSERT** a full-access `super_admin_permissions` row for user `119fa4f5-59bc-4778-a14c-b3d0c23dc774`.
- **CREATE** the trigger function + trigger on `user_roles` that auto-inserts a `super_admin_permissions` record (all permissions = true, `allowed_company_ids` = NULL) whenever a `super_admin` role is assigned. This prevents the problem from recurring.

```sql
-- Backfill missing record
INSERT INTO super_admin_permissions (user_id, can_manage_companies, can_manage_plans, can_manage_tickets, can_manage_referrals, can_manage_admins, can_view_platform_stats, allowed_company_ids)
VALUES ('119fa4f5-59bc-4778-a14c-b3d0c23dc774', true, true, true, true, true, true, NULL)
ON CONFLICT DO NOTHING;

-- Auto-create trigger
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
```

### 2. No frontend changes needed

The `useSuperAdminPermissions` hook logic is correct -- it just needs the database record to exist. Once the migration runs, the dashboard will load normally.

