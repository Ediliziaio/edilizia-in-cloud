-- ─── ai_persona_sessions_stats RPC ──────────────────────────────────────────
-- Aggregate per la tab Sessioni dell'AI Personas Hub.
-- Restituisce conteggi e somme globali (NON sul paginato) così l'UI mostra
-- numeri veri anche con 1000+ sessioni senza dover scaricare tutto.
--
-- Filtri opzionali: persona_key, periodo (giorni), archiviate.
-- RLS: la funzione filtra sempre per auth.uid() — l'utente vede solo le sue.
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.ai_persona_sessions_stats(
  p_persona_key   text    DEFAULT NULL,
  p_period_days   int     DEFAULT NULL,   -- NULL = nessun cutoff (tutte)
  p_include_archived boolean DEFAULT false
)
RETURNS TABLE (
  sessions_count   bigint,
  messages_count   bigint,
  total_cost_eur   numeric,
  top_persona_key  text,
  top_persona_count bigint
)
LANGUAGE plpgsql
SECURITY INVOKER  -- usa le RLS dell'utente: ai_persona_sessions_owner
SET search_path = public
AS $$
DECLARE
  v_cutoff timestamptz;
BEGIN
  IF p_period_days IS NOT NULL THEN
    v_cutoff := now() - (p_period_days || ' days')::interval;
  END IF;

  RETURN QUERY
  WITH filtered AS (
    SELECT s.persona_key, s.message_count, s.total_cost_billed_eur
    FROM public.ai_persona_sessions s
    WHERE s.user_id = auth.uid()
      AND (p_persona_key IS NULL OR s.persona_key = p_persona_key)
      AND (v_cutoff IS NULL OR s.last_message_at >= v_cutoff)
      AND (p_include_archived OR s.archived = false)
  ),
  per_persona AS (
    SELECT persona_key, COUNT(*) AS cnt
    FROM filtered
    GROUP BY persona_key
    ORDER BY cnt DESC
    LIMIT 1
  )
  SELECT
    (SELECT COUNT(*) FROM filtered)::bigint,
    (SELECT COALESCE(SUM(message_count), 0) FROM filtered)::bigint,
    (SELECT COALESCE(SUM(total_cost_billed_eur), 0) FROM filtered)::numeric,
    (SELECT persona_key FROM per_persona),
    (SELECT cnt FROM per_persona)::bigint;
END;
$$;

GRANT EXECUTE ON FUNCTION public.ai_persona_sessions_stats(text, int, boolean)
  TO authenticated;

COMMENT ON FUNCTION public.ai_persona_sessions_stats(text, int, boolean) IS
  'Aggregate sessioni AI per AI Personas Hub > Sessioni. Rispetta RLS owner.';

-- ─── Bulk archive RPC ──────────────────────────────────────────────────────
-- Archivia/riattiva un set di sessioni in una sola transazione.
-- Più efficiente di N UPDATE separate + safer rispetto a race condition
-- (es. invalidazione cache react-query mid-batch).
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.ai_persona_sessions_bulk_archive(
  p_session_ids uuid[],
  p_archived    boolean
)
RETURNS int
LANGUAGE plpgsql
SECURITY INVOKER  -- RLS owner si applica automaticamente
SET search_path = public
AS $$
DECLARE
  v_count int;
BEGIN
  UPDATE public.ai_persona_sessions
  SET archived = p_archived,
      updated_at = now()
  WHERE id = ANY(p_session_ids)
    AND user_id = auth.uid();  -- safety belt: doppio check

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.ai_persona_sessions_bulk_archive(uuid[], boolean)
  TO authenticated;

COMMENT ON FUNCTION public.ai_persona_sessions_bulk_archive(uuid[], boolean) IS
  'Bulk archive/restore sessioni in 1 UPDATE. Restituisce numero di righe modificate.';

-- ─── Trigram index su title per search veloce ───────────────────────────────
-- Senza questo, ilike("%foo%") fa scan sequenziale. Con pg_trgm + gin
-- abbiamo lookup quasi O(log n) anche con 100k+ sessioni.
-- ────────────────────────────────────────────────────────────────────────────

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_ai_persona_sessions_title_trgm
  ON public.ai_persona_sessions
  USING gin (title gin_trgm_ops);
