-- Validation trigger for conversations
DROP FUNCTION IF EXISTS public.validate_ai_conversation_v2() CASCADE;
CREATE OR REPLACE FUNCTION validate_ai_conversation_v2()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.canale NOT IN ('voce','chat','whatsapp','interno') THEN
    RAISE EXCEPTION 'Canale non valido: %', NEW.canale;
  END IF;
  IF NEW.direzione IS NOT NULL AND NEW.direzione NOT IN ('inbound','outbound') THEN
    RAISE EXCEPTION 'Direzione non valida: %', NEW.direzione;
  END IF;
  IF NEW.stato NOT IN ('in_corso','completata','fallita','no_risposta','occupato','segreteria') THEN
    RAISE EXCEPTION 'Stato conversazione non valido: %', NEW.stato;
  END IF;
  IF NEW.sentiment IS NOT NULL AND NEW.sentiment NOT IN ('positivo','neutro','negativo') THEN
    RAISE EXCEPTION 'Sentiment non valido: %', NEW.sentiment;
  END IF;
  RETURN NEW;
END;
$$;
