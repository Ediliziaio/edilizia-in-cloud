set local lock_timeout='3s';
set local statement_timeout='60s';
-- SAL del cliente (audit 31/10/2026): il numero lo calcolava il browser; due utenti (o due schede) potevano
-- creare lo stesso numero, e la scheda SAL si fermava su «Numerazione SAL duplicata» senza via d'uscita.
-- Ora: il server assegna il numero se manca o se è già preso (un lock per commessa), e un indice unico lo garantisce.
create or replace function public.sal_records_numero_libero() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 perform pg_advisory_xact_lock(hashtextextended('sal_records:'||new.order_id::text, 0));
 if new.numero_sal is null or exists(select 1 from public.sal_records where order_id=new.order_id and numero_sal=new.numero_sal and id<>new.id) then
  select coalesce(max(numero_sal),0)+1 into new.numero_sal from public.sal_records where order_id=new.order_id;
 end if;
 return new;
end $$;
do $$ begin
 if not exists(select 1 from pg_trigger where tgname='sal_records_numero_libero' and tgrelid='public.sal_records'::regclass) then
  create trigger sal_records_numero_libero before insert on public.sal_records
   for each row execute function public.sal_records_numero_libero();
 end if;
end $$;
create unique index if not exists sal_records_ordine_numero_unico on public.sal_records(order_id, numero_sal);
