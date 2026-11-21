alter table public.sal_subappaltatori
  add column if not exists revisione bigint not null default 0;

create or replace function private.sal_subappalto_avanza_revisione()
returns trigger language plpgsql set search_path = '' as $$
begin
  if old.stato = 'contestato' and new.stato = 'verificato' then
    raise exception 'Il SAL è contestato. Riesamina le misure e porta in verifica la nuova versione.' using errcode = 'PT409';
  end if;
  new.revisione := old.revisione + 1;
  return new;
end $$;

revoke all on function private.sal_subappalto_avanza_revisione() from public, anon, authenticated;
drop trigger if exists sal_subappalto_revisione on public.sal_subappaltatori;
create trigger sal_subappalto_revisione before update on public.sal_subappaltatori
  for each row execute function private.sal_subappalto_avanza_revisione();
notify pgrst, 'reload schema';
