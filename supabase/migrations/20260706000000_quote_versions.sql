-- IMP06: Storico versioni preventivo
-- Creates a table to store full snapshots of quotes at each save point.

CREATE TABLE public.quote_versions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id    UUID NOT NULL REFERENCES public.quotes(id) ON DELETE CASCADE,
  company_id  UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  version_num INTEGER NOT NULL,  -- incremental per quote
  snapshot    JSONB NOT NULL,    -- full quote + items snapshot
  created_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ DEFAULT now() NOT NULL,
  note        TEXT,              -- optional label ("Inviato al cliente", "Revisione prezzi", etc.)
  UNIQUE (quote_id, version_num)
);

-- RLS
ALTER TABLE public.quote_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY quote_versions_select ON public.quote_versions
  FOR SELECT USING (company_id = public.get_my_company_id());
CREATE POLICY quote_versions_insert ON public.quote_versions
  FOR INSERT WITH CHECK (company_id = public.get_my_company_id());

-- Index for efficient lookups by quote, ordered by version descending
CREATE INDEX idx_quote_versions_quote_id ON public.quote_versions(quote_id, version_num DESC);
