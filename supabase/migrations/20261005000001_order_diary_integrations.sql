-- Harden order diary integrations for attachments and public signature completion.
-- Keeps the diary complete even when a UI path forgets to write order_events.

CREATE OR REPLACE FUNCTION public.trg_order_attachment_diary()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_company_id UUID;
  v_actor_name TEXT;
BEGIN
  SELECT company_id INTO v_company_id
  FROM public.orders
  WHERE id = NEW.order_id;

  SELECT NULLIF(TRIM(CONCAT_WS(' ', first_name, last_name)), '')
  INTO v_actor_name
  FROM public.profiles
  WHERE id = NEW.uploaded_by;

  IF v_company_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.order_events
    WHERE order_id = NEW.order_id
      AND event_type = 'allegato_caricato'
      AND payload->>'file_name' = NEW.file_name
      AND created_at > now() - interval '2 minutes'
  ) THEN
    INSERT INTO public.order_events(order_id, company_id, event_type, payload, actor_id, actor_name)
    VALUES (
      NEW.order_id,
      v_company_id,
      'allegato_caricato',
      jsonb_build_object(
        'file_name', NEW.file_name,
        'file_type', NEW.file_type,
        'file_size', NEW.file_size,
        'visible_to_customer', NEW.visible_to_customer,
        'source', 'order_attachments_trigger'
      ),
      NEW.uploaded_by,
      v_actor_name
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS after_order_attachment_insert_diary ON public.order_attachments;
CREATE TRIGGER after_order_attachment_insert_diary
AFTER INSERT ON public.order_attachments
FOR EACH ROW
EXECUTE FUNCTION public.trg_order_attachment_diary();

CREATE OR REPLACE FUNCTION public.trg_signature_request_signed_diary()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.order_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF COALESCE(OLD.status, '') <> 'signed'
     AND NEW.status = 'signed'
     AND NEW.company_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM public.order_events
       WHERE order_id = NEW.order_id
         AND event_type = 'contratto_firmato'
         AND payload->>'signature_request_id' = NEW.id::text
     ) THEN
    INSERT INTO public.order_events(order_id, company_id, event_type, payload, actor_id, actor_name)
    VALUES (
      NEW.order_id,
      NEW.company_id,
      'contratto_firmato',
      jsonb_build_object(
        'action', 'firma_completata',
        'document_type', COALESCE(NEW.tipo_documento, 'Contratto commessa'),
        'signer_name', NEW.signer_name,
        'signer_email', NEW.signer_email,
        'signed_at', NEW.signed_at,
        'signature_request_id', NEW.id,
        'source', 'signature_requests_trigger'
      ),
      NEW.created_by,
      NEW.signer_name
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS after_signature_request_signed_diary ON public.signature_requests;
CREATE TRIGGER after_signature_request_signed_diary
AFTER UPDATE OF status, signed_at ON public.signature_requests
FOR EACH ROW
EXECUTE FUNCTION public.trg_signature_request_signed_diary();
