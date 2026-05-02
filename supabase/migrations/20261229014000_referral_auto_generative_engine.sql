-- Referral auto-generative engine
-- Extends the existing referral model without changing historical payouts/ledger.

ALTER TABLE public.referrers ADD COLUMN IF NOT EXISTS referral_link text;
ALTER TABLE public.referrers ADD COLUMN IF NOT EXISTS dashboard_slug text;
ALTER TABLE public.referrers ADD COLUMN IF NOT EXISTS tracking_token text DEFAULT substr(replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''), 1, 48);
ALTER TABLE public.referrers ADD COLUMN IF NOT EXISTS created_by uuid;
ALTER TABLE public.referrers ADD COLUMN IF NOT EXISTS last_event_at timestamptz;

ALTER TABLE public.referral_clicks ADD COLUMN IF NOT EXISTS device_hash text;
ALTER TABLE public.referral_clicks ADD COLUMN IF NOT EXISTS dedupe_key text;

CREATE INDEX IF NOT EXISTS idx_referrers_user_id ON public.referrers(user_id);
CREATE INDEX IF NOT EXISTS idx_referral_clicks_dedupe_created ON public.referral_clicks(dedupe_key, created_at DESC);

CREATE TABLE IF NOT EXISTS public.referral_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id uuid NOT NULL REFERENCES public.referrers(id) ON DELETE CASCADE,
  referral_code text NOT NULL,
  link text NOT NULL,
  is_primary boolean NOT NULL DEFAULT true,
  clicks integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (referrer_id, referral_code)
);

INSERT INTO public.referral_links(referrer_id, referral_code, link, is_primary, clicks)
SELECT
  id,
  referral_code,
  'https://app.ediliziaincloud.com/login?ref=' || referral_code,
  true,
  COALESCE(total_clicks, 0)
FROM public.referrers
ON CONFLICT (referrer_id, referral_code) DO NOTHING;

UPDATE public.referrers
SET
  referral_link = COALESCE(referral_link, 'https://app.ediliziaincloud.com/login?ref=' || referral_code),
  dashboard_slug = COALESCE(dashboard_slug, lower(referral_code)),
  tracking_token = COALESCE(tracking_token, substr(replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''), 1, 48))
WHERE referral_code IS NOT NULL;

ALTER TABLE public.referral_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "super_admin_manage_referral_links" ON public.referral_links;
CREATE POLICY "super_admin_manage_referral_links"
ON public.referral_links FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role));

DROP POLICY IF EXISTS "partner_read_own_referral_links" ON public.referral_links;
CREATE POLICY "partner_read_own_referral_links"
ON public.referral_links FOR SELECT TO authenticated
USING (
  referrer_id IN (
    SELECT id FROM public.referrers WHERE user_id = auth.uid()
  )
);

CREATE TABLE IF NOT EXISTS public.referral_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL CHECK (event_type IN ('click', 'register', 'activation', 'payment', 'upgrade', 'payout', 'fraud')),
  referrer_id uuid REFERENCES public.referrers(id) ON DELETE SET NULL,
  referral_code text,
  click_id uuid REFERENCES public.referral_clicks(id) ON DELETE SET NULL,
  user_id uuid,
  company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  event_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  ip_address text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.referral_events ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_referral_events_referrer_created ON public.referral_events(referrer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_referral_events_type_created ON public.referral_events(event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_referral_events_company ON public.referral_events(company_id);

DROP POLICY IF EXISTS "super_admin_manage_referral_events" ON public.referral_events;
CREATE POLICY "super_admin_manage_referral_events"
ON public.referral_events FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role));

DROP POLICY IF EXISTS "partner_read_own_referral_events" ON public.referral_events;
CREATE POLICY "partner_read_own_referral_events"
ON public.referral_events FOR SELECT TO authenticated
USING (
  referrer_id IN (
    SELECT id FROM public.referrers WHERE user_id = auth.uid()
  )
);

CREATE TABLE IF NOT EXISTS public.referral_conversions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id uuid NOT NULL REFERENCES public.referrers(id) ON DELETE CASCADE,
  referred_user_id uuid,
  company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  source_click_id uuid REFERENCES public.referral_clicks(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'registered' CHECK (status IN ('click', 'registered', 'active', 'paying', 'approved', 'rejected', 'expired')),
  revenue numeric NOT NULL DEFAULT 0,
  commission_amount numeric NOT NULL DEFAULT 0,
  fraud_status text NOT NULL DEFAULT 'clear' CHECK (fraud_status IN ('clear', 'review', 'blocked')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (referrer_id, company_id)
);

ALTER TABLE public.referral_conversions ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_referral_conversions_referrer_created ON public.referral_conversions(referrer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_referral_conversions_status ON public.referral_conversions(status);
CREATE INDEX IF NOT EXISTS idx_referral_conversions_company ON public.referral_conversions(company_id);

DROP POLICY IF EXISTS "super_admin_manage_referral_conversions" ON public.referral_conversions;
CREATE POLICY "super_admin_manage_referral_conversions"
ON public.referral_conversions FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role));

