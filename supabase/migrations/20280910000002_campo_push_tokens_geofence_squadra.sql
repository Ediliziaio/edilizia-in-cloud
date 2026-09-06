-- Portale operaio, seconda tornata:
--   1. push_tokens: l'app nativa (Capacitor) salvava i token in una tabella che non esisteva
--   2. geofence: timbratura con GPS lontana dal cantiere → avviso all'ufficio
--   3. campo_squadra_oggi(): il capocantiere vede chi c'è oggi (le timbrature altrui
--      sono chiuse dalla RLS, quindi passa da una funzione SECURITY DEFINER)
--   4. orders.work_geocoded_at: la edge geocodifica-cantieri riempie work_lat/work_lng

-- ── 1. token push nativi ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.push_tokens (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id  uuid NULL,
  token       text NOT NULL,
  platform    text NOT NULL CHECK (platform IN ('ios', 'android')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, token)
);
ALTER TABLE public.push_tokens ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS push_tokens_own ON public.push_tokens;
CREATE POLICY push_tokens_own ON public.push_tokens
  FOR ALL TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.push_tokens TO authenticated;
CREATE INDEX IF NOT EXISTS push_tokens_user_idx ON public.push_tokens (user_id);

-- ── 4. geocodifica dei cantieri (tentativo registrato, così non si ricicla all'infinito) ──
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS work_geocoded_at timestamptz;

-- ── 2. geofence (helper col prefisso campo_: distanza_metri esiste già con altra firma) ───────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.campo_distanza_metri(lat1 double precision, lng1 double precision, lat2 double precision, lng2 double precision)
RETURNS double precision LANGUAGE sql IMMUTABLE AS $$
  SELECT 2 * 6371000 * asin(sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2) +
    cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)
  ))
$$;

CREATE OR REPLACE FUNCTION public.tg_campo_timbratura_geofence() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_lat double precision; v_lng double precision; v_code text; v_d double precision; v_nome text; r record;
BEGIN
  IF NEW.gps_lat IS NULL OR NEW.gps_lng IS NULL OR NEW.order_id IS NULL THEN RETURN NEW; END IF;
  SELECT o.work_lat, o.work_lng, o.order_code INTO v_lat, v_lng, v_code FROM public.orders o WHERE o.id = NEW.order_id;
  IF v_lat IS NULL OR v_lng IS NULL THEN RETURN NEW; END IF;
  v_d := public.campo_distanza_metri(NEW.gps_lat::double precision, NEW.gps_lng::double precision, v_lat, v_lng);
  -- 500 m: sotto è il cantiere (GPS del telefono, palazzi, parcheggio), sopra è un'altra cosa.
  IF v_d <= 500 THEN RETURN NEW; END IF;
  SELECT trim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')) INTO v_nome FROM public.profiles p WHERE p.id = NEW.user_id;
  FOR r IN
    SELECT p.id FROM public.profiles p JOIN public.user_roles ur ON ur.user_id = p.id
    WHERE p.company_id = NEW.company_id AND ur.role IN ('company_admin', 'company_staff')
  LOOP
    PERFORM public.campo_notifica(NEW.company_id, r.id, 'campo_geofence',
      'Timbratura lontana dal cantiere',
      coalesce(nullif(v_nome, ''), 'Un operaio') || ' ha timbrato l''' || NEW.tipo || ' a ' ||
        CASE WHEN v_d >= 1000 THEN round((v_d / 1000)::numeric, 1)::text || ' km' ELSE round(v_d)::text || ' m' END ||
        ' da ' || coalesce(v_code, 'un cantiere') || '.',
      'campo_timbratura', NEW.id, '/azienda/ordini/' || NEW.order_id::text);
  END LOOP;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_campo_timbratura_geofence ON public.campo_timbrature;
CREATE TRIGGER trg_campo_timbratura_geofence AFTER INSERT ON public.campo_timbrature
  FOR EACH ROW EXECUTE FUNCTION public.tg_campo_timbratura_geofence();

