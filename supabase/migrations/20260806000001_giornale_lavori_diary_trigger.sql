-- Trigger: quando si inserisce un report nel Giornale Lavori con order_id
-- → crea automaticamente un evento nel Diario dell'Ordine (order_events)

CREATE OR REPLACE FUNCTION public.trg_giornale_to_order_event()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Solo se ha un order_id collegato
  IF NEW.order_id IS NOT NULL THEN
    INSERT INTO public.order_events (
      order_id,
      company_id,
      event_type,
      actor_id,
      payload
    ) VALUES (
      NEW.order_id,
      NEW.company_id,
      'giornale_lavori_inserito',
      NEW.created_by,
      jsonb_build_object(
        'giornale_id',           NEW.id,
        'data_lavori',           NEW.data_lavori::text,
        'lavorazioni',           NEW.lavorazioni_eseguite,
        'personale',             NEW.personale_presente,
        'avanzamento',           NEW.avanzamento_percentuale,
        'condizioni_meteo',      NEW.condizioni_meteo,
        'materiali',             NEW.materiali_utilizzati,
        'note',                  NEW.note
      )
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_giornale_to_order_event ON public.giornale_lavori;
CREATE TRIGGER trg_giornale_to_order_event
  AFTER INSERT ON public.giornale_lavori
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_giornale_to_order_event();
