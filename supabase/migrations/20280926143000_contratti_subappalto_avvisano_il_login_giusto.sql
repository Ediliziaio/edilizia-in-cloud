-- Contratti di subappalto: l'avviso va al login giusto (26/09/2026).
--
-- 20280926141500 cercava il login del subappaltatore in subappaltatori con
-- l'id del contratto, ma contratti_subappalto.subappaltatore_id punta a
-- subappaltatori_sicurezza (l'anagrafica di sicurezza: DURC, documenti, SAL),
-- che è legata al subappaltatore del campo (e al suo login) da
-- campo_subappaltatore_id. La catena giusta:
--   contratto → subappaltatori_sicurezza → campo_subappaltatore_id →
--   subappaltatori.user_id
-- La stessa correzione è in src/lib/campo/assignments.ts, dove l'app del campo
-- cercava i contratti con gli id sbagliati e non ne trovava mai nessuno.
-- Provata il 26/09 in un blocco annullato: contratto riattivato → avviso
-- «Nuovo cantiere: …» al login del subappaltatore.

SET LOCAL lock_timeout = '3s';

CREATE OR REPLACE FUNCTION public.tg_contratto_subappalto_avvisa()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_user uuid;
BEGIN
  IF NEW.stato IS DISTINCT FROM 'attivo' OR NEW.order_id IS NULL OR NEW.subappaltatore_id IS NULL THEN
    RETURN NEW;
  END IF;
  -- Già attivo, stessa commessa e stesso subappaltatore: niente di nuovo.
  IF TG_OP = 'UPDATE' AND OLD.stato = 'attivo'
     AND OLD.order_id IS NOT DISTINCT FROM NEW.order_id
     AND OLD.subappaltatore_id IS NOT DISTINCT FROM NEW.subappaltatore_id THEN
    RETURN NEW;
  END IF;
  SELECT s.user_id INTO v_user
    FROM public.subappaltatori_sicurezza ss
    JOIN public.subappaltatori s ON s.id = ss.campo_subappaltatore_id AND coalesce(s.is_active, true)
   WHERE ss.id = NEW.subappaltatore_id;
  PERFORM public.campo_avvisa_lavoro(NEW.company_id, NEW.order_id, v_user, auth.uid());
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.tg_contratto_subappalto_avvisa() FROM PUBLIC, anon, authenticated;
