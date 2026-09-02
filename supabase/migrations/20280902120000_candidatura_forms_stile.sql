-- Aspetto del modulo di candidatura: il form sta sul sito DELL'IMPRESA e
-- deve vestirsi dei suoi colori. stile = { testata, bottone, mostra_azienda }.
-- '{}' = default (arancione EiC, nome azienda nascosto — richiesta utente).
alter table public.hr_candidatura_forms
  add column if not exists stile jsonb not null default '{}'::jsonb;
