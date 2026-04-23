-- =============================================================================
-- P2-10 — Unifica trigger WhatsApp sotto nome canonico 'whatsapp_message_received'
-- =============================================================================
-- Background:
--   - P0-7 aveva consolidato il DOUBLE INSERT di whatsapp_received +
--     customer_replied in un SINGOLO INSERT con trigger_event='whatsapp_received'
--     + payload.legacy_events=['customer_replied'].
--   - P2-10 promuove il nome canonico a 'whatsapp_message_received' per
--     coerenza con gli altri eventi di dominio (sms_message_received,
--     email_opened, ecc.). I flow esistenti che hanno trigger_event:
--     'whatsapp_received' nel loro config_json vengono normalizzati.
--
-- La tabella affetta è `automation_flows` (non `automations`, che è la
-- definizione di alto livello). I nodi trigger vivono in
-- `automation_flows.config_json` → jsonb contenente l'albero dei nodi.
--
-- Strategia:
--   1. Regex-replace sul cast text della colonna per sostituire solo il
--      valore stringa `"trigger_event":"whatsapp_received"` → canonical.
--      Sicuro: nessuna key altra di trigger_event viene toccata.
--      NON tocchiamo `customer_replied` perché è un evento generico
--      riutilizzato anche per SMS/email (scope non-whatsapp).
--   2. Il runner process-automation già gestisce `payload.legacy_events`
--      (P0-7) quindi i flow non-migrati rimangono funzionanti con match
--      fuzzy sui legacy names finché non vengono re-salvati.
--
-- Idempotente: la regex matcha solo `whatsapp_received` esatto, non
-- il canonical `whatsapp_message_received` → re-apply è no-op.
-- =============================================================================

DO $$
DECLARE
  v_flows_aggiornati int := 0;
BEGIN
  -- Check esistenza tabella per evitare errori su schema parziali (dev).
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'automation_flows'
  ) THEN
    WITH updated AS (
      UPDATE public.automation_flows
         SET config_json = REGEXP_REPLACE(
           config_json::text,
           '"trigger_event"\s*:\s*"whatsapp_received"',
           '"trigger_event": "whatsapp_message_received"',
           'g'
         )::jsonb,
             updated_at = now()
       WHERE config_json::text LIKE '%"trigger_event"%whatsapp_received%'
       RETURNING 1
    )
    SELECT COUNT(*) INTO v_flows_aggiornati FROM updated;

    RAISE NOTICE 'P2-10: automation_flows aggiornati da whatsapp_received → whatsapp_message_received: %', v_flows_aggiornati;
  ELSE
    RAISE NOTICE 'P2-10: tabella automation_flows non presente, skip migration.';
  END IF;
END $$;
