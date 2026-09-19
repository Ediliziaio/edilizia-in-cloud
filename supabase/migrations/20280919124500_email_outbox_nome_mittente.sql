-- Il nome del mittente per le email che partono da una casella collegata
-- (19/09/2026).
--
-- Le automazioni che mandano da una casella dell'azienda (info@…) usavano come
-- nome quello del profilo di chi l'aveva collegata; se il profilo non sembra
-- un nome di persona («flo.andriciuc Admin») l'email partiva con l'indirizzo
-- nudo. Ora il «da nome» scelto nel nodo email viaggia sulla riga della coda
-- e la funzione email-send lo usa per primo.
alter table public.email_outbox
  add column if not exists from_name text;

comment on column public.email_outbox.from_name is
  'Nome del mittente scelto da chi ha costruito l''automazione («da nome» del nodo email); se vuoto vale il nome del profilo.';
