-- ════════════════════════════════════════════════════════════════════════════
-- MP-SILVIO-SA-PROBLEMS-01 · SuperAdmin Problem Intelligence + Motore Pacchetti
-- ────────────────────────────────────────────────────────────────────────────
-- Cross-tenant, READ-ONLY, solo super_admin. Centralina che aggrega i problemi di
-- TUTTE le aziende da fonti ESISTENTI (silvio_alerts + sa_conversation_signals),
-- calcola un problem-score operativo e mappa ogni dolore al pacchetto AEDIX
-- (tabella configurabile). Fan-out in SQL deterministico (no LLM) chiamato dal cron.
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.sa_company_problems (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  area text NOT NULL,
  problema text NOT NULL,
  severita text NOT NULL CHECK (severita IN ('info','warning','critical')),
  fonte text NOT NULL,
  da_quanti_giorni int,
  dettaglio_anonimo text,
  rilevato_al timestamptz NOT NULL DEFAULT now(),
  UNIQUE(company_id, area, problema)
);
CREATE INDEX IF NOT EXISTS idx_sa_problems_company ON public.sa_company_problems (company_id, severita);
CREATE INDEX IF NOT EXISTS idx_sa_problems_area ON public.sa_company_problems (area);
ALTER TABLE public.sa_company_problems ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sa_problems_super ON public.sa_company_problems;
CREATE POLICY sa_problems_super ON public.sa_company_problems FOR SELECT TO authenticated USING (public.is_super_admin(auth.uid()));
DROP POLICY IF EXISTS sa_problems_service ON public.sa_company_problems;
CREATE POLICY sa_problems_service ON public.sa_company_problems FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.sa_problem_to_package (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  area text NOT NULL UNIQUE,
  pacchetto text NOT NULL,
  attivo boolean NOT NULL DEFAULT true,
  note text
);
ALTER TABLE public.sa_problem_to_package ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sa_pkg_super ON public.sa_problem_to_package;
CREATE POLICY sa_pkg_super ON public.sa_problem_to_package FOR SELECT TO authenticated USING (public.is_super_admin(auth.uid()));
DROP POLICY IF EXISTS sa_pkg_service ON public.sa_problem_to_package;
CREATE POLICY sa_pkg_service ON public.sa_problem_to_package FOR ALL TO service_role USING (true) WITH CHECK (true);

INSERT INTO public.sa_problem_to_package (area, pacchetto) VALUES
 ('finanza','Finanza / Cashflow (CG)'),('controllo_gestione','Controllo di Gestione'),
 ('marketing','Marketing Edile'),('vendita','Vendita / Sales OS'),('recruiting','Recruiting'),
 ('legale','Gestione Legale / TutelAI'),('operativo','Upgrade piano EiC / moduli'),
 ('tecnico','Supporto tecnico / integrazioni'),('prodotto','Upgrade piano EiC / moduli')
ON CONFLICT (area) DO NOTHING;

