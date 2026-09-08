-- Le fasce occupate del titolare arrivano alla pagina di prenotazione
-- (08/09/2026), senza mostrare cosa sta facendo.
--
-- COSA NON FUNZIONAVA: /prenota/<slug> leggeva `google_calendar_busy_slots` e
-- `apple_calendar_busy_slots` direttamente da visitatore anonimo → 401
-- «permission denied for table» (anon non ha nemmeno il GRANT). Su Outlook,
-- che il GRANT ce l'ha, la RLS restituiva zero righe: stesso risultato, ma in
-- silenzio. Conclusione: gli impegni del titolare non bloccavano MAI gli
-- orari proposti, su nessuno dei tre provider — un cliente poteva prenotare
-- mentre eri già in riunione.
--
-- COME: la stessa idea di `public_appointment_slots` — una vista che espone
-- SOLO le colonne che servono. Qui: chi, da quando, a quando. Nessun titolo,
-- nessuna descrizione, nessun invitato: chi guarda vede che sei impegnato, non
-- cosa stai facendo. Ed esiste solo per i titolari che (a) hanno pubblicato un
-- calendario di prenotazione attivo e (b) hanno chiesto di bloccare le fasce.
-- Applicata sul live via Management API, poi migration repair 20280912000006.

CREATE OR REPLACE VIEW public.public_calendar_busy_slots AS
WITH titolari AS (
  -- Solo chi ha davvero un link di prenotazione pubblico e attivo.
  SELECT DISTINCT mc.owner_id AS user_id
    FROM public.marketing_calendars mc
   WHERE mc.owner_id IS NOT NULL
     AND mc.booking_slug IS NOT NULL
     AND mc.is_active = true
),
blocca AS (
  -- …e che non ha disattivato il blocco delle fasce occupate.
  SELECT t.user_id
    FROM titolari t
    LEFT JOIN public.public_calendar_owner_prefs p ON p.user_id = t.user_id
   WHERE coalesce(p.block_busy_slots, true) = true
)
SELECT 'google'::text AS provider, b.user_id, b.start_at, b.end_at, b.is_all_day
  FROM public.google_calendar_busy_slots b JOIN blocca ON blocca.user_id = b.user_id
UNION ALL
SELECT 'outlook'::text, b.user_id, b.start_at, b.end_at, b.is_all_day
  FROM public.outlook_calendar_busy_slots b JOIN blocca ON blocca.user_id = b.user_id
UNION ALL
SELECT 'apple'::text, b.user_id, b.start_at, b.end_at, b.is_all_day
  FROM public.apple_calendar_busy_slots b JOIN blocca ON blocca.user_id = b.user_id;

COMMENT ON VIEW public.public_calendar_busy_slots IS
  'Fasce occupate dei titolari con un calendario di prenotazione pubblico: solo inizio e fine, mai il titolo. La legge /prenota/<slug> da visitatore anonimo.';

GRANT SELECT ON public.public_calendar_busy_slots TO anon, authenticated;
