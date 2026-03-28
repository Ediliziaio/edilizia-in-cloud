-- =============================================
-- Function + Trigger: auto-calculate hr_giornate
-- =============================================
CREATE OR REPLACE FUNCTION public.calcola_giornata_hr()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_data date;
  v_company_id uuid;
  v_profilo_id uuid;
  v_ore_previste numeric(4,2);
  v_prima_entrata time;
  v_ultima_uscita time;
  v_ore_lavorate numeric(4,2);
  v_ore_pausa numeric(4,2);
  v_entrata_rec RECORD;
  v_uscita_rec RECORD;
  v_pausa_inizio_rec RECORD;
  v_pausa_fine_rec RECORD;
BEGIN
  v_data := NEW.data_evento;
  v_company_id := NEW.company_id;
  v_profilo_id := NEW.profilo_id;

  -- Get ore_previste from profilo
  SELECT COALESCE(ore_giornaliere, 8) INTO v_ore_previste
  FROM hr_profili WHERE id = v_profilo_id;

  -- First entry
  SELECT MIN(ora_evento) INTO v_prima_entrata
  FROM hr_timbrature
  WHERE profilo_id = v_profilo_id AND data_evento = v_data AND tipo = 'entrata';

  -- Last exit
  SELECT MAX(ora_evento) INTO v_ultima_uscita
  FROM hr_timbrature
  WHERE profilo_id = v_profilo_id AND data_evento = v_data AND tipo = 'uscita';

  -- Calculate worked hours (simple: last exit - first entry)
  IF v_prima_entrata IS NOT NULL AND v_ultima_uscita IS NOT NULL THEN
    v_ore_lavorate := EXTRACT(EPOCH FROM (v_ultima_uscita - v_prima_entrata)) / 3600.0;
  ELSE
    v_ore_lavorate := 0;
  END IF;

  -- Calculate pause
  v_ore_pausa := 0;
  FOR v_pausa_inizio_rec IN
    SELECT ora_evento FROM hr_timbrature
    WHERE profilo_id = v_profilo_id AND data_evento = v_data AND tipo = 'pausa_inizio'
    ORDER BY ora_evento
  LOOP
    SELECT ora_evento INTO v_pausa_fine_rec
    FROM hr_timbrature
    WHERE profilo_id = v_profilo_id AND data_evento = v_data AND tipo = 'pausa_fine'
      AND ora_evento > v_pausa_inizio_rec.ora_evento
    ORDER BY ora_evento LIMIT 1;

    IF v_pausa_fine_rec.ora_evento IS NOT NULL THEN
      v_ore_pausa := v_ore_pausa + EXTRACT(EPOCH FROM (v_pausa_fine_rec.ora_evento - v_pausa_inizio_rec.ora_evento)) / 3600.0;
    END IF;
  END LOOP;

  v_ore_lavorate := GREATEST(0, v_ore_lavorate - v_ore_pausa);

  -- Upsert giornata
  INSERT INTO hr_giornate (company_id, profilo_id, data, ore_previste, ore_lavorate, ore_pausa, prima_entrata, ultima_uscita)
  VALUES (v_company_id, v_profilo_id, v_data, v_ore_previste, ROUND(v_ore_lavorate::numeric, 2), ROUND(v_ore_pausa::numeric, 2), v_prima_entrata, v_ultima_uscita)
  ON CONFLICT (profilo_id, data)
  DO UPDATE SET
    ore_lavorate = ROUND(EXCLUDED.ore_lavorate::numeric, 2),
    ore_pausa = ROUND(EXCLUDED.ore_pausa::numeric, 2),
    prima_entrata = EXCLUDED.prima_entrata,
    ultima_uscita = EXCLUDED.ultima_uscita,
    updated_at = now();

  RETURN NEW;
END;
$$;
