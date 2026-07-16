-- Conversazioni: le email in arrivo (email_inbox) erano agganciate al contatto
-- SOLO per indirizzo mittente. Con il reply GHL-style l'edge email-inbound-reply
-- valorizza matched_contact_id (via email_reply_routes): lo si usa come secondo
-- criterio di aggancio, così la risposta appare nel thread anche se il contatto
-- risponde da un alias diverso dalla sua email in anagrafica.
-- Patch testuale server-side della vista per non trascrivere l'intera definizione.
DO $$
DECLARE
  v text;
  old_join text := 'JOIN marketing_contacts ct ON ct.company_id = ei.company_id AND ei.from_email IS NOT NULL AND lower(ct.email) = lower(ei.from_email)';
  new_join text := 'JOIN marketing_contacts ct ON ct.company_id = ei.company_id AND ((ei.from_email IS NOT NULL AND lower(ct.email) = lower(ei.from_email)) OR ct.id = ei.matched_contact_id)';
BEGIN
  v := pg_get_viewdef('public.v_conversazioni_messaggi'::regclass, true);
  IF position(old_join IN v) = 0 THEN
    -- Già applicata (o definizione cambiata): non fallire in replica locale.
    IF position('matched_contact_id' IN v) > 0 THEN
      RAISE NOTICE 'v_conversazioni_messaggi già aggiornata, skip';
      RETURN;
    END IF;
    RAISE EXCEPTION 'join email_inbox→marketing_contacts non trovata nella vista: definizione cambiata, aggiornare la migration';
  END IF;
  v := replace(v, old_join, new_join);
  EXECUTE 'CREATE OR REPLACE VIEW public.v_conversazioni_messaggi AS ' || v;
END $$;
