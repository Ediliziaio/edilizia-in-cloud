-- ============================================================================
-- Portal Admin Grants — Accesso condiviso ai corsi Superadmin
-- ============================================================================
-- Modello: un corso vive in UN SOLO posto (PLATFORM_ADMIN_COMPANY_ID) e il
-- Superadmin concede ACCESSO READ-ONLY a N aziende clienti. Non si clona
-- nulla. Quando il Superadmin modifica il corso, tutte le aziende vedono
-- subito le modifiche.
--
-- Tabelle:
--   portal_course_grants — quale corso piattaforma è visibile a quale azienda
--
-- Le aziende beneficiarie possono:
--   - Visualizzare il corso (incluso moduli + asset)
--   - Iscrivere i propri membri (enrollment scoped alla loro company)
--   - Tracciare progressi (scoped)
-- NON possono:
--   - Modificare il corso (UPDATE/DELETE bloccati da RLS)
--   - Aggiungere moduli/asset
--   - Vedere i propri corsi confusi con quelli platform
--
-- Workflow:
--   1. Superadmin crea corso in /admin/portale-formazione
--   2. Apre "Concedi accesso" → seleziona aziende destinatarie
--   3. Insert in portal_course_grants
--   4. Aziende vedono il corso flaggato "Piattaforma" nel proprio portale
-- ============================================================================

-- ─── 1) Tabella grants ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.portal_course_grants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Corso sorgente (sempre nella PLATFORM_ADMIN_COMPANY_ID).
  source_company_id UUID NOT NULL,
  course_id TEXT NOT NULL,
  -- Azienda destinataria dell'accesso.
  target_company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  -- Stato dell'accesso. "granted" = visibile, "revoked" = nascosto.
  status TEXT NOT NULL DEFAULT 'granted' CHECK (status IN ('granted', 'revoked')),
  granted_by UUID,
  granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at TIMESTAMPTZ,
  notes TEXT,
  UNIQUE (source_company_id, course_id, target_company_id),
  FOREIGN KEY (source_company_id, course_id)
    REFERENCES public.portal_courses(company_id, id)
    ON DELETE CASCADE
);

COMMENT ON TABLE public.portal_course_grants IS
  'Concessione di accesso read-only a un corso del portale Superadmin verso un''azienda cliente. Niente clonazione: il corso resta uno solo nella platform admin company.';

CREATE INDEX IF NOT EXISTS idx_portal_grants_target
  ON public.portal_course_grants(target_company_id, status)
  WHERE status = 'granted';

CREATE INDEX IF NOT EXISTS idx_portal_grants_source_course
  ON public.portal_course_grants(source_company_id, course_id, status);

ALTER TABLE public.portal_course_grants ENABLE ROW LEVEL SECURITY;

-- ─── 2) RLS sui grants ───────────────────────────────────────────────────
-- Super admin: full control (read/write).
-- Azienda target: può leggere le righe che la riguardano (per UI "vedo che
-- mi è stato concesso accesso a questi corsi") — niente write.
DROP POLICY IF EXISTS "portal_grants_super_admin_all" ON public.portal_course_grants;
CREATE POLICY "portal_grants_super_admin_all" ON public.portal_course_grants
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::public.app_role));

DROP POLICY IF EXISTS "portal_grants_target_read" ON public.portal_course_grants;
CREATE POLICY "portal_grants_target_read" ON public.portal_course_grants
  FOR SELECT TO authenticated
  USING (
    target_company_id IN (
      SELECT company_id FROM public.profiles WHERE id = auth.uid()
      UNION
      SELECT company_id FROM public.multi_company_access WHERE user_id = auth.uid()
    )
  );

