-- Disponibilità della squadra (08/09/2026): le altre commesse della squadra nel
-- periodo + gli impegni del suo calendario Google. Avvisa, non blocca: è la
-- UI a decidere cosa farne. DEFINER con controllo azienda: gli slot Google
-- sono leggibili solo da chi ha la connessione o dallo staff, ma la striscia
-- serve a chiunque pianifichi. Applicata sul live via Management API, poi
-- migration repair 20280912000003.
CREATE OR REPLACE FUNCTION public.squadra_impegni(
  p_team_id uuid, p_dal date, p_al date, p_commessa_esclusa uuid DEFAULT NULL
) RETURNS TABLE (fonte text, titolo text, inizio timestamptz, fine timestamptz, tutto_il_giorno boolean, order_id uuid)
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  WITH sq AS (
    SELECT t.id, t.company_id, t.google_calendar_id
      FROM public.external_teams t
     WHERE t.id = p_team_id AND t.company_id = public.get_user_company_id((SELECT auth.uid()))
  ),
  commesse AS (
    SELECT 'commessa'::text AS fonte,
           coalesce(o.order_code, '') || coalesce(' · ' || o.client_name, '') AS titolo,
           (o.work_start_date + coalesce(o.work_start_time, time '00:00')) AT TIME ZONE 'Europe/Rome' AS inizio,
           (coalesce(o.work_end_date, o.work_start_date) + coalesce(o.work_end_time, time '23:59')) AT TIME ZONE 'Europe/Rome' AS fine,
           (o.work_start_time IS NULL) AS tutto_il_giorno,
           o.id AS order_id
      FROM sq
      JOIN public.order_external_teams oet ON oet.external_team_id = sq.id
      JOIN public.orders o ON o.id = oet.order_id AND o.company_id = sq.company_id
     WHERE o.work_start_date IS NOT NULL
       AND (p_commessa_esclusa IS NULL OR o.id <> p_commessa_esclusa)
       AND o.work_start_date <= p_al
       AND coalesce(o.work_end_date, o.work_start_date) >= p_dal
  ),
  google AS (
    SELECT 'google'::text, coalesce(nullif(b.summary, ''), 'Impegno su Google'),
           b.start_at, b.end_at, b.is_all_day, NULL::uuid
      FROM sq
      JOIN public.google_calendar_busy_slots b ON b.google_calendar_id = sq.google_calendar_id AND b.company_id = sq.company_id
     WHERE sq.google_calendar_id IS NOT NULL
       AND b.start_at < ((p_al + 1) AT TIME ZONE 'Europe/Rome')
       AND b.end_at > (p_dal AT TIME ZONE 'Europe/Rome')
  )
  SELECT * FROM commesse UNION ALL SELECT * FROM google ORDER BY inizio;
$$;
REVOKE ALL ON FUNCTION public.squadra_impegni(uuid, date, date, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.squadra_impegni(uuid, date, date, uuid) TO authenticated;
