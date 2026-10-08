-- Likes and retrieval frequency are signals for review, never proof of correctness.
BEGIN;

CREATE TABLE public.silvio_learning_reviews (
  document_id uuid PRIMARY KEY REFERENCES public.ai_brain_documents(id) ON DELETE CASCADE,
  review_id uuid NOT NULL DEFAULT gen_random_uuid(),
  document_version text NOT NULL,
  decision text NOT NULL CHECK (decision IN ('approved', 'rejected')),
  reviewed_content text,
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at timestamptz NOT NULL DEFAULT now(),
  CHECK (decision <> 'approved' OR length(btrim(reviewed_content)) BETWEEN 20 AND 500),
  CHECK (decision <> 'approved' OR reviewed_content IS NOT NULL)
);
ALTER TABLE public.silvio_learning_reviews ENABLE ROW LEVEL SECURITY;
-- Writes are only through the guarded review RPC (also records the actual actor).
REVOKE ALL ON public.silvio_learning_reviews FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.silvio_learning_reviews TO authenticated;
CREATE POLICY learning_reviews_admin_read ON public.silvio_learning_reviews FOR SELECT TO authenticated
  USING (public.is_silvio_superadmin() AND EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND NOT coalesce(is_blocked, false)));

ALTER TABLE public.silvio_persona_memory
  ADD COLUMN learning_document_id uuid REFERENCES public.ai_brain_documents(id) ON DELETE SET NULL,
  ADD COLUMN learning_review_id uuid;
CREATE UNIQUE INDEX silvio_memory_learning_document_persona
  ON public.silvio_persona_memory(learning_document_id, persona_key);

-- Derive the version from actual content and recipients, not a caller-provided hash.
CREATE FUNCTION public.silvio_learning_version(p_doc public.ai_brain_documents)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT md5(jsonb_build_array(p_doc.content, p_doc.persona_keys, p_doc.kb_section,
    p_doc.source_type, p_doc.source_id, p_doc.scope, p_doc.company_id)::text)
$$;
REVOKE ALL ON FUNCTION public.silvio_learning_version(public.ai_brain_documents) FROM PUBLIC;

CREATE FUNCTION public.silvio_learning_candidates(p_state text DEFAULT 'pending', p_offset int DEFAULT 0)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT coalesce(public.is_silvio_superadmin(), false) OR NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND NOT coalesce(is_blocked, false)
  ) THEN RAISE EXCEPTION 'Permesso negato' USING ERRCODE = '42501'; END IF;
  IF p_state IS NULL OR p_state NOT IN ('pending','approved','rejected') THEN
    RAISE EXCEPTION 'Stato non valido';
  END IF;
  RETURN coalesce((SELECT jsonb_agg(to_jsonb(c)) FROM (
    SELECT d.id, d.title, d.content, d.persona_keys, d.kb_section,
      public.silvio_learning_version(d) AS version,
      CASE WHEN r.document_version = public.silvio_learning_version(d)
        THEN r.decision ELSE 'pending' END AS review_state,
      CASE WHEN r.document_version = public.silvio_learning_version(d)
        THEN r.reviewed_content END AS reviewed_content
    FROM public.ai_brain_documents d LEFT JOIN public.silvio_learning_reviews r ON r.document_id=d.id
    WHERE d.scope='silvio_admin' AND d.company_id IS NULL
      AND d.kb_section IN ('gold_standard','avoid_pattern')
      AND d.deleted_at IS NULL AND (d.valid_until IS NULL OR d.valid_until > now())
      AND CASE WHEN r.document_version = public.silvio_learning_version(d)
        THEN r.decision ELSE 'pending' END = p_state
    ORDER BY d.id LIMIT 20 OFFSET greatest(coalesce(p_offset,0),0)
  ) c), '[]'::jsonb);
END $$;

