-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.

-- Listino come fonte unica: tagging macrocategoria + sync automatico verso il preventivatore FV.

ALTER TABLE public.listino_macrocategorie
  ADD COLUMN IF NOT EXISTS tipologia text,
  ADD COLUMN IF NOT EXISTS fv_categoria text
    CHECK (fv_categoria IS NULL OR fv_categoria IN
      ('pannello','inverter','accumulo','wallbox','ottimizzatore','struttura','altro'));

COMMENT ON COLUMN public.listino_macrocategorie.tipologia IS
  'Preventivatore a cui appartiene la macro (fotovoltaico, serramenti, ristrutturazione, …). NULL = listino generico.';
COMMENT ON COLUMN public.listino_macrocategorie.fv_categoria IS
  'Se tipologia=fotovoltaico: tipo componente proiettato nel preventivatore FV.';

CREATE UNIQUE INDEX IF NOT EXISTS uq_articoli_native_listino_family
  ON public.articoli_native (listino_family_id)
  WHERE listino_family_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.fv_sync_one_family(p_family_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  f record;
  v_testo text;
  v_potenza_w int;
  v_potenza_kw numeric;
  v_capacita_kwh numeric;
  m text[];
BEGIN
  SELECT af.*, mc.tipologia AS macro_tipologia, mc.fv_categoria AS macro_fv_categoria,
         COALESCE(mc.attivo, false) AS macro_attiva
    INTO f
    FROM article_families af
    LEFT JOIN listino_macrocategorie mc ON mc.id = af.macrocategoria_id
   WHERE af.id = p_family_id;

  IF NOT FOUND THEN RETURN; END IF;

  IF f.macro_tipologia IS DISTINCT FROM 'fotovoltaico'
     OR f.macro_fv_categoria IS NULL
     OR NOT f.macro_attiva
     OR NOT COALESCE(f.attivo, false)
     OR f.deleted_at IS NOT NULL THEN
    UPDATE articoli_native SET attivo = false, updated_at = now()
     WHERE listino_family_id = p_family_id AND attivo;
    RETURN;
  END IF;

  v_testo := f.nome || ' ' || COALESCE(f.descrizione, '');
  IF f.macro_fv_categoria = 'pannello' THEN
    m := regexp_match(v_testo, '(\d{3,4})\s*[Ww](?![HhPp])');
    IF m IS NOT NULL THEN v_potenza_w := m[1]::int; END IF;
  ELSIF f.macro_fv_categoria = 'inverter' THEN
    m := regexp_match(v_testo, '(\d+(?:[.,]\d+)?)\s*[Kk][Ww](?![Hh])');
    IF m IS NOT NULL THEN v_potenza_kw := replace(m[1], ',', '.')::numeric; END IF;
  ELSIF f.macro_fv_categoria = 'accumulo' THEN
    m := regexp_match(v_testo, '(\d+(?:[.,]\d+)?)\s*[Kk][Ww][Hh]');
    IF m IS NOT NULL THEN v_capacita_kwh := replace(m[1], ',', '.')::numeric; END IF;
  END IF;

  INSERT INTO articoli_native (
    company_id, codice, descrizione, descrizione_estesa, unita_misura,
    prezzo_vendita, prezzo_acquisto, immagine_url, scheda_tecnica_url,
    attivo, categoria_fv, potenza_w, potenza_kw, capacita_kwh, listino_family_id
  ) VALUES (
    f.company_id, f.codice, f.nome, f.descrizione, COALESCE(f.unit_of_measure, 'pz'),
    f.prezzo_base_vendita, f.prezzo_base_acquisto, f.immagine_url, f.pdf_scheda_url,
    true, f.macro_fv_categoria, v_potenza_w, v_potenza_kw, v_capacita_kwh, f.id
  )
  ON CONFLICT (listino_family_id) WHERE listino_family_id IS NOT NULL
  DO UPDATE SET
    codice             = EXCLUDED.codice,
    descrizione        = EXCLUDED.descrizione,
    descrizione_estesa = EXCLUDED.descrizione_estesa,
    unita_misura       = EXCLUDED.unita_misura,
    prezzo_vendita     = EXCLUDED.prezzo_vendita,
    prezzo_acquisto    = EXCLUDED.prezzo_acquisto,
    immagine_url       = EXCLUDED.immagine_url,
    scheda_tecnica_url = EXCLUDED.scheda_tecnica_url,
    attivo             = true,
    categoria_fv       = EXCLUDED.categoria_fv,
    potenza_w          = COALESCE(EXCLUDED.potenza_w, articoli_native.potenza_w),
    potenza_kw         = COALESCE(EXCLUDED.potenza_kw, articoli_native.potenza_kw),
    capacita_kwh       = COALESCE(EXCLUDED.capacita_kwh, articoli_native.capacita_kwh),
    updated_at         = now();
END;
$$;

CREATE OR REPLACE FUNCTION public.fv_trg_family_sync()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM fv_sync_one_family(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_fv_sync_family ON public.article_families;
CREATE TRIGGER trg_fv_sync_family
AFTER INSERT OR UPDATE ON public.article_families
FOR EACH ROW
WHEN (pg_trigger_depth() = 0)
EXECUTE FUNCTION public.fv_trg_family_sync();

CREATE OR REPLACE FUNCTION public.fv_trg_family_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE articoli_native SET attivo = false, updated_at = now()
   WHERE listino_family_id = OLD.id AND attivo;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_fv_sync_family_delete ON public.article_families;
CREATE TRIGGER trg_fv_sync_family_delete
BEFORE DELETE ON public.article_families
FOR EACH ROW
EXECUTE FUNCTION public.fv_trg_family_delete();

CREATE OR REPLACE FUNCTION public.fv_trg_macro_sync()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  fid uuid;
BEGIN
  IF NEW.tipologia IS DISTINCT FROM OLD.tipologia
     OR NEW.fv_categoria IS DISTINCT FROM OLD.fv_categoria
     OR NEW.attivo IS DISTINCT FROM OLD.attivo THEN
    FOR fid IN SELECT id FROM article_families WHERE macrocategoria_id = NEW.id LOOP
      PERFORM fv_sync_one_family(fid);
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_fv_sync_macro ON public.listino_macrocategorie;
CREATE TRIGGER trg_fv_sync_macro
AFTER UPDATE ON public.listino_macrocategorie
FOR EACH ROW
EXECUTE FUNCTION public.fv_trg_macro_sync();

CREATE OR REPLACE FUNCTION public.fv_sync_listino_macro(p_company_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  fid uuid;
  n int;
BEGIN
  IF NOT (p_company_id = public.get_my_company_id()
          OR public.has_role(auth.uid(), 'super_admin'::app_role)) THEN
    RAISE EXCEPTION 'Non autorizzato';
  END IF;

  FOR fid IN SELECT id FROM article_families WHERE company_id = p_company_id LOOP
    PERFORM fv_sync_one_family(fid);
  END LOOP;

  SELECT count(*) INTO n
    FROM articoli_native
   WHERE company_id = p_company_id AND listino_family_id IS NOT NULL AND attivo;
  RETURN n;
END;
$$;

GRANT EXECUTE ON FUNCTION public.fv_sync_listino_macro(uuid) TO authenticated;