-- ─── 3) Estendere RLS dei portal_courses per aziende con grant ──────────
-- Le policy esistenti consentono accesso solo se company_id = company utente
-- OPPURE se super_admin. Aggiungiamo una clausola "OR esiste un grant attivo
-- per questa azienda → questo corso".
DROP POLICY IF EXISTS "portal_courses_company_access" ON public.portal_courses;
CREATE POLICY "portal_courses_company_access" ON public.portal_courses
  FOR ALL TO authenticated
  USING (
    -- A) Corso di proprietà dell'azienda utente
    company_id IN (
      SELECT company_id FROM public.profiles WHERE id = auth.uid()
      UNION
      SELECT company_id FROM public.multi_company_access WHERE user_id = auth.uid()
    )
    -- B) Super admin vede tutto
    OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
    -- C) Corso platform a cui l'azienda utente ha grant attivo (READ-ONLY)
    OR EXISTS (
      SELECT 1 FROM public.portal_course_grants g
      WHERE g.source_company_id = public.portal_courses.company_id
        AND g.course_id = public.portal_courses.id
        AND g.status = 'granted'
        AND g.target_company_id IN (
          SELECT company_id FROM public.profiles WHERE id = auth.uid()
          UNION
          SELECT company_id FROM public.multi_company_access WHERE user_id = auth.uid()
        )
    )
  )
  WITH CHECK (
    -- WRITE consentito SOLO al proprietario reale del corso o super_admin.
    -- I grant NON consentono modifica (read-only).
    company_id IN (
      SELECT company_id FROM public.profiles WHERE id = auth.uid()
      UNION
      SELECT company_id FROM public.multi_company_access WHERE user_id = auth.uid()
    )
    OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
  );

-- ─── Idem per portal_course_modules ──────────────────────────────────────
DROP POLICY IF EXISTS "portal_modules_company_access" ON public.portal_course_modules;
CREATE POLICY "portal_modules_company_access" ON public.portal_course_modules
  FOR ALL TO authenticated
  USING (
    company_id IN (
      SELECT company_id FROM public.profiles WHERE id = auth.uid()
      UNION
      SELECT company_id FROM public.multi_company_access WHERE user_id = auth.uid()
    )
    OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
    OR EXISTS (
      SELECT 1 FROM public.portal_course_grants g
      WHERE g.source_company_id = public.portal_course_modules.company_id
        AND g.course_id = public.portal_course_modules.course_id
        AND g.status = 'granted'
        AND g.target_company_id IN (
          SELECT company_id FROM public.profiles WHERE id = auth.uid()
          UNION
          SELECT company_id FROM public.multi_company_access WHERE user_id = auth.uid()
        )
    )
  )
  WITH CHECK (
    company_id IN (
      SELECT company_id FROM public.profiles WHERE id = auth.uid()
      UNION
      SELECT company_id FROM public.multi_company_access WHERE user_id = auth.uid()
    )
    OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
  );

-- ─── Idem per portal_course_assets ──────────────────────────────────────
DROP POLICY IF EXISTS "portal_assets_company_access" ON public.portal_course_assets;
CREATE POLICY "portal_assets_company_access" ON public.portal_course_assets
  FOR ALL TO authenticated
  USING (
    company_id IN (
      SELECT company_id FROM public.profiles WHERE id = auth.uid()
      UNION
      SELECT company_id FROM public.multi_company_access WHERE user_id = auth.uid()
    )
    OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
    OR EXISTS (
      SELECT 1 FROM public.portal_course_grants g
      WHERE g.source_company_id = public.portal_course_assets.company_id
        AND g.course_id = public.portal_course_assets.course_id
        AND g.status = 'granted'
        AND g.target_company_id IN (
          SELECT company_id FROM public.profiles WHERE id = auth.uid()
          UNION
          SELECT company_id FROM public.multi_company_access WHERE user_id = auth.uid()
        )
    )
  )
  WITH CHECK (
    company_id IN (
      SELECT company_id FROM public.profiles WHERE id = auth.uid()
      UNION
      SELECT company_id FROM public.multi_company_access WHERE user_id = auth.uid()
    )
    OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
  );

-- ─── 4) Storage bucket: read per aziende con grant attivo ────────────────
-- I file (PDF/video) dei corsi superadmin sono in storage/portal-materials
-- sotto prefix PLATFORM_ADMIN_COMPANY_ID/courseId/...
-- Permetto SELECT (download/signed url) alle aziende che hanno un grant
-- attivo per quel corso.
DROP POLICY IF EXISTS "portal_materials_grant_read" ON storage.objects;
CREATE POLICY "portal_materials_grant_read" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'portal-materials'
    AND EXISTS (
      SELECT 1 FROM public.portal_course_grants g
      WHERE g.source_company_id::text = (storage.foldername(name))[1]
        AND g.course_id = (storage.foldername(name))[2]
        AND g.status = 'granted'
        AND g.target_company_id IN (
          SELECT company_id FROM public.profiles WHERE id = auth.uid()
          UNION
          SELECT company_id FROM public.multi_company_access WHERE user_id = auth.uid()
        )
    )
  );

