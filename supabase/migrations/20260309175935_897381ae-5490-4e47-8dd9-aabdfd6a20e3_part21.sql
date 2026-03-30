-- 5. Function: attach_attribution_to_contact
DROP FUNCTION IF EXISTS public.attach_attribution_to_contact(uuid, uuid, uuid) CASCADE;
CREATE OR REPLACE FUNCTION public.attach_attribution_to_contact(
  p_session_id uuid,
  p_contact_id uuid,
  p_company_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session attribution_sessions%ROWTYPE;
BEGIN
  -- Get session data
  SELECT * INTO v_session FROM attribution_sessions WHERE id = p_session_id;
  IF NOT FOUND THEN RETURN; END IF;

  -- Link session to contact
  UPDATE attribution_sessions SET contact_id = p_contact_id WHERE id = p_session_id;

  -- Upsert contact_attributions
  INSERT INTO contact_attributions (
    company_id, contact_id,
    first_touch_session_id, last_touch_session_id,
    first_touch_at, last_touch_at,
    first_source, first_medium, first_campaign,
    last_source, last_medium, last_campaign,
    total_sessions
  ) VALUES (
    p_company_id, p_contact_id,
    p_session_id, p_session_id,
    v_session.started_at, v_session.started_at,
    v_session.utm_source, v_session.utm_medium, v_session.utm_campaign,
    v_session.utm_source, v_session.utm_medium, v_session.utm_campaign,
    1
  )
  ON CONFLICT (contact_id) DO UPDATE SET
    last_touch_session_id = p_session_id,
    last_touch_at = v_session.started_at,
    last_source = v_session.utm_source,
    last_medium = v_session.utm_medium,
    last_campaign = v_session.utm_campaign,
    total_sessions = contact_attributions.total_sessions + 1,
    updated_at = now();

  -- Update marketing_contacts attribution columns (last touch)
  UPDATE marketing_contacts SET
    attr_source = v_session.utm_source,
    attr_medium = v_session.utm_medium,
    attr_campaign = v_session.utm_campaign,
    attr_content = v_session.utm_content
  WHERE id = p_contact_id;
END;
$$;
