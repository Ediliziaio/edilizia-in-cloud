BEGIN;

CREATE OR REPLACE FUNCTION public.reputation_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.reputation_company_allowed(p_company_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    auth.uid() IS NOT NULL
    AND (
      p_company_id = public.get_my_company_id()
      OR public.is_super_admin(auth.uid())
      OR public.is_silvio_superadmin(auth.uid())
    );
$$;

CREATE TABLE IF NOT EXISTS public.reputation_public_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  public_slug TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT reputation_public_links_slug_not_blank CHECK (length(trim(public_slug)) > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_reputation_public_links_company
  ON public.reputation_public_links(company_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_reputation_public_links_slug
  ON public.reputation_public_links(public_slug);
CREATE INDEX IF NOT EXISTS idx_reputation_public_links_active
  ON public.reputation_public_links(company_id, active);

CREATE TABLE IF NOT EXISTS public.reputation_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  segment TEXT NOT NULL DEFAULT 'Clienti selezionati',
  channel TEXT NOT NULL DEFAULT 'whatsapp'
    CHECK (channel IN ('whatsapp', 'sms', 'email')),
  sent_count INTEGER NOT NULL DEFAULT 0 CHECK (sent_count >= 0),
  opened_count INTEGER NOT NULL DEFAULT 0 CHECK (opened_count >= 0),
  clicked_count INTEGER NOT NULL DEFAULT 0 CHECK (clicked_count >= 0),
  review_count INTEGER NOT NULL DEFAULT 0 CHECK (review_count >= 0),
  status TEXT NOT NULL DEFAULT 'bozza'
    CHECK (status IN ('attiva', 'bozza', 'in_pausa', 'completata')),
  target_order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
  target_customer_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  target_label TEXT,
  message_template TEXT,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT reputation_campaigns_name_not_blank CHECK (length(trim(name)) > 0)
);

CREATE INDEX IF NOT EXISTS idx_reputation_campaigns_company_created
  ON public.reputation_campaigns(company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reputation_campaigns_target_order
  ON public.reputation_campaigns(company_id, target_order_id)
  WHERE target_order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_reputation_campaigns_target_customer
  ON public.reputation_campaigns(company_id, target_customer_id)
  WHERE target_customer_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.reputation_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  campaign_id UUID REFERENCES public.reputation_campaigns(id) ON DELETE SET NULL,
  order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
  customer_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  author TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'Sito'
    CHECK (source IN ('Google', 'Facebook', 'Sito', 'Manuale')),
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  status TEXT NOT NULL DEFAULT 'pubblicata'
    CHECK (status IN ('pubblicata', 'da_rispondere', 'risposta', 'critica')),
  review_date DATE NOT NULL DEFAULT current_date,
  project TEXT NOT NULL DEFAULT 'Feedback pubblico',
  body TEXT NOT NULL,
  ai_reply TEXT,
  sentiment TEXT NOT NULL DEFAULT 'positivo'
    CHECK (sentiment IN ('positivo', 'neutro', 'critico')),
  replied_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT reputation_reviews_author_not_blank CHECK (length(trim(author)) > 0),
  CONSTRAINT reputation_reviews_body_not_blank CHECK (length(trim(body)) > 0)
);

CREATE INDEX IF NOT EXISTS idx_reputation_reviews_company_date
  ON public.reputation_reviews(company_id, review_date DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reputation_reviews_company_status
  ON public.reputation_reviews(company_id, status);
CREATE INDEX IF NOT EXISTS idx_reputation_reviews_campaign
  ON public.reputation_reviews(company_id, campaign_id)
  WHERE campaign_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_reputation_reviews_order
  ON public.reputation_reviews(company_id, order_id)
  WHERE order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_reputation_reviews_customer
  ON public.reputation_reviews(company_id, customer_id)
  WHERE customer_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.reputation_automation_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT true,
  trigger_key TEXT NOT NULL DEFAULT 'commessa_chiusa'
    CHECK (trigger_key IN ('commessa_chiusa', 'sal_finale', 'fattura_saldato')),
  delay_days INTEGER NOT NULL DEFAULT 2 CHECK (delay_days >= 0),
  follow_up_after_days INTEGER NOT NULL DEFAULT 5 CHECK (follow_up_after_days >= 0),
  min_rating_alert INTEGER NOT NULL DEFAULT 3 CHECK (min_rating_alert BETWEEN 1 AND 5),
  require_approval BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_reputation_automation_company
  ON public.reputation_automation_settings(company_id);

CREATE TABLE IF NOT EXISTS public.reputation_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT '',
  actor TEXT NOT NULL DEFAULT 'Sistema',
  tone TEXT NOT NULL DEFAULT 'info'
    CHECK (tone IN ('info', 'success', 'warning')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reputation_events_company_created
  ON public.reputation_events(company_id, created_at DESC);

ALTER TABLE public.reputation_public_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reputation_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reputation_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reputation_automation_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reputation_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS reputation_public_links_company ON public.reputation_public_links;
CREATE POLICY reputation_public_links_company ON public.reputation_public_links
  FOR ALL
  USING (public.reputation_company_allowed(company_id))
  WITH CHECK (public.reputation_company_allowed(company_id));

DROP POLICY IF EXISTS reputation_campaigns_company ON public.reputation_campaigns;
CREATE POLICY reputation_campaigns_company ON public.reputation_campaigns
  FOR ALL
  USING (public.reputation_company_allowed(company_id))
  WITH CHECK (public.reputation_company_allowed(company_id));

DROP POLICY IF EXISTS reputation_reviews_company ON public.reputation_reviews;
CREATE POLICY reputation_reviews_company ON public.reputation_reviews
  FOR ALL
  USING (public.reputation_company_allowed(company_id))
  WITH CHECK (public.reputation_company_allowed(company_id));

DROP POLICY IF EXISTS reputation_automation_company ON public.reputation_automation_settings;
CREATE POLICY reputation_automation_company ON public.reputation_automation_settings
  FOR ALL
  USING (public.reputation_company_allowed(company_id))
  WITH CHECK (public.reputation_company_allowed(company_id));

DROP POLICY IF EXISTS reputation_events_company ON public.reputation_events;
CREATE POLICY reputation_events_company ON public.reputation_events
  FOR ALL
  USING (public.reputation_company_allowed(company_id))
  WITH CHECK (public.reputation_company_allowed(company_id));

DROP TRIGGER IF EXISTS trg_reputation_public_links_updated_at ON public.reputation_public_links;
CREATE TRIGGER trg_reputation_public_links_updated_at
  BEFORE UPDATE ON public.reputation_public_links
  FOR EACH ROW EXECUTE FUNCTION public.reputation_set_updated_at();

DROP TRIGGER IF EXISTS trg_reputation_campaigns_updated_at ON public.reputation_campaigns;
CREATE TRIGGER trg_reputation_campaigns_updated_at
  BEFORE UPDATE ON public.reputation_campaigns
  FOR EACH ROW EXECUTE FUNCTION public.reputation_set_updated_at();

DROP TRIGGER IF EXISTS trg_reputation_reviews_updated_at ON public.reputation_reviews;
CREATE TRIGGER trg_reputation_reviews_updated_at
  BEFORE UPDATE ON public.reputation_reviews
  FOR EACH ROW EXECUTE FUNCTION public.reputation_set_updated_at();

DROP TRIGGER IF EXISTS trg_reputation_automation_updated_at ON public.reputation_automation_settings;
CREATE TRIGGER trg_reputation_automation_updated_at
  BEFORE UPDATE ON public.reputation_automation_settings
  FOR EACH ROW EXECUTE FUNCTION public.reputation_set_updated_at();

CREATE OR REPLACE FUNCTION public.submit_public_reputation_review(
  p_company_id UUID,
  p_public_slug TEXT,
  p_campaign_id UUID DEFAULT NULL,
  p_order_id UUID DEFAULT NULL,
  p_customer_id UUID DEFAULT NULL,
  p_author TEXT DEFAULT NULL,
  p_rating INTEGER DEFAULT NULL,
  p_project TEXT DEFAULT NULL,
  p_body TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_campaign_id UUID;
  v_order_id UUID;
  v_customer_id UUID;
  v_customer_name TEXT;
  v_project TEXT := COALESCE(NULLIF(trim(p_project), ''), 'Feedback pubblico');
  v_status TEXT;
  v_sentiment TEXT;
  v_ai_reply TEXT;
  v_review_id UUID;
BEGIN
  IF p_company_id IS NULL OR p_public_slug IS NULL THEN
    RAISE EXCEPTION 'Link recensione non valido';
  END IF;

  IF p_rating IS NULL OR p_rating < 1 OR p_rating > 5 THEN
    RAISE EXCEPTION 'Valutazione non valida';
  END IF;

  IF length(trim(COALESCE(p_author, ''))) = 0 THEN
    RAISE EXCEPTION 'Nome richiesto';
  END IF;

  IF length(trim(COALESCE(p_body, ''))) = 0 THEN
    RAISE EXCEPTION 'Feedback richiesto';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.reputation_public_links link
    WHERE link.company_id = p_company_id
      AND link.public_slug = p_public_slug
      AND link.active = true
  ) THEN
    RAISE EXCEPTION 'Link recensione non attivo';
  END IF;

  IF p_campaign_id IS NOT NULL THEN
    SELECT c.id, c.target_order_id, c.target_customer_id, COALESCE(c.target_label, v_project)
    INTO v_campaign_id, v_order_id, v_customer_id, v_project
    FROM public.reputation_campaigns c
    WHERE c.id = p_campaign_id
      AND c.company_id = p_company_id
    LIMIT 1;
  END IF;

  IF v_order_id IS NULL AND p_order_id IS NOT NULL THEN
    SELECT o.id, o.customer_id, COALESCE(NULLIF(o.order_code, ''), v_project)
    INTO v_order_id, v_customer_id, v_project
    FROM public.orders o
    WHERE o.id = p_order_id
      AND o.company_id = p_company_id
    LIMIT 1;
  END IF;

  IF v_customer_id IS NULL AND p_customer_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.profiles p WHERE p.id = p_customer_id
  ) THEN
    v_customer_id := p_customer_id;
  END IF;

  IF v_customer_id IS NOT NULL THEN
    SELECT NULLIF(trim(concat_ws(' ', p.first_name, p.last_name)), '')
    INTO v_customer_name
    FROM public.profiles p
    WHERE p.id = v_customer_id
    LIMIT 1;
  END IF;

  v_status := CASE WHEN p_rating <= 3 THEN 'critica' ELSE 'pubblicata' END;
  v_sentiment := CASE WHEN p_rating <= 3 THEN 'critico' WHEN p_rating = 4 THEN 'neutro' ELSE 'positivo' END;
  v_ai_reply := CASE
    WHEN p_rating <= 3 THEN 'Grazie per il feedback. Apriamo una verifica interna e ti contattiamo per capire come recuperare l''esperienza.'
    ELSE 'Grazie per aver condiviso la tua esperienza. Il tuo feedback aiuta il team a migliorare ancora.'
  END;

  INSERT INTO public.reputation_reviews (
    company_id, campaign_id, order_id, customer_id,
    author, source, rating, status, review_date, project, body,
    ai_reply, sentiment, metadata
  )
  VALUES (
    p_company_id, v_campaign_id, v_order_id, v_customer_id,
    trim(p_author), 'Sito', p_rating, v_status, current_date, v_project, trim(p_body),
    v_ai_reply, v_sentiment,
    jsonb_build_object(
      'public_slug', p_public_slug,
      'customer_name', v_customer_name,
      'ingested_from', 'public_review_form'
    )
  )
  RETURNING id INTO v_review_id;

  IF v_campaign_id IS NOT NULL THEN
    UPDATE public.reputation_campaigns
    SET review_count = review_count + 1,
        clicked_count = GREATEST(clicked_count, 1),
        updated_at = now()
    WHERE id = v_campaign_id
      AND company_id = p_company_id;
  END IF;

  INSERT INTO public.reputation_events (
    company_id, kind, title, detail, actor, tone
  )
  VALUES (
    p_company_id,
    CASE WHEN p_rating <= 3 THEN 'critical_alert' ELSE 'request_started' END,
    CASE WHEN p_rating <= 3 THEN 'Feedback critico ricevuto' ELSE 'Feedback positivo ricevuto' END,
    trim(p_author) || ' - ' || v_project,
    'Modulo pubblico',
    CASE WHEN p_rating <= 3 THEN 'warning' ELSE 'success' END
  );

  RETURN jsonb_build_object('ok', true, 'review_id', v_review_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.reputation_company_allowed(UUID) TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.reputation_public_links TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.reputation_campaigns TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.reputation_reviews TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.reputation_automation_settings TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.reputation_events TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.submit_public_reputation_review(UUID, TEXT, UUID, UUID, UUID, TEXT, INTEGER, TEXT, TEXT)
  TO anon, authenticated, service_role;

COMMIT;