-- ─── 5) Enrollment policy: ogni azienda traccia i propri membri ─────────
-- Le aziende beneficiarie possono enroll-are i propri utenti sul corso
-- platform (la riga in portal_course_enrollments avrà company_id =
-- azienda beneficiaria, course_id = corso platform). Questo richiede che
-- enrollments NON validi più rigidamente che company_id+course_id esista
-- in portal_courses con stesso company_id (era implicito nella FK).
-- Rimuoviamo la FK rigida e validiamo via grant.
ALTER TABLE public.portal_course_enrollments
  DROP CONSTRAINT IF EXISTS portal_course_enrollments_company_id_course_id_fkey;

-- L'enrollment ora richiede una di queste condizioni (gestita via RLS):
--   A) Il corso è di proprietà di company_id (corso aziendale standard)
--   B) Esiste un grant attivo per company_id verso il corso
DROP POLICY IF EXISTS "portal_enrollments_company_access" ON public.portal_course_enrollments;
CREATE POLICY "portal_enrollments_company_access" ON public.portal_course_enrollments
  FOR ALL TO authenticated
  USING (
    company_id IN (
      SELECT company_id FROM public.profiles WHERE id = auth.uid()
      UNION
      SELECT company_id FROM public.multi_company_access WHERE user_id = auth.uid()
    )
    OR user_id = auth.uid()
    OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
  )
  WITH CHECK (
    -- Per inserire un enrollment l'azienda DEVE:
    --   A) essere proprietaria del corso, OPPURE
    --   B) avere un grant attivo sul corso, OPPURE
    --   C) essere super_admin
    public.has_role(auth.uid(), 'super_admin'::public.app_role)
    OR EXISTS (
      SELECT 1 FROM public.portal_courses pc
      WHERE pc.company_id = portal_course_enrollments.company_id
        AND pc.id = portal_course_enrollments.course_id
    )
    OR EXISTS (
      SELECT 1 FROM public.portal_course_grants g
      WHERE g.target_company_id = portal_course_enrollments.company_id
        AND g.course_id = portal_course_enrollments.course_id
        AND g.status = 'granted'
    )
  );

