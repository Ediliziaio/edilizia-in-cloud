-- Fix MP-01: la KB universale era caricata con category valorizzata ma senza
-- metadata.area. match_brain_universal filtrava su metadata->>'area', quindi
-- i filtri kb_areas_filter delle personas potevano escludere tutti i chunk.

UPDATE public.ai_brain_documents
SET metadata = COALESCE(metadata, '{}'::jsonb)
  || jsonb_build_object(
    'area', category,
    'category', category
  )
WHERE scope = 'universal'
  AND category IS NOT NULL
  AND (
    metadata->>'area' IS NULL
    OR metadata->>'area' <> category
    OR metadata->>'category' IS NULL
  );

CREATE INDEX IF NOT EXISTS idx_brain_scope_universal_area_coalesced
  ON public.ai_brain_documents ((COALESCE(metadata->>'area', category)))
  WHERE scope = 'universal' AND embedding IS NOT NULL;

CREATE OR REPLACE FUNCTION public.match_brain_universal(
  p_query_embedding vector(1536),
  p_match_count int DEFAULT 3,
  p_min_similarity numeric DEFAULT 0.30,
  p_kb_areas text[] DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  area text,
  title text,
  content text,
  metadata jsonb,
  similarity numeric
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    d.id,
    COALESCE(d.metadata->>'area', d.category) AS area,
    COALESCE(
      d.title,
      d.metadata->>'title',
      d.metadata->>'titolo',
      d.source_type
    ) AS title,
    d.content,
    COALESCE(d.metadata, '{}'::jsonb)
      || jsonb_build_object('area', COALESCE(d.metadata->>'area', d.category)) AS metadata,
    (1 - (d.embedding <=> p_query_embedding))::numeric AS similarity
  FROM public.ai_brain_documents d
  WHERE d.scope = 'universal'
    AND d.embedding IS NOT NULL
    AND (
      p_kb_areas IS NULL
      OR COALESCE(d.metadata->>'area', d.category) = ANY(p_kb_areas)
    )
    AND (1 - (d.embedding <=> p_query_embedding)) >= p_min_similarity
  ORDER BY d.embedding <=> p_query_embedding
  LIMIT GREATEST(LEAST(p_match_count, 10), 1);
END;
$$;

REVOKE ALL ON FUNCTION public.match_brain_universal(vector, int, numeric, text[]) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.match_brain_universal(vector, int, numeric, text[])
  TO authenticated, service_role;

COMMENT ON FUNCTION public.match_brain_universal(vector, int, numeric, text[]) IS
  'MP-01: RAG sulla KB universale, filtrabile per area; usa metadata.area con fallback sicuro a category.';
