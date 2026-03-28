-- RPC: get_automation_log_recent
CREATE OR REPLACE FUNCTION public.get_automation_log_recent(p_company_id UUID, p_limit INTEGER DEFAULT 20)
RETURNS TABLE(
  log_id UUID, rule_id UUID, rule_nome TEXT, categoria TEXT,
  esito TEXT, errore_msg TEXT, durata_ms INTEGER, created_at TIMESTAMPTZ
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    al.id, al.rule_id, ar.nome, ar.categoria,
    al.esito, al.errore_msg, al.durata_ms, al.created_at
  FROM public.automation_log al
  JOIN public.automation_rules ar ON ar.id = al.rule_id
  WHERE ar.company_id = p_company_id
  ORDER BY al.created_at DESC
  LIMIT p_limit;
$$;
