-- Route Optimization — pianificazione percorsi operai cross-cantiere
-- ════════════════════════════════════════════════════════════════════════════
-- Schema per planning quotidiano: operai partono da casa/depot, visitano N
-- cantieri, tornano. Algoritmo nearest-neighbor TSP + Google Distance Matrix.
-- ════════════════════════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────────────────────────────
-- 1. Punti di interesse geografici (cantieri, depot, casa operai)
-- Cache geocoding per evitare chiamate ripetute
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.geocoded_locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,

  reference_type text NOT NULL CHECK (reference_type IN ('cantiere', 'depot', 'employee_home', 'customer', 'supplier')),
  reference_id uuid,

  full_address text NOT NULL,
  normalized_address text,
  lat numeric(10,7),
  lng numeric(10,7),

  geocoded_at timestamptz DEFAULT now(),
  geocoder_source text,        -- 'google', 'osm_nominatim', 'manual'
  metadata jsonb DEFAULT '{}'::jsonb,

  CONSTRAINT uq_geocoded_ref UNIQUE (company_id, reference_type, reference_id)
);

CREATE INDEX IF NOT EXISTS idx_geocoded_company_type
  ON public.geocoded_locations(company_id, reference_type);
CREATE INDEX IF NOT EXISTS idx_geocoded_latlng
  ON public.geocoded_locations(lat, lng) WHERE lat IS NOT NULL;

ALTER TABLE public.geocoded_locations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS geocoded_company ON public.geocoded_locations;
CREATE POLICY geocoded_company ON public.geocoded_locations
  FOR ALL USING (company_id = public.get_my_company_id());

-- ────────────────────────────────────────────────────────────────────────────
-- 2. Distance matrix cache (evita chiamate ripetute Google Maps)
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.distance_matrix_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  origin_location_id uuid NOT NULL REFERENCES public.geocoded_locations(id) ON DELETE CASCADE,
  destination_location_id uuid NOT NULL REFERENCES public.geocoded_locations(id) ON DELETE CASCADE,

  distance_meters int,
  duration_seconds int,
  duration_traffic_seconds int,
  source text DEFAULT 'google_distance_matrix',

  computed_at timestamptz DEFAULT now(),
  expires_at timestamptz DEFAULT now() + interval '30 days',

  CONSTRAINT uq_distance_pair UNIQUE (origin_location_id, destination_location_id)
);

CREATE INDEX IF NOT EXISTS idx_distance_origin
  ON public.distance_matrix_cache(origin_location_id);

ALTER TABLE public.distance_matrix_cache ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS distance_cache_read ON public.distance_matrix_cache;
CREATE POLICY distance_cache_read ON public.distance_matrix_cache
  FOR SELECT USING (true);  -- usable cross-company per ottimizzazione cache

-- ────────────────────────────────────────────────────────────────────────────
-- 3. Route plans (piani di percorso giornalieri)
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.route_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,

  plan_date date NOT NULL,
  employee_id uuid REFERENCES public.employees(id) ON DELETE SET NULL,

  -- Punto partenza/arrivo
  start_location_id uuid REFERENCES public.geocoded_locations(id),
  end_location_id uuid REFERENCES public.geocoded_locations(id),

  -- Ordered list di stop (cantieri/clienti)
  stops jsonb DEFAULT '[]'::jsonb,
  -- Schema stop:
  -- [{ "location_id": uuid, "reference_type": "cantiere", "reference_id": uuid,
  --    "estimated_arrival": "08:30", "estimated_departure": "10:00",
  --    "stop_duration_min": 90, "address": "..." }]

  total_distance_km numeric(8,2),
  total_duration_min int,
  total_drive_time_min int,
  total_work_time_min int,

  optimization_strategy text DEFAULT 'nearest_neighbor'
    CHECK (optimization_strategy IN ('nearest_neighbor', 'manual', 'ai_optimized')),

  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'approved', 'in_progress', 'completed', 'cancelled')),

  notes text,
  ai_suggestions jsonb DEFAULT '[]'::jsonb,

  created_at timestamptz DEFAULT now(),
  created_by uuid,
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT uq_route_plan_employee_date UNIQUE (company_id, employee_id, plan_date)
);

CREATE INDEX IF NOT EXISTS idx_route_plans_company_date
  ON public.route_plans(company_id, plan_date DESC);
CREATE INDEX IF NOT EXISTS idx_route_plans_employee
  ON public.route_plans(employee_id, plan_date DESC) WHERE employee_id IS NOT NULL;

ALTER TABLE public.route_plans ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS route_plans_company ON public.route_plans;
CREATE POLICY route_plans_company ON public.route_plans
  FOR ALL USING (company_id = public.get_my_company_id());

