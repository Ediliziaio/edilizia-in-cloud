-- Giorni e orari d'invio del cold li decide ogni brand.
--
-- Prima esisteva una finestra di piattaforma (platform_settings, mai scritta:
-- valeva il predefinito lun–ven 8–19) e il ritmo di un brand era
-- l'intersezione fra quella e la sua. ThermoDMR era impostato lun–sab: il
-- sabato veniva tagliato qui, nella stima, e prima ancora nel motore, che si
-- fermava senza guardare il brand. Il motore ora gira tutti i giorni.
--
-- Un brand senza finestra propria spedisce lun–ven 8–19, come prima. Una
-- finestra salvata male (ore invertite o fuori scala) ripiega sul predefinito,
-- come parseSendWindow nel motore. Si restituisce anche l'ora di apertura: la
-- pagina Pipeline diceva «si sta spedendo» anche prima dell'orario di inizio.

DROP FUNCTION IF EXISTS public.outreach_campagne_ritmo(uuid);

CREATE FUNCTION public.outreach_campagne_ritmo(p_company uuid)
RETURNS TABLE (
  brand_id uuid, brand text, stato text, nuovi_al_giorno integer,
  giorni_invio integer[], ora_inizio integer, ora_fine integer, caselle jsonb)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT (SELECT public.is_super_admin()) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT b.id, b.name, b.status, b.new_per_day,
         coalesce(g.giorni, ARRAY[1, 2, 3, 4, 5]),
         CASE WHEN o.valida THEN o.sh ELSE 8 END,
         CASE WHEN o.valida THEN o.eh ELSE 19 END,
         coalesce(c.lista, '[]'::jsonb)
    FROM public.outreach_brands b
    LEFT JOIN LATERAL (
      SELECT array_agg(DISTINCT x::int ORDER BY x::int) AS giorni
        FROM jsonb_array_elements_text(
               CASE WHEN jsonb_typeof(b.send_window -> 'days') = 'array'
                    THEN b.send_window -> 'days' ELSE '[]'::jsonb END) x
       WHERE x ~ '^[0-6]$'
    ) g ON true
    LEFT JOIN LATERAL (
      SELECT t.sh, t.eh, (t.sh IS NOT NULL AND t.eh IS NOT NULL AND t.sh < t.eh) AS valida
        FROM (SELECT
                CASE WHEN (b.send_window ->> 'startHour') ~ '^\d{1,2}$' THEN
                  CASE WHEN (b.send_window ->> 'startHour')::int BETWEEN 0 AND 23
                       THEN (b.send_window ->> 'startHour')::int END END AS sh,
                CASE WHEN (b.send_window ->> 'endHour') ~ '^\d{1,2}$' THEN
                  CASE WHEN (b.send_window ->> 'endHour')::int BETWEEN 1 AND 24
                       THEN (b.send_window ->> 'endHour')::int END END AS eh) t
    ) o ON true
    LEFT JOIN LATERAL (
      SELECT jsonb_agg(jsonb_build_object(
               'id', s.id,
               'tetto', greatest(0, coalesce(s.daily_cap_target, 0)),
               'base', greatest(0, coalesce(s.warmup_base, 0)),
               'passo', greatest(0, coalesce(s.warmup_step, 0)),
               'giorno', greatest(0, coalesce(s.warmup_day, 0)),
               'avviato', s.warmup_started_on IS NOT NULL,
               'inviati_oggi', CASE WHEN s.daily_sent_date = (now() AT TIME ZONE 'Europe/Rome')::date THEN coalesce(s.daily_sent, 0) ELSE 0 END)
             ORDER BY s.email) AS lista
        FROM public.outreach_sender_accounts s
       WHERE s.brand_id = b.id AND s.status IN ('active', 'warming')
         AND coalesce(s.connection_status, '') <> 'error'
    ) c ON true
   WHERE b.company_id = p_company;
END;
$$;

REVOKE ALL ON FUNCTION public.outreach_campagne_ritmo(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.outreach_campagne_ritmo(uuid) TO authenticated, service_role;
