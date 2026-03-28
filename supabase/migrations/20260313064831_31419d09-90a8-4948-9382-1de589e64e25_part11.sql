CREATE TRIGGER trg_sync_anagrafica_on_profile_update
  AFTER UPDATE OF first_name, last_name, email, phone, fiscal_code, address
  ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION sync_anagrafica_from_profile();
