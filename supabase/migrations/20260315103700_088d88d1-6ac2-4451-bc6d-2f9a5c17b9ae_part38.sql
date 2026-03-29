-- 9. RPC stats
CREATE OR REPLACE FUNCTION get_ai_company_stats(p_company_id UUID, p_giorni INTEGER DEFAULT 30)
RETURNS TABLE(
  agenti_attivi BIGINT,
  conv_totali BIGINT,
  minuti_totali FLOAT,
  chat_totali BIGINT,
  tasso_risposta FLOAT,
  crediti_usati FLOAT
)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    (SELECT COUNT(*) FROM ai_agents_v2 WHERE company_id = p_company_id AND stato = 'attivo'),
    (SELECT COUNT(*) FROM ai_conversations_v2 WHERE company_id = p_company_id
      AND creato_il >= NOW() - (p_giorni || ' days')::interval),
    (SELECT COALESCE(SUM(durata_secondi), 0)::FLOAT / 60.0 FROM ai_conversations_v2
      WHERE company_id = p_company_id AND creato_il >= NOW() - (p_giorni || ' days')::interval),
    (SELECT COUNT(*) FROM ai_conversations_v2 WHERE company_id = p_company_id
      AND canale IN ('chat','whatsapp') AND creato_il >= NOW() - (p_giorni || ' days')::interval),
    (SELECT CASE WHEN COUNT(*) = 0 THEN 0::FLOAT
      ELSE COUNT(*) FILTER (WHERE stato = 'completata')::FLOAT / COUNT(*)::FLOAT * 100
      END FROM ai_conversations_v2
      WHERE company_id = p_company_id AND direzione = 'outbound'
        AND creato_il >= NOW() - (p_giorni || ' days')::interval),
    (SELECT COALESCE(SUM(costo_crediti), 0)::FLOAT FROM ai_conversations_v2
      WHERE company_id = p_company_id AND creato_il >= NOW() - (p_giorni || ' days')::interval);
END;
$$;
