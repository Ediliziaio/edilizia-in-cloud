-- Dedicated referral portal domain.
-- New and existing referral links now point to referral.ediliziaincloud.com/referral-login.

CREATE OR REPLACE FUNCTION public.ensure_referral_link(
  p_referrer_id uuid,
  p_base_url text DEFAULT 'https://referral.ediliziaincloud.com/referral-login'
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

  v_link := rtrim(p_base_url, '/') || '?ref=' || v_code;

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

UPDATE public.referral_links
SET
  link = 'https://referral.ediliziaincloud.com/referral-login?ref=' || referral_code,
  updated_at = now()
WHERE referral_code IS NOT NULL
  AND (
    link LIKE 'https://app.ediliziaincloud.com/login?ref=%'
    OR link LIKE 'https://app.ediliziaincloud.com/referral-login?ref=%'
    OR link LIKE 'https://referral.ediliziaincloud.com/login?ref=%'
  );

UPDATE public.referrers
SET referral_link = 'https://referral.ediliziaincloud.com/referral-login?ref=' || referral_code
WHERE referral_code IS NOT NULL
  AND (
    referral_link LIKE 'https://app.ediliziaincloud.com/login?ref=%'
    OR referral_link LIKE 'https://app.ediliziaincloud.com/referral-login?ref=%'
    OR referral_link LIKE 'https://referral.ediliziaincloud.com/login?ref=%'
  );
