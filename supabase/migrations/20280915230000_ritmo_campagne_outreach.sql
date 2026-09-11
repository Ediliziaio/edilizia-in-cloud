-- Quanto ci mette una campagna cold: il ritmo vero delle caselle.
--
-- La coda scrive per ogni messaggio una data (scheduled_for), ma è un minimo,
-- non una promessa: il dispatcher spedisce solo nei giorni della finestra
-- d'invio e dentro il tetto giornaliero di ogni casella (warm-up compreso) e
-- dei «nuovi al giorno» del brand. Con 9 caselle a 5 email al giorno la coda
-- diceva «tutti entro il 15/09» per 2.600 primi contatti che al ritmo reale
-- richiedono mesi. Per stimare i tempi servono:
--   - per brand: le caselle (tetto, rampa di warm-up, giorno di warm-up), i
--     nuovi al giorno per casella e i giorni della finestra d'invio
--     (piattaforma ∩ brand, come finestraEffettiva in _shared/outreach-schedule.ts);
--   - per campagna: quanti messaggi restano da mandare se nessuno risponde.
-- La stima si fa nel browser (campagneFasi.ts, provata), con gli stessi
-- numeri del dispatcher.

-- Il riepilogo guadagna brand_id e i messaggi ancora da mandare: cambia la
-- forma del risultato, quindi va ricreata.
DROP FUNCTION IF EXISTS public.outreach_campagne_riepilogo(uuid);

