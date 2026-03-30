-- Funzione helper per creare notifiche (SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.create_notification(
  p_company_id  uuid,
  p_user_id     uuid,
  p_type        text,
  p_title       text,
  p_body        text        DEFAULT NULL,
  p_entity_type text        DEFAULT NULL,
  p_entity_id   uuid        DEFAULT NULL,
  p_action_url  text        DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = p_user_id) THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.notifications (
    company_id, user_id, type, title, body,
    entity_type, entity_id, action_url
  ) VALUES (
    p_company_id, p_user_id, p_type, p_title, p_body,
    p_entity_type, p_entity_id, p_action_url
  ) RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;