-- ─── 6) RPC: grant_admin_portal_course_to_companies ──────────────────────
-- Concede accesso a un corso platform a N aziende in un'unica operazione.
-- Skippa silenziosamente le aziende che hanno già un grant attivo.
CREATE OR REPLACE FUNCTION public.grant_admin_portal_course_to_companies(
  p_source_course_id TEXT,
  p_target_company_ids UUID[],
  p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_platform_company_id UUID := '00000000-0000-0000-0000-000000000001'::uuid;
  v_target_company_id UUID;
  v_granted_count INT := 0;
  v_skipped_count INT := 0;
  v_session_role TEXT;
  v_is_super BOOLEAN;
BEGIN
  v_session_role := current_setting('role', true);
  v_is_super := COALESCE(public.has_role(auth.uid(), 'super_admin'::public.app_role), false);
  IF v_session_role <> 'service_role' AND NOT v_is_super THEN
    RAISE EXCEPTION 'permission_denied: solo super_admin può concedere accesso';
  END IF;

  IF p_source_course_id IS NULL OR length(trim(p_source_course_id)) = 0 THEN
    RAISE EXCEPTION 'source_course_id_required';
  END IF;
  IF p_target_company_ids IS NULL OR array_length(p_target_company_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'target_company_ids_required';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.portal_courses
     WHERE company_id = v_platform_company_id AND id = p_source_course_id
  ) THEN
    RAISE EXCEPTION 'source_course_not_found: % nel portale Superadmin', p_source_course_id;
  END IF;

  FOREACH v_target_company_id IN ARRAY p_target_company_ids
  LOOP
    -- Skip self-grant (PLATFORM_ADMIN su PLATFORM_ADMIN)
    IF v_target_company_id = v_platform_company_id THEN
      v_skipped_count := v_skipped_count + 1;
      CONTINUE;
    END IF;

    -- Upsert: se esiste già granted, skip; se revoked, lo riattiva
    INSERT INTO public.portal_course_grants (
      source_company_id,
      course_id,
      target_company_id,
      status,
      granted_by,
      notes
    )
    VALUES (
      v_platform_company_id,
      p_source_course_id,
      v_target_company_id,
      'granted',
      auth.uid(),
      p_notes
    )
    ON CONFLICT (source_company_id, course_id, target_company_id)
    DO UPDATE SET
      status = 'granted',
      granted_at = now(),
      granted_by = auth.uid(),
      revoked_at = NULL,
      notes = COALESCE(EXCLUDED.notes, public.portal_course_grants.notes);

    IF FOUND THEN
      v_granted_count := v_granted_count + 1;
    ELSE
      v_skipped_count := v_skipped_count + 1;
    END IF;

    -- Activity log lato azienda ricevente (visibile alle aziende per audit)
    INSERT INTO public.portal_course_activity (
      company_id,
      course_id,
      actor_id,
      event_type,
      metadata
    )
    VALUES (
      v_target_company_id,
      NULL,  -- l'azienda non ha il corso, è solo grant
      auth.uid(),
      'course_access_granted_by_platform',
      jsonb_build_object(
        'platform_course_id', p_source_course_id,
        'platform_company_id', v_platform_company_id
      )
    );
  END LOOP;

  RETURN jsonb_build_object(
    'granted_count', v_granted_count,
    'skipped_count', v_skipped_count
  );
END;
$$;

REVOKE ALL ON FUNCTION public.grant_admin_portal_course_to_companies(TEXT, UUID[], TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.grant_admin_portal_course_to_companies(TEXT, UUID[], TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.grant_admin_portal_course_to_companies(TEXT, UUID[], TEXT) TO service_role;

-- ─── 7) RPC: revoke_admin_portal_course_from_companies ──────────────────
CREATE OR REPLACE FUNCTION public.revoke_admin_portal_course_from_companies(
  p_source_course_id TEXT,
  p_target_company_ids UUID[]
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_platform_company_id UUID := '00000000-0000-0000-0000-000000000001'::uuid;
  v_revoked_count INT := 0;
  v_session_role TEXT;
BEGIN
  v_session_role := current_setting('role', true);
  IF v_session_role <> 'service_role'
     AND NOT COALESCE(public.has_role(auth.uid(), 'super_admin'::public.app_role), false) THEN
    RAISE EXCEPTION 'permission_denied: solo super_admin può revocare accesso';
  END IF;

  UPDATE public.portal_course_grants
     SET status = 'revoked',
         revoked_at = now()
   WHERE source_company_id = v_platform_company_id
     AND course_id = p_source_course_id
     AND target_company_id = ANY(p_target_company_ids)
     AND status = 'granted';

  GET DIAGNOSTICS v_revoked_count = ROW_COUNT;

  RETURN jsonb_build_object('revoked_count', v_revoked_count);
END;
$$;

REVOKE ALL ON FUNCTION public.revoke_admin_portal_course_from_companies(TEXT, UUID[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.revoke_admin_portal_course_from_companies(TEXT, UUID[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_admin_portal_course_from_companies(TEXT, UUID[]) TO service_role;

-- ─── 8) VIEW: corsi disponibili per un'azienda (own + granted) ──────────
-- Helper opzionale per query lato cliente. Marca con `source_type`:
--   'own'      → corso creato dall'azienda
--   'platform' → corso platform concesso via grant
CREATE OR REPLACE VIEW public.portal_courses_available AS
SELECT
  c.*,
  'own'::text AS source_type,
  NULL::uuid AS granted_to_company_id
FROM public.portal_courses c
UNION ALL
SELECT
  c.*,
  'platform'::text AS source_type,
  g.target_company_id AS granted_to_company_id
FROM public.portal_courses c
JOIN public.portal_course_grants g
  ON g.source_company_id = c.company_id
 AND g.course_id = c.id
WHERE g.status = 'granted';

COMMENT ON VIEW public.portal_courses_available IS
  'Vista unificata: per ogni azienda restituisce i suoi corsi (source_type=own) + i corsi platform a cui ha grant (source_type=platform, granted_to_company_id=target).';

GRANT SELECT ON public.portal_courses_available TO authenticated;
