-- L'associazione al calendario esterno vive SUL calendario (08/09/2026).
--
-- Prima: la destinazione era una sola per utente (google_calendar_settings.
-- primary_calendar_id) e il percorso era appuntamento → calendario marketing →
-- responsabile → LA casella del responsabile → IL suo calendario. Due calendari
-- con lo stesso responsabile finivano per forza nello stesso posto, e per
-- cambiarlo bisognava uscire dal calendario e andare in un'altra pagina.
--
-- Da qui in poi ogni calendario marketing porta con sé il suo account e il suo
-- calendario, scelti dentro «Modifica calendario». Provider-agnostico: la
-- connessione sta in google_/outlook_/apple_calendar_connections, e a dire
-- quale tabella è `external_provider` (niente FK: punterebbe a tre tabelle).
-- Applicata sul live via Management API, poi migration repair 20280912000004.

ALTER TABLE public.marketing_calendars
  ADD COLUMN IF NOT EXISTS external_provider text,
  ADD COLUMN IF NOT EXISTS external_connection_id uuid,
  ADD COLUMN IF NOT EXISTS external_calendar_id text,
  ADD COLUMN IF NOT EXISTS external_calendar_name text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'marketing_calendars_external_provider_valido') THEN
    ALTER TABLE public.marketing_calendars
      ADD CONSTRAINT marketing_calendars_external_provider_valido
      CHECK (external_provider IS NULL OR external_provider IN ('google', 'outlook', 'apple'));
  END IF;
END $$;

COMMENT ON COLUMN public.marketing_calendars.external_provider IS
  'google | outlook | apple — quale tabella di connessioni guardare. NULL = nessun calendario esterno collegato.';
COMMENT ON COLUMN public.marketing_calendars.external_connection_id IS
  'La casella collegata (riga in <provider>_calendar_connections).';
COMMENT ON COLUMN public.marketing_calendars.external_calendar_id IS
  'Il calendario dentro quella casella: id Google, id Outlook o URL CalDAV per Apple.';
COMMENT ON COLUMN public.marketing_calendars.external_calendar_name IS
  'Nome leggibile del calendario, salvato per mostrarlo senza richiamare il provider.';

CREATE INDEX IF NOT EXISTS idx_marketing_calendars_external
  ON public.marketing_calendars (external_connection_id, external_calendar_id)
  WHERE external_connection_id IS NOT NULL;
