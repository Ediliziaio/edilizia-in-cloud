-- ============================================================================
-- Render upload access hardening
-- ----------------------------------------------------------------------------
-- Fixes upload/session RLS failures for render modules when the active company
-- comes from impersonation, multi-company access or super-admin company switch.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.can_access_render_company(p_company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p_company_id IS NOT NULL
    AND (
      p_company_id = public.get_effective_company_id()
      OR EXISTS (
        SELECT 1
        FROM public.multi_company_access mca
        WHERE mca.user_id = auth.uid()
          AND mca.company_id = p_company_id
      )
      OR public.superadmin_can_access_company(auth.uid(), p_company_id)
      OR public.has_role(auth.uid(), 'super_admin'::app_role)
    );
$$;

GRANT EXECUTE ON FUNCTION public.can_access_render_company(uuid) TO authenticated;

COMMENT ON FUNCTION public.can_access_render_company(uuid) IS
'Tenant guard per render AI. Consente la company effettiva, le aziende multi-company abilitate e super_admin.';

CREATE OR REPLACE FUNCTION public.can_access_render_storage_object(p_name text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, storage
AS $$
  WITH folders AS (
    SELECT storage.foldername(p_name) AS parts
  )
  SELECT CASE
    WHEN (parts)[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      THEN public.can_access_render_company(((parts)[1])::uuid)
    WHEN (parts)[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      THEN public.can_access_render_company(((parts)[2])::uuid)
    ELSE false
  END
  FROM folders;
$$;

GRANT EXECUTE ON FUNCTION public.can_access_render_storage_object(text) TO authenticated;

COMMENT ON FUNCTION public.can_access_render_storage_object(text) IS
'Valida accesso storage render leggendo la company dal primo folder, o dal secondo folder per fallback legacy.';

-- ── Session table policies ─────────────────────────────────────────────────
DROP POLICY IF EXISTS "co_render_sessions" ON public.render_sessions;
CREATE POLICY "co_render_sessions" ON public.render_sessions
  FOR ALL TO authenticated
  USING (public.can_access_render_company(company_id))
  WITH CHECK (public.can_access_render_company(company_id));

DROP POLICY IF EXISTS "co_render_gallery" ON public.render_gallery;
CREATE POLICY "co_render_gallery" ON public.render_gallery
  FOR ALL TO authenticated
  USING (public.can_access_render_company(company_id))
  WITH CHECK (public.can_access_render_company(company_id));

DROP POLICY IF EXISTS "co_render_facciata_sessions" ON public.render_facciata_sessions;
CREATE POLICY "co_render_facciata_sessions" ON public.render_facciata_sessions
  FOR ALL TO authenticated
  USING (public.can_access_render_company(company_id))
  WITH CHECK (public.can_access_render_company(company_id));

DROP POLICY IF EXISTS "co_render_pavimento_sessions" ON public.render_pavimento_sessions;
CREATE POLICY "co_render_pavimento_sessions" ON public.render_pavimento_sessions
  FOR ALL TO authenticated
  USING (public.can_access_render_company(company_id))
  WITH CHECK (public.can_access_render_company(company_id));

DROP POLICY IF EXISTS "co_render_persiane_sessions" ON public.render_persiane_sessions;
CREATE POLICY "co_render_persiane_sessions" ON public.render_persiane_sessions
  FOR ALL TO authenticated
  USING (public.can_access_render_company(company_id))
  WITH CHECK (public.can_access_render_company(company_id));

DROP POLICY IF EXISTS "co_render_tetto_sessions" ON public.render_tetto_sessions;
CREATE POLICY "co_render_tetto_sessions" ON public.render_tetto_sessions
  FOR ALL TO authenticated
  USING (public.can_access_render_company(company_id))
  WITH CHECK (public.can_access_render_company(company_id));

DROP POLICY IF EXISTS "co_render_stanza_sessions" ON public.render_stanza_sessions;
CREATE POLICY "co_render_stanza_sessions" ON public.render_stanza_sessions
  FOR ALL TO authenticated
  USING (public.can_access_render_company(company_id))
  WITH CHECK (public.can_access_render_company(company_id));

DROP POLICY IF EXISTS "render_bagno_select" ON public.render_bagno_sessions;
DROP POLICY IF EXISTS "render_bagno_insert" ON public.render_bagno_sessions;
DROP POLICY IF EXISTS "render_bagno_update" ON public.render_bagno_sessions;

CREATE POLICY "render_bagno_select" ON public.render_bagno_sessions
  FOR SELECT TO authenticated
  USING (public.can_access_render_company(company_id));

CREATE POLICY "render_bagno_insert" ON public.render_bagno_sessions
  FOR INSERT TO authenticated
  WITH CHECK (
    public.can_access_render_company(company_id)
    AND user_id = auth.uid()
  );

CREATE POLICY "render_bagno_update" ON public.render_bagno_sessions
  FOR UPDATE TO authenticated
  USING (public.can_access_render_company(company_id))
  WITH CHECK (public.can_access_render_company(company_id));

DROP POLICY IF EXISTS "co_render_pergole_sessions" ON public.render_pergole_sessions;
CREATE POLICY "co_render_pergole_sessions" ON public.render_pergole_sessions
  FOR ALL TO authenticated
  USING (public.can_access_render_company(company_id))
  WITH CHECK (public.can_access_render_company(company_id));

DROP POLICY IF EXISTS "co_render_piscine_sessions" ON public.render_piscine_sessions;
CREATE POLICY "co_render_piscine_sessions" ON public.render_piscine_sessions
  FOR ALL TO authenticated
  USING (public.can_access_render_company(company_id))
  WITH CHECK (public.can_access_render_company(company_id));

DROP POLICY IF EXISTS "co_render_technical_sessions" ON public.render_technical_sessions;
CREATE POLICY "co_render_technical_sessions" ON public.render_technical_sessions
  FOR ALL TO authenticated
  USING (public.can_access_render_company(company_id))
  WITH CHECK (public.can_access_render_company(company_id));

-- ── Storage policies ───────────────────────────────────────────────────────
DROP POLICY IF EXISTS "bagno_originals_insert" ON storage.objects;
CREATE POLICY "bagno_originals_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'bagno-originals'
    AND public.can_access_render_storage_object(name)
  );

DROP POLICY IF EXISTS "bagno_originals_select" ON storage.objects;
CREATE POLICY "bagno_originals_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'bagno-originals'
    AND public.can_access_render_storage_object(name)
  );

DROP POLICY IF EXISTS "bagno_results_insert" ON storage.objects;
CREATE POLICY "bagno_results_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'bagno-results'
    AND public.can_access_render_storage_object(name)
  );

DROP POLICY IF EXISTS "pavimento_originals_insert" ON storage.objects;
CREATE POLICY "pavimento_originals_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'pavimento-originals'
    AND public.can_access_render_storage_object(name)
  );

