-- Stato per la strategia round-robin dell'azione assegna_agente: per (flow_id,node_id)
-- tiene l'ultimo indice usato. Accesso solo via service_role (edge fn) / RPC definer.
-- Applicata in prod via MCP il 2026-06-30. Usata da process-automation case assign_user.
CREATE TABLE IF NOT EXISTS public.automation_assign_state (
  flow_id    uuid NOT NULL,
  node_id    uuid NOT NULL,
  last_index int  NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (flow_id, node_id)
);
ALTER TABLE public.automation_assign_state ENABLE ROW LEVEL SECURITY;
-- nessuna policy: anon/authenticated negati; service_role bypassa RLS.

-- Rotazione atomica: ritorna l'indice (0-based) del prossimo agente nel giro.
-- Prima chiamata -> 0; successive -> (last+1) % n.
CREATE OR REPLACE FUNCTION public.automation_assign_next(p_flow_id uuid, p_node_id uuid, p_n int)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_idx int;
  v_n   int := GREATEST(p_n, 1);
BEGIN
  INSERT INTO public.automation_assign_state (flow_id, node_id, last_index)
  VALUES (p_flow_id, p_node_id, 0)
  ON CONFLICT (flow_id, node_id)
  DO UPDATE SET last_index = (public.automation_assign_state.last_index + 1) % v_n,
                updated_at = now()
  RETURNING last_index INTO v_idx;
  RETURN v_idx;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.automation_assign_next(uuid, uuid, int) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.automation_assign_next(uuid, uuid, int) TO service_role;
