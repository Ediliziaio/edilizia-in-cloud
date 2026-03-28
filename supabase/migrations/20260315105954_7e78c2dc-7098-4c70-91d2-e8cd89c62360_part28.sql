-- 6. RPCs
CREATE OR REPLACE FUNCTION public.update_kb_sync_status(
  p_doc_id uuid,
  p_status text,
  p_error text DEFAULT NULL,
  p_el_doc_id text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.ai_knowledge_base_v2
  SET sync_status = p_status,
      sync_error = p_error,
      elevenlabs_doc_id = COALESCE(p_el_doc_id, elevenlabs_doc_id)
  WHERE id = p_doc_id;
END;
$$;
