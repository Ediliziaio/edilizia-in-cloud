-- La contabilizzazione conserva la lettura già registrata, anche per i documenti storici.
-- Non modifica gli stati delle fatture esistenti.
set local lock_timeout='3s';
set local statement_timeout='30s';

create or replace function private.ricevuta_conserva_lettura_contabilizzando()
returns trigger language plpgsql security invoker set search_path='' as $function$
begin
  if old.stato in ('non_letta','letta') and new.stato='contabilizzata'
     and new.da_leggere is null then
    new.da_leggere := coalesce(old.da_leggere,old.stato='non_letta');
  end if;
  return new;
end;
$function$;
revoke all on function private.ricevuta_conserva_lettura_contabilizzando() from public,anon,authenticated;

drop trigger if exists ricevuta_conserva_lettura_contabilizzando on public.fatture_ricevute;
create trigger ricevuta_conserva_lettura_contabilizzando
before update of stato on public.fatture_ricevute
for each row execute function private.ricevuta_conserva_lettura_contabilizzando();
