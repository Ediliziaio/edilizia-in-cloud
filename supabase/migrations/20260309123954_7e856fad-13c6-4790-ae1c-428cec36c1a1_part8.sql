-- Helper function
DROP FUNCTION IF EXISTS public.is_super_admin(UUID) CASCADE;
CREATE OR REPLACE FUNCTION public.is_super_admin(p_user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = p_user_id AND role = 'super_admin'
  );
$$ LANGUAGE SQL SECURITY DEFINER STABLE;
