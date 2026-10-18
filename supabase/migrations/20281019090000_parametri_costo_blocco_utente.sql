-- costo_personale_parametri: la regola che esclude gli utenti bloccati, come su ogni tabella.
-- La migrazione 20281019040000 la toglieva prima di creare la sua policy e non la rimetteva.
set local lock_timeout = '3s';
set local statement_timeout = '60s';

drop policy if exists blocco_utente_bloccato on public.costo_personale_parametri;
create policy blocco_utente_bloccato on public.costo_personale_parametri
  as restrictive for all to authenticated
  using (not (select public.utente_bloccato()))
  with check (not (select public.utente_bloccato()));
