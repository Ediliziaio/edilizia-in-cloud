-- Una risposta persa non deve rispedire un rapporto che l'ufficio ha già
-- ricevuto, anche quando nel frattempo lo ha rimandato indietro.
set local lock_timeout = '3s';
alter table public.campo_rapportini add column if not exists invio_operazione_id uuid;
grant select (invio_operazione_id) on public.campo_rapportini to authenticated;
notify pgrst, 'reload schema';
