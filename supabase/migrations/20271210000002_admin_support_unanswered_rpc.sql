-- ============================================================================
-- RPC admin_support_last_message_by_company — ultimo messaggio per ogni
-- conversazione di supporto ATTIVA (open/in_progress/pending).
--
-- Perché: il tab Assistenza calcolava "da rispondere" incrociando le
-- conversazioni attive con gli ULTIMI 2000 messaggi globali. Una conversazione
-- attiva il cui ultimo messaggio era più vecchio della finestra spariva dal
-- conteggio → badge "da rispondere" sottostimato e response rate gonfiato
-- proprio per i ticket più vecchi (i peggiori). DISTINCT ON per-company
-- risolve senza finestre arbitrarie.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.admin_support_last_message_by_company()
RETURNS TABLE(company_id uuid, sender_role text, created_at timestamptz)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT DISTINCT ON (m.company_id)
    m.company_id,
    m.sender_role,
    m.created_at
  FROM public.support_messages m
  WHERE public.has_role(auth.uid(), 'super_admin'::public.app_role)
    AND EXISTS (
      SELECT 1 FROM public.support_conversations c
      WHERE c.company_id = m.company_id
        AND c.status IN ('open', 'in_progress', 'pending')
    )
  ORDER BY m.company_id, m.created_at DESC;
$$;

GRANT EXECUTE ON FUNCTION public.admin_support_last_message_by_company() TO authenticated;

COMMENT ON FUNCTION public.admin_support_last_message_by_company() IS
  'Ultimo messaggio per ogni conversazione supporto attiva (solo super_admin: has_role nel WHERE — per gli altri ritorna 0 righe).';
