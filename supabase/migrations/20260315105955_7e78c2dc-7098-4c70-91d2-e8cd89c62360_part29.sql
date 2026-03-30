DROP FUNCTION IF EXISTS public.get_agent_chat_stats(uuid) CASCADE;
CREATE OR REPLACE FUNCTION public.get_agent_chat_stats(p_agent_id uuid)
RETURNS TABLE(
  sessioni_totali bigint,
  messaggi_totali bigint,
  durata_media_secondi numeric,
  sessioni_attive bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    COUNT(*) AS sessioni_totali,
    COALESCE(SUM(messaggi_totali), 0) AS messaggi_totali,
    COALESCE(AVG(durata_secondi), 0) AS durata_media_secondi,
    COUNT(*) FILTER (WHERE stato = 'attiva') AS sessioni_attive
  FROM public.ai_chat_sessions
  WHERE agent_id = p_agent_id;
$$;