CREATE OR REPLACE FUNCTION public.sa_alert_type_to_area(p_alert_type text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN p_alert_type ILIKE '%payment%' OR p_alert_type ILIKE '%cashflow%' OR p_alert_type ILIKE '%overdue%' THEN 'finanza'
    WHEN p_alert_type ILIKE '%stock%' OR p_alert_type ILIKE '%magazz%' THEN 'operativo'
    WHEN p_alert_type ILIKE '%quote%' OR p_alert_type ILIKE '%preventiv%' THEN 'vendita'
    WHEN p_alert_type ILIKE '%hr%' OR p_alert_type ILIKE '%formazione%' OR p_alert_type ILIKE '%operai%' THEN 'recruiting'
    WHEN p_alert_type ILIKE '%durc%' OR p_alert_type ILIKE '%doc%' OR p_alert_type ILIKE '%compliance%' THEN 'legale'
    ELSE 'operativo' END;
$$;

CREATE OR REPLACE FUNCTION public.sa_signalarea_to_problemarea(p_area text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE p_area
    WHEN 'margini' THEN 'controllo_gestione' WHEN 'cashflow' THEN 'finanza' WHEN 'fatturazione' THEN 'finanza'
    WHEN 'vendita' THEN 'vendita' WHEN 'preventivi' THEN 'vendita' WHEN 'marketing' THEN 'marketing'
    WHEN 'hr' THEN 'recruiting' WHEN 'compliance' THEN 'legale'
    WHEN 'cantiere' THEN 'operativo' WHEN 'magazzino' THEN 'operativo' ELSE 'operativo' END;
$$;

-- fan-out per azienda (snapshot pulito da fonti esistenti)
CREATE OR REPLACE FUNCTION public.sa_aggregate_company_problems(p_company_id uuid)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF p_company_id IS NULL THEN RETURN 0; END IF;
  DELETE FROM public.sa_company_problems WHERE company_id = p_company_id;

  INSERT INTO public.sa_company_problems (company_id, area, problema, severita, fonte, da_quanti_giorni, dettaglio_anonimo)
  SELECT a.company_id, public.sa_alert_type_to_area(a.alert_type), left(a.title,160),
         CASE WHEN a.severity IN ('info','warning','critical') THEN a.severity ELSE 'warning' END,
         'silvio_alerts', GREATEST(0, (CURRENT_DATE - a.created_at::date)), left(a.message,200)
  FROM public.silvio_alerts a
  WHERE a.company_id = p_company_id AND a.status = 'open'
  ON CONFLICT (company_id, area, problema) DO NOTHING;

  INSERT INTO public.sa_company_problems (company_id, area, problema, severita, fonte, da_quanti_giorni, dettaglio_anonimo)
  SELECT s.company_id, m.area_p, 'Dolore dichiarato in chat: ' || m.area_p,
         CASE WHEN sum(s.peso) >= 5 THEN 'critical' WHEN sum(s.peso) >= 2 THEN 'warning' ELSE 'info' END,
         'conversation', GREATEST(0, (CURRENT_DATE - max(s.giorno))), max(s.esempio_anonimo)
  FROM public.sa_conversation_signals s
  CROSS JOIN LATERAL (SELECT public.sa_signalarea_to_problemarea(s.area) AS area_p) m
  WHERE s.company_id = p_company_id AND s.intento IN ('difficolta','lamentela') AND s.giorno > CURRENT_DATE - 90
  GROUP BY s.company_id, m.area_p
  ON CONFLICT (company_id, area, problema) DO NOTHING;

  RETURN (SELECT count(*) FROM public.sa_company_problems WHERE company_id = p_company_id);
END $$;

CREATE OR REPLACE FUNCTION public.sa_aggregate_all_problems()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE r record; v_tot int := 0; v_companies int := 0;
BEGIN
  FOR r IN SELECT id FROM public.companies WHERE status IN ('active','trial') LOOP
    v_tot := v_tot + public.sa_aggregate_company_problems(r.id);
    v_companies := v_companies + 1;
  END LOOP;
  RETURN jsonb_build_object('ok', true, 'companies', v_companies, 'problemi_totali', v_tot);
END $$;

CREATE OR REPLACE VIEW public.sa_company_problem_score AS
  SELECT company_id,
    LEAST(100, round(sum((CASE severita WHEN 'critical' THEN 25 WHEN 'warning' THEN 10 ELSE 3 END)
      * (1 + coalesce(da_quanti_giorni,0) / 30.0)))::int) AS problem_score,
    count(*)::int AS n_problemi,
    count(*) FILTER (WHERE severita = 'critical')::int AS n_critici
  FROM public.sa_company_problems GROUP BY company_id;

CREATE OR REPLACE FUNCTION public.sa_get_problem_radar(p_area text DEFAULT 'tutte', p_severita_min text DEFAULT 'warning', p_limite int DEFAULT 15)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v jsonb; v_min int;
BEGIN
  IF NOT public.is_super_admin(auth.uid()) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
  v_min := CASE p_severita_min WHEN 'critical' THEN 3 WHEN 'warning' THEN 2 ELSE 1 END;
  SELECT coalesce(jsonb_agg(r ORDER BY (r->>'problem_score')::int DESC), '[]'::jsonb) INTO v
  FROM (
    SELECT jsonb_build_object('company_id', co.id, 'azienda', co.name, 'problem_score', sc.problem_score,
      'n_problemi', sc.n_problemi, 'n_critici', sc.n_critici,
      'problemi', (SELECT coalesce(jsonb_agg(jsonb_build_object('area', p.area, 'problema', p.problema,
                       'severita', p.severita, 'da_giorni', p.da_quanti_giorni, 'pacchetto', pk.pacchetto)
                       ORDER BY CASE p.severita WHEN 'critical' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END), '[]'::jsonb)
                   FROM public.sa_company_problems p LEFT JOIN public.sa_problem_to_package pk ON pk.area = p.area AND pk.attivo
                   WHERE p.company_id = co.id AND (coalesce(p_area,'tutte') = 'tutte' OR p.area = p_area)
                     AND (CASE p.severita WHEN 'critical' THEN 3 WHEN 'warning' THEN 2 ELSE 1 END) >= v_min LIMIT 6)) AS r
    FROM public.sa_company_problem_score sc JOIN public.companies co ON co.id = sc.company_id
    WHERE EXISTS (SELECT 1 FROM public.sa_company_problems p2 WHERE p2.company_id = co.id
                  AND (coalesce(p_area,'tutte') = 'tutte' OR p2.area = p_area)
                  AND (CASE p2.severita WHEN 'critical' THEN 3 WHEN 'warning' THEN 2 ELSE 1 END) >= v_min)
    ORDER BY sc.problem_score DESC LIMIT GREATEST(coalesce(p_limite,15),1)
  ) q;
  RETURN v;
END $$;

CREATE OR REPLACE FUNCTION public.sa_get_company_dossier(p_company_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v jsonb;
BEGIN
  IF NOT public.is_super_admin(auth.uid()) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
  SELECT jsonb_build_object('company_id', co.id, 'azienda', co.name,
    'problem_score', coalesce(sc.problem_score,0), 'n_problemi', coalesce(sc.n_problemi,0), 'n_critici', coalesce(sc.n_critici,0),
    'top_problemi', (SELECT coalesce(jsonb_agg(jsonb_build_object('area', p.area, 'problema', p.problema, 'severita', p.severita,
                        'da_giorni', p.da_quanti_giorni, 'fonte', p.fonte, 'pacchetto', pk.pacchetto)
                        ORDER BY CASE p.severita WHEN 'critical' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END, p.da_quanti_giorni DESC), '[]'::jsonb)
                     FROM public.sa_company_problems p LEFT JOIN public.sa_problem_to_package pk ON pk.area = p.area AND pk.attivo
                     WHERE p.company_id = co.id LIMIT 3),
    'pacchetti_consigliati', (SELECT coalesce(jsonb_agg(DISTINCT pk.pacchetto), '[]'::jsonb)
                     FROM public.sa_company_problems p JOIN public.sa_problem_to_package pk ON pk.area = p.area AND pk.attivo WHERE p.company_id = co.id),
    'intel', (SELECT to_jsonb(i) FROM public.sa_company_intel i WHERE i.company_id = co.id)
  ) INTO v
  FROM public.companies co LEFT JOIN public.sa_company_problem_score sc ON sc.company_id = co.id
  WHERE co.id = p_company_id;
  RETURN coalesce(v, jsonb_build_object('error','azienda non trovata'));
END $$;

CREATE OR REPLACE FUNCTION public.sa_get_pipeline_per_pacchetto()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v jsonb;
BEGIN
  IF NOT public.is_super_admin(auth.uid()) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('pacchetto', pacchetto, 'aziende_candidate', n) ORDER BY n DESC), '[]'::jsonb) INTO v
  FROM (SELECT pk.pacchetto, count(DISTINCT p.company_id)::int AS n
        FROM public.sa_company_problems p JOIN public.sa_problem_to_package pk ON pk.area = p.area AND pk.attivo
        GROUP BY pk.pacchetto) t;
  RETURN v;
END $$;

REVOKE EXECUTE ON FUNCTION public.sa_get_problem_radar(text,text,int) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.sa_get_company_dossier(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.sa_get_pipeline_per_pacchetto() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sa_get_problem_radar(text,text,int) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.sa_get_company_dossier(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.sa_get_pipeline_per_pacchetto() TO authenticated, service_role;

DO $$ BEGIN PERFORM cron.unschedule('sa-problems-aggregate-daily'); EXCEPTION WHEN OTHERS THEN NULL; END $$;
SELECT cron.schedule('sa-problems-aggregate-daily', '45 3 * * *', $$ SELECT public.sa_aggregate_all_problems(); $$);

COMMENT ON TABLE public.sa_company_problems IS 'MP-SA-PROBLEMS-01: problemi cross-tenant aggregati da fonti esistenti (RLS super_admin).';
