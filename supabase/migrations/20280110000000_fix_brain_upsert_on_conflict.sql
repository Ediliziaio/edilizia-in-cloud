-- Fix: brain_upsert_document non ha mai potuto fare upsert.
--
-- L'indice unico uq_brain_docs_dedup e' su
--   (COALESCE(company_id, zero-uuid), source_type, COALESCE(source_id, zero-uuid), content_hash)
-- ma la ON CONFLICT della funzione ometteva il COALESCE su company_id: le
-- espressioni non combaciavano e Postgres rifiutava con "there is no unique
-- or exclusion constraint matching the ON CONFLICT specification".
-- Scoperto il 2026-08-05 lanciando ai-brain-seed-universal: 87 documenti su
-- 87 falliti al primo giro, 87/87 indicizzati dopo il fix. Gia' applicato in
-- produzione lo stesso giorno; questa migration allinea gli altri ambienti.

CREATE OR REPLACE FUNCTION public.brain_upsert_document(p_company_id uuid, p_source_type text, p_source_id uuid, p_content text, p_content_hash text, p_embedding vector DEFAULT NULL::vector, p_metadata jsonb DEFAULT '{}'::jsonb, p_visibility_roles text[] DEFAULT NULL::text[], p_scope text DEFAULT 'company'::text, p_category text DEFAULT NULL::text, p_title text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_id uuid;
BEGIN
  IF p_scope = 'universal' THEN
    p_company_id := NULL;
  END IF;

  INSERT INTO public.ai_brain_documents
    (company_id, source_type, source_id, content, content_hash, embedding,
     metadata, visibility_roles, scope, category, title)
  VALUES
    (p_company_id, p_source_type, p_source_id, p_content, p_content_hash,
     p_embedding, COALESCE(p_metadata, '{}'::jsonb), p_visibility_roles,
     p_scope, p_category, p_title)
  -- 2026-08-05: il target deve replicare ESATTAMENTE l'indice uq_brain_docs_dedup,
  -- che ha COALESCE anche su company_id. Senza, Postgres non trova il vincolo
  -- ("no unique or exclusion constraint matching") e OGNI upsert fallisce —
  -- in particolare tutti quelli a scope universale, dove company_id e' NULL.
  ON CONFLICT (COALESCE(company_id, '00000000-0000-0000-0000-000000000000'::uuid), source_type, COALESCE(source_id, '00000000-0000-0000-0000-000000000000'::uuid), content_hash)
  DO UPDATE SET
    content = EXCLUDED.content,
    embedding = COALESCE(EXCLUDED.embedding, public.ai_brain_documents.embedding),
    metadata = EXCLUDED.metadata,
    visibility_roles = EXCLUDED.visibility_roles,
    scope = EXCLUDED.scope,
    category = EXCLUDED.category,
    title = EXCLUDED.title,
    updated_at = now()
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$function$
;
