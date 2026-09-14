-- ============================================================================
-- Social Manager: pubblicazione affidabile su Facebook e Instagram
-- ============================================================================
-- 1. target_page_ids — su quale pagina/account esce il post, per piattaforma:
--    {"facebook": "<page_id>", "instagram": "<page_id della pagina FB a cui è
--    legato l'account IG>"}. Vuoto = l'unica pagina collegata; con più pagine e
--    nessuna scelta il publisher si ferma con un errore invece di pubblicare a
--    caso (prima vinceva l'ultima riga letta da social_accounts).
-- 2. media — i file del post: [{bucket, path, url, type}]. Serve a caroselli e
--    video; image_url resta la copertina e il campo dei post già esistenti.
-- 3. stato 'processing' + next_attempt_at + publish_attempts — un Reel che
--    Instagram sta ancora elaborando, o un errore temporaneo di Meta, non
--    diventa più 'failed' al primo giro: lo riprende social-publish-scheduler.
--    'processing' fa anche da lucchetto contro la doppia pubblicazione (prima
--    si usava 'failed', perché il CHECK non ammetteva altro).
-- 4. bucket privato social-media — i file caricati dal composer. Meta li
--    scarica da un URL firmato che il publisher genera al momento del giro.
--
-- social_posts ha poche decine di righe: nessuna scrittura massiva. I timeout
-- restano per regola di casa.
-- ============================================================================

SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '60s';

ALTER TABLE public.social_posts
  ADD COLUMN IF NOT EXISTS target_page_ids jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS media jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS next_attempt_at timestamptz,
  ADD COLUMN IF NOT EXISTS publish_attempts integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.social_posts.target_page_ids IS
  'Pagina di destinazione per piattaforma ({"facebook": page_id, "instagram": page_id della pagina FB legata all''account IG}). Vuoto = unica pagina collegata.';
COMMENT ON COLUMN public.social_posts.media IS
  'File del post [{bucket, path, url, type: image|video}]. Più di uno = carosello. Vuoto = si usa image_url.';
COMMENT ON COLUMN public.social_posts.next_attempt_at IS
  'Con status=processing: quando il cron riprende il post (contenitore IG in elaborazione, errore temporaneo, lucchetto del giro).';
COMMENT ON COLUMN public.social_posts.publish_attempts IS
  'Giri del publisher su questo post; oltre il tetto il post diventa failed.';

ALTER TABLE public.social_posts DROP CONSTRAINT IF EXISTS social_posts_status_check;
ALTER TABLE public.social_posts ADD CONSTRAINT social_posts_status_check
  CHECK (status IN ('draft', 'scheduled', 'processing', 'published', 'failed', 'review'));

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'social_posts_media_is_array' AND conrelid = 'public.social_posts'::regclass
  ) THEN
    ALTER TABLE public.social_posts
      ADD CONSTRAINT social_posts_media_is_array CHECK (jsonb_typeof(media) = 'array');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'social_posts_target_page_ids_is_object' AND conrelid = 'public.social_posts'::regclass
  ) THEN
    ALTER TABLE public.social_posts
      ADD CONSTRAINT social_posts_target_page_ids_is_object CHECK (jsonb_typeof(target_page_ids) = 'object');
  END IF;
END $$;

-- Scansione del cron sui post da riprendere.
CREATE INDEX IF NOT EXISTS idx_social_posts_processing_due
  ON public.social_posts (next_attempt_at)
  WHERE status = 'processing';

-- ─── Bucket privato per i file del composer ─────────────────────────────────
-- Path: <company_id>/<aaaa-mm>/<uuid>.<ext>. Privato: il client vede l'anteprima
-- con un URL firmato, Meta scarica da un URL firmato generato dal publisher.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'social-media',
  'social-media',
  false,
  209715200, -- 200 MB (Reel)
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/quicktime']
)
ON CONFLICT (id) DO UPDATE
  SET public = false,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS social_media_storage_select ON storage.objects;
CREATE POLICY social_media_storage_select ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'social-media'
    AND CASE
      WHEN (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        THEN public.user_can_access_company(((storage.foldername(name))[1])::uuid)
      ELSE false
    END
  );

DROP POLICY IF EXISTS social_media_storage_insert ON storage.objects;
CREATE POLICY social_media_storage_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'social-media'
    AND CASE
      WHEN (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        THEN public.user_can_access_company(((storage.foldername(name))[1])::uuid)
      ELSE false
    END
  );

DROP POLICY IF EXISTS social_media_storage_delete ON storage.objects;
CREATE POLICY social_media_storage_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'social-media'
    AND CASE
      WHEN (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        THEN public.user_can_access_company(((storage.foldername(name))[1])::uuid)
      ELSE false
    END
  );
