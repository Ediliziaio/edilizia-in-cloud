-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.

-- Città cambiata → provincia/regione si AGGIORNANO da sole (prima il trigger
-- compilava solo i campi mancanti: cambiando città restavano quelli vecchi).
-- Se nello stesso update l'utente ha toccato a mano provincia o regione, i
-- suoi valori vengono rispettati.
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
  -- 0) UPDATE con città cambiata e provincia/regione NON toccate → ricalcola
  IF TG_OP = 'UPDATE'
     AND geo_norm(coalesce(NEW.city, '')) IS DISTINCT FROM geo_norm(coalesce(OLD.city, ''))
     AND NULLIF(btrim(NEW.city), '') IS NOT NULL
     AND NEW.province IS NOT DISTINCT FROM OLD.province
     AND NEW.region IS NOT DISTINCT FROM OLD.region THEN
    SELECT array_agg(DISTINCT sigla) INTO v_sigle FROM it_comuni WHERE geo_norm(comune) = geo_norm(NEW.city);
    IF array_length(v_sigle, 1) = 1 THEN
      NEW.province := v_sigle[1];
      SELECT regione INTO v_reg FROM it_comuni WHERE sigla = v_sigle[1] LIMIT 1;
      NEW.region := v_reg;
      RETURN NEW;
    END IF;
    v_sigle := NULL; v_sigla := NULL; v_reg := NULL;
  END IF;

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
