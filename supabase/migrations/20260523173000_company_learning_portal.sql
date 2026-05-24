-- Company Learning Portal
-- LMS interno multi-tenant per corsi, procedure, manuali e avanzamento persone.

CREATE TABLE IF NOT EXISTS public.portal_courses (
  id TEXT NOT NULL,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK (length(trim(title)) BETWEEN 2 AND 180),
  description TEXT NOT NULL DEFAULT '',
  area TEXT NOT NULL CHECK (area IN ('sicurezza', 'procedure', 'commerciale', 'onboarding', 'tecnica')),
  audience TEXT NOT NULL CHECK (audience IN ('tutti', 'operai', 'ufficio', 'commerciali', 'capicantiere')),
  status TEXT NOT NULL DEFAULT 'bozza' CHECK (status IN ('bozza', 'pubblicato', 'revisione')),
  owner TEXT NOT NULL DEFAULT 'Team',
  enrolled_count INTEGER NOT NULL DEFAULT 0 CHECK (enrolled_count >= 0),
  completion_percent INTEGER NOT NULL DEFAULT 0 CHECK (completion_percent BETWEEN 0 AND 100),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_by UUID,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (company_id, id)
);

CREATE TABLE IF NOT EXISTS public.portal_course_modules (
  id TEXT NOT NULL,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  course_id TEXT NOT NULL,
  title TEXT NOT NULL CHECK (length(trim(title)) BETWEEN 2 AND 180),
  description TEXT NOT NULL DEFAULT '',
  lessons INTEGER NOT NULL DEFAULT 0 CHECK (lessons >= 0),
  duration TEXT NOT NULL DEFAULT 'Da definire',
  completed_rate INTEGER NOT NULL DEFAULT 0 CHECK (completed_rate BETWEEN 0 AND 100),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (company_id, course_id, id),
  FOREIGN KEY (company_id, course_id)
    REFERENCES public.portal_courses(company_id, id)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.portal_course_assets (
  id TEXT NOT NULL,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  course_id TEXT NOT NULL,
  title TEXT NOT NULL CHECK (length(trim(title)) BETWEEN 2 AND 180),
  type TEXT NOT NULL CHECK (type IN ('video', 'pdf', 'procedura', 'quiz', 'link', 'testo', 'immagine', 'documento')),
  duration TEXT NOT NULL DEFAULT 'Da definire',
  module_id TEXT,
  storage_path TEXT,
  external_url TEXT,
  is_downloadable BOOLEAN NOT NULL DEFAULT true,
  content_text TEXT,
  file_name TEXT,
  file_size BIGINT CHECK (file_size IS NULL OR file_size >= 0),
  mime_type TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (company_id, course_id, id),
  FOREIGN KEY (company_id, course_id)
    REFERENCES public.portal_courses(company_id, id)
    ON DELETE CASCADE
);

ALTER TABLE public.portal_course_assets
  ADD COLUMN IF NOT EXISTS module_id TEXT,
  ADD COLUMN IF NOT EXISTS storage_path TEXT,
  ADD COLUMN IF NOT EXISTS external_url TEXT,
  ADD COLUMN IF NOT EXISTS is_downloadable BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS content_text TEXT,
  ADD COLUMN IF NOT EXISTS file_name TEXT,
  ADD COLUMN IF NOT EXISTS file_size BIGINT,
  ADD COLUMN IF NOT EXISTS mime_type TEXT;

ALTER TABLE public.portal_course_assets
  DROP CONSTRAINT IF EXISTS portal_course_assets_type_check;

ALTER TABLE public.portal_course_assets
  ADD CONSTRAINT portal_course_assets_type_check
  CHECK (type IN ('video', 'pdf', 'procedura', 'quiz', 'link', 'testo', 'immagine', 'documento'));

CREATE TABLE IF NOT EXISTS public.portal_course_enrollments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  course_id TEXT NOT NULL,
  user_id UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'assegnato' CHECK (status IN ('assegnato', 'in_corso', 'completato', 'in_ritardo')),
  progress_percent INTEGER NOT NULL DEFAULT 0 CHECK (progress_percent BETWEEN 0 AND 100),
  due_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  assigned_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, course_id, user_id),
  FOREIGN KEY (company_id, course_id)
    REFERENCES public.portal_courses(company_id, id)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.portal_course_activity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  course_id TEXT,
  actor_id UUID,
  event_type TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (company_id, course_id)
    REFERENCES public.portal_courses(company_id, id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_portal_courses_company_status
  ON public.portal_courses(company_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_portal_courses_company_area
  ON public.portal_courses(company_id, area, sort_order);
CREATE INDEX IF NOT EXISTS idx_portal_modules_course_order
  ON public.portal_course_modules(company_id, course_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_portal_assets_course_order
  ON public.portal_course_assets(company_id, course_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_portal_assets_module
  ON public.portal_course_assets(company_id, course_id, module_id)
  WHERE module_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_portal_enrollments_user
  ON public.portal_course_enrollments(company_id, user_id, status);
CREATE INDEX IF NOT EXISTS idx_portal_activity_course
  ON public.portal_course_activity(company_id, course_id, created_at DESC);

DROP TRIGGER IF EXISTS trg_portal_courses_updated_at ON public.portal_courses;
CREATE TRIGGER trg_portal_courses_updated_at
  BEFORE UPDATE ON public.portal_courses
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_portal_modules_updated_at ON public.portal_course_modules;
CREATE TRIGGER trg_portal_modules_updated_at
  BEFORE UPDATE ON public.portal_course_modules
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_portal_assets_updated_at ON public.portal_course_assets;
CREATE TRIGGER trg_portal_assets_updated_at
  BEFORE UPDATE ON public.portal_course_assets
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_portal_enrollments_updated_at ON public.portal_course_enrollments;
CREATE TRIGGER trg_portal_enrollments_updated_at
  BEFORE UPDATE ON public.portal_course_enrollments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.portal_courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portal_course_modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portal_course_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portal_course_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portal_course_activity ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "portal_courses_company_access" ON public.portal_courses;
CREATE POLICY "portal_courses_company_access" ON public.portal_courses
  FOR ALL TO authenticated
  USING (
    company_id IN (
      SELECT company_id FROM public.profiles WHERE id = auth.uid()
      UNION
      SELECT company_id FROM public.multi_company_access WHERE user_id = auth.uid()
    )
    OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
  )
  WITH CHECK (
    company_id IN (
      SELECT company_id FROM public.profiles WHERE id = auth.uid()
      UNION
      SELECT company_id FROM public.multi_company_access WHERE user_id = auth.uid()
    )
    OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
  );

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
  )
  WITH CHECK (
    company_id IN (
      SELECT company_id FROM public.profiles WHERE id = auth.uid()
      UNION
      SELECT company_id FROM public.multi_company_access WHERE user_id = auth.uid()
    )
    OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
  );

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
  )
  WITH CHECK (
    company_id IN (
      SELECT company_id FROM public.profiles WHERE id = auth.uid()
      UNION
      SELECT company_id FROM public.multi_company_access WHERE user_id = auth.uid()
    )
    OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
  );

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
    company_id IN (
      SELECT company_id FROM public.profiles WHERE id = auth.uid()
      UNION
      SELECT company_id FROM public.multi_company_access WHERE user_id = auth.uid()
    )
    OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
  );

DROP POLICY IF EXISTS "portal_activity_company_access" ON public.portal_course_activity;
CREATE POLICY "portal_activity_company_access" ON public.portal_course_activity
  FOR ALL TO authenticated
  USING (
    company_id IN (
      SELECT company_id FROM public.profiles WHERE id = auth.uid()
      UNION
      SELECT company_id FROM public.multi_company_access WHERE user_id = auth.uid()
    )
    OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
  )
  WITH CHECK (
    company_id IN (
      SELECT company_id FROM public.profiles WHERE id = auth.uid()
      UNION
      SELECT company_id FROM public.multi_company_access WHERE user_id = auth.uid()
    )
    OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
  );

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'portal-materials',
  'portal-materials',
  false,
  104857600,
  ARRAY[
    'application/pdf',
    'video/mp4',
    'video/quicktime',
    'image/jpeg',
    'image/png',
    'image/webp',
    'text/plain',
    'text/markdown',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation'
  ]
)
ON CONFLICT (id) DO NOTHING;

