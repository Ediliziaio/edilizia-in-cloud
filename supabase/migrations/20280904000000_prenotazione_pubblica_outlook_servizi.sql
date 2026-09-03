-- Prenotazione pubblica (03/09/2026): Outlook tra gli impegni, preferenza
-- "blocca slot occupati" leggibile dalla pagina pubblica, e i calendari dei
-- servizi di consulenza della piattaforma.
--
-- Due difetti chiusi qui:
--   1. gli eventi Outlook non bloccavano gli slot (solo Google e Apple): chi
--      usa il calendario Microsoft rischiava doppie prenotazioni;
--   2. la pagina pubblica leggeva user_calendar_preferences, tabella che un
--      visitatore anonimo NON puo' leggere → prefs sempre nulle → gli impegni
--      del titolare non bloccavano MAI nulla, nemmeno quelli di Google.

-- 1. Outlook: il visitatore anonimo puo' vedere gli eventi (solo inizio/fine)
--    dei titolari di calendari pubblici, come gia' per Google e Apple.
DROP POLICY IF EXISTS public_booking_read_outlook_events ON public.outlook_calendar_events;
CREATE POLICY public_booking_read_outlook_events ON public.outlook_calendar_events
  FOR SELECT USING (
    user_id IN (
      SELECT mc.owner_id FROM public.marketing_calendars mc
      WHERE mc.owner_id IS NOT NULL AND mc.booking_slug IS NOT NULL AND mc.is_active = true
    )
  );

-- Vista con la stessa forma di google/apple_calendar_busy_slots. security_invoker
-- ON: si applica la policy qui sopra, non i permessi del proprietario della vista.
DROP VIEW IF EXISTS public.outlook_calendar_busy_slots;
CREATE VIEW public.outlook_calendar_busy_slots WITH (security_invoker = on) AS
  SELECT e.id, e.company_id, e.user_id, e.start_time AS start_at, e.end_time AS end_at,
         e.subject AS summary, e.is_all_day, e.outlook_event_id
  FROM public.outlook_calendar_events e
  WHERE e.is_cancelled IS NOT TRUE
    AND COALESCE(e.show_as, 'busy') NOT IN ('free', 'workingElsewhere')
    AND e.start_time IS NOT NULL AND e.end_time IS NOT NULL;
GRANT SELECT ON public.outlook_calendar_busy_slots TO anon, authenticated, service_role;

-- 2. Vista unificata degli impegni: ora include anche Outlook.
CREATE OR REPLACE VIEW public.unified_calendar_busy_slots AS
  SELECT id, company_id, user_id, start_at, end_at, summary, is_all_day,
         'google'::text AS provider, google_event_id AS external_id
  FROM public.google_calendar_busy_slots
  UNION ALL
  SELECT id, company_id, user_id, start_at, end_at, summary, is_all_day,
         'apple'::text AS provider, caldav_uid AS external_id
  FROM public.apple_calendar_busy_slots
  UNION ALL
  SELECT id, company_id, user_id, start_at, end_at, summary, is_all_day,
         'outlook'::text AS provider, outlook_event_id AS external_id
  FROM public.outlook_calendar_busy_slots;

-- 3. Preferenza "blocca slot occupati" leggibile dalla pagina pubblica: solo
--    il flag, solo per i titolari di calendari pubblici. Vista SENZA
--    security_invoker (gira come proprietario) e ristretta dal WHERE: stesso
--    schema gia' usato da public_appointment_slots.
DROP VIEW IF EXISTS public.public_calendar_owner_prefs;
CREATE VIEW public.public_calendar_owner_prefs AS
  SELECT p.user_id, bool_or(COALESCE(p.block_busy_slots, true)) AS block_busy_slots
  FROM public.user_calendar_preferences p
  WHERE p.user_id IN (
    SELECT mc.owner_id FROM public.marketing_calendars mc
    WHERE mc.owner_id IS NOT NULL AND mc.booking_slug IS NOT NULL AND mc.is_active = true
  )
  GROUP BY p.user_id;
GRANT SELECT ON public.public_calendar_owner_prefs TO anon, authenticated, service_role;

-- 4. Calendari dei servizi di consulenza (azienda = piattaforma, titolare =
--    super admin). Il "Demo & Sales" esistente diventa il calendario demo con
--    un link pubblico; gli altri sono nuovi. Slug e durate si cambiano da
--    /admin/impostazioni/calendari.
DO $$
DECLARE
  v_platform uuid := '00000000-0000-0000-0000-000000000001';
  v_owner uuid;
  v_cal uuid;
  v_servizio record;
  v_giorno integer;
