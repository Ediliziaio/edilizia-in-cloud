-- 2026-06-10 (audit AI, costi): cache risposte per task AI DETERMINISTICI.
-- Task come bank_categorize e fattura_classify rivedono spesso lo STESSO
-- input (stesso movimento bancario ricorrente, stessa fattura fornitore):
-- prima ogni occorrenza richiamava il modello a pagamento. Con la cache,
-- stesso input → stessa risposta senza chiamata AI (risparmio stimato
-- 30-50% su questi task). Opt-in per task via aiRouterComplete({cacheTtlDays}).
--
-- Scoped PER AZIENDA: la categorizzazione può dipendere da configurazioni
-- custom del tenant — mai condividere risposte cross-company.

CREATE TABLE IF NOT EXISTS public.ai_response_cache (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_key       text NOT NULL,
  company_id     uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  input_hash     text NOT NULL,           -- sha256 di task|messages|responseFormat
  output_content text NOT NULL,
  model_used     text,
  hits           integer NOT NULL DEFAULT 0,
  created_at     timestamptz NOT NULL DEFAULT now(),
  expires_at     timestamptz NOT NULL,
  UNIQUE (task_key, company_id, input_hash)
);

CREATE INDEX IF NOT EXISTS idx_ai_response_cache_lookup
  ON public.ai_response_cache(task_key, company_id, input_hash)
  WHERE expires_at > now();

CREATE INDEX IF NOT EXISTS idx_ai_response_cache_expiry
  ON public.ai_response_cache(expires_at);

-- Solo service-role: la cache è un dettaglio server-side delle edge function,
-- mai letta/scritta dal client.
ALTER TABLE public.ai_response_cache ENABLE ROW LEVEL SECURITY;
-- (nessuna policy = nessun accesso per anon/authenticated; service_role bypassa RLS)

COMMENT ON TABLE public.ai_response_cache IS
  'Cache risposte AI per task deterministici (opt-in via cacheTtlDays nel router). Scoped per company.';

-- Pulizia righe scadute: callable da cron (non schedulata qui — opzionale,
-- la UNIQUE + upsert tiene comunque la tabella compatta).
CREATE OR REPLACE FUNCTION public.prune_ai_response_cache()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted integer;
BEGIN
  DELETE FROM public.ai_response_cache WHERE expires_at < now() - interval '7 days';
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

REVOKE ALL ON FUNCTION public.prune_ai_response_cache FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prune_ai_response_cache TO service_role;
