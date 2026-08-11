-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.

CREATE OR REPLACE FUNCTION public.fn_enqueue_fattura_emessa()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Solo fatture attive emesse NATIVAMENTE. Le fatture IMPORTATE da provider esterni
  -- (external_provider valorizzato) NON vanno notificate al cliente: sono storiche.
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
        '3', COALESCE(NEW.total::text, '0'),   -- FIX: era NEW.total_amount (colonna inesistente) -> ogni INSERT su invoices falliva
        '4', COALESCE(NEW.due_date::text, '')
      )
    )
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$function$;
