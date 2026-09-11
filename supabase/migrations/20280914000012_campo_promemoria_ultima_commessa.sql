-- I promemoria agli operai («non hai timbrato l'uscita», «manca il rapportino»)
-- non sono mai partiti: la query usava max() su una colonna uuid, e Postgres
-- non ha un max per gli uuid. Ora si prende la commessa dell'ultima timbratura
-- della giornata, che è quella che ha senso linkare nel promemoria.
CREATE OR REPLACE FUNCTION public.campo_promemoria(p_slot text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_ora  text := to_char(now() AT TIME ZONE 'Europe/Rome', 'HH24:MI');
  v_oggi date := (now() AT TIME ZONE 'Europe/Rome')::date;
  v_slot text := p_slot;
  v_n int := 0; r record;
BEGIN
  IF v_slot IS NULL THEN
    v_slot := CASE
      WHEN v_ora BETWEEN '17:30' AND '17:59' THEN 'uscita'
      WHEN v_ora BETWEEN '18:30' AND '18:59' THEN 'rapportino'
      WHEN v_ora BETWEEN '07:30' AND '07:59' THEN 'digest'
      ELSE NULL END;
  END IF;
  IF v_slot IS NULL THEN RETURN jsonb_build_object('slot', null, 'ora', v_ora); END IF;

  IF v_slot = 'uscita' THEN
    -- Entrata oggi senza uscita successiva
    FOR r IN
      SELECT t.company_id, t.user_id, min(t.timestamp_evento) AS entrata
      FROM public.campo_timbrature t
      WHERE t.tipo = 'entrata' AND (t.timestamp_evento AT TIME ZONE 'Europe/Rome')::date = v_oggi
        AND NOT EXISTS (SELECT 1 FROM public.campo_timbrature u WHERE u.user_id = t.user_id AND u.tipo = 'uscita' AND u.timestamp_evento > t.timestamp_evento)
      GROUP BY 1, 2
    LOOP
      IF public.campo_notifica(r.company_id, r.user_id, 'campo_promemoria', 'Non hai timbrato l''uscita',
           'Sei entrato alle ' || to_char(r.entrata AT TIME ZONE 'Europe/Rome', 'HH24:MI') || '. Se hai finito, timbra l''uscita.',
           'campo_timbratura', NULL, '/campo/timbratura') IS NOT NULL THEN v_n := v_n + 1; END IF;
    END LOOP;

  ELSIF v_slot = 'rapportino' THEN
    -- Ha timbrato oggi ma non ha mandato il rapportino di oggi
    FOR r IN
      SELECT t.company_id, t.user_id,
             (array_agg(t.order_id ORDER BY t.timestamp_evento DESC) FILTER (WHERE t.order_id IS NOT NULL))[1] AS order_id
      FROM public.campo_timbrature t
      WHERE (t.timestamp_evento AT TIME ZONE 'Europe/Rome')::date = v_oggi
        AND NOT EXISTS (SELECT 1 FROM public.campo_rapportini cr WHERE cr.user_id = t.user_id AND cr.data_lavoro = v_oggi)
      GROUP BY 1, 2
    LOOP
      IF public.campo_notifica(r.company_id, r.user_id, 'campo_promemoria', 'Manca il rapportino di oggi',
           'Due minuti: cosa hai fatto, quante ore, una foto. Anche a voce.',
           'campo_rapportino', NULL,
           CASE WHEN r.order_id IS NOT NULL THEN '/campo/lavoro/' || r.order_id::text || '/rapportino' ELSE '/campo' END) IS NOT NULL THEN v_n := v_n + 1; END IF;
    END LOOP;

  ELSIF v_slot = 'digest' THEN
    -- All'ufficio: quanti rapportini aspettano l'approvazione
    FOR r IN
      SELECT cr.company_id, count(*) AS n, p.id AS admin_id
      FROM public.campo_rapportini cr
      JOIN public.profiles p ON p.company_id = cr.company_id
      JOIN public.user_roles ur ON ur.user_id = p.id AND ur.role IN ('company_admin', 'company_staff')
      WHERE cr.stato = 'inviato'
      GROUP BY cr.company_id, p.id
    LOOP
      IF public.campo_notifica(r.company_id, r.admin_id, 'campo_digest',
           r.n || CASE WHEN r.n = 1 THEN ' rapportino da approvare' ELSE ' rapportini da approvare' END,
           'Gli operai aspettano l''esito: ore e fasi passano in commessa solo dopo l''approvazione.',
           'campo_rapportino', NULL, '/azienda/ordini') IS NOT NULL THEN v_n := v_n + 1; END IF;
    END LOOP;
  END IF;
  RETURN jsonb_build_object('slot', v_slot, 'ora', v_ora, 'notifiche', v_n);
END $function$;