-- ── 3. squadra di oggi per il capocantiere ────────────────────────────────────
CREATE OR REPLACE FUNCTION public.campo_squadra_oggi(p_order_id uuid)
RETURNS TABLE (
  user_id uuid, nome text, ruolo text, is_capocantiere boolean,
  entrata timestamptz, uscita timestamptz, in_cantiere boolean, ore numeric, rapportino_inviato boolean
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_company uuid; v_me uuid := auth.uid(); v_oggi date := (now() AT TIME ZONE 'Europe/Rome')::date;
BEGIN
  SELECT o.company_id INTO v_company FROM public.orders o WHERE o.id = p_order_id;
  IF v_company IS NULL THEN RETURN; END IF;
  -- Chi può guardare: ufficio della stessa azienda, o capocantiere di QUESTO cantiere.
  IF NOT (
    EXISTS (SELECT 1 FROM public.profiles p JOIN public.user_roles ur ON ur.user_id = p.id
            WHERE p.id = v_me AND p.company_id = v_company AND ur.role IN ('company_admin', 'company_staff', 'super_admin'))
    OR EXISTS (SELECT 1 FROM public.order_campo_assignments a WHERE a.order_id = p_order_id AND a.user_id = v_me AND a.is_capocantiere)
  ) THEN
    RAISE EXCEPTION 'Solo il capocantiere o l''ufficio possono vedere la squadra' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH squadra AS (
    SELECT DISTINCT a.user_id, bool_or(a.is_capocantiere) AS capo, max(a.role_type) AS role_type
    FROM public.order_campo_assignments a WHERE a.order_id = p_order_id AND a.user_id IS NOT NULL
    GROUP BY a.user_id
  ),
  eventi AS (
    SELECT t.user_id, t.tipo, t.timestamp_evento
    FROM public.campo_timbrature t
    WHERE t.company_id = v_company AND (t.timestamp_evento AT TIME ZONE 'Europe/Rome')::date = v_oggi
      AND (t.order_id = p_order_id OR t.order_id IS NULL)
  ),
  agg AS (
    SELECT e.user_id,
           min(e.timestamp_evento) FILTER (WHERE e.tipo = 'entrata') AS entrata,
           max(e.timestamp_evento) FILTER (WHERE e.tipo = 'uscita')  AS uscita,
           (array_agg(e.tipo ORDER BY e.timestamp_evento DESC))[1] = 'entrata' AS dentro
    FROM eventi e GROUP BY e.user_id
  ),
  ore AS (
    -- coppie entrata→uscita in ordine; l'ultima entrata aperta conta fino ad adesso
    SELECT x.user_id, round((sum(extract(epoch from (coalesce(x.fine, now()) - x.inizio))) / 3600)::numeric, 1) AS ore
    FROM (
      SELECT e.user_id, e.timestamp_evento AS inizio,
             lead(e.timestamp_evento) OVER (PARTITION BY e.user_id ORDER BY e.timestamp_evento) AS fine,
             e.tipo
      FROM eventi e
    ) x WHERE x.tipo = 'entrata' GROUP BY x.user_id
  )
  SELECT s.user_id,
         trim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')) AS nome,
         CASE WHEN ur.role = 'subcontractor' THEN 'sub' ELSE 'dipendente' END AS ruolo,
         s.capo AS is_capocantiere,
         a.entrata, a.uscita, coalesce(a.dentro, false) AS in_cantiere, coalesce(o.ore, 0) AS ore,
         EXISTS (SELECT 1 FROM public.campo_rapportini cr WHERE cr.user_id = s.user_id AND cr.order_id = p_order_id AND cr.data_lavoro = v_oggi) AS rapportino_inviato
  FROM squadra s
  JOIN public.profiles p ON p.id = s.user_id
  LEFT JOIN LATERAL (SELECT ur2.role FROM public.user_roles ur2 WHERE ur2.user_id = s.user_id ORDER BY (ur2.role = 'subcontractor') DESC LIMIT 1) ur ON true
  LEFT JOIN agg a ON a.user_id = s.user_id
  LEFT JOIN ore o ON o.user_id = s.user_id
  ORDER BY s.capo DESC, nome;
END $$;
GRANT EXECUTE ON FUNCTION public.campo_squadra_oggi(uuid) TO authenticated;

-- ── cron geocodifica: 40 cantieri ogni 20 minuti (Nominatim: 1 richiesta al secondo) ──
DO $$
DECLARE j record; v_url text := 'https://rsbrguhkodgnqfomrevo.supabase.co/functions/v1/geocodifica-cantieri';
BEGIN
  FOR j IN SELECT jobid FROM cron.job WHERE jobname = 'campo-geocodifica-cantieri' LOOP PERFORM cron.unschedule(j.jobid); END LOOP;
  PERFORM cron.schedule('campo-geocodifica-cantieri', '*/20 * * * *',
    format($c$SELECT net.http_post(url := %L, headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'silvio_internal_cron_secret' LIMIT 1)), body := '{}'::jsonb, timeout_milliseconds := 60000)$c$, v_url));
END $$;
