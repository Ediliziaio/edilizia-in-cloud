-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.

-- Arricchimento geografico contatti: regione da provincia, e provincia+regione
-- da città-capoluogo. NON sovrascrive mai dati già presenti (riempie solo i NULL).
-- Se la città non è un capoluogo noto (piccoli comuni), non tocca nulla (skip).
CREATE OR REPLACE FUNCTION public.enrich_marketing_contact_geo()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reg text;
  v_sigla text;
BEGIN
  -- 1) Regione da provincia (sigla o nome), se regione mancante
  IF NEW.region IS NULL AND NULLIF(btrim(NEW.province), '') IS NOT NULL THEN
    SELECT p.regione INTO v_reg
    FROM public.it_province p
    WHERE upper(btrim(NEW.province)) = p.sigla
       OR lower(btrim(NEW.province)) = lower(p.nome)
    LIMIT 1;
    IF v_reg IS NOT NULL THEN NEW.region := v_reg; END IF;
  END IF;

  -- 2) Provincia + regione da città-capoluogo, se provincia mancante
  IF NULLIF(btrim(NEW.province), '') IS NULL AND NULLIF(btrim(NEW.city), '') IS NOT NULL THEN
    SELECT p.sigla, p.regione INTO v_sigla, v_reg
    FROM public.it_province p
    WHERE lower(btrim(NEW.city)) = lower(p.nome)
    LIMIT 1;
    IF v_sigla IS NOT NULL THEN
      NEW.province := v_sigla;
      IF NEW.region IS NULL THEN NEW.region := v_reg; END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enrich_contact_geo ON public.marketing_contacts;
CREATE TRIGGER trg_enrich_contact_geo
  BEFORE INSERT OR UPDATE OF city, province, region, postal_code ON public.marketing_contacts
  FOR EACH ROW EXECUTE FUNCTION public.enrich_marketing_contact_geo();

-- Backfill esistenti (idempotente: solo dove mancante)
UPDATE public.marketing_contacts mc
SET region = p.regione
FROM public.it_province p
WHERE mc.region IS NULL
  AND NULLIF(btrim(mc.province), '') IS NOT NULL
  AND (upper(btrim(mc.province)) = p.sigla OR lower(btrim(mc.province)) = lower(p.nome));

UPDATE public.marketing_contacts mc
SET province = p.sigla, region = COALESCE(mc.region, p.regione)
FROM public.it_province p
WHERE NULLIF(btrim(mc.province), '') IS NULL
  AND NULLIF(btrim(mc.city), '') IS NOT NULL
  AND lower(btrim(mc.city)) = lower(p.nome);
