
CREATE OR REPLACE FUNCTION public.increment_agent_stats(
  p_agent_id UUID,
  p_chiamate INT DEFAULT 0,
  p_chiamate_completate INT DEFAULT 0,
  p_minuti NUMERIC DEFAULT 0,
  p_chat INT DEFAULT 0,
  p_costo NUMERIC DEFAULT 0
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE ai_agents_v2
  SET
    chiamate_totali = chiamate_totali + p_chiamate,
    chiamate_completate = chiamate_completate + p_chiamate_completate,
    minuti_totali = minuti_totali + p_minuti,
    chat_totali = chat_totali + p_chat,
    costo_totale_crediti = costo_totale_crediti + p_costo,
    aggiornato_il = now()
  WHERE id = p_agent_id;
END;
$$;