UPDATE storage.buckets
SET
  file_size_limit = 104857600,
  allowed_mime_types = ARRAY[
    'application/pdf',
    'video/mp4',
    'video/quicktime',
    'image/jpeg',
    'image/png',
    'image/webp',
    'text/plain',
    'text/markdown',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation'
  ]
WHERE id = 'portal-materials';

DROP POLICY IF EXISTS "portal_materials_company_read" ON storage.objects;
CREATE POLICY "portal_materials_company_read" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'portal-materials'
    AND (
      (storage.foldername(name))[1] IN (
        SELECT company_id::text FROM public.profiles WHERE id = auth.uid()
        UNION
        SELECT company_id::text FROM public.multi_company_access WHERE user_id = auth.uid()
      )
      OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
    )
  );

DROP POLICY IF EXISTS "portal_materials_company_insert" ON storage.objects;
CREATE POLICY "portal_materials_company_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'portal-materials'
    AND (
      (storage.foldername(name))[1] IN (
        SELECT company_id::text FROM public.profiles WHERE id = auth.uid()
        UNION
        SELECT company_id::text FROM public.multi_company_access WHERE user_id = auth.uid()
      )
      OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
    )
  );

DROP POLICY IF EXISTS "portal_materials_company_update" ON storage.objects;
CREATE POLICY "portal_materials_company_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'portal-materials'
    AND (
      (storage.foldername(name))[1] IN (
        SELECT company_id::text FROM public.profiles WHERE id = auth.uid()
        UNION
        SELECT company_id::text FROM public.multi_company_access WHERE user_id = auth.uid()
      )
      OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
    )
  )
  WITH CHECK (
    bucket_id = 'portal-materials'
    AND (
      (storage.foldername(name))[1] IN (
        SELECT company_id::text FROM public.profiles WHERE id = auth.uid()
        UNION
        SELECT company_id::text FROM public.multi_company_access WHERE user_id = auth.uid()
      )
      OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
    )
  );