CREATE FUNCTION public.outreach_campagne_riepilogo(p_company uuid)
RETURNS TABLE (
  sequence_id uuid, nome text, stato text, brand_id uuid, brand text, creata_at timestamptz,
  passi integer, ramificata boolean, aperture_tracciate boolean,
  iscritti bigint, contattati bigint, da_contattare bigint, in_corso bigint, completati bigint,
  risposte bigint, interessati bigint, non_interessati bigint,
  rimbalzati bigint, disiscritti bigint, fermati bigint, in_pausa bigint,
  messaggi_inviati bigint, messaggi_programmati bigint, messaggi_da_mandare bigint,
  prossimo_invio timestamptz, ultimo_programmato timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH i AS (
    SELECT * FROM public.outreach_campagna_iscrizioni(p_company, NULL)
  ),
  st AS (
    SELECT st.sequence_id,
           count(*) FILTER (WHERE coalesce(st.node_type, st.channel) IN ('email', 'whatsapp', 'sms', 'call'))::int AS passi,
           coalesce(bool_or(st.node_type = 'condition'), false) AS ramificata
      FROM public.outreach_sequence_steps st
     GROUP BY st.sequence_id
  ),
  agg AS (
    SELECT i.sequence_id,
           count(*) AS iscritti,
           count(*) FILTER (WHERE i.inviati > 0) AS contattati,
           count(*) FILTER (WHERE i.fase = 'da_contattare') AS da_contattare,
           count(*) FILTER (WHERE starts_with(i.fase, 'passo_')) AS in_corso,
           count(*) FILTER (WHERE i.fase = 'completato') AS completati,
           count(*) FILTER (WHERE starts_with(i.fase, 'risposta_')) AS risposte,
           count(*) FILTER (WHERE i.fase IN ('risposta_interessato', 'risposta_domanda')) AS interessati,
           count(*) FILTER (WHERE i.fase = 'risposta_non_interessato') AS non_interessati,
           count(*) FILTER (WHERE i.fase = 'rimbalzato') AS rimbalzati,
           count(*) FILTER (WHERE i.fase = 'disiscritto') AS disiscritti,
           count(*) FILTER (WHERE i.fase = 'fermato') AS fermati,
           count(*) FILTER (WHERE i.stato = 'paused') AS in_pausa,
           sum(i.inviati) AS messaggi_inviati,
           -- Chi è ancora nel flusso riceverà i passi che gli mancano, se non risponde.
           sum(greatest(coalesce(st.passi, 0) - i.inviati, 0))
             FILTER (WHERE i.fase = 'da_contattare' OR starts_with(i.fase, 'passo_')) AS da_mandare,
           min(i.prossimo_invio_at) AS prossimo_invio
      FROM i
      LEFT JOIN st ON st.sequence_id = i.sequence_id
     GROUP BY i.sequence_id
  ),
  prog AS (
    SELECT e.sequence_id, count(*) AS programmati, max(q.scheduled_for) AS ultimo
      FROM public.outreach_send_queue q
      JOIN public.outreach_enrollments e ON e.id = q.enrollment_id
     WHERE q.company_id = p_company AND q.status IN ('queued', 'sending')
       AND coalesce(q.kind, 'send') = 'send'
       AND (SELECT public.is_super_admin())
     GROUP BY e.sequence_id
  )
  SELECT s.id, s.name, s.status, s.brand_id, b.name, s.created_at,
         coalesce(st.passi, 0), coalesce(st.ramificata, false), coalesce(s.track_opens, false),
         coalesce(agg.iscritti, 0), coalesce(agg.contattati, 0), coalesce(agg.da_contattare, 0),
         coalesce(agg.in_corso, 0), coalesce(agg.completati, 0), coalesce(agg.risposte, 0),
         coalesce(agg.interessati, 0), coalesce(agg.non_interessati, 0), coalesce(agg.rimbalzati, 0),
         coalesce(agg.disiscritti, 0), coalesce(agg.fermati, 0), coalesce(agg.in_pausa, 0),
         coalesce(agg.messaggi_inviati, 0), coalesce(prog.programmati, 0), coalesce(agg.da_mandare, 0),
         agg.prossimo_invio, prog.ultimo
    FROM public.outreach_sequences s
    LEFT JOIN public.outreach_brands b ON b.id = s.brand_id
    LEFT JOIN agg ON agg.sequence_id = s.id
    LEFT JOIN prog ON prog.sequence_id = s.id
    LEFT JOIN st ON st.sequence_id = s.id
   WHERE s.company_id = p_company AND (SELECT public.is_super_admin())
   ORDER BY (s.status = 'active') DESC, coalesce(agg.iscritti, 0) DESC, s.created_at DESC;
$$;

-- Il ritmo di ogni brand: le sue caselle attive o in warm-up con tetto e
-- rampa, i nuovi al giorno per casella, i giorni e l'ora di chiusura della
-- finestra d'invio.
DROP FUNCTION IF EXISTS public.outreach_campagne_ritmo(uuid);

CREATE FUNCTION public.outreach_campagne_ritmo(p_company uuid)
RETURNS TABLE (
  brand_id uuid, brand text, stato text, nuovi_al_giorno integer, giorni_invio integer[], ora_fine integer, caselle jsonb)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_giorni integer[] := ARRAY[1, 2, 3, 4, 5];
  v_fine integer := 19;
  v_raw text;
BEGIN
  IF NOT (SELECT public.is_super_admin()) THEN
    RETURN;
  END IF;

  -- Finestra di piattaforma (platform_settings.outreach_send_window, JSON in
  -- testo); illeggibile o assente = lun–ven fino alle 19, come DEFAULT_SEND_WINDOW.
  SELECT ps.value INTO v_raw FROM public.platform_settings ps WHERE ps.key = 'outreach_send_window';
  IF v_raw IS NOT NULL THEN
    BEGIN
      SELECT array_agg(DISTINCT x::int ORDER BY x::int) INTO v_giorni
        FROM jsonb_array_elements_text(v_raw::jsonb -> 'days') x
       WHERE x ~ '^[0-6]$';
      IF (v_raw::jsonb ->> 'endHour') ~ '^\d+$' THEN
        v_fine := least(24, greatest(1, (v_raw::jsonb ->> 'endHour')::int));
      END IF;
    EXCEPTION WHEN others THEN
      v_giorni := NULL;
      v_fine := 19;
    END;
    IF v_giorni IS NULL OR cardinality(v_giorni) = 0 THEN
      v_giorni := ARRAY[1, 2, 3, 4, 5];
    END IF;
  END IF;

  RETURN QUERY
  SELECT b.id, b.name, b.status, b.new_per_day,
         -- piattaforma ∩ brand; senza giorni del brand, o intersezione vuota, vale la piattaforma
         coalesce((
           SELECT array_agg(g ORDER BY g) FROM unnest(v_giorni) g
            WHERE jsonb_typeof(b.send_window -> 'days') IS DISTINCT FROM 'array'
               OR (b.send_window -> 'days') @> to_jsonb(g)
         ), v_giorni),
         CASE WHEN (b.send_window ->> 'endHour') ~ '^\d+$'
              THEN least(v_fine, (b.send_window ->> 'endHour')::int) ELSE v_fine END,
         coalesce((
           SELECT jsonb_agg(jsonb_build_object(
                    'id', s.id,
                    'tetto', greatest(0, coalesce(s.daily_cap_target, 0)),
                    'base', greatest(0, coalesce(s.warmup_base, 0)),
                    'passo', greatest(0, coalesce(s.warmup_step, 0)),
                    'giorno', greatest(0, coalesce(s.warmup_day, 0)),
                    'avviato', s.warmup_started_on IS NOT NULL,
                    'inviati_oggi', CASE WHEN s.daily_sent_date = (now() AT TIME ZONE 'Europe/Rome')::date THEN coalesce(s.daily_sent, 0) ELSE 0 END)
                  ORDER BY s.email)
             FROM public.outreach_sender_accounts s
            WHERE s.brand_id = b.id AND s.status IN ('active', 'warming')
              AND coalesce(s.connection_status, '') <> 'error'
         ), '[]'::jsonb)
    FROM public.outreach_brands b
   WHERE b.company_id = p_company;
END;
$$;

REVOKE ALL ON FUNCTION public.outreach_campagne_riepilogo(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.outreach_campagne_ritmo(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.outreach_campagne_riepilogo(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.outreach_campagne_ritmo(uuid) TO authenticated, service_role;
