set local lock_timeout='3s';
set local statement_timeout='60s';
-- Un segnale per commessa: nessuna ora, persona, descrizione o informazione economica.
create table if not exists public.commessa_campo_sync (
 order_id uuid primary key references public.orders(id) on delete cascade,
 company_id uuid not null references public.companies(id) on delete cascade,
 revisione bigint not null default 1,
 aggiornato_il timestamptz not null default now()
);
alter table public.commessa_campo_sync enable row level security;
revoke all on public.commessa_campo_sync from public,anon,authenticated;
grant select on public.commessa_campo_sync to authenticated;
grant all on public.commessa_campo_sync to service_role;
drop policy if exists commessa_sync_leggi on public.commessa_campo_sync;
create policy commessa_sync_leggi on public.commessa_campo_sync for select to authenticated using (
 (select auth.uid()) is not null and not (select public.utente_bloccato())
 and exists(select 1 from public.orders o where o.id=commessa_campo_sync.order_id and o.company_id=commessa_campo_sync.company_id and o.deleted_at is null)
);

-- Solo trigger interni. Il segnale fa parte della transazione operativa: un rollback lo annulla.
create or replace function public.commessa_campo_segnala_modifica()
returns trigger language plpgsql security definer set search_path='' as $fn$
declare vecchi uuid[]:='{}'; nuovi uuid[]:='{}'; commessa uuid; azienda uuid;
begin
 if tg_table_name='order_work_subphases' then
  if tg_op<>'INSERT' then select array[p.order_id] into vecchi from public.order_work_phases p where p.id=old.phase_id;end if;
  if tg_op<>'DELETE' then select array[p.order_id] into nuovi from public.order_work_phases p where p.id=new.phase_id;end if;
 else
  if tg_op<>'INSERT' then vecchi:=array[old.order_id];end if;
  if tg_op<>'DELETE' then nuovi:=array[new.order_id];end if;
 end if;
 for commessa in select distinct id from unnest(coalesce(vecchi,'{}')||coalesce(nuovi,'{}')) id where id is not null loop
  select o.company_id into azienda from public.orders o where o.id=commessa and o.deleted_at is null;
  if azienda is null then continue;end if;
  insert into public.commessa_campo_sync(order_id,company_id) values(commessa,azienda)
   on conflict(order_id) do update set company_id=excluded.company_id,revisione=commessa_campo_sync.revisione+1,aggiornato_il=clock_timestamp();
 end loop;
 return null;
end $fn$;
revoke all on function public.commessa_campo_segnala_modifica() from public,anon,authenticated;
drop trigger if exists commessa_campo_sync_rapportino on public.campo_rapportini;
create trigger commessa_campo_sync_rapportino after insert or update or delete on public.campo_rapportini for each row execute function public.commessa_campo_segnala_modifica();
drop trigger if exists commessa_campo_sync_fase on public.order_work_phases;
create trigger commessa_campo_sync_fase after insert or update or delete on public.order_work_phases for each row execute function public.commessa_campo_segnala_modifica();
drop trigger if exists commessa_campo_sync_sottofase on public.order_work_subphases;
create trigger commessa_campo_sync_sottofase after insert or update or delete on public.order_work_subphases for each row execute function public.commessa_campo_segnala_modifica();
do $$ begin
 if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='commessa_campo_sync') then
  alter publication supabase_realtime add table public.commessa_campo_sync;
 end if;
end $$;

