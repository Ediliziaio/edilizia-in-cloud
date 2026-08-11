-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.

CREATE OR REPLACE FUNCTION public.conversazioni_puo_accedere(p_company_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT public.is_super_admin()
      OR p_company_id = public.get_user_company_id(auth.uid())
      OR EXISTS (
           SELECT 1 FROM public.multi_company_access mca
           WHERE mca.user_id = auth.uid() AND mca.company_id = p_company_id
         );
$$;
GRANT EXECUTE ON FUNCTION public.conversazioni_puo_accedere(uuid) TO authenticated;

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
      WHEN 'cliente'  THEN (SELECT NULLIF(trim(COALESCE(p.first_name,'')||' '||COALESCE(p.last_name,'')), '') FROM public.profiles p WHERE p.id = a.entita_id)
    END,
    CASE a.entita_tipo
      WHEN 'contatto' THEN (SELECT email FROM public.marketing_contacts WHERE id = a.entita_id)
      WHEN 'cliente'  THEN (SELECT email FROM public.profiles WHERE id = a.entita_id)
    END,
    CASE a.entita_tipo
      WHEN 'contatto' THEN (SELECT phone FROM public.marketing_contacts WHERE id = a.entita_id)
      WHEN 'cliente'  THEN (SELECT phone FROM public.profiles WHERE id = a.entita_id)
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

CREATE OR REPLACE FUNCTION public.conversazione_timeline(p_entita_tipo text, p_entita_id uuid)
RETURNS TABLE (
  canale text, direzione text, controparte text, oggetto text,
  testo text, media_url text, ts timestamptz, ref_tabella text, ref_id uuid
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_company uuid;
BEGIN
  IF p_entita_tipo = 'contatto' THEN
    SELECT company_id INTO v_company FROM public.marketing_contacts WHERE id = p_entita_id;
  ELSIF p_entita_tipo = 'cliente' THEN
    SELECT company_id INTO v_company FROM public.profiles WHERE id = p_entita_id;
  ELSE
    RAISE EXCEPTION 'entita_tipo non valido: %', p_entita_tipo USING ERRCODE = '22023';
  END IF;

  IF v_company IS NULL THEN RETURN; END IF;
  IF NOT public.conversazioni_puo_accedere(v_company) THEN
    RAISE EXCEPTION 'Accesso negato alla conversazione' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
    SELECT m.canale, m.direzione, m.controparte, m.oggetto,
           m.testo, m.media_url, m.ts, m.ref_tabella, m.ref_id
    FROM public.v_conversazioni_messaggi m
    WHERE m.entita_tipo = p_entita_tipo AND m.entita_id = p_entita_id
    ORDER BY m.ts ASC;
END;
$$;

CREATE OR REPLACE FUNCTION public.conversazioni_cerca(p_company_id uuid, p_query text)
RETURNS TABLE (entita_tipo text, entita_id uuid, snippet text, match_ts timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.conversazioni_puo_accedere(p_company_id) THEN
    RAISE EXCEPTION 'Accesso negato' USING ERRCODE = '42501';
  END IF;
  IF length(COALESCE(trim(p_query), '')) < 2 THEN
    RETURN;
  END IF;

  RETURN QUERY
    SELECT DISTINCT ON (m.entita_tipo, m.entita_id)
           m.entita_tipo, m.entita_id, left(m.testo, 160) AS snippet, m.ts AS match_ts
    FROM public.v_conversazioni_messaggi m
    WHERE m.company_id = p_company_id
      AND m.testo ILIKE '%' || trim(p_query) || '%'
    ORDER BY m.entita_tipo, m.entita_id, m.ts DESC
    LIMIT 100;
END;
$$;
