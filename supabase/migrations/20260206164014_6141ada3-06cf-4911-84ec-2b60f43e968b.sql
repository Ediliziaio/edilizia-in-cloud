-- Trigger per prevenire eliminazione di stati ordine già in uso
CREATE OR REPLACE FUNCTION public.prevent_status_deletion_if_used()
RETURNS TRIGGER 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Verifica se lo stato è usato come current_status_id in qualche ordine
  IF EXISTS (SELECT 1 FROM orders WHERE current_status_id = OLD.id) THEN
    RAISE EXCEPTION 'Impossibile eliminare: stato usato in ordini attivi';
  END IF;
  
  -- Verifica se lo stato è presente nello storico ordini
  IF EXISTS (SELECT 1 FROM order_status_history WHERE status_id = OLD.id) THEN
    RAISE EXCEPTION 'Impossibile eliminare: stato presente nello storico ordini';
  END IF;
  
  RETURN OLD;
END;
$$;

-- Creare il trigger
CREATE TRIGGER check_status_before_delete
BEFORE DELETE ON order_statuses
FOR EACH ROW EXECUTE FUNCTION public.prevent_status_deletion_if_used();