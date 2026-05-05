-- Fix: Sara Commerciale has a salespeople record but is missing the salesperson role
-- She only has company_staff. Add salesperson role to sync with salespeople table.
INSERT INTO user_roles (user_id, role)
SELECT '84f1279e-56a3-401a-a796-63afccd9e5f3', 'salesperson'
WHERE EXISTS (
  SELECT 1 FROM auth.users
  WHERE id = '84f1279e-56a3-401a-a796-63afccd9e5f3'
)
AND NOT EXISTS (
  SELECT 1 FROM user_roles
  WHERE user_id = '84f1279e-56a3-401a-a796-63afccd9e5f3' AND role = 'salesperson'
);
