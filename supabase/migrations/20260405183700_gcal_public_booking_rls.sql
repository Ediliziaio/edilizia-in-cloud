-- FASE 7: RLS policy per permettere al booking pubblico di leggere i busy slots Google
-- Il booking pubblico non ha un utente autenticato, ma deve poter verificare
-- la disponibilità del proprietario del calendario

CREATE POLICY "public_booking_read_busy_slots"
  ON google_calendar_busy_slots
  FOR SELECT
  USING (
    user_id IN (
      SELECT owner_id FROM marketing_calendars
      WHERE booking_slug IS NOT NULL
        AND is_active = true
        AND owner_id IS NOT NULL
    )
  );
