-- Audit fatturazione: le fatture IMPORTATE da provider esterni (FIC/Aruba) non
-- devono scatenare automazioni "fattura creata" (email/WhatsApp/task al cliente):
-- sono documenti storici già emessi altrove. Guard `external_provider IS NOT NULL`
-- allineato a fn_enqueue_fattura_emessa.
CREATE OR REPLACE FUNCTION public.fire_invoice_automation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
BEGIN
  IF NEW.company_id IS NULL THEN RETURN NEW; END IF;
  IF NEW.external_provider IS NOT NULL THEN RETURN NEW; END IF;
  INSERT INTO public.automation_trigger_events (company_id, trigger_event, entity_id, entity_type, payload)
  VALUES (NEW.company_id, 'invoice_created', NEW.id::text, 'invoice',
    jsonb_build_object('invoice_id', NEW.id, 'invoice_number', NEW.invoice_number, 'total', NEW.total,
      'tax_amount', NEW.tax_amount, 'client_company_name', NEW.client_company_name, 'client_email', NEW.client_email,
      'due_date', NEW.due_date, 'status', NEW.status, 'document_type', NEW.document_type,
      'client_id', NEW.client_id, 'order_id', NEW.order_id));
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE LOG 'fire_invoice_automation error: %', SQLERRM;
  RETURN NEW;
END; $function$;
