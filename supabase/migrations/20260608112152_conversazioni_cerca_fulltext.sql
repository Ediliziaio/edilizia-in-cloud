-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.

CREATE OR REPLACE FUNCTION public.conversazioni_cerca(p_company_id uuid, p_query text)
RETURNS TABLE (entita_tipo text, entita_id uuid, snippet text, match_ts timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT (public.is_super_admin() OR p_company_id = public.get_user_company_id(auth.uid())) THEN
    RAISE EXCEPTION 'Accesso negato' USING ERRCODE = '42501';
  END IF;
  IF length(COALESCE(trim(p_query), '')) < 2 THEN
    RETURN;
  END IF;

  RETURN QUERY
    SELECT DISTINCT ON (m.entita_tipo, m.entita_id)
           m.entita_tipo,
           m.entita_id,
           left(m.testo, 160) AS snippet,
           m.ts               AS match_ts
    FROM public.v_conversazioni_messaggi m
    WHERE m.company_id = p_company_id
      AND m.testo ILIKE '%' || trim(p_query) || '%'
    ORDER BY m.entita_tipo, m.entita_id, m.ts DESC
    LIMIT 100;
END;
$$;

REVOKE ALL ON FUNCTION public.conversazioni_cerca(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.conversazioni_cerca(uuid, text) TO authenticated;
