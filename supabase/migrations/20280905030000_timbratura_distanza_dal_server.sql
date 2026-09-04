-- ════════════════════════════════════════════════════════════════════════════
-- Ondata 5.2 — la distanza della timbratura la calcola il server
-- ════════════════════════════════════════════════════════════════════════════
--
-- Oggi il cliente si autocertifica. In src/hooks/useGPS.ts il browser fa il
-- calcolo Haversine, decide `in_sede`, sceglie `sede_id` e li manda; l'insert
-- in src/hooks/useTimbratura.ts scrive quello che è arrivato. Il server non
-- guarda niente: chiunque sappia fare una POST può dichiararsi in cantiere.
--
-- Ma c'è un fatto più grosso, trovato guardando i dati prima di scrivere:
--   hr_sedi ................ 2 righe, ZERO con lat/lng
--   orders ................. 533 righe, ZERO con work_lat/work_lng
--   hr_timbrature .......... 2.039 righe, ZERO con sede_id, ZERO con order_id
--                            404 con lat/lng, le altre 1.635 senza
--   campo_timbrature ....... 13 righe, ZERO con gps_lat
-- Il recinto non ha mai funzionato, perché non ha mai avuto un centro. Il
-- client calcola diligentemente la distanza da un punto che non esiste,
-- `in_sede` esce sempre falso e nessuno se ne accorge.
--
-- Quindi qui non basta spostare il calcolo: serve che il server distingua
-- «verificato dentro», «verificato fuori» e «non verificabile, ed ecco
-- perché». Oggi tutte e tre queste cose hanno lo stesso aspetto.

CREATE OR REPLACE FUNCTION public.distanza_metri(
  p_lat1 double precision, p_lng1 double precision,
  p_lat2 double precision, p_lng2 double precision
)
RETURNS double precision
LANGUAGE sql
IMMUTABLE
AS $function$
  -- Haversine. Niente PostGIS: non è installato e per una distanza punto-punto
  -- su scala urbana non serve.
  SELECT 2 * 6371000 * asin(sqrt(
      sin(radians(p_lat2 - p_lat1) / 2) ^ 2
    + cos(radians(p_lat1)) * cos(radians(p_lat2))
      * sin(radians(p_lng2 - p_lng1) / 2) ^ 2
  ))
  WHERE p_lat1 IS NOT NULL AND p_lng1 IS NOT NULL
    AND p_lat2 IS NOT NULL AND p_lng2 IS NOT NULL;
$function$;

COMMENT ON FUNCTION public.distanza_metri(double precision, double precision, double precision, double precision) IS
  'Distanza in metri fra due coordinate (Haversine). NULL se manca una delle quattro: una distanza sconosciuta non è zero.';

ALTER TABLE public.hr_timbrature
  ADD COLUMN IF NOT EXISTS distanza_mt      numeric(10,1),
  ADD COLUMN IF NOT EXISTS posizione_esito  text,
  ADD COLUMN IF NOT EXISTS riferimento_tipo text,
  ADD COLUMN IF NOT EXISTS riferimento_id   uuid;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conrelid='public.hr_timbrature'::regclass
                   AND conname='hr_timbrature_posizione_esito_check') THEN
    ALTER TABLE public.hr_timbrature ADD CONSTRAINT hr_timbrature_posizione_esito_check
      CHECK (posizione_esito IS NULL OR posizione_esito = ANY (ARRAY[
        'dentro',                        -- GPS presente, riferimento con coordinate, entro il raggio
        'fuori',                         -- come sopra, ma oltre il raggio
        'senza_gps',                     -- la timbratura non porta coordinate
        'riferimento_senza_coordinate',  -- sede o cantiere dichiarati ma senza lat/lng
        'nessun_riferimento'             -- non c'è né sede né cantiere con cui confrontarsi
      ]));
  END IF;
END $$;

COMMENT ON COLUMN public.hr_timbrature.posizione_esito IS
  'Esito del controllo fatto DAL SERVER. Le tre forme di «non verificabile» sono distinte apposta: prima erano indistinguibili da «dentro».';

-- ── Il controllo ─────────────────────────────────────────────────────────────
-- Le quattro colonne qui sopra sono scritte solo da qui: quello che arriva
-- dal client per queste colonne viene sovrascritto, sempre.
--
-- Non rifiuta la timbratura quando è fuori raggio, e non è una svista: un
-- operaio timbra in cantiere, non in sede, e il cantiere può non avere
-- coordinate. Rifiutare significherebbe impedire a qualcuno di timbrare per
-- un dato di configurazione mancante. Il server registra la verità e la rende
-- visibile; chi guarda decide.
CREATE OR REPLACE FUNCTION public.verifica_posizione_timbratura()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_lat  double precision;
  v_lng  double precision;
  v_ragg integer;
  v_dist double precision;
  v_sede record;
