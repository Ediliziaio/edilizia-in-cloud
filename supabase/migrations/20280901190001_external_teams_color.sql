-- Colore della squadra sul calendario: scelto dall'azienda, uguale per tutti
-- gli utenti (il calendario si legge in ufficio come in cantiere). Null =
-- colore automatico dalla palette (hash dell'id).
alter table public.external_teams
  add column if not exists color text;