DROP POLICY IF EXISTS "pavimento_originals_select" ON storage.objects;
CREATE POLICY "pavimento_originals_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'pavimento-originals'
    AND public.can_access_render_storage_object(name)
  );

DROP POLICY IF EXISTS "pavimento_results_insert" ON storage.objects;
CREATE POLICY "pavimento_results_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'pavimento-results'
    AND public.can_access_render_storage_object(name)
  );

DROP POLICY IF EXISTS "stanza_originals_insert" ON storage.objects;
CREATE POLICY "stanza_originals_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'stanza-originals'
    AND public.can_access_render_storage_object(name)
  );

DROP POLICY IF EXISTS "stanza_originals_select" ON storage.objects;
CREATE POLICY "stanza_originals_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'stanza-originals'
    AND public.can_access_render_storage_object(name)
  );

DROP POLICY IF EXISTS "stanza_results_insert" ON storage.objects;
CREATE POLICY "stanza_results_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'stanza-results'
    AND public.can_access_render_storage_object(name)
  );

DROP POLICY IF EXISTS "pergole_originals_insert" ON storage.objects;
CREATE POLICY "pergole_originals_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'pergole-originals'
    AND public.can_access_render_storage_object(name)
  );

DROP POLICY IF EXISTS "pergole_originals_select" ON storage.objects;
CREATE POLICY "pergole_originals_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'pergole-originals'
    AND public.can_access_render_storage_object(name)
  );

DROP POLICY IF EXISTS "pergole_results_insert" ON storage.objects;
CREATE POLICY "pergole_results_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'pergole-results'
    AND public.can_access_render_storage_object(name)
  );

DROP POLICY IF EXISTS "piscine_originals_insert" ON storage.objects;
CREATE POLICY "piscine_originals_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'piscine-originals'
    AND public.can_access_render_storage_object(name)
  );

DROP POLICY IF EXISTS "piscine_originals_select" ON storage.objects;
CREATE POLICY "piscine_originals_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'piscine-originals'
    AND public.can_access_render_storage_object(name)
  );

DROP POLICY IF EXISTS "piscine_results_insert" ON storage.objects;
CREATE POLICY "piscine_results_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'piscine-results'
    AND public.can_access_render_storage_object(name)
  );

DROP POLICY IF EXISTS "render_originals_effective_company_insert" ON storage.objects;
CREATE POLICY "render_originals_effective_company_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'render-originals'
    AND public.can_access_render_storage_object(name)
  );

DROP POLICY IF EXISTS "render_originals_effective_company_select" ON storage.objects;
CREATE POLICY "render_originals_effective_company_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'render-originals'
    AND public.can_access_render_storage_object(name)
  );

DROP POLICY IF EXISTS "render_results_effective_company_insert" ON storage.objects;
CREATE POLICY "render_results_effective_company_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'render-results'
    AND public.can_access_render_storage_object(name)
  );

DROP POLICY IF EXISTS "facciata_originals_insert" ON storage.objects;
CREATE POLICY "facciata_originals_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'facciata-originals'
    AND public.can_access_render_storage_object(name)
  );

DROP POLICY IF EXISTS "facciata_originals_select" ON storage.objects;
CREATE POLICY "facciata_originals_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'facciata-originals'
    AND public.can_access_render_storage_object(name)
  );

DROP POLICY IF EXISTS "facciata_results_insert" ON storage.objects;
CREATE POLICY "facciata_results_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'facciata-results'
    AND public.can_access_render_storage_object(name)
  );

DROP POLICY IF EXISTS "tetto_originals_insert" ON storage.objects;
CREATE POLICY "tetto_originals_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'tetto-originals'
    AND public.can_access_render_storage_object(name)
  );

DROP POLICY IF EXISTS "tetto_originals_select" ON storage.objects;
CREATE POLICY "tetto_originals_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'tetto-originals'
    AND public.can_access_render_storage_object(name)
  );

DROP POLICY IF EXISTS "tetto_results_insert" ON storage.objects;
CREATE POLICY "tetto_results_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'tetto-results'
    AND public.can_access_render_storage_object(name)
  );

DROP POLICY IF EXISTS "persiane_originals_insert" ON storage.objects;
CREATE POLICY "persiane_originals_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'persiane-originals'
    AND public.can_access_render_storage_object(name)
  );

DROP POLICY IF EXISTS "persiane_originals_select" ON storage.objects;
CREATE POLICY "persiane_originals_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'persiane-originals'
    AND public.can_access_render_storage_object(name)
  );

NOTIFY pgrst, 'reload schema';
