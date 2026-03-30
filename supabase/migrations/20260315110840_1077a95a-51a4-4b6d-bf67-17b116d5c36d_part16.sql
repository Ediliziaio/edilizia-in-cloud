-- 6. RPC get_ai_analytics
DROP FUNCTION IF EXISTS public.get_ai_analytics(uuid, int) CASCADE;
CREATE OR REPLACE FUNCTION public.get_ai_analytics(
  p_company_id uuid,
  p_giorni int DEFAULT 30
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_from timestamptz := now() - (p_giorni || ' days')::interval;
  v_calls jsonb;
  v_chats jsonb;
  v_agents jsonb;
  v_credits jsonb;
  v_daily_calls jsonb;
  v_daily_chats jsonb;
BEGIN
  -- Call stats from ai_conversations_v2
  SELECT jsonb_build_object(
    'totali', COUNT(*),
    'completate', COUNT(*) FILTER (WHERE stato = 'completata'),
    'durata_media_sec', COALESCE(AVG(durata_secondi), 0),
    'tasso_risposta', CASE WHEN COUNT(*) > 0 THEN ROUND((COUNT(*) FILTER (WHERE stato = 'completata'))::numeric / COUNT(*) * 100, 1) ELSE 0 END
  ) INTO v_calls
  FROM ai_conversations_v2
  WHERE company_id = p_company_id AND creato_il >= v_from;

  -- Chat stats from ai_chat_sessions
  SELECT jsonb_build_object(
    'totali', COUNT(*),
    'messaggi_totali', COALESCE(SUM(messaggi_totali), 0),
    'durata_media_sec', COALESCE(AVG(durata_secondi), 0)
  ) INTO v_chats
  FROM ai_chat_sessions
  WHERE company_id = p_company_id AND iniziata_il >= v_from;

  -- Agent distribution
  SELECT COALESCE(jsonb_agg(jsonb_build_object('tipo', tipo, 'count', cnt)), '[]'::jsonb) INTO v_agents
  FROM (
    SELECT tipo, COUNT(*) as cnt FROM ai_agents_v2
    WHERE company_id = p_company_id AND stato = 'attivo'
    GROUP BY tipo
  ) sub;

  -- Credit consumption
  SELECT jsonb_build_object(
    'totale_consumato', COALESCE(SUM(ABS(crediti)), 0),
    'transazioni', COUNT(*)
  ) INTO v_credits
  FROM ai_credit_transactions
  WHERE company_id = p_company_id AND creato_il >= v_from AND tipo = 'consumo';

  -- Daily call series (last N days)
  SELECT COALESCE(jsonb_agg(jsonb_build_object('data', d, 'count', cnt) ORDER BY d), '[]'::jsonb) INTO v_daily_calls
  FROM (
    SELECT DATE(creato_il) as d, COUNT(*) as cnt
    FROM ai_conversations_v2
    WHERE company_id = p_company_id AND creato_il >= v_from
    GROUP BY DATE(creato_il)
  ) sub;

  -- Daily chat series
  SELECT COALESCE(jsonb_agg(jsonb_build_object('data', d, 'count', cnt) ORDER BY d), '[]'::jsonb) INTO v_daily_chats
  FROM (
    SELECT DATE(iniziata_il) as d, COUNT(*) as cnt
    FROM ai_chat_sessions
    WHERE company_id = p_company_id AND iniziata_il >= v_from
    GROUP BY DATE(iniziata_il)
  ) sub;

  RETURN jsonb_build_object(
    'chiamate', v_calls,
    'chat', v_chats,
    'agenti', v_agents,
    'crediti', v_credits,
    'serie_chiamate', v_daily_calls,
    'serie_chat', v_daily_chats
  );
END;
$$;