CREATE OR REPLACE FUNCTION public.silvio_self_improvement_promote()
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE d public.ai_brain_documents; r public.silvio_learning_reviews; n int := 0; added int;
BEGIN
  IF current_setting('role', true) IS DISTINCT FROM 'service_role' AND (
    NOT coalesce(public.is_silvio_superadmin(), false) OR NOT EXISTS (
      SELECT 1 FROM public.profiles WHERE id=auth.uid() AND NOT coalesce(is_blocked,false))
  ) THEN RAISE EXCEPTION 'Permesso negato' USING ERRCODE='42501'; END IF;
  FOR d IN
    SELECT doc.* FROM public.ai_brain_documents doc
    JOIN public.silvio_learning_reviews review ON review.document_id=doc.id
    WHERE doc.scope='silvio_admin' AND doc.company_id IS NULL
      AND doc.kb_section IN ('gold_standard','avoid_pattern')
      AND doc.deleted_at IS NULL AND (doc.valid_until IS NULL OR doc.valid_until > now())
      AND review.decision='approved' AND review.reviewed_by IS NOT NULL
      AND review.document_version=public.silvio_learning_version(doc)
      AND EXISTS (SELECT 1 FROM public.silvio_admin_personas p
        WHERE p.persona_key=ANY(doc.persona_keys) AND NOT EXISTS (
          SELECT 1 FROM public.silvio_persona_memory m WHERE m.learning_document_id=doc.id
            AND m.persona_key=p.persona_key AND m.learning_review_id=review.review_id))
    ORDER BY doc.id LIMIT 100 FOR UPDATE OF doc SKIP LOCKED
  LOOP
    SELECT * INTO r FROM public.silvio_learning_reviews WHERE document_id=d.id;
    IF r.decision <> 'approved' OR r.document_version <> public.silvio_learning_version(d) THEN CONTINUE; END IF;
    INSERT INTO public.silvio_persona_memory
      (persona_key,memory_type,content,source,confidence,enabled,created_by,learning_document_id,learning_review_id)
    SELECT p.persona_key, CASE d.kb_section WHEN 'avoid_pattern' THEN 'avoid' ELSE 'pattern' END,
      r.reviewed_content, 'feedback_loop', 0.85, true, r.reviewed_by, d.id, r.review_id
    FROM public.silvio_admin_personas p WHERE p.persona_key=ANY(d.persona_keys)
    ON CONFLICT (learning_document_id,persona_key) DO UPDATE SET
      content=excluded.content,memory_type=excluded.memory_type,enabled=true,
      learning_review_id=excluded.learning_review_id,created_by=excluded.created_by,updated_at=now()
    WHERE silvio_persona_memory.learning_review_id IS DISTINCT FROM excluded.learning_review_id;
    GET DIAGNOSTICS added = ROW_COUNT;
    n := n + added;
  END LOOP;
  RETURN n;
END $$;

-- Versioned entry point: a new worker against an unmigrated DB must fail closed,
-- never accidentally invoke the old hits-based promotion implementation.
CREATE FUNCTION public.silvio_promote_reviewed_learning()
RETURNS int LANGUAGE sql SECURITY INVOKER SET search_path=public AS $$
  SELECT public.silvio_self_improvement_promote()
$$;
REVOKE ALL ON FUNCTION public.silvio_promote_reviewed_learning() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.silvio_promote_reviewed_learning() TO authenticated,service_role;

