-- admin_ai_usage_aggregato — consumi AI aggregati nel DB per la scheda
-- «Consumi e costi» (/admin/ai?section=monitor&tab=usage).
--
-- Perché: useAIUsageMonitor leggeva ai_usage_log riga per riga senza limite;
-- PostgREST ne restituisce al massimo 1000 e a ottobre 2026 erano 2.227 →
-- costi e richieste del mese tagliati a metà senza avviso. Qui il DB somma
-- per (azienda, provider, modello, feature, giorno) e restituisce poche
-- centinaia di righe (374 gruppi sugli ultimi 30 giorni al 30/10/2026).
-- Il giorno è calcolato in Europe/Rome, come il raggruppamento della UI.
--
-- Il client pagina comunque con .range() a blocchi di 1000 e, se la funzione
-- non c'è ancora (PGRST202/42883), ripiega sulla lettura paginata della tabella.
-- Idempotente: CREATE OR REPLACE + REVOKE/GRANT espliciti.

CREATE OR REPLACE FUNCTION public.admin_ai_usage_aggregato(
  p_da timestamptz,
  p_a timestamptz,
  p_provider text DEFAULT NULL,
  p_company_id uuid DEFAULT NULL
)
RETURNS TABLE (
  company_id uuid,
  provider text,
  model text,
  feature text,
  giorno date,
  richieste bigint,
  costo_eur numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'super_admin') THEN
    RAISE EXCEPTION 'Solo il super admin può leggere i consumi AI di tutte le aziende'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    l.company_id,
    l.provider,
    l.model,
    l.feature,
    (l.created_at AT TIME ZONE 'Europe/Rome')::date AS giorno,
    count(*)::bigint AS richieste,
    COALESCE(sum(l.cost_eur), 0)::numeric AS costo_eur
  FROM public.ai_usage_log l
  WHERE l.created_at >= p_da
    AND l.created_at <= p_a
    AND (p_provider IS NULL OR l.provider = p_provider)
    AND (p_company_id IS NULL OR l.company_id = p_company_id)
  GROUP BY l.company_id, l.provider, l.model, l.feature, (l.created_at AT TIME ZONE 'Europe/Rome')::date
  -- Ordine stabile: serve alla paginazione con .range() lato client.
  ORDER BY 5, 1, 2, 3, 4;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_ai_usage_aggregato(timestamptz, timestamptz, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_ai_usage_aggregato(timestamptz, timestamptz, text, uuid) TO authenticated;

COMMENT ON FUNCTION public.admin_ai_usage_aggregato(timestamptz, timestamptz, text, uuid) IS
  'Consumi AI (ai_usage_log) sommati per azienda/provider/modello/feature/giorno (Europe/Rome). Solo super_admin. Usata da useAIUsageMonitor.';
