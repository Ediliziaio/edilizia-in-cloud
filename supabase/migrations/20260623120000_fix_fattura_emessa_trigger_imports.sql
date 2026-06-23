-- Fix trigger fn_enqueue_fattura_emessa.
-- BUG: usava NEW.total_amount (colonna inesistente sulla tabella invoices, si chiama
-- "total") -> ERRORE 42703 "record new has no field total_amount" su OGNI insert in
-- public.invoices, bloccando l'import fatture da provider esterni (FIC/Aruba/...) e
-- anche l'emissione nativa. L'import contava "100 importate" ma 0 righe venivano scritte.
-- Inoltre: NON accodare la notifica WhatsApp "fattura emessa" per le fatture IMPORTATE
-- (external_provider valorizzato): sono storiche, non vanno notificate al cliente.

CREATE OR REPLACE FUNCTION public.fn_enqueue_fattura_emessa()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF COALESCE(NEW.document_type, '') IN ('invoice', 'fattura', 'fattura_immediata', 'fattura_accompagnatoria')
     AND NEW.external_provider IS NULL THEN
    INSERT INTO public.wa_notifiche_event_queue (
      company_id, trigger_kind, subject_id, variables
    ) VALUES (
      NEW.company_id,
      'fattura_emessa',
      NEW.id::text,
      jsonb_build_object(
        '1', COALESCE(NEW.invoice_number, 'N/D'),
        '2', COALESCE(NEW.client_company_name, ''),
        '3', COALESCE(NEW.total::text, '0'),   -- FIX: era NEW.total_amount
        '4', COALESCE(NEW.due_date::text, '')
      )
    )
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$function$;
