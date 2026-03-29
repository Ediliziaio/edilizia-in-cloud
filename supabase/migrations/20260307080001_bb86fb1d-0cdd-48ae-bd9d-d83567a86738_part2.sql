CREATE TRIGGER trg_validate_contact_message_channel
  BEFORE INSERT OR UPDATE ON public.contact_messages
  FOR EACH ROW EXECUTE FUNCTION public.validate_contact_message_channel();
