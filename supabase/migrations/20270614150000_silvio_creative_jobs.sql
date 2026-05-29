-- ════════════════════════════════════════════════════════════════════════════
-- MP-SILVIO-CREATIVE-01 · Blocco 4 — artefatti on-demand (backbone)
-- ────────────────────────────────────────────────────────────────────────────
-- Coda job generazione artefatti (immagine/video/documento) + 2 RPC di accodamento.
-- Stesso pattern thin-recorder di silvio_outbound_messages: il tool accoda e ritorna
-- subito {job_id, eta_seconds, status:'queued'} (il loop chat NON aspetta). Il worker
-- che chiama i motori reali (ai-ads-image/video-generate, genera_*) + le card in chat
-- sono uno step UI/integrazione separato (scelta del titolare: backbone sicuro ora).
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.silvio_generation_jobs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  created_by    uuid REFERENCES auth.users(id),
  tipo          text NOT NULL CHECK (tipo IN ('image','video','document')),
  brief         text,                       -- per image/video: cosa rappresentare
  formato       text CHECK (formato IN ('1:1','4:5','9:16','16:9')),
  doc_tipo      text,                        -- per document: relazione_tecnica|pos|duvri|proposal|reportino_committente
  commessa_id   uuid,
  pratica_id    uuid,
  status        text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','processing','ready','failed','cancelled')),
  eta_seconds   integer,
  public_url    text,
  result        jsonb,
  error         text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  completed_at  timestamptz
);
CREATE INDEX IF NOT EXISTS idx_silvio_gen_jobs_company ON public.silvio_generation_jobs (company_id, status, created_at DESC);

ALTER TABLE public.silvio_generation_jobs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS silvio_gen_jobs_staff ON public.silvio_generation_jobs;
CREATE POLICY silvio_gen_jobs_staff ON public.silvio_generation_jobs FOR SELECT TO authenticated
  USING (company_id = public.get_effective_company_id());
DROP POLICY IF EXISTS silvio_gen_jobs_service ON public.silvio_generation_jobs;
CREATE POLICY silvio_gen_jobs_service ON public.silvio_generation_jobs FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS silvio_gen_jobs_super ON public.silvio_generation_jobs;
CREATE POLICY silvio_gen_jobs_super ON public.silvio_generation_jobs FOR SELECT TO authenticated USING (public.is_super_admin(auth.uid()));

-- ── RPC: accoda creatività (immagine/video) ─────────────────────────────────
CREATE OR REPLACE FUNCTION public.silvio_tool_enqueue_creativita(
  p_company_id uuid, p_user_id uuid, p_tipo text, p_brief text,
  p_formato text DEFAULT '4:5', p_commessa_id uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_id uuid; v_eta int;
BEGIN
  IF p_company_id IS NULL OR p_brief IS NULL OR p_brief = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'company_id e brief obbligatori');
  END IF;
  IF coalesce(p_tipo,'') NOT IN ('immagine','video','image') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'tipo non valido (immagine|video)');
  END IF;
  -- normalizza 'immagine' → 'image'
  v_eta := CASE WHEN p_tipo = 'video' THEN 90 ELSE 25 END;
  INSERT INTO public.silvio_generation_jobs (company_id, created_by, tipo, brief, formato, commessa_id, status, eta_seconds)
  VALUES (p_company_id, p_user_id, CASE WHEN p_tipo = 'video' THEN 'video' ELSE 'image' END,
          p_brief, COALESCE(p_formato,'4:5'), p_commessa_id, 'queued', v_eta)
  RETURNING id INTO v_id;
  RETURN jsonb_build_object('ok', true, 'job_id', v_id, 'status', 'queued', 'eta_seconds', v_eta,
                            'tipo', CASE WHEN p_tipo = 'video' THEN 'video' ELSE 'image' END);
END $$;

-- ── RPC: router documento per commessa/pratica (accoda job document) ─────────
CREATE OR REPLACE FUNCTION public.silvio_tool_genera_documento_router(
  p_company_id uuid, p_user_id uuid, p_tipo text,
  p_commessa_id uuid DEFAULT NULL, p_pratica_id uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_id uuid;
BEGIN
  IF p_company_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'company_id obbligatorio');
  END IF;
  IF coalesce(p_tipo,'') NOT IN ('relazione_tecnica','pos','duvri','proposal','reportino_committente') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'tipo documento non valido');
  END IF;
  INSERT INTO public.silvio_generation_jobs (company_id, created_by, tipo, doc_tipo, commessa_id, pratica_id, status, eta_seconds)
  VALUES (p_company_id, p_user_id, 'document', p_tipo, p_commessa_id, p_pratica_id, 'queued', 20)
  RETURNING id INTO v_id;
  RETURN jsonb_build_object('ok', true, 'job_id', v_id, 'status', 'queued', 'eta_seconds', 20, 'doc_tipo', p_tipo);
END $$;

REVOKE EXECUTE ON FUNCTION public.silvio_tool_enqueue_creativita(uuid,uuid,text,text,text,uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.silvio_tool_genera_documento_router(uuid,uuid,text,uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.silvio_tool_enqueue_creativita(uuid,uuid,text,text,text,uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.silvio_tool_genera_documento_router(uuid,uuid,text,uuid,uuid) TO authenticated, service_role;

COMMENT ON TABLE public.silvio_generation_jobs IS 'MP-SILVIO-CREATIVE-01: coda artefatti (image|video|document). Thin recorder; worker→motori reali e card chat in step successivo.';
