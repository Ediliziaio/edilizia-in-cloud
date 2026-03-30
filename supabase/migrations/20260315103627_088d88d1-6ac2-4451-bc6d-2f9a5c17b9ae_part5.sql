-- Validation trigger for stato
DROP FUNCTION IF EXISTS public.validate_ai_agent_v2_stato() CASCADE;
CREATE OR REPLACE FUNCTION validate_ai_agent_v2_stato()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
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
