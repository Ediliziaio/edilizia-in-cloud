-- 15/11/2026, ~20:00: dopo 20290410400000 nessuno riusciva più a creare un documento
-- («Impossibile creare il documento — mancano alcuni dati obbligatori»). La colonna
-- documenti_fiscali.riferimenti_pa è NOT NULL default '[]', ma documento_crea popola la riga
-- da un record jsonb: un campo che il client non manda arriva come NULL esplicito e il
-- default non scatta («null value in column "riferimenti_pa" … violates not-null constraint»,
-- 4 volte tra le 19:00 e le 20:01 UTC, Demo 2 e un'azienda vera).
--
-- Un trigger BEFORE porta NULL (o un valore che non è un array) a '[]' prima del controllo
-- NOT NULL. Vale per ogni strada che scrive la tabella, non solo per documento_crea.
-- Idempotente. Funzione di trigger: nessun EXECUTE da concedere.

set local lock_timeout = '3s';

create or replace function public.documenti_fiscali_riferimenti_pa_vuoti()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.riferimenti_pa is null or jsonb_typeof(new.riferimenti_pa) <> 'array' then
    new.riferimenti_pa := '[]'::jsonb;
  end if;
  return new;
end;
$$;
revoke all on function public.documenti_fiscali_riferimenti_pa_vuoti() from public, anon, authenticated;

drop trigger if exists a00_documenti_fiscali_riferimenti_pa_vuoti on public.documenti_fiscali;
create trigger a00_documenti_fiscali_riferimenti_pa_vuoti
  before insert or update of riferimenti_pa on public.documenti_fiscali
  for each row execute function public.documenti_fiscali_riferimenti_pa_vuoti();
