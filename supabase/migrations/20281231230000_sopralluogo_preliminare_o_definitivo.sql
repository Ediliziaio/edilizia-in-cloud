-- Il sopralluogo dice se le sue misure sono di massima o definitive (08/11/2026).
-- La commessa e l'ordine leggeranno questa scelta. Solo una colonna facoltativa.
set local lock_timeout = '3s';
set local statement_timeout = '60s';
alter table public.surveys add column if not exists ruolo_misure text;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'surveys_ruolo_misure_check') then
    alter table public.surveys add constraint surveys_ruolo_misure_check
      check (ruolo_misure is null or ruolo_misure in ('preliminare', 'definitivo'));
  end if;
end $$;
comment on column public.surveys.ruolo_misure is 'Le misure di questo sopralluogo: preliminare (di massima) o definitivo (si ordina da qui). Vuoto = non detto.';
