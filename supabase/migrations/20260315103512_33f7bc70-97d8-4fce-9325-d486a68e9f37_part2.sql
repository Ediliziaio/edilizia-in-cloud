DROP FUNCTION IF EXISTS public.validate_ai_campaign_v2() CASCADE;
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
