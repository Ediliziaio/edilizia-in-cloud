
-- 1. Create private storage bucket for ticket attachments
INSERT INTO storage.buckets (id, name, public)
VALUES ('ticket-attachments', 'ticket-attachments', false)
ON CONFLICT (id) DO NOTHING;

-- 2. RLS policies for ticket-attachments bucket
-- Allow authenticated users to upload files
CREATE POLICY "ticket_attach_upload"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'ticket-attachments'
);

-- Allow users to read attachments for tickets they have access to
CREATE POLICY "ticket_attach_read"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'ticket-attachments'
);

-- 3. Enable pg_net extension for HTTP calls from triggers
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- 4. Trigger function to notify on ticket updates
CREATE OR REPLACE FUNCTION public.notify_ticket_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _payload jsonb;
  _supabase_url text;
  _service_key text;
BEGIN
  _supabase_url := current_setting('app.settings.supabase_url', true);
  IF _supabase_url IS NULL OR _supabase_url = '' THEN
    _supabase_url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'supabase_url' LIMIT 1);
  END IF;
  -- Fallback: construct from project ref
  IF _supabase_url IS NULL OR _supabase_url = '' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  _service_key := current_setting('app.settings.service_role_key', true);
  IF _service_key IS NULL OR _service_key = '' THEN
    _service_key := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1);
  END IF;
  IF _service_key IS NULL OR _service_key = '' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF TG_TABLE_NAME = 'ticket_messages' THEN
    _payload := jsonb_build_object(
      'type', 'new_message',
      'ticket_id', NEW.ticket_id,
      'sender_id', NEW.sender_id,
      'message_id', NEW.id
    );
  ELSIF TG_TABLE_NAME = 'tickets' THEN
    _payload := jsonb_build_object(
      'type', 'status_change',
      'ticket_id', NEW.id,
      'old_status', OLD.status,
      'new_status', NEW.status
    );
  END IF;

  PERFORM extensions.http_post(
    url := _supabase_url || '/functions/v1/ticket-notify',
    body := _payload::text,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || _service_key
    )
  );

  RETURN COALESCE(NEW, OLD);
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'notify_ticket_update failed: %', SQLERRM;
  RETURN COALESCE(NEW, OLD);
END;
$$;

-- 5. Trigger on ticket_messages INSERT
CREATE TRIGGER trg_ticket_message_notify
AFTER INSERT ON public.ticket_messages
FOR EACH ROW
EXECUTE FUNCTION public.notify_ticket_update();

-- 6. Trigger on tickets status UPDATE
CREATE TRIGGER trg_ticket_status_notify
AFTER UPDATE OF status ON public.tickets
FOR EACH ROW
WHEN (OLD.status IS DISTINCT FROM NEW.status)
EXECUTE FUNCTION public.notify_ticket_update();
