-- Validation trigger for channel
DROP FUNCTION IF EXISTS public.validate_contact_message_channel() CASCADE;
CREATE OR REPLACE FUNCTION public.validate_contact_message_channel()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF NEW.channel NOT IN ('whatsapp', 'email', 'sms') THEN
    RAISE EXCEPTION 'channel deve essere whatsapp, email o sms';
  END IF;
  RETURN NEW;
END;
$$;
