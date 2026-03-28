-- Backfill missing permission record for flo.andriciuc (skip if user missing in Preview)
INSERT INTO super_admin_permissions (user_id, can_manage_companies, can_manage_plans, can_manage_tickets, can_manage_referrals, can_manage_admins, can_view_platform_stats, allowed_company_ids)
SELECT '119fa4f5-59bc-4778-a14c-b3d0c23dc774', true, true, true, true, true, true, NULL
WHERE EXISTS (SELECT 1 FROM auth.users WHERE id = '119fa4f5-59bc-4778-a14c-b3d0c23dc774')
ON CONFLICT DO NOTHING;
