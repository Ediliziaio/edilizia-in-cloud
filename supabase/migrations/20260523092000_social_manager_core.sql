-- Social Manager core schema: accounts, media library, posts, publish jobs, inbox.

CREATE OR REPLACE FUNCTION public.social_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TABLE IF NOT EXISTS public.social_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  platform_id text NOT NULL CHECK (platform_id IN ('facebook','instagram','linkedin','youtube','tiktok')),
  page_id text NOT NULL,
  page_name text NOT NULL,
  username text,
  followers integer DEFAULT 0,
  token_expires_at timestamptz,
  scopes text[] NOT NULL DEFAULT '{}',
  is_active boolean NOT NULL DEFAULT true,
  connected_by uuid DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
  connected_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, platform_id, page_id)
);

CREATE TABLE IF NOT EXISTS public.social_account_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES public.social_accounts(id) ON DELETE CASCADE,
  access_token_encrypted text NOT NULL,
  refresh_token_encrypted text,
  token_expires_at timestamptz,
  scopes text[] NOT NULL DEFAULT '{}',
  provider_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_id)
);

CREATE TABLE IF NOT EXISTS public.social_media_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  title text NOT NULL,
  media_type text NOT NULL DEFAULT 'image' CHECK (media_type IN ('image','video','story')),
  format text NOT NULL DEFAULT '4:5' CHECK (format IN ('9:16','4:5','1:1','16:9')),
  public_url text,
  thumbnail_url text,
  storage_path text,
  gradient text,
  category text NOT NULL DEFAULT 'portfolio' CHECK (category IN ('portfolio','promo','team','cantiere','prodotto')),
  tags text[] NOT NULL DEFAULT '{}',
  ai_generated boolean NOT NULL DEFAULT false,
  file_size_bytes bigint,
  file_size_label text,
  used_in_posts integer NOT NULL DEFAULT 0,
  used_in_ads integer NOT NULL DEFAULT 0,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.social_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  platforms text[] NOT NULL DEFAULT '{}',
  content_type text NOT NULL DEFAULT 'post',
  text text NOT NULL DEFAULT '',
  platform_texts jsonb NOT NULL DEFAULT '{}'::jsonb,
  image_url text,
  media_item_id uuid REFERENCES public.social_media_items(id) ON DELETE SET NULL,
  hashtags text[] NOT NULL DEFAULT '{}',
  first_comment text,
  scheduled_at timestamptz,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','scheduled','published','failed','review')),
  review_note text,
  publish_result jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.social_publish_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  post_id uuid NOT NULL REFERENCES public.social_posts(id) ON DELETE CASCADE,
  platform_id text NOT NULL CHECK (platform_id IN ('facebook','instagram','linkedin','youtube','tiktok')),
  external_post_id text,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','processing','posted','failed','skipped')),
  attempts integer NOT NULL DEFAULT 0,
  scheduled_for timestamptz,
  processed_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.social_inbox_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  account_id uuid REFERENCES public.social_accounts(id) ON DELETE SET NULL,
  platform_id text NOT NULL CHECK (platform_id IN ('facebook','instagram','linkedin','youtube','tiktok')),
  external_id text NOT NULL,
  type text NOT NULL CHECK (type IN ('comment','dm','mention','review')),
  author_name text NOT NULL,
  author_avatar text,
  post_preview text,
  message text NOT NULL,
  sentiment text CHECK (sentiment IN ('positive','neutral','negative')),
  status text NOT NULL DEFAULT 'unread' CHECK (status IN ('unread','read','replied','archived')),
  starred boolean NOT NULL DEFAULT false,
  external_created_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, platform_id, external_id)
);

