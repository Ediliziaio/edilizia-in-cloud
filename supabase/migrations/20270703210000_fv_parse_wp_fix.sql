-- Fix parsing potenze (validato sui nomi reali del listino Green Energy):
--  - pannelli: accetta notazione "Wp" (watt-picco) + guardia plausibilità 100–1000 W
--  - inverter: fallback W/Wp → kW ("INVERTER GROWATT 5000 WP" = 5 kW), plausibilità 0.3–100 kW
--  - accumulo: fallback Wh → kWh
-- NB: nomi "famiglia multi-taglia" (es. "Growatt MIN-TL-X 2500-6000") restano
-- volutamente senza potenza: meglio vuoto (da compilare) che un numero sbagliato.
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
    -- W o Wp; plausibilità pannello 100–1000 W (evita di leggere "5000 Wp" come pannello)
    m := regexp_match(v_testo, '(\d{3,4})\s*[Ww][Pp]?(?![Hh])');
    IF m IS NOT NULL AND m[1]::int BETWEEN 100 AND 1000 THEN
      v_potenza_w := m[1]::int;
    END IF;

  ELSIF f.macro_fv_categoria = 'inverter' THEN
    -- prima kW espliciti…
    m := regexp_match(v_testo, '(\d+(?:[.,]\d+)?)\s*[Kk][Ww](?![Hh])');
    IF m IS NOT NULL THEN
      v_potenza_kw := replace(m[1], ',', '.')::numeric;
    ELSE
      -- …poi fallback W/Wp → kW (es. "5000 WP" = 5 kW)
      m := regexp_match(v_testo, '(\d{3,5})\s*[Ww][Pp]?(?![Hh])');
      IF m IS NOT NULL THEN v_potenza_kw := m[1]::numeric / 1000; END IF;
    END IF;
    IF v_potenza_kw IS NOT NULL AND (v_potenza_kw < 0.3 OR v_potenza_kw > 100) THEN
      v_potenza_kw := NULL;
    END IF;

  ELSIF f.macro_fv_categoria = 'accumulo' THEN
    m := regexp_match(v_testo, '(\d+(?:[.,]\d+)?)\s*[Kk][Ww][Hh]');
    IF m IS NOT NULL THEN
      v_capacita_kwh := replace(m[1], ',', '.')::numeric;
    ELSE
      m := regexp_match(v_testo, '(\d{3,5})\s*[Ww][Hh]');
      IF m IS NOT NULL THEN v_capacita_kwh := m[1]::numeric / 1000; END IF;
    END IF;
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
