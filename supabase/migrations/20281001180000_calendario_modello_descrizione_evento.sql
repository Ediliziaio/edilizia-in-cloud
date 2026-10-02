-- Modello della descrizione degli eventi di Google Calendar, per calendario (01/10/2026).
-- Come in GHL: nelle impostazioni del calendario si scrive la descrizione con le
-- variabili ({{nome}}, {{telefono}}, {{indirizzo_completo}}, i campi personalizzati…).
-- Una colonna nullable: istantaneo. Vuoto = scheda cliente standard.
alter table public.marketing_calendars
  add column if not exists modello_descrizione_evento text;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'marketing_calendars_modello_descrizione_evento_len') then
    alter table public.marketing_calendars add constraint marketing_calendars_modello_descrizione_evento_len
      check (modello_descrizione_evento is null or char_length(modello_descrizione_evento) <= 3000);
  end if;
end $$;

comment on column public.marketing_calendars.modello_descrizione_evento is
  'Modello della descrizione degli eventi di questo calendario su Google Calendar, con variabili tipo {{nome}} {{telefono}} {{indirizzo_completo}}. Vuoto = scheda cliente standard.';