DROP POLICY IF EXISTS "partner_read_own_referral_conversions" ON public.referral_conversions;
CREATE POLICY "partner_read_own_referral_conversions"
ON public.referral_conversions FOR SELECT TO authenticated
USING (
  referrer_id IN (
    SELECT id FROM public.referrers WHERE user_id = auth.uid()
  )
);

CREATE OR REPLACE VIEW public.referral_partners
WITH (security_invoker = true)
AS
SELECT
  id,
  user_id,
  referral_code,
  referral_link,
  partner_type,
  commission_type,
  commission_value,
  is_active AS status_active,
  total_earned,
  total_paid,
  created_at,
  last_event_at
FROM public.referrers;

CREATE OR REPLACE FUNCTION public.generate_referral_code_secure()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_code text;
BEGIN
  FOR i IN 1..20 LOOP
    v_code := upper(substr(replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''), 1, 10));
    v_code := regexp_replace(v_code, '[^A-Z0-9]', '', 'g');
    v_code := replace(replace(v_code, 'O', 'X'), '0', '9');
    v_code := substr(v_code || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6)), 1, 10);

    IF NOT EXISTS (SELECT 1 FROM public.referrers WHERE referral_code = v_code) THEN
      RETURN v_code;
    END IF;
  END LOOP;

  RAISE EXCEPTION 'Unable to generate unique referral code';
END;
$$;

CREATE OR REPLACE FUNCTION public.ensure_referral_link(
  p_referrer_id uuid,
  p_base_url text DEFAULT 'https://app.ediliziaincloud.com/login'
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_code text;
  v_link text;
BEGIN
  SELECT referral_code INTO v_code
  FROM public.referrers
  WHERE id = p_referrer_id;

  IF v_code IS NULL THEN
    RAISE EXCEPTION 'Referrer not found';
  END IF;

  v_link := p_base_url || '?ref=' || v_code;

  INSERT INTO public.referral_links(referrer_id, referral_code, link, is_primary)
  VALUES (p_referrer_id, v_code, v_link, true)
  ON CONFLICT (referrer_id, referral_code)
  DO UPDATE SET link = EXCLUDED.link, is_primary = true, updated_at = now();

  UPDATE public.referrers
  SET
    referral_link = v_link,
    dashboard_slug = COALESCE(dashboard_slug, lower(v_code)),
    tracking_token = COALESCE(tracking_token, substr(replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''), 1, 48))
  WHERE id = p_referrer_id;

  RETURN v_link;
END;
$$;

