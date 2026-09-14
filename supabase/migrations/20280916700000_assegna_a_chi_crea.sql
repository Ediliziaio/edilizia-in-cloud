-- Chi vede solo i suoi assegnati deve poter vedere quello che crea.
--
-- BeMade, 14/09: le operatrici di call center (only_assigned = true) non
-- riuscivano a inserire contatti né opportunità. La policy di inserimento le
-- lasciava scrivere, ma l'app rilegge subito la riga appena creata
-- (.insert().select()) e la policy di lettura mostra solo le righe con
-- assigned_to / call_center_id / follower_id = utente. Un contatto nuovo non
-- ha nessuno dei tre: «new row violates row-level security policy».
-- Vale per ogni azienda e per ogni percorso di inserimento (dialog,
-- scheda opportunità, import), quindi si corregge nel database.
--
-- Regola: se chi crea vede solo i suoi assegnati e la riga non è già sua,
-- la si aggancia a lui senza toccare le scelte fatte nel form:
-- call center se ha quel ruolo e il campo è libero, altrimenti assegnatario,
-- altrimenti follower.

CREATE OR REPLACE FUNCTION public.assegna_a_chi_crea()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL OR NOT public.solo_assegnati_attivo() THEN
    RETURN NEW;
  END IF;

  IF NEW.assigned_to = v_uid OR NEW.call_center_id = v_uid OR NEW.follower_id = v_uid THEN
    RETURN NEW;
  END IF;

  IF NEW.call_center_id IS NULL AND public.has_role(v_uid, 'call_center'::public.app_role) THEN
    NEW.call_center_id := v_uid;
  ELSIF NEW.assigned_to IS NULL THEN
    NEW.assigned_to := v_uid;
  ELSIF NEW.follower_id IS NULL THEN
    NEW.follower_id := v_uid;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.assegna_a_chi_crea() FROM PUBLIC, anon;

DROP TRIGGER IF EXISTS trg_assegna_a_chi_crea ON public.marketing_contacts;
CREATE TRIGGER trg_assegna_a_chi_crea
  BEFORE INSERT ON public.marketing_contacts
  FOR EACH ROW EXECUTE FUNCTION public.assegna_a_chi_crea();

DROP TRIGGER IF EXISTS trg_assegna_a_chi_crea ON public.marketing_opportunities;
CREATE TRIGGER trg_assegna_a_chi_crea
  BEFORE INSERT ON public.marketing_opportunities
  FOR EACH ROW EXECUTE FUNCTION public.assegna_a_chi_crea();