CREATE FUNCTION public.silvio_review_learning(p_document_id uuid, p_version text, p_decision text, p_content text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE d public.ai_brain_documents; v text; promoted int;
BEGIN
  -- The cron/service worker may promote an approval, but cannot manufacture one.
  IF auth.uid() IS NULL OR NOT coalesce(public.is_silvio_superadmin(),false) OR NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id=auth.uid() AND NOT coalesce(is_blocked,false)
  ) THEN RAISE EXCEPTION 'Permesso negato' USING ERRCODE='42501'; END IF;
  IF p_decision IS NULL OR p_decision NOT IN ('approved','rejected') THEN RAISE EXCEPTION 'Decisione non valida'; END IF;
  SELECT * INTO d FROM public.ai_brain_documents WHERE id=p_document_id FOR UPDATE;
  IF NOT FOUND OR d.scope IS DISTINCT FROM 'silvio_admin' OR d.company_id IS NOT NULL
    OR d.kb_section IS NULL OR d.kb_section NOT IN ('gold_standard','avoid_pattern')
    OR d.deleted_at IS NOT NULL OR d.valid_until <= now() THEN
    RAISE EXCEPTION 'Esempio non disponibile: aggiorna la lista';
  END IF;
  v := public.silvio_learning_version(d);
  IF p_version IS DISTINCT FROM v THEN RAISE EXCEPTION 'Esempio modificato: aggiorna e rileggi prima di approvare'; END IF;
  IF p_decision='approved' THEN
    IF p_content IS NULL OR length(btrim(p_content)) NOT BETWEEN 20 AND 500 THEN
      RAISE EXCEPTION 'Scrivi una regola verificata da 20 a 500 caratteri';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.silvio_admin_personas WHERE persona_key=ANY(d.persona_keys)) THEN
      RAISE EXCEPTION 'Nessuna persona valida associata: correggi prima il documento';
    END IF;
  END IF;
  INSERT INTO public.silvio_learning_reviews(document_id,document_version,decision,reviewed_content,reviewed_by)
  VALUES (d.id,v,p_decision,CASE WHEN p_decision='approved' THEN btrim(p_content) END,auth.uid())
  ON CONFLICT (document_id) DO UPDATE SET document_version=excluded.document_version,
    decision=excluded.decision,reviewed_content=excluded.reviewed_content,reviewed_by=excluded.reviewed_by,
    reviewed_at=now(),review_id=gen_random_uuid()
  WHERE (silvio_learning_reviews.document_version,silvio_learning_reviews.decision,silvio_learning_reviews.reviewed_content)
    IS DISTINCT FROM (excluded.document_version,excluded.decision,excluded.reviewed_content);
  IF p_decision='rejected' THEN
    UPDATE public.silvio_persona_memory SET enabled=false WHERE learning_document_id=d.id;
    promoted := 0;
  ELSE promoted := public.silvio_self_improvement_promote(); END IF;
  RETURN jsonb_build_object('ok',true,'promoted',promoted);
END $$;

-- Keep legacy feedback rows for inspection, but never inject unreviewed examples.
-- Also invalidate derived memory immediately when its source is changed/removed/expired.
CREATE OR REPLACE FUNCTION public.get_persona_memory(p_persona_key text, p_limit int DEFAULT 10)
RETURNS TABLE(memory_type text,content text,source text,hits_count int)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF current_setting('role',true) IS DISTINCT FROM 'service_role' AND (
    NOT coalesce(public.is_silvio_superadmin(),false) OR NOT EXISTS (
      SELECT 1 FROM public.profiles WHERE id=auth.uid() AND NOT coalesce(is_blocked,false))
  ) THEN RAISE EXCEPTION 'Permesso negato' USING ERRCODE='42501'; END IF;
  RETURN QUERY SELECT m.memory_type,m.content,m.source,m.hits_count
  FROM public.silvio_persona_memory m
  WHERE m.persona_key=p_persona_key AND m.enabled=true
    AND (m.expires_at IS NULL OR m.expires_at>now())
    AND (m.source IS DISTINCT FROM 'feedback_loop' AND m.learning_document_id IS NULL OR EXISTS (
      SELECT 1 FROM public.silvio_learning_reviews r JOIN public.ai_brain_documents d ON d.id=r.document_id
      WHERE r.document_id=m.learning_document_id AND r.review_id=m.learning_review_id
        AND r.decision='approved' AND r.reviewed_by IS NOT NULL
        AND r.document_version=public.silvio_learning_version(d) AND m.content=r.reviewed_content
        AND m.persona_key=ANY(d.persona_keys) AND d.scope='silvio_admin' AND d.company_id IS NULL
        AND d.deleted_at IS NULL AND (d.valid_until IS NULL OR d.valid_until>now())))
  ORDER BY m.hits_count DESC,m.created_at DESC LIMIT least(greatest(coalesce(p_limit,10),0),50);
END $$;

REVOKE ALL ON FUNCTION public.silvio_learning_candidates(text,int) FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.silvio_review_learning(uuid,text,text,text) FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.silvio_self_improvement_promote() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_persona_memory(text,int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.silvio_learning_candidates(text,int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.silvio_review_learning(uuid,text,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.silvio_self_improvement_promote() TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_persona_memory(text,int) TO authenticated,service_role;
COMMIT;
