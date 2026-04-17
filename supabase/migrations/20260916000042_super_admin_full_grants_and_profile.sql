-- Completa il restore del super_admin flo.andriciuc@gmail.com:
-- 1. Imposta TUTTI i permessi granulari (impersonation, user_management, etc.) a true
--    per tutti gli utenti con ruolo super_admin.
-- 2. Crea eventuali record profiles mancanti per utenti super_admin (serve per
--    l'UI: navbar, avatar, displayName).
-- Idempotente: safe to re-run.
DO $$
DECLARE
  v_user_id uuid;
  v_email text;
BEGIN
  -- Itera su tutti i super_admin
  FOR v_user_id IN
    SELECT DISTINCT ur.user_id
    FROM public.user_roles ur
    WHERE ur.role = 'super_admin'::public.app_role
  LOOP
    SELECT email INTO v_email FROM auth.users WHERE id = v_user_id;

    -- Upsert permessi granulari (se la riga esiste, forza tutti i flag a true)
    INSERT INTO public.super_admin_permissions (
      user_id,
      can_manage_companies, can_manage_plans, can_manage_tickets,
      can_manage_referrals, can_manage_admins, can_view_platform_stats,
      can_manage_marketing,
      -- Granulari
      billing_read, billing_write, impersonation, user_management,
      pricing_override, feature_flags, audit_log_access, bulk_actions,
      data_export, support_tickets,
      platform_role,
      allowed_company_ids
    )
    VALUES (
      v_user_id,
      true, true, true, true, true, true, true,
      true, true, true, true, true, true, true, true, true, true,
      'super_admin',
      NULL
    )
    ON CONFLICT (user_id) DO UPDATE SET
      can_manage_companies    = true,
      can_manage_plans        = true,
      can_manage_tickets      = true,
      can_manage_referrals    = true,
      can_manage_admins       = true,
      can_view_platform_stats = true,
      can_manage_marketing    = true,
      billing_read            = true,
      billing_write           = true,
      impersonation           = true,
      user_management         = true,
      pricing_override        = true,
      feature_flags           = true,
      audit_log_access        = true,
      bulk_actions            = true,
      data_export             = true,
      support_tickets         = true,
      platform_role           = 'super_admin',
      allowed_company_ids     = NULL,
      updated_at              = now();

    -- Crea profile se manca (evita "Admin" generico nell'UI).
    -- Il super_admin non ha company_id (lavora cross-tenant).
    INSERT INTO public.profiles (id, email, first_name, last_name, created_at, updated_at)
    VALUES (
      v_user_id,
      v_email,
      COALESCE(
        (SELECT raw_user_meta_data->>'first_name' FROM auth.users WHERE id = v_user_id),
        split_part(v_email, '@', 1)
      ),
      COALESCE(
        (SELECT raw_user_meta_data->>'last_name' FROM auth.users WHERE id = v_user_id),
        'Admin'
      ),
      now(),
      now()
    )
    ON CONFLICT (id) DO NOTHING;
  END LOOP;
END
$$;
