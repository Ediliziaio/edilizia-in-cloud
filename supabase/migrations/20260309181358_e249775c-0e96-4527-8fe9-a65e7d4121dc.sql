
-- Step 1: Add missing columns to attribution_sessions
ALTER TABLE public.attribution_sessions
  ADD COLUMN IF NOT EXISTS ttclid TEXT,
  ADD COLUMN IF NOT EXISTS msclkid TEXT,
  ADD COLUMN IF NOT EXISTS li_fat_id TEXT,
  ADD COLUMN IF NOT EXISTS landing_url TEXT,
  ADD COLUMN IF NOT EXISTS converted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS user_agent TEXT;

-- Migrate landing_page data to landing_url
UPDATE public.attribution_sessions SET landing_url = landing_page WHERE landing_url IS NULL AND landing_page IS NOT NULL;

-- Add unique constraint on (company_id, session_id)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'attribution_sessions_company_session_unique') THEN
    ALTER TABLE public.attribution_sessions ADD CONSTRAINT attribution_sessions_company_session_unique UNIQUE (company_id, session_id);
  END IF;
END $$;

-- Step 2: Add missing columns to contact_attributions
ALTER TABLE public.contact_attributions
  ADD COLUMN IF NOT EXISTS ft_content TEXT,
  ADD COLUMN IF NOT EXISTS ft_term TEXT,
  ADD COLUMN IF NOT EXISTS ft_fbclid TEXT,
  ADD COLUMN IF NOT EXISTS ft_gclid TEXT,
  ADD COLUMN IF NOT EXISTS ft_ttclid TEXT,
  ADD COLUMN IF NOT EXISTS ft_landing_url TEXT,
  ADD COLUMN IF NOT EXISTS lt_content TEXT,
  ADD COLUMN IF NOT EXISTS lt_term TEXT,
  ADD COLUMN IF NOT EXISTS lt_fbclid TEXT,
  ADD COLUMN IF NOT EXISTS lt_gclid TEXT,
  ADD COLUMN IF NOT EXISTS lt_ttclid TEXT,
  ADD COLUMN IF NOT EXISTS lt_landing_url TEXT;

-- Step 3: Update attach_attribution_to_contact function
CREATE OR REPLACE FUNCTION public.attach_attribution_to_contact(
  p_session_id UUID,
  p_contact_id UUID,
  p_company_id UUID
) RETURNS VOID AS $$
DECLARE
  v_session RECORD;
  v_existing RECORD;
BEGIN
  SELECT * INTO v_session FROM public.attribution_sessions WHERE id = p_session_id AND company_id = p_company_id;
  IF NOT FOUND THEN RETURN; END IF;

  -- Link session to contact
  UPDATE public.attribution_sessions SET contact_id = p_contact_id, converted_at = NOW() WHERE id = p_session_id;

  -- Check existing attribution
  SELECT * INTO v_existing FROM public.contact_attributions WHERE contact_id = p_contact_id;

  IF NOT FOUND THEN
    INSERT INTO public.contact_attributions (
      contact_id, company_id,
      first_source, first_medium, first_campaign, ft_content, ft_term,
      ft_fbclid, ft_gclid, ft_ttclid, ft_landing_url,
      first_touch_at, first_touch_session_id,
      last_source, last_medium, last_campaign, lt_content, lt_term,
      lt_fbclid, lt_gclid, lt_ttclid, lt_landing_url,
      last_touch_at, last_touch_session_id,
      total_sessions
    ) VALUES (
      p_contact_id, p_company_id,
      v_session.utm_source, v_session.utm_medium, v_session.utm_campaign, v_session.utm_content, v_session.utm_term,
      v_session.fbclid, v_session.gclid, v_session.ttclid, COALESCE(v_session.landing_url, v_session.landing_page),
      v_session.started_at, v_session.id,
      v_session.utm_source, v_session.utm_medium, v_session.utm_campaign, v_session.utm_content, v_session.utm_term,
      v_session.fbclid, v_session.gclid, v_session.ttclid, COALESCE(v_session.landing_url, v_session.landing_page),
      v_session.started_at, v_session.id,
      1
    );
  ELSE
    UPDATE public.contact_attributions SET
      last_source = v_session.utm_source,
      last_medium = v_session.utm_medium,
      last_campaign = v_session.utm_campaign,
      lt_content = v_session.utm_content,
      lt_term = v_session.utm_term,
      lt_fbclid = v_session.fbclid,
      lt_gclid = v_session.gclid,
      lt_ttclid = v_session.ttclid,
      lt_landing_url = COALESCE(v_session.landing_url, v_session.landing_page),
      last_touch_at = v_session.started_at,
      last_touch_session_id = v_session.id,
      total_sessions = COALESCE(total_sessions, 0) + 1,
      updated_at = NOW()
    WHERE contact_id = p_contact_id;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Step 4: Update get_attribution_report RPC
CREATE OR REPLACE FUNCTION public.get_attribution_report(
  p_company_id UUID,
  p_date_from TIMESTAMPTZ,
  p_date_to TIMESTAMPTZ,
  p_group_by TEXT DEFAULT 'source',
  p_filter_source TEXT DEFAULT NULL
) RETURNS TABLE(
  dimension TEXT,
  sessions BIGINT,
  unique_visitors BIGINT,
  contacts_created BIGINT,
  conversions BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COALESCE(
      CASE p_group_by
        WHEN 'source' THEN s.utm_source
        WHEN 'medium' THEN s.utm_medium
        WHEN 'campaign' THEN s.utm_campaign
        WHEN 'content' THEN s.utm_content
      END, '(diretto)'
    ) AS dimension,
    COUNT(*)::BIGINT AS sessions,
    COUNT(DISTINCT s.visitor_id)::BIGINT AS unique_visitors,
    COUNT(DISTINCT s.contact_id)::BIGINT AS contacts_created,
    COUNT(DISTINCT CASE WHEN s.converted_at IS NOT NULL OR s.contact_id IS NOT NULL THEN s.id END)::BIGINT AS conversions
  FROM public.attribution_sessions s
  WHERE s.company_id = p_company_id
    AND s.started_at >= p_date_from
    AND s.started_at <= p_date_to
    AND (p_filter_source IS NULL OR s.utm_source = p_filter_source)
  GROUP BY 1
  ORDER BY sessions DESC;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;
