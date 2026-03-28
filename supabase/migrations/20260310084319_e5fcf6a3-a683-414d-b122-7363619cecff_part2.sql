CREATE TRIGGER trg_auto_create_superadmin_permissions
AFTER INSERT ON user_roles
FOR EACH ROW EXECUTE FUNCTION fn_auto_create_superadmin_permissions();
