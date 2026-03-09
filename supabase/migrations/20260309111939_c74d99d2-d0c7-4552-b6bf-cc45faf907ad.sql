
-- Add fiscal_code and vat_number to marketing_contacts
ALTER TABLE public.marketing_contacts ADD COLUMN IF NOT EXISTS fiscal_code text;
ALTER TABLE public.marketing_contacts ADD COLUMN IF NOT EXISTS vat_number text;

-- Trigger: log quote status changes to marketing_contact_activities
CREATE OR REPLACE FUNCTION public.log_quote_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_activity_type text;
  v_description text;
BEGIN
  -- Only fire when status actually changes and contact_id exists
  IF OLD.status IS NOT DISTINCT FROM NEW.status THEN
    RETURN NEW;
  END IF;
  IF NEW.contact_id IS NULL THEN
    RETURN NEW;
  END IF;

  CASE NEW.status
    WHEN 'inviata' THEN
      v_activity_type := 'quote_sent';
      v_description := 'Preventivo inviato: ' || COALESCE(NEW.quote_number, '');
    WHEN 'accettata' THEN
      v_activity_type := 'quote_accepted';
      v_description := 'Preventivo accettato: ' || COALESCE(NEW.quote_number, '');
    WHEN 'rifiutata' THEN
      v_activity_type := 'quote_refused';
      v_description := 'Preventivo rifiutato: ' || COALESCE(NEW.quote_number, '');
    ELSE
      RETURN NEW;
  END CASE;

  INSERT INTO public.marketing_contact_activities (
    contact_id, company_id, activity_type, description, metadata, created_by
  ) VALUES (
    NEW.contact_id,
    NEW.company_id,
    v_activity_type,
    v_description,
    jsonb_build_object('quote_id', NEW.id, 'quote_number', NEW.quote_number, 'total', NEW.total),
    COALESCE(auth.uid(), NEW.created_by)
  );

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_log_quote_status_change
  AFTER UPDATE ON public.quotes
  FOR EACH ROW
  EXECUTE FUNCTION public.log_quote_status_change();