DROP POLICY IF EXISTS "portal_materials_company_delete" ON storage.objects;
CREATE POLICY "portal_materials_company_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'portal-materials'
    AND (
      (storage.foldername(name))[1] IN (
        SELECT company_id::text FROM public.profiles WHERE id = auth.uid()
        UNION
        SELECT company_id::text FROM public.multi_company_access WHERE user_id = auth.uid()
      )
      OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
    )
  );

CREATE OR REPLACE FUNCTION public.upsert_portal_course(
  p_company_id UUID,
  p_course JSONB
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_course_id TEXT := p_course->>'id';
  v_status TEXT := COALESCE(p_course->>'status', 'bozza');
BEGIN
  IF v_course_id IS NULL OR length(trim(v_course_id)) = 0 THEN
    RAISE EXCEPTION 'course_id_required';
  END IF;

  INSERT INTO public.portal_courses (
    id,
    company_id,
    title,
    description,
    area,
    audience,
    status,
    owner,
    enrolled_count,
    completion_percent,
    created_by,
    published_at
  )
  VALUES (
    v_course_id,
    p_company_id,
    COALESCE(NULLIF(trim(p_course->>'title'), ''), 'Corso senza titolo'),
    COALESCE(p_course->>'description', ''),
    COALESCE(p_course->>'area', 'onboarding'),
    COALESCE(p_course->>'audience', 'tutti'),
    v_status,
    COALESCE(NULLIF(trim(p_course->>'owner'), ''), 'Team'),
    COALESCE((p_course->>'enrolled')::INTEGER, 0),
    COALESCE((p_course->>'completion')::INTEGER, 0),
    auth.uid(),
    CASE WHEN v_status = 'pubblicato' THEN now() ELSE NULL END
  )
  ON CONFLICT (company_id, id)
  DO UPDATE SET
    title = EXCLUDED.title,
    description = EXCLUDED.description,
    area = EXCLUDED.area,
    audience = EXCLUDED.audience,
    status = EXCLUDED.status,
    owner = EXCLUDED.owner,
    enrolled_count = EXCLUDED.enrolled_count,
    completion_percent = EXCLUDED.completion_percent,
    published_at = CASE
      WHEN EXCLUDED.status = 'pubblicato'
        THEN COALESCE(public.portal_courses.published_at, now())
      ELSE NULL
    END;

  DELETE FROM public.portal_course_modules
  WHERE company_id = p_company_id
    AND course_id = v_course_id;

  INSERT INTO public.portal_course_modules (
    id,
    company_id,
    course_id,
    title,
    description,
    lessons,
    duration,
    completed_rate,
    sort_order
  )
  SELECT
    COALESCE(module_item.value->>'id', 'module-' || module_item.ordinality::TEXT),
    p_company_id,
    v_course_id,
    COALESCE(NULLIF(trim(module_item.value->>'title'), ''), 'Modulo senza titolo'),
    COALESCE(module_item.value->>'description', ''),
    COALESCE((module_item.value->>'lessons')::INTEGER, 0),
    COALESCE(module_item.value->>'duration', 'Da definire'),
    COALESCE((module_item.value->>'completedRate')::INTEGER, 0),
    module_item.ordinality::INTEGER - 1
  FROM jsonb_array_elements(COALESCE(p_course->'modules', '[]'::jsonb)) WITH ORDINALITY AS module_item(value, ordinality);

  DELETE FROM public.portal_course_assets
  WHERE company_id = p_company_id
    AND course_id = v_course_id;

  INSERT INTO public.portal_course_assets (
    id,
    company_id,
    course_id,
    title,
    type,
    duration,
    module_id,
    storage_path,
    external_url,
    is_downloadable,
    content_text,
    file_name,
    file_size,
    mime_type,
    sort_order
  )
  SELECT
    COALESCE(asset_item.value->>'id', 'asset-' || asset_item.ordinality::TEXT),
    p_company_id,
    v_course_id,
    COALESCE(NULLIF(trim(asset_item.value->>'title'), ''), 'Materiale senza titolo'),
    COALESCE(asset_item.value->>'type', 'pdf'),
    COALESCE(asset_item.value->>'duration', 'Da definire'),
    CASE
      WHEN EXISTS (
        SELECT 1
        FROM jsonb_array_elements(COALESCE(p_course->'modules', '[]'::jsonb)) AS module_guard(value)
        WHERE module_guard.value->>'id' = NULLIF(asset_item.value->>'moduleId', '')
      )
        THEN NULLIF(asset_item.value->>'moduleId', '')
      ELSE NULL
    END,
	    CASE
	      WHEN lower(COALESCE(asset_item.value->>'source', '')) LIKE 'http%' THEN NULL
	      WHEN lower(COALESCE(asset_item.value->>'source', '')) LIKE 'locale/%' THEN NULL
	      ELSE NULLIF(asset_item.value->>'source', '')
	    END,
    COALESCE(
      CASE
        WHEN lower(COALESCE(asset_item.value->>'downloadUrl', '')) LIKE 'http%' THEN asset_item.value->>'downloadUrl'
        ELSE NULL
      END,
      CASE
        WHEN lower(COALESCE(asset_item.value->>'source', '')) LIKE 'http%' THEN asset_item.value->>'source'
        ELSE NULL
      END
    ),
    COALESCE((asset_item.value->>'downloadable')::BOOLEAN, true),
    NULLIF(asset_item.value->>'content', ''),
    NULLIF(asset_item.value->>'fileName', ''),
    NULLIF(asset_item.value->>'fileSize', '')::BIGINT,
    NULLIF(asset_item.value->>'mimeType', ''),
    asset_item.ordinality::INTEGER - 1
  FROM jsonb_array_elements(COALESCE(p_course->'assets', '[]'::jsonb)) WITH ORDINALITY AS asset_item(value, ordinality);

  INSERT INTO public.portal_course_activity (
    company_id,
    course_id,
    actor_id,
    event_type,
    metadata
  )
  VALUES (
    p_company_id,
    v_course_id,
    auth.uid(),
    'course_saved',
    jsonb_build_object(
      'status', v_status,
      'modules', jsonb_array_length(COALESCE(p_course->'modules', '[]'::jsonb)),
      'assets', jsonb_array_length(COALESCE(p_course->'assets', '[]'::jsonb))
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_portal_course(UUID, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.upsert_portal_course(UUID, JSONB) TO authenticated;
