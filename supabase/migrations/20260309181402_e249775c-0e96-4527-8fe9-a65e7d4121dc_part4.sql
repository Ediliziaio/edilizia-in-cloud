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