BEGIN
  SELECT user_id INTO v_owner FROM public.user_roles WHERE role = 'super_admin' ORDER BY user_id LIMIT 1;
  IF v_owner IS NULL THEN RAISE NOTICE 'Nessun super admin: calendari non creati'; RETURN; END IF;

  -- Il calendario demo che esisteva senza link pubblico ne' titolare.
  UPDATE public.marketing_calendars
  SET name = 'Demo Edilizia in Cloud', booking_slug = 'demo-edilizia-in-cloud',
      duration_minutes = 30, owner_id = COALESCE(owner_id, v_owner), is_active = true,
      description = COALESCE(description, 'Ti mostro il gestionale sui tuoi cantieri: preventivi, commesse, fatture. Trenta minuti, senza impegno.')
  WHERE id = '00000000-0000-0000-0000-000000000301';

  FOR v_servizio IN
    SELECT * FROM (VALUES
      ('Consulenza gestionale', 'consulenza-gestionale', 60,
       'Un''ora sui processi della tua impresa: come stanno andando commesse, preventivi e margini, e cosa conviene sistemare per primo.'),
      ('Controllo di gestione', 'consulenza-controllo-gestione', 60,
       'I numeri della tua impresa letti insieme: margine per commessa, costi fissi, prezzo orario. Un''ora per capire dove stai perdendo.'),
      ('Consulenza marketing edile', 'consulenza-marketing-edile', 45,
       'Come arrivano oggi i tuoi clienti e come farne arrivare altri: sito, campagne, preventivi che si chiudono.'),
      ('Consulenza vendita edile', 'consulenza-vendita-edile', 45,
       'Il metodo per far firmare i preventivi: sopralluogo, presentazione, gestione delle obiezioni, follow-up.'),
      ('Consulenza infissi e serramenti', 'consulenza-infissi', 45,
       'Per chi vende e posa serramenti: listini, configuratore, preventivi in giornata e gestione della posa.')
    ) AS t(nome, slug, durata, descrizione)
  LOOP
    SELECT id INTO v_cal FROM public.marketing_calendars
    WHERE company_id = v_platform AND booking_slug = v_servizio.slug;

    IF v_cal IS NULL THEN
      INSERT INTO public.marketing_calendars
        (company_id, name, booking_slug, duration_minutes, description, owner_id, created_by, is_active, calendar_type)
      VALUES (v_platform, v_servizio.nome, v_servizio.slug, v_servizio.durata, v_servizio.descrizione, v_owner, v_owner, true, 'personal')
      RETURNING id INTO v_cal;
    END IF;

    -- Disponibilita': lunedi'-venerdi' 9-18 (una fascia per giorno, come si
    -- aspetta il pannello). Sabato e domenica disattivati ma presenti, cosi'
    -- le righe ci sono gia' quando si aprono gli orari nel pannello.
    FOR v_giorno IN 0..6 LOOP
      IF NOT EXISTS (
        SELECT 1 FROM public.marketing_calendar_availability
        WHERE calendar_id = v_cal AND day_of_week = v_giorno AND specific_date IS NULL
      ) THEN
        INSERT INTO public.marketing_calendar_availability
          (company_id, calendar_id, day_of_week, start_time, end_time, is_enabled)
        VALUES (v_platform, v_cal, v_giorno, '09:00', '18:00', v_giorno BETWEEN 1 AND 5);
      END IF;
    END LOOP;
  END LOOP;

  -- Stesse fasce anche per il calendario demo.
  FOR v_giorno IN 0..6 LOOP
    IF NOT EXISTS (
      SELECT 1 FROM public.marketing_calendar_availability
      WHERE calendar_id = '00000000-0000-0000-0000-000000000301' AND day_of_week = v_giorno AND specific_date IS NULL
    ) THEN
      INSERT INTO public.marketing_calendar_availability
        (company_id, calendar_id, day_of_week, start_time, end_time, is_enabled)
      VALUES (v_platform, '00000000-0000-0000-0000-000000000301', v_giorno, '09:00', '18:00', v_giorno BETWEEN 1 AND 5);
    END IF;
  END LOOP;

  -- Preferenza del titolare: gli impegni del suo calendario bloccano gli slot.
  INSERT INTO public.user_calendar_preferences (user_id, company_id, sync_enabled, sync_direction, block_busy_slots)
  VALUES (v_owner, v_platform, true, 'both', true)
  ON CONFLICT DO NOTHING;
END $$;
