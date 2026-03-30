-- Trigger: auto-sync anagrafica when linked profile is updated
DROP FUNCTION IF EXISTS public.sync_anagrafica_from_profile() CASCADE;
CREATE OR REPLACE FUNCTION sync_anagrafica_from_profile()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE anagrafiche_native
  SET
    ragione_sociale = COALESCE(NEW.first_name, '') || ' ' || NEW.last_name,
    codice_fiscale  = NEW.fiscal_code,
    email           = NEW.email,
    telefono        = NEW.phone,
    indirizzo_via   = NEW.address,
    last_synced_at  = NOW()
  WHERE cliente_id = NEW.id
    AND sync_from_cliente = true;

  RETURN NEW;
END;
$$;
