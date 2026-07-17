-- Ponte meta_assets → social_accounts.
-- Il Social Manager (banner piattaforme + socialPublishCore, che mappa
-- pagina↔piattaforma da social_accounts) non vedeva MAI le pagine collegate
-- via integrazione Meta: nessun flusso popolava social_accounts → banner
-- "Nessuna piattaforma collegata" e pubblicazione impossibile anche con
-- l'integrazione Meta attiva.
-- Da ora: le pagine meta_assets selected=true generano/riattivano le righe
-- facebook (+ instagram se la pagina ha l'IG business account nel metadata);
-- deselezione/rimozione → is_active=false (i token restano in
-- integration_credentials, qui è solo lo stato di collegamento).

CREATE OR REPLACE FUNCTION public.sync_social_account_from_meta_asset()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_ig_id text;
  v_ig_username text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.asset_type = 'page' THEN
      UPDATE social_accounts SET is_active = false, updated_at = now()
      WHERE company_id = OLD.company_id
        AND page_id = OLD.asset_id
        AND platform_id IN ('facebook','instagram');
    END IF;
    RETURN OLD;
  END IF;

  IF NEW.asset_type <> 'page' THEN
    RETURN NEW;
  END IF;

  IF NEW.selected THEN
    -- Facebook: la pagina stessa
    INSERT INTO social_accounts (company_id, platform_id, page_id, page_name, scopes, is_active, connected_at, updated_at)
    VALUES (NEW.company_id, 'facebook', NEW.asset_id, NEW.asset_name, '{}', true, now(), now())
    ON CONFLICT (company_id, platform_id, page_id)
    DO UPDATE SET page_name = EXCLUDED.page_name, is_active = true, updated_at = now();

    -- Instagram: solo se la pagina ha un IG business account collegato
    v_ig_id := NEW.metadata->'instagram_business_account'->>'id';
    v_ig_username := COALESCE(NEW.metadata->'instagram_business_account'->>'username', NEW.asset_name);
    IF v_ig_id IS NOT NULL THEN
      -- page_id = pagina FB (il publish core risolve token e IG id da lì)
      INSERT INTO social_accounts (company_id, platform_id, page_id, page_name, username, scopes, is_active, connected_at, updated_at)
      VALUES (NEW.company_id, 'instagram', NEW.asset_id, v_ig_username, v_ig_username, '{}', true, now(), now())
      ON CONFLICT (company_id, platform_id, page_id)
      DO UPDATE SET page_name = EXCLUDED.page_name, username = EXCLUDED.username, is_active = true, updated_at = now();
    END IF;
  ELSE
    UPDATE social_accounts SET is_active = false, updated_at = now()
    WHERE company_id = NEW.company_id
      AND page_id = NEW.asset_id
      AND platform_id IN ('facebook','instagram');
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_sync_social_account ON public.meta_assets;
CREATE TRIGGER trg_sync_social_account
  AFTER INSERT OR UPDATE OR DELETE ON public.meta_assets
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_social_account_from_meta_asset();

-- Backfill: pagine già selezionate di tutte le aziende con Meta collegata
INSERT INTO social_accounts (company_id, platform_id, page_id, page_name, scopes, is_active, connected_at, updated_at)
SELECT ma.company_id, 'facebook', ma.asset_id, ma.asset_name, '{}', true, now(), now()
FROM meta_assets ma
WHERE ma.asset_type = 'page' AND ma.selected = true
ON CONFLICT (company_id, platform_id, page_id)
DO UPDATE SET page_name = EXCLUDED.page_name, is_active = true, updated_at = now();

INSERT INTO social_accounts (company_id, platform_id, page_id, page_name, username, scopes, is_active, connected_at, updated_at)
SELECT ma.company_id, 'instagram', ma.asset_id,
       COALESCE(ma.metadata->'instagram_business_account'->>'username', ma.asset_name),
       ma.metadata->'instagram_business_account'->>'username',
       '{}', true, now(), now()
FROM meta_assets ma
WHERE ma.asset_type = 'page' AND ma.selected = true
  AND ma.metadata->'instagram_business_account'->>'id' IS NOT NULL
ON CONFLICT (company_id, platform_id, page_id)
DO UPDATE SET page_name = EXCLUDED.page_name, username = EXCLUDED.username, is_active = true, updated_at = now();