CREATE OR REPLACE FUNCTION public.log_referral_event(
  p_event_type text,
  p_referrer_id uuid DEFAULT NULL,
  p_referral_code text DEFAULT NULL,
  p_click_id uuid DEFAULT NULL,
  p_user_id uuid DEFAULT NULL,
  p_company_id uuid DEFAULT NULL,
  p_event_payload jsonb DEFAULT '{}'::jsonb,
  p_ip_address text DEFAULT NULL,
  p_user_agent text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event_id uuid;
BEGIN
  INSERT INTO public.referral_events(
    event_type,
    referrer_id,
    referral_code,
    click_id,
    user_id,
    company_id,
    event_payload,
    ip_address,
    user_agent
  )
  VALUES (
    p_event_type,
    p_referrer_id,
    p_referral_code,
    p_click_id,
    p_user_id,
    p_company_id,
    COALESCE(p_event_payload, '{}'::jsonb),
    p_ip_address,
    p_user_agent
  )
  RETURNING id INTO v_event_id;

  IF p_referrer_id IS NOT NULL THEN
    UPDATE public.referrers
    SET last_event_at = now()
    WHERE id = p_referrer_id;
  END IF;

  RETURN v_event_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.increment_referral_link_clicks(
  p_referrer_id uuid,
  p_referral_code text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.referral_links
  SET clicks = COALESCE(clicks, 0) + 1, updated_at = now()
  WHERE referrer_id = p_referrer_id
    AND referral_code = p_referral_code;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_referral_conversion(
  p_referral_code text,
  p_company_id uuid,
  p_user_id uuid DEFAULT NULL,
  p_click_id uuid DEFAULT NULL,
  p_revenue numeric DEFAULT 0,
  p_status text DEFAULT 'registered'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_referrer public.referrers%ROWTYPE;
  v_conversion_id uuid;
  v_commission numeric := 0;
  v_fraud_status text := 'clear';
BEGIN
  SELECT * INTO v_referrer
  FROM public.referrers
  WHERE referral_code = p_referral_code
    AND is_active = true;

  IF v_referrer.id IS NULL THEN
    RAISE EXCEPTION 'Invalid referral code';
  END IF;

  IF v_referrer.user_id IS NOT NULL AND p_user_id IS NOT NULL AND v_referrer.user_id = p_user_id THEN
    v_fraud_status := 'blocked';
    INSERT INTO public.referral_fraud_log(referrer_id, company_id, fraud_type, details)
    VALUES (v_referrer.id, p_company_id, 'self_referral', jsonb_build_object('user_id', p_user_id, 'source', 'record_referral_conversion'));
  END IF;

  IF COALESCE(p_revenue, 0) > 0 THEN
    IF v_referrer.commission_type = 'percentage' THEN
      v_commission := round((p_revenue * v_referrer.commission_value / 100)::numeric, 2);
    ELSE
      v_commission := v_referrer.commission_value;
    END IF;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.referral_companies
    WHERE referrer_id = v_referrer.id
      AND company_id = p_company_id
  ) THEN
    INSERT INTO public.referral_companies(referrer_id, company_id, referred_at, is_active, notes)
    VALUES (v_referrer.id, p_company_id, now(), true, 'Auto-tracked referral conversion');
  END IF;

  INSERT INTO public.referral_conversions(
    referrer_id,
    referred_user_id,
    company_id,
    source_click_id,
    status,
    revenue,
    commission_amount,
    fraud_status
  )
  VALUES (
    v_referrer.id,
    p_user_id,
    p_company_id,
    p_click_id,
    p_status,
    COALESCE(p_revenue, 0),
    v_commission,
    v_fraud_status
  )
  ON CONFLICT (referrer_id, company_id)
  DO UPDATE SET
    referred_user_id = COALESCE(EXCLUDED.referred_user_id, referral_conversions.referred_user_id),
    source_click_id = COALESCE(EXCLUDED.source_click_id, referral_conversions.source_click_id),
    status = EXCLUDED.status,
    revenue = GREATEST(referral_conversions.revenue, EXCLUDED.revenue),
    commission_amount = GREATEST(referral_conversions.commission_amount, EXCLUDED.commission_amount),
    fraud_status = CASE
      WHEN referral_conversions.fraud_status = 'blocked' OR EXCLUDED.fraud_status = 'blocked' THEN 'blocked'
      WHEN referral_conversions.fraud_status = 'review' OR EXCLUDED.fraud_status = 'review' THEN 'review'
      ELSE 'clear'
    END,
    updated_at = now()
  RETURNING id INTO v_conversion_id;

  IF p_click_id IS NOT NULL THEN
    UPDATE public.referral_clicks
    SET converted = true, converted_at = now(), converted_company_id = p_company_id
    WHERE id = p_click_id;
  END IF;

  UPDATE public.referrers
  SET
    total_conversions = (
      SELECT count(*)::integer
      FROM public.referral_conversions
      WHERE referrer_id = v_referrer.id
        AND status IN ('registered', 'active', 'paying', 'approved')
        AND fraud_status <> 'blocked'
    ),
    conversion_rate = CASE
      WHEN COALESCE(total_clicks, 0) > 0 THEN round(((
        SELECT count(*)::numeric
        FROM public.referral_conversions
        WHERE referrer_id = v_referrer.id
          AND status IN ('registered', 'active', 'paying', 'approved')
          AND fraud_status <> 'blocked'
      ) / total_clicks) * 100, 2)
      ELSE 0
    END,
    last_event_at = now()
  WHERE id = v_referrer.id;

  PERFORM public.log_referral_event(
    CASE
      WHEN p_status = 'paying' THEN 'payment'
      WHEN p_status = 'active' THEN 'activation'
      ELSE 'register'
    END,
    v_referrer.id,
    p_referral_code,
    p_click_id,
    p_user_id,
    p_company_id,
    jsonb_build_object('status', p_status, 'revenue', COALESCE(p_revenue, 0), 'commission', v_commission, 'fraud_status', v_fraud_status)
  );

  RETURN v_conversion_id;
END;
$$;
