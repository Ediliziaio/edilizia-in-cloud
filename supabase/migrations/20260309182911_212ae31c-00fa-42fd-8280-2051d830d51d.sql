
-- Add is_active to lead_forms
ALTER TABLE public.lead_forms ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

-- Add click ID and device columns to form_submissions
ALTER TABLE public.form_submissions ADD COLUMN IF NOT EXISTS fbclid TEXT;
ALTER TABLE public.form_submissions ADD COLUMN IF NOT EXISTS gclid TEXT;
ALTER TABLE public.form_submissions ADD COLUMN IF NOT EXISTS user_agent TEXT;
ALTER TABLE public.form_submissions ADD COLUMN IF NOT EXISTS device_type TEXT;

-- Create trigger_form_automations function
CREATE OR REPLACE FUNCTION public.trigger_form_automations(p_submission_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sub RECORD;
BEGIN
  SELECT fs.*, lf.company_id AS lf_company_id
  INTO v_sub
  FROM form_submissions fs
  JOIN lead_forms lf ON lf.id = fs.form_id
  WHERE fs.id = p_submission_id;

  IF NOT FOUND THEN RETURN; END IF;

  INSERT INTO automation_trigger_events (
    company_id, trigger_event, entity_type, entity_id, payload
  ) VALUES (
    v_sub.company_id,
    'form_submitted',
    'contact',
    COALESCE(v_sub.contact_id, v_sub.form_id),
    jsonb_build_object(
      'form_id', v_sub.form_id,
      'submission_id', p_submission_id,
      'contact_id', v_sub.contact_id,
      'data', v_sub.data
    )
  );
END;
$$;
