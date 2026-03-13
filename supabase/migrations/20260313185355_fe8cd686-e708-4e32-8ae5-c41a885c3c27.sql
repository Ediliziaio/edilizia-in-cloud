
-- HNSW index for cosine similarity
CREATE INDEX idx_preventivo_kb_chunks_embedding ON public.preventivo_kb_chunks
  USING hnsw (embedding extensions.vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- RPC for similarity search with search_path including extensions
CREATE OR REPLACE FUNCTION public.search_kb_chunks(
  p_azienda_id UUID,
  p_embedding extensions.vector,
  p_categoria TEXT DEFAULT NULL,
  p_top_k INTEGER DEFAULT 5,
  p_threshold FLOAT DEFAULT 0.65
)
RETURNS TABLE (
  id UUID,
  documento_id UUID,
  testo TEXT,
  testo_preview TEXT,
  pagina INTEGER,
  chunk_index INTEGER,
  categoria TEXT,
  similarity FLOAT
)
LANGUAGE plpgsql STABLE
SECURITY INVOKER
SET search_path = public, extensions
AS $$
BEGIN
  RETURN QUERY
  SELECT
    c.id,
    c.documento_id,
    c.testo,
    c.testo_preview,
    c.pagina,
    c.chunk_index,
    c.categoria,
    (1 - (c.embedding <=> p_embedding))::float AS similarity
  FROM public.preventivo_kb_chunks c
  WHERE c.azienda_id = p_azienda_id
    AND (p_categoria IS NULL OR c.categoria = p_categoria)
    AND (1 - (c.embedding <=> p_embedding))::float >= p_threshold
  ORDER BY c.embedding <=> p_embedding
  LIMIT p_top_k;
END;
$$;
