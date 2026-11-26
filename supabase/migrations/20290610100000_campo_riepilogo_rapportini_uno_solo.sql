-- «N rapportini da approvare» una notifica sola (26/11/2026, segnalazione del founder dall'iPhone).
--
-- campo_promemoria('digest') ogni giorno manda all'ufficio il riepilogo dei rapportini in attesa. Il titolo
-- cambia col numero («31 rapportini…», «20 rapportini…»), quindi il controllo delle 12 ore non lo fermava e
-- le notifiche si accumulavano: 1.873 non lette per 46 persone, una al giorno, tutte vecchie tranne l'ultima.
-- Ora un riepilogo nuovo sostituisce i precedenti dello stesso utente: resta solo quello col numero di oggi.
-- Il resto di campo_notifica è invariato.

CREATE OR REPLACE FUNCTION public.campo_notifica(p_company_id uuid, p_user_id uuid, p_type text, p_title text, p_body text, p_entity_type text DEFAULT NULL::text, p_entity_id uuid DEFAULT NULL::uuid, p_action_url text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_id uuid;
BEGIN
  IF p_user_id IS NULL OR p_company_id IS NULL THEN RETURN NULL; END IF;
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = p_user_id) THEN RETURN NULL; END IF;
  -- Stesso avviso allo stesso utente nelle ultime 12 ore: non lo ripetiamo.
  IF EXISTS (
    SELECT 1 FROM public.notifications n
    WHERE n.user_id = p_user_id AND n.type = p_type AND n.title = p_title
      AND coalesce(n.entity_id::text, '') = coalesce(p_entity_id::text, '')
      AND n.created_at > now() - interval '12 hours'
  ) THEN RETURN NULL; END IF;
  -- Il riepilogo dei rapportini da approvare è uno stato, non un evento: quello nuovo prende il posto dei vecchi.
  IF p_type = 'campo_digest' THEN
    DELETE FROM public.notifications n
    WHERE n.user_id = p_user_id AND n.company_id = p_company_id AND n.type = 'campo_digest';
  END IF;
  INSERT INTO public.notifications (company_id, user_id, type, title, body, entity_type, entity_id, action_url)
  VALUES (p_company_id, p_user_id, p_type, p_title, p_body, p_entity_type, p_entity_id, p_action_url)
  RETURNING id INTO v_id;
  RETURN v_id;
END $function$;