BEGIN
  NEW.distanza_mt      := NULL;
  NEW.riferimento_tipo := NULL;
  NEW.riferimento_id   := NULL;

  -- Una sede di un'altra azienda non si dichiara. Questo sì che è un rifiuto.
  IF NEW.sede_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM public.hr_sedi s
        WHERE s.id = NEW.sede_id AND s.company_id = NEW.company_id) THEN
    RAISE EXCEPTION 'la sede dichiarata non appartiene a questa azienda'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.lat IS NULL OR NEW.lng IS NULL THEN
    NEW.posizione_esito := 'senza_gps';
    RETURN NEW;
  END IF;

  -- Riferimento: il cantiere se la timbratura ne dichiara uno, altrimenti la
  -- sede dichiarata, altrimenti la sede più vicina fra quelle attive
  -- dell'azienda — la scelta la fa il server, non il browser.
  IF NEW.order_id IS NOT NULL THEN
    SELECT o.work_lat, o.work_lng INTO v_lat, v_lng
      FROM public.orders o WHERE o.id = NEW.order_id;
    IF v_lat IS NOT NULL AND v_lng IS NOT NULL THEN
      NEW.riferimento_tipo := 'cantiere';
      NEW.riferimento_id   := NEW.order_id;
      v_ragg := 200;   -- i cantieri non hanno un raggio proprio: 200 m come le sedi
    END IF;
  END IF;

  IF NEW.riferimento_tipo IS NULL THEN
    IF NEW.sede_id IS NOT NULL THEN
      SELECT s.id, s.lat, s.lng, coalesce(s.raggio_mt, 200) AS raggio
        INTO v_sede FROM public.hr_sedi s WHERE s.id = NEW.sede_id;
    ELSE
      SELECT s.id, s.lat, s.lng, coalesce(s.raggio_mt, 200) AS raggio
        INTO v_sede
        FROM public.hr_sedi s
       WHERE s.company_id = NEW.company_id AND s.attiva IS NOT FALSE
         AND s.lat IS NOT NULL AND s.lng IS NOT NULL
       ORDER BY public.distanza_metri(NEW.lat, NEW.lng, s.lat, s.lng)
       LIMIT 1;
    END IF;

    IF v_sede.id IS NOT NULL AND v_sede.lat IS NOT NULL AND v_sede.lng IS NOT NULL THEN
      NEW.riferimento_tipo := 'sede';
      NEW.riferimento_id   := v_sede.id;
      NEW.sede_id          := v_sede.id;   -- la sede la assegna il server
      v_lat := v_sede.lat; v_lng := v_sede.lng; v_ragg := v_sede.raggio;
    ELSIF NEW.sede_id IS NOT NULL OR NEW.order_id IS NOT NULL THEN
      -- Un riferimento c'era, ma senza coordinate: dirlo, non tacerlo.
      NEW.posizione_esito := 'riferimento_senza_coordinate';
      RETURN NEW;
    END IF;
  END IF;

  IF NEW.riferimento_tipo IS NULL THEN
    NEW.posizione_esito := 'nessun_riferimento';
    RETURN NEW;
  END IF;

  v_dist := public.distanza_metri(NEW.lat, NEW.lng, v_lat, v_lng);
  NEW.distanza_mt := round(v_dist::numeric, 1);
  NEW.posizione_esito := CASE WHEN v_dist <= v_ragg THEN 'dentro' ELSE 'fuori' END;
  RETURN NEW;
END $function$;

DROP TRIGGER IF EXISTS trg_verifica_posizione_timbratura ON public.hr_timbrature;
CREATE TRIGGER trg_verifica_posizione_timbratura
  BEFORE INSERT OR UPDATE OF lat, lng, sede_id, order_id ON public.hr_timbrature
  FOR EACH ROW EXECUTE FUNCTION public.verifica_posizione_timbratura();

-- Le righe già presenti: si dichiarano per quello che sono, senza inventare
-- una verifica che al momento non era stata fatta.
UPDATE public.hr_timbrature SET
  posizione_esito = CASE WHEN lat IS NULL OR lng IS NULL THEN 'senza_gps'
                         ELSE 'nessun_riferimento' END
WHERE posizione_esito IS NULL;

CREATE INDEX IF NOT EXISTS idx_hr_timbrature_fuori_raggio
  ON public.hr_timbrature (company_id, data_evento)
  WHERE posizione_esito IN ('fuori', 'riferimento_senza_coordinate');