CREATE INDEX IF NOT EXISTS idx_social_accounts_company ON public.social_accounts(company_id, is_active);
CREATE INDEX IF NOT EXISTS idx_social_account_tokens_account ON public.social_account_tokens(account_id);
CREATE INDEX IF NOT EXISTS idx_social_posts_company_status ON public.social_posts(company_id, status, scheduled_at DESC);
CREATE INDEX IF NOT EXISTS idx_social_posts_created ON public.social_posts(company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_social_media_company_created ON public.social_media_items(company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_social_publish_jobs_due ON public.social_publish_jobs(status, scheduled_for);
CREATE INDEX IF NOT EXISTS idx_social_inbox_company_status ON public.social_inbox_items(company_id, status, external_created_at DESC);

DROP TRIGGER IF EXISTS trg_social_accounts_updated_at ON public.social_accounts;
CREATE TRIGGER trg_social_accounts_updated_at
  BEFORE UPDATE ON public.social_accounts
  FOR EACH ROW EXECUTE FUNCTION public.social_set_updated_at();

DROP TRIGGER IF EXISTS trg_social_account_tokens_updated_at ON public.social_account_tokens;
CREATE TRIGGER trg_social_account_tokens_updated_at
  BEFORE UPDATE ON public.social_account_tokens
  FOR EACH ROW EXECUTE FUNCTION public.social_set_updated_at();

DROP TRIGGER IF EXISTS trg_social_media_items_updated_at ON public.social_media_items;
CREATE TRIGGER trg_social_media_items_updated_at
  BEFORE UPDATE ON public.social_media_items
  FOR EACH ROW EXECUTE FUNCTION public.social_set_updated_at();

DROP TRIGGER IF EXISTS trg_social_posts_updated_at ON public.social_posts;
CREATE TRIGGER trg_social_posts_updated_at
  BEFORE UPDATE ON public.social_posts
  FOR EACH ROW EXECUTE FUNCTION public.social_set_updated_at();

DROP TRIGGER IF EXISTS trg_social_publish_jobs_updated_at ON public.social_publish_jobs;
CREATE TRIGGER trg_social_publish_jobs_updated_at
  BEFORE UPDATE ON public.social_publish_jobs
  FOR EACH ROW EXECUTE FUNCTION public.social_set_updated_at();

DROP TRIGGER IF EXISTS trg_social_inbox_items_updated_at ON public.social_inbox_items;
CREATE TRIGGER trg_social_inbox_items_updated_at
  BEFORE UPDATE ON public.social_inbox_items
  FOR EACH ROW EXECUTE FUNCTION public.social_set_updated_at();

ALTER TABLE public.social_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_account_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_media_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_publish_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_inbox_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS social_accounts_company_access ON public.social_accounts;
CREATE POLICY social_accounts_company_access ON public.social_accounts
  FOR ALL TO authenticated
  USING (
    company_id IN (
      SELECT company_id FROM public.profiles WHERE id = auth.uid()
      UNION
      SELECT company_id FROM public.multi_company_access WHERE user_id = auth.uid()
    )
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
  )
  WITH CHECK (
    company_id IN (
      SELECT company_id FROM public.profiles WHERE id = auth.uid()
      UNION
      SELECT company_id FROM public.multi_company_access WHERE user_id = auth.uid()
    )
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
  );

DROP POLICY IF EXISTS social_account_tokens_service_role ON public.social_account_tokens;
CREATE POLICY social_account_tokens_service_role ON public.social_account_tokens
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS social_media_items_company_access ON public.social_media_items;
CREATE POLICY social_media_items_company_access ON public.social_media_items
  FOR ALL TO authenticated
  USING (
    company_id IN (
      SELECT company_id FROM public.profiles WHERE id = auth.uid()
      UNION
      SELECT company_id FROM public.multi_company_access WHERE user_id = auth.uid()
    )
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
  )
  WITH CHECK (
    company_id IN (
      SELECT company_id FROM public.profiles WHERE id = auth.uid()
      UNION
      SELECT company_id FROM public.multi_company_access WHERE user_id = auth.uid()
    )
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
  );

DROP POLICY IF EXISTS social_posts_company_access ON public.social_posts;
CREATE POLICY social_posts_company_access ON public.social_posts
  FOR ALL TO authenticated
  USING (
    company_id IN (
      SELECT company_id FROM public.profiles WHERE id = auth.uid()
      UNION
      SELECT company_id FROM public.multi_company_access WHERE user_id = auth.uid()
    )
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
  )
  WITH CHECK (
    company_id IN (
      SELECT company_id FROM public.profiles WHERE id = auth.uid()
      UNION
      SELECT company_id FROM public.multi_company_access WHERE user_id = auth.uid()
    )
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
  );

DROP POLICY IF EXISTS social_publish_jobs_service_role ON public.social_publish_jobs;
CREATE POLICY social_publish_jobs_service_role ON public.social_publish_jobs
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS social_inbox_items_company_access ON public.social_inbox_items;
CREATE POLICY social_inbox_items_company_access ON public.social_inbox_items
  FOR ALL TO authenticated
  USING (
    company_id IN (
      SELECT company_id FROM public.profiles WHERE id = auth.uid()
      UNION
      SELECT company_id FROM public.multi_company_access WHERE user_id = auth.uid()
    )
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
  )
  WITH CHECK (
    company_id IN (
      SELECT company_id FROM public.profiles WHERE id = auth.uid()
      UNION
      SELECT company_id FROM public.multi_company_access WHERE user_id = auth.uid()
    )
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
  );

COMMENT ON TABLE public.social_accounts IS 'Pagine e profili social collegati per azienda';
COMMENT ON TABLE public.social_account_tokens IS 'Token OAuth social separati dalla superficie client; accesso riservato a service role/edge functions';
COMMENT ON TABLE public.social_media_items IS 'Libreria media riusabile da social composer e ads';
COMMENT ON TABLE public.social_posts IS 'Bozze, revisioni e pianificazioni social per azienda';
COMMENT ON TABLE public.social_publish_jobs IS 'Coda futura per publisher social backend';
COMMENT ON TABLE public.social_inbox_items IS 'Inbox social normalizzata da commenti, DM, menzioni e recensioni';
