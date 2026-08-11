-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.

CREATE OR REPLACE FUNCTION public.conversazioni_lista(p_company_id uuid)
RETURNS TABLE (
  entita_tipo text, entita_id uuid, nome text, email text, telefono text,
  ultimo_ts timestamptz, ultimo_canale text, ultimo_direzione text, anteprima text,
  non_letti bigint, totale_messaggi bigint, stato text, assegnato_a uuid
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.conversazioni_puo_accedere(p_company_id) THEN
    RAISE EXCEPTION 'Accesso negato' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH msg AS (
    SELECT * FROM public.v_conversazioni_messaggi WHERE company_id = p_company_id
  ),
  ultimo AS (
    SELECT DISTINCT ON (m.entita_tipo, m.entita_id)
           m.entita_tipo, m.entita_id, m.ts, m.canale, m.direzione, m.testo
    FROM msg m
    ORDER BY m.entita_tipo, m.entita_id, m.ts DESC
  ),
  agg AS (
    SELECT m.entita_tipo, m.entita_id, count(*) AS tot, max(m.ts) AS last_ts
    FROM msg m GROUP BY m.entita_tipo, m.entita_id
  )
  SELECT
    a.entita_tipo,
    a.entita_id,
    CASE a.entita_tipo
      WHEN 'contatto' THEN (SELECT NULLIF(trim(COALESCE(mc.first_name,'')||' '||COALESCE(mc.last_name,'')), '') FROM public.marketing_contacts mc WHERE mc.id = a.entita_id)
      WHEN 'cliente'  THEN (SELECT NULLIF(trim(COALESCE(pr.first_name,'')||' '||COALESCE(pr.last_name,'')), '') FROM public.profiles pr WHERE pr.id = a.entita_id)
    END,
    CASE a.entita_tipo
      WHEN 'contatto' THEN (SELECT mc.email FROM public.marketing_contacts mc WHERE mc.id = a.entita_id)
      WHEN 'cliente'  THEN (SELECT pr.email FROM public.profiles pr WHERE pr.id = a.entita_id)
    END,
    CASE a.entita_tipo
      WHEN 'contatto' THEN (SELECT mc.phone FROM public.marketing_contacts mc WHERE mc.id = a.entita_id)
      WHEN 'cliente'  THEN (SELECT pr.phone FROM public.profiles pr WHERE pr.id = a.entita_id)
    END,
    a.last_ts, u.canale, u.direzione, left(u.testo, 140),
    COALESCE(nl.n, 0)::bigint, a.tot::bigint,
    COALESCE(cv.stato, 'aperta'), cv.assegnato_a
  FROM agg a
  JOIN ultimo u ON u.entita_tipo = a.entita_tipo AND u.entita_id = a.entita_id
  LEFT JOIN public.conversazioni cv
         ON cv.company_id = p_company_id AND cv.entita_tipo = a.entita_tipo AND cv.entita_id = a.entita_id
  LEFT JOIN LATERAL (
    SELECT count(*) AS n FROM msg m2
    WHERE m2.entita_tipo = a.entita_tipo AND m2.entita_id = a.entita_id
      AND m2.direzione = 'in'
      AND m2.ts > COALESCE(cv.last_read_at, '-infinity'::timestamptz)
  ) nl ON true
  ORDER BY a.last_ts DESC;
END;
$$;
