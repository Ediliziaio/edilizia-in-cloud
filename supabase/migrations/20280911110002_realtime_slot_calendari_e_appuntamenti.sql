-- Il calendario marketing (MarketingCalendar.tsx) ascolta da mesi i
-- cambiamenti su google_calendar_busy_slots, apple_calendar_busy_slots e
-- appointments con Supabase Realtime ("l'utente vede gli eventi senza
-- ricaricare la pagina"). Ma la pubblicazione `supabase_realtime` non
-- conteneva NESSUNA di quelle tabelle: i listener non sono mai scattati.
-- Scoperto l'8 settembre 2026 aggiungendo Outlook allo stesso schema.
--
-- Per Outlook la tabella e' outlook_calendar_events: outlook_calendar_busy_slots
-- e' una VISTA sopra di essa (filtra cancellati e "libero"), e una vista non
-- puo' stare in una pubblicazione. Il client ascolta la tabella e rilegge la
-- vista.
--
-- Le tabelle degli slot hanno REPLICA IDENTITY FULL: senza, un DELETE non
-- porta con se' company_id e il filtro `company_id=eq.…` del client lo
-- scarta, cosi' gli impegni cancellati resterebbero a schermo fino a un
-- refresh. Sono tabelle piccole e riscritte a blocchi dalla sync: il costo
-- e' trascurabile. appointments resta con l'identita' di default (le righe
-- aggiornate portano company_id; le cancellazioni sono rare e la UI le
-- riprende alla prossima lettura).

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'google_calendar_busy_slots',
    'apple_calendar_busy_slots',
    'outlook_calendar_events',
    'appointments'
  ] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
       WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;

ALTER TABLE public.google_calendar_busy_slots REPLICA IDENTITY FULL;
ALTER TABLE public.apple_calendar_busy_slots  REPLICA IDENTITY FULL;
ALTER TABLE public.outlook_calendar_events    REPLICA IDENTITY FULL;
