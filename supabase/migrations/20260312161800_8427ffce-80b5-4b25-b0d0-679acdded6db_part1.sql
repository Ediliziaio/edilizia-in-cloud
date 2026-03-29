-- Event trigger on CREATE TABLE
CREATE EVENT TRIGGER check_rls_on_create_table
ON ddl_command_end
WHEN TAG IN ('CREATE TABLE')
EXECUTE FUNCTION public.check_new_table_rls();
