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
