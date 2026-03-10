
-- Tabella notifiche in-app
CREATE TABLE IF NOT EXISTS public.notifications (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id       uuid NOT NULL,
  type          text NOT NULL,
  title         text NOT NULL,
  body          text,
  entity_type   text,
  entity_id     uuid,
  action_url    text,
  is_read       boolean NOT NULL DEFAULT false,
  is_dismissed  boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- Indici
CREATE INDEX idx_notifications_user_id    ON public.notifications(user_id);
CREATE INDEX idx_notifications_company_id ON public.notifications(company_id);
CREATE INDEX idx_notifications_is_read    ON public.notifications(is_read) WHERE is_read = false;
CREATE INDEX idx_notifications_created_at ON public.notifications(created_at DESC);

-- RLS
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_read_own_notifications"
  ON public.notifications FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "users_update_own_notifications"
  ON public.notifications FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

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

-- RPC per segnare tutte le notifiche come lette
CREATE OR REPLACE FUNCTION public.mark_all_notifications_read(
  p_company_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.notifications
  SET is_read = true
  WHERE user_id = auth.uid()
    AND company_id = p_company_id
    AND is_read = false;
END;
$$;

-- Abilita realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
