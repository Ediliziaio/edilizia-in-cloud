-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.

-- Normalizzazione per match comune: minuscolo + rimozione accenti (no extension).
CREATE OR REPLACE FUNCTION public.geo_norm(t text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT translate(lower(btrim(coalesce(t, ''))), 'àáâäèéêëìíîïòóôöùúûü', 'aaaaeeeeiiiioooouuuu');
$$;

CREATE INDEX IF NOT EXISTS it_comuni_norm ON public.it_comuni (geo_norm(comune));

-- Enrichment aggiornato: usa il dataset completo it_comuni.
-- Regola anti-ambiguità: assegna provincia SOLO se il CAP/città risolve a UNA sola provincia.
CREATE OR REPLACE FUNCTION public.enrich_marketing_contact_geo()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sigle text[];
  v_sigla text;
  v_reg   text;
BEGIN
  -- 1) Regione da provincia già presente (it_province), se regione manca
  IF NEW.region IS NULL AND NULLIF(btrim(NEW.province), '') IS NOT NULL THEN
    SELECT regione INTO v_reg FROM it_province
      WHERE upper(btrim(NEW.province)) = sigla OR lower(btrim(NEW.province)) = lower(nome)
      LIMIT 1;
    IF v_reg IS NOT NULL THEN NEW.region := v_reg; END IF;
  END IF;

  -- 2) Se provincia manca: ricava da CAP (univoco), poi da città (univoca)
  IF NULLIF(btrim(NEW.province), '') IS NULL THEN
    IF NULLIF(btrim(NEW.postal_code), '') IS NOT NULL THEN
      SELECT array_agg(DISTINCT sigla) INTO v_sigle FROM it_comuni WHERE cap = btrim(NEW.postal_code);
      IF array_length(v_sigle, 1) = 1 THEN v_sigla := v_sigle[1]; END IF;
    END IF;
    IF v_sigla IS NULL AND NULLIF(btrim(NEW.city), '') IS NOT NULL THEN
      SELECT array_agg(DISTINCT sigla) INTO v_sigle FROM it_comuni WHERE geo_norm(comune) = geo_norm(NEW.city);
      IF array_length(v_sigle, 1) = 1 THEN v_sigla := v_sigle[1]; END IF;
    END IF;
    IF v_sigla IS NOT NULL THEN
      NEW.province := v_sigla;
      IF NEW.region IS NULL THEN
        SELECT regione INTO v_reg FROM it_comuni WHERE sigla = v_sigla LIMIT 1;
        NEW.region := v_reg;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Re-backfill esistenti col dataset completo (idempotente, solo dove mancante)
-- 2a) da CAP univoco
UPDATE public.marketing_contacts mc
SET province = sub.sigla, region = COALESCE(mc.region, sub.regione)
FROM (
  SELECT cap, max(sigla) AS sigla, max(regione) AS regione
  FROM it_comuni GROUP BY cap HAVING count(DISTINCT sigla) = 1
) sub
WHERE NULLIF(btrim(mc.province), '') IS NULL
  AND NULLIF(btrim(mc.postal_code), '') IS NOT NULL
  AND btrim(mc.postal_code) = sub.cap;

-- 2b) da città univoca
UPDATE public.marketing_contacts mc
SET province = sub.sigla, region = COALESCE(mc.region, sub.regione)
FROM (
  SELECT geo_norm(comune) AS cnorm, max(sigla) AS sigla, max(regione) AS regione
  FROM it_comuni GROUP BY geo_norm(comune) HAVING count(DISTINCT sigla) = 1
) sub
WHERE NULLIF(btrim(mc.province), '') IS NULL
  AND NULLIF(btrim(mc.city), '') IS NOT NULL
  AND geo_norm(mc.city) = sub.cnorm;

-- 2c) regione residua da provincia
UPDATE public.marketing_contacts mc
SET region = ip.regione
FROM it_province ip
WHERE mc.region IS NULL
  AND NULLIF(btrim(mc.province), '') IS NOT NULL
  AND (upper(btrim(mc.province)) = ip.sigla OR lower(btrim(mc.province)) = lower(ip.nome));
