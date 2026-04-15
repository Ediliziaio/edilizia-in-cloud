-- ════════════════════════════════════════════════════════════════════════════
-- set_default_dashboard
-- Imposta una dashboard come "default" per l'utente corrente.
-- Rimuove automaticamente il flag da qualsiasi altra dashboard dell'utente.
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.set_default_dashboard(p_dashboard_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id uuid;
BEGIN
  -- Verifica proprietà
  SELECT company_id INTO v_company_id
  FROM public.dashboards
  WHERE id = p_dashboard_id
    AND owner_id = auth.uid();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Dashboard non trovata o non autorizzato';
  END IF;

  -- Rimuovi il flag default da tutte le dashboard dell'utente
  UPDATE public.dashboards
  SET is_default = false
  WHERE owner_id = auth.uid()
    AND is_default = true
    AND id != p_dashboard_id;

  -- Imposta il nuovo default
  UPDATE public.dashboards
  SET is_default = true
  WHERE id = p_dashboard_id
    AND owner_id = auth.uid();
END;
$$;

REVOKE ALL ON FUNCTION public.set_default_dashboard(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_default_dashboard(uuid) TO authenticated;