-- ────────────────────────────────────────────────────────────────────────────
-- 4. RPC: silvio_tool_optimize_route_nearest_neighbor
-- Algoritmo TSP semplice: parte dal punto più vicino al primo stop, poi
-- via via il più vicino al precedente. NON ottimo ma efficace per <15 stops.
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.silvio_tool_optimize_route_nearest_neighbor(
  p_company_id uuid,
  p_start_location_id uuid,
  p_stop_location_ids uuid[],
  p_end_location_id uuid DEFAULT NULL,
  p_default_stop_min int DEFAULT 60
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_remaining uuid[];
  v_route uuid[];
  v_current uuid;
  v_next uuid;
  v_next_dist int;
  v_total_meters int := 0;
  v_total_seconds int := 0;
  v_stops jsonb := '[]'::jsonb;
  v_loc record;
  v_idx int := 0;
  v_arrival_seconds int := 8 * 3600;  -- partenza 08:00
BEGIN
  v_remaining := p_stop_location_ids;
  v_current := p_start_location_id;

  WHILE array_length(v_remaining, 1) > 0 LOOP
    -- Trova il prossimo stop più vicino al current
    SELECT origin_id, dist INTO v_next, v_next_dist
    FROM (
      SELECT
        unnest(v_remaining) AS origin_id,
        COALESCE(
          (SELECT distance_meters FROM public.distance_matrix_cache c
           WHERE c.origin_location_id = v_current AND c.destination_location_id = unnest(v_remaining)
           LIMIT 1),
          999999999  -- valore alto se cache miss → finirà ultimo
        ) AS dist
    ) ranked
    ORDER BY dist
    LIMIT 1;

    v_route := array_append(v_route, v_next);
    v_remaining := array_remove(v_remaining, v_next);

    -- Look up duration
    SELECT distance_meters, COALESCE(duration_traffic_seconds, duration_seconds) INTO v_next_dist
    FROM public.distance_matrix_cache
    WHERE origin_location_id = v_current AND destination_location_id = v_next
    LIMIT 1;

    v_total_meters := v_total_meters + COALESCE(v_next_dist, 0);
    -- Aggiungo durata viaggio + sosta cantiere
    SELECT * INTO v_loc FROM public.geocoded_locations WHERE id = v_next;

    v_arrival_seconds := v_arrival_seconds + COALESCE(v_next_dist, 600);  -- fallback 10 min
    v_stops := v_stops || jsonb_build_array(jsonb_build_object(
      'order', v_idx + 1,
      'location_id', v_next,
      'reference_type', v_loc.reference_type,
      'reference_id', v_loc.reference_id,
      'address', v_loc.full_address,
      'lat', v_loc.lat,
      'lng', v_loc.lng,
      'estimated_arrival', to_char(make_interval(secs => v_arrival_seconds), 'HH24:MI'),
      'stop_duration_min', p_default_stop_min,
      'estimated_departure', to_char(
        make_interval(secs => v_arrival_seconds + p_default_stop_min * 60),
        'HH24:MI'
      )
    ));

    v_arrival_seconds := v_arrival_seconds + p_default_stop_min * 60;
    v_total_seconds := v_total_seconds + p_default_stop_min * 60 + COALESCE(v_next_dist, 600);
    v_current := v_next;
    v_idx := v_idx + 1;
  END LOOP;

  -- Tratta finale: ritorno al end_location se diverso
  IF p_end_location_id IS NOT NULL AND p_end_location_id <> v_current THEN
    SELECT distance_meters, COALESCE(duration_traffic_seconds, duration_seconds) INTO v_next_dist
    FROM public.distance_matrix_cache
    WHERE origin_location_id = v_current AND destination_location_id = p_end_location_id
    LIMIT 1;

    v_total_meters := v_total_meters + COALESCE(v_next_dist, 0);
    v_total_seconds := v_total_seconds + COALESCE(v_next_dist, 0);
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'route_order', to_jsonb(v_route),
    'stops', v_stops,
    'total_distance_km', round(v_total_meters / 1000.0, 2),
    'total_duration_min', round(v_total_seconds / 60.0),
    'cache_hits', (SELECT count(*) FROM public.distance_matrix_cache c
                   WHERE c.origin_location_id = ANY(v_route) OR c.destination_location_id = ANY(v_route))
  );
END $$;

GRANT EXECUTE ON FUNCTION public.silvio_tool_optimize_route_nearest_neighbor(uuid, uuid, uuid[], uuid, int) TO authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- 5. RPC: silvio_tool_save_route_plan
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.silvio_tool_save_route_plan(
  p_company_id uuid,
  p_plan_date date,
  p_employee_id uuid,
  p_start_location_id uuid,
  p_end_location_id uuid,
  p_stops jsonb,
  p_total_distance_km numeric,
  p_total_duration_min int,
  p_strategy text DEFAULT 'nearest_neighbor'
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_id uuid;
BEGIN
  INSERT INTO public.route_plans(
    company_id, plan_date, employee_id, start_location_id, end_location_id,
    stops, total_distance_km, total_duration_min,
    optimization_strategy, status, created_by
  )
  VALUES (
    p_company_id, p_plan_date, p_employee_id, p_start_location_id, p_end_location_id,
    p_stops, p_total_distance_km, p_total_duration_min,
    p_strategy, 'draft', auth.uid()
  )
  ON CONFLICT (company_id, employee_id, plan_date) DO UPDATE SET
    stops = EXCLUDED.stops,
    start_location_id = EXCLUDED.start_location_id,
    end_location_id = EXCLUDED.end_location_id,
    total_distance_km = EXCLUDED.total_distance_km,
    total_duration_min = EXCLUDED.total_duration_min,
    optimization_strategy = EXCLUDED.optimization_strategy,
    updated_at = now()
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('ok', true, 'route_plan_id', v_id);
END $$;

GRANT EXECUTE ON FUNCTION public.silvio_tool_save_route_plan(uuid, date, uuid, uuid, uuid, jsonb, numeric, int, text) TO authenticated;

DO $$ BEGIN RAISE NOTICE 'Route optimization schema + nearest-neighbor TSP RPC ready'; END $$;
