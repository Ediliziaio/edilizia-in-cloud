-- Outlook Calendar: un collegamento per utente E azienda, come Google e Apple.
--
-- UNIQUE(user_id) permetteva un solo collegamento in tutto: chi lavora su più
-- aziende lo aveva salvato su quella del profilo e, dalla seconda, la scheda lo
-- vedeva «non collegato» (o quello dell'altra azienda). Al 17/09/2026 i
-- collegamenti Outlook sono zero: il cambio non tocca dati.

set local lock_timeout = '3s';

alter table public.outlook_calendar_connections
  drop constraint if exists outlook_calendar_connections_user_id_key;

create unique index if not exists outlook_calendar_connections_azienda_utente
  on public.outlook_calendar_connections (company_id, user_id);

-- L'upsert del ritorno OAuth usa onConflict "company_id,user_id": serve un
-- vincolo con quel nome di colonne, l'indice unico basta a PostgREST.
