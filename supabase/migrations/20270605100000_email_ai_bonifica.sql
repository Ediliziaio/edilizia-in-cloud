-- ════════════════════════════════════════════════════════════════════════════
-- MP-EMAIL-AI-12 · Bonifica guidata dell'arretrato (a blocchi, mai una a una)
-- ────────────────────────────────────────────────────────────────────────────
-- Panoramica per categoria del backlog (non lette) + azioni di MASSA reversibili.
-- Sicuro per default: archivia (is_archived), MAI cancella. Ogni azione registra
-- gli id toccati per l'annulla. La classificazione riusa L1/L3 (MP-01) già fatti.
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.bonifica_azioni (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  gruppo       text NOT NULL,
  azione       text NOT NULL CHECK (azione IN ('archivia','segna_letto')),
  email_ids    uuid[] NOT NULL DEFAULT '{}',
  annullabile  boolean NOT NULL DEFAULT true,
  created_by   uuid,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_bonifica_azioni_company ON public.bonifica_azioni (company_id, created_at DESC);

ALTER TABLE public.bonifica_azioni ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS bonifica_azioni_staff_read ON public.bonifica_azioni;
CREATE POLICY bonifica_azioni_staff_read ON public.bonifica_azioni FOR SELECT TO authenticated
  USING (company_id = public.get_effective_company_id() AND public.is_email_staff_interno());
DROP POLICY IF EXISTS bonifica_azioni_service_all ON public.bonifica_azioni;
CREATE POLICY bonifica_azioni_service_all ON public.bonifica_azioni FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS bonifica_azioni_super_admin ON public.bonifica_azioni;
CREATE POLICY bonifica_azioni_super_admin ON public.bonifica_azioni FOR ALL TO authenticated USING (public.is_super_admin(auth.uid()));

-- Panoramica backlog (non lette, non archiviate, non cestino) per categoria.
CREATE OR REPLACE FUNCTION public.bonifica_overview()
RETURNS TABLE(categoria text, n bigint)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_company uuid; v_uid uuid;
BEGIN
  IF NOT public.is_email_staff_interno() THEN RETURN; END IF;
  v_company := public.get_effective_company_id();
  IF v_company IS NULL THEN RETURN; END IF;
  v_uid := auth.uid();
  RETURN QUERY
  SELECT COALESCE(e.categoria::text, e.ai_category, 'altro') AS categoria, count(*)::bigint
  FROM public.email_inbox e
  WHERE e.company_id = v_company AND e.is_trashed = false AND e.is_archived = false
    AND e.is_read = false AND e.is_personale = false
    AND (e.user_id = v_uid OR e.user_id IS NULL)
  GROUP BY 1 ORDER BY 2 DESC;
END $$;
REVOKE EXECUTE ON FUNCTION public.bonifica_overview() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bonifica_overview() TO authenticated, service_role;

-- Azione di massa: archivia tutte le email di una categoria del backlog. Reversibile.
CREATE OR REPLACE FUNCTION public.bonifica_archivia_categoria(p_categoria text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_company uuid; v_uid uuid; v_ids uuid[]; v_azione uuid;
BEGIN
  IF NOT public.is_email_staff_interno() THEN RAISE EXCEPTION 'forbidden'; END IF;
  v_company := public.get_effective_company_id(); v_uid := auth.uid();
  SELECT array_agg(e.id) INTO v_ids FROM public.email_inbox e
   WHERE e.company_id = v_company AND e.is_trashed=false AND e.is_archived=false AND e.is_read=false AND e.is_personale=false
     AND (e.user_id = v_uid OR e.user_id IS NULL)
     AND COALESCE(e.categoria::text, e.ai_category, 'altro') = p_categoria;
  IF v_ids IS NULL OR array_length(v_ids,1) IS NULL THEN RETURN jsonb_build_object('count', 0); END IF;
  UPDATE public.email_inbox SET is_archived = true, is_read = true WHERE id = ANY(v_ids);
  INSERT INTO public.bonifica_azioni (company_id, gruppo, azione, email_ids, created_by)
    VALUES (v_company, p_categoria, 'archivia', v_ids, v_uid) RETURNING id INTO v_azione;
  RETURN jsonb_build_object('count', array_length(v_ids,1), 'azione_id', v_azione);
END $$;
REVOKE EXECUTE ON FUNCTION public.bonifica_archivia_categoria(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bonifica_archivia_categoria(text) TO authenticated, service_role;

-- Annulla un'azione di massa: ripristina le email toccate.
CREATE OR REPLACE FUNCTION public.bonifica_annulla(p_azione_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_company uuid; v_a record;
BEGIN
  IF NOT public.is_email_staff_interno() THEN RAISE EXCEPTION 'forbidden'; END IF;
  v_company := public.get_effective_company_id();
  SELECT * INTO v_a FROM public.bonifica_azioni WHERE id = p_azione_id AND company_id = v_company;
  IF v_a.id IS NULL THEN RAISE EXCEPTION 'azione_not_found'; END IF;
  IF NOT v_a.annullabile THEN RETURN jsonb_build_object('count', 0, 'gia_annullata', true); END IF;
  UPDATE public.email_inbox SET is_archived = false, is_read = false WHERE id = ANY(v_a.email_ids) AND company_id = v_company;
  UPDATE public.bonifica_azioni SET annullabile = false WHERE id = p_azione_id;
  RETURN jsonb_build_object('count', COALESCE(array_length(v_a.email_ids,1),0), 'annullata', true);
END $$;
REVOKE EXECUTE ON FUNCTION public.bonifica_annulla(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bonifica_annulla(uuid) TO authenticated, service_role;

COMMENT ON TABLE public.bonifica_azioni IS 'MP-EMAIL-AI-12: log azioni di massa bonifica arretrato, per annulla. Mai cancella.';
