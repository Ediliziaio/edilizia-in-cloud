-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.

CREATE OR REPLACE FUNCTION public.sa_aggregate_company_problems(p_company_id uuid)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF p_company_id IS NULL THEN RETURN 0; END IF;
  DELETE FROM public.sa_company_problems WHERE company_id = p_company_id;

  -- fonte 1: silvio_alerts open
  INSERT INTO public.sa_company_problems (company_id, area, problema, severita, fonte, da_quanti_giorni, dettaglio_anonimo)
  SELECT a.company_id, public.sa_alert_type_to_area(a.alert_type), left(a.title,160),
         CASE WHEN a.severity IN ('info','warning','critical') THEN a.severity ELSE 'warning' END,
         'silvio_alerts', GREATEST(0, (CURRENT_DATE - a.created_at::date)), left(a.message,200)
  FROM public.silvio_alerts a
  WHERE a.company_id = p_company_id AND a.status = 'open'
  ON CONFLICT (company_id, area, problema) DO NOTHING;

  -- fonte 2: segnali conversazione (difficolta/lamentela, ultimi 90gg), per area-problema mappata
  INSERT INTO public.sa_company_problems (company_id, area, problema, severita, fonte, da_quanti_giorni, dettaglio_anonimo)
  SELECT s.company_id, m.area_p,
         'Dolore dichiarato in chat: ' || m.area_p,
         CASE WHEN sum(s.peso) >= 5 THEN 'critical' WHEN sum(s.peso) >= 2 THEN 'warning' ELSE 'info' END,
         'conversation', GREATEST(0, (CURRENT_DATE - max(s.giorno))), max(s.esempio_anonimo)
  FROM public.sa_conversation_signals s
  CROSS JOIN LATERAL (SELECT public.sa_signalarea_to_problemarea(s.area) AS area_p) m
  WHERE s.company_id = p_company_id AND s.intento IN ('difficolta','lamentela') AND s.giorno > CURRENT_DATE - 90
  GROUP BY s.company_id, m.area_p
  ON CONFLICT (company_id, area, problema) DO NOTHING;

  RETURN (SELECT count(*) FROM public.sa_company_problems WHERE company_id = p_company_id);
END $$;
