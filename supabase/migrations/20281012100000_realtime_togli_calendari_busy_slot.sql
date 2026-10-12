-- Toglie i busy-slot dei calendari dalla pubblicazione Realtime. Sono dati di
-- sync di sfondo (il calendar-sync li riscrive a ogni giro) e NESSUNA UI li
-- ascolta dal vivo. Realtime decodificava ogni scrittura: ~9.100 UPDATE in 2h45
-- sul solo google_calendar_busy_slots = ~94% del traffico Realtime e il grosso
-- del 18% di CPU. Reversibile (ALTER PUBLICATION ... ADD TABLE). Idempotente.
do $$
begin
  if exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='google_calendar_busy_slots') then
    alter publication supabase_realtime drop table public.google_calendar_busy_slots;
  end if;
  if exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='apple_calendar_busy_slots') then
    alter publication supabase_realtime drop table public.apple_calendar_busy_slots;
  end if;
  if exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='outlook_calendar_events') then
    alter publication supabase_realtime drop table public.outlook_calendar_events;
  end if;
end $$;
