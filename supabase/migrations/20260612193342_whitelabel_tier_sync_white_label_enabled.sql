-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.

-- White-label: companies.white_label_enabled è il flag runtime letto dai layout,
-- company_branding.whitelabel_tier è il piano acquistato. Devono restare allineati:
-- tier <> 'none' → white_label_enabled = true (e viceversa alla revoca).

CREATE OR REPLACE FUNCTION public.sync_white_label_enabled()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.companies
  SET white_label_enabled = (NEW.whitelabel_tier IS NOT NULL AND NEW.whitelabel_tier <> 'none')
  WHERE id = NEW.company_id
    AND white_label_enabled IS DISTINCT FROM (NEW.whitelabel_tier IS NOT NULL AND NEW.whitelabel_tier <> 'none');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_white_label_enabled ON public.company_branding;
CREATE TRIGGER trg_sync_white_label_enabled
AFTER INSERT OR UPDATE OF whitelabel_tier ON public.company_branding
FOR EACH ROW
EXECUTE FUNCTION public.sync_white_label_enabled();

-- Backfill: attiva il flag per chi ha già un tier white-label
UPDATE public.companies c
SET white_label_enabled = true
FROM public.company_branding cb
WHERE cb.company_id = c.id
  AND cb.whitelabel_tier IS NOT NULL
  AND cb.whitelabel_tier <> 'none'
  AND c.white_label_enabled IS DISTINCT FROM true;

-- company_branding.is_active: la riga branding di un'azienda con tier va attiva
UPDATE public.company_branding
SET is_active = true
WHERE whitelabel_tier IS NOT NULL
  AND whitelabel_tier <> 'none'
  AND is_active IS DISTINCT FROM true;

-- Pulizia dati sporchi:
-- 1) custom_domain su dominio piattaforma non è ammesso (mai verificato)
UPDATE public.company_branding
SET custom_domain = NULL,
    custom_domain_verified = false,
    custom_domain_cname = NULL
WHERE custom_domain IS NOT NULL
  AND (custom_domain LIKE '%.ediliziaincloud.com' OR custom_domain LIKE '%.ediliziaincloud.it'
       OR custom_domain IN ('ediliziaincloud.com','ediliziaincloud.it'));

-- 2) primary_color in formato HSL ("222 47% 11%") al posto dell'hex → reset
UPDATE public.company_branding
SET primary_color = NULL
WHERE primary_color IS NOT NULL
  AND primary_color !~* '^#[0-9a-f]{3}([0-9a-f]{3})?$';
