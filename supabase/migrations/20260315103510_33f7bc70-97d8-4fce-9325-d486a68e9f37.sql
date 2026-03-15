
-- Fix search_path on validation functions
CREATE OR REPLACE FUNCTION validate_ai_agent_v2_stato()
RETURNS TRIGGER LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.stato NOT IN ('bozza','attivo','pausa','archiviato') THEN
    RAISE EXCEPTION 'Stato non valido: %', NEW.stato;
  END IF;
  IF NEW.temperatura < 0 OR NEW.temperatura > 1 THEN
    RAISE EXCEPTION 'Temperatura deve essere tra 0 e 1';
  END IF;
  IF NEW.widget_posizione IS NOT NULL AND NEW.widget_posizione NOT IN ('bottom-right','bottom-left','top-right','top-left') THEN
    RAISE EXCEPTION 'Posizione widget non valida: %', NEW.widget_posizione;
  END IF;
  NEW.aggiornato_il := NOW();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION validate_ai_conversation_v2()
RETURNS TRIGGER LANGUAGE plpgsql
SET search_path = public
AS $$
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

CREATE OR REPLACE FUNCTION validate_ai_campaign_v2()
RETURNS TRIGGER LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.tipo NOT IN ('chiamata','whatsapp','sms') THEN
    RAISE EXCEPTION 'Tipo campagna non valido: %', NEW.tipo;
  END IF;
  IF NEW.stato NOT IN ('bozza','in_corso','completata','pausa','archiviata') THEN
    RAISE EXCEPTION 'Stato campagna non valido: %', NEW.stato;
  END IF;
  RETURN NEW;
END;
$$;
