-- File ricostruito il 27/10/2026 dal registro del database (supabase_migrations.schema_migrations).
-- La migrazione era già applicata in produzione con questa versione, ma il file non era mai stato salvato nel repository:
-- il controllo «Supabase Preview» segnalava «Remote migration versions not found in local migrations directory».
-- Sotto c'è l'SQL esattamente come applicato.

set local lock_timeout='3s';set local statement_timeout='60s';
alter table public.sicurezza_fascicolo add column if not exists fase_id uuid;
alter table public.sicurezza_fascicolo add column if not exists applicabile_dal date;
alter table public.sicurezza_fascicolo add column if not exists applicabile_al date;
do $$ begin
 if not exists(select 1 from pg_constraint where conname='fascicolo_fase_fk') then
  alter table public.sicurezza_fascicolo add constraint fascicolo_fase_fk foreign key(fase_id) references public.order_work_phases(id);
 end if;
 if not exists(select 1 from pg_constraint where conname='fascicolo_applicabilita_periodo') then
  alter table public.sicurezza_fascicolo add constraint fascicolo_applicabilita_periodo check(applicabile_dal is null or applicabile_al is null or applicabile_al>=applicabile_dal);
 end if;
end $$;
create index if not exists fascicolo_fase on public.sicurezza_fascicolo(fase_id) where fase_id is not null;
create or replace function public.sicurezza_fascicolo_applicabilita_guardia()
returns trigger language plpgsql security invoker set search_path=public as $$
begin
 if new.fase_id is not null and not exists(select 1 from public.order_work_phases f where f.id=new.fase_id and f.company_id=new.company_id and f.order_id=new.order_id) then
  raise exception 'La fase non appartiene alla commessa e all’azienda del requisito';
 end if;
 if tg_op='UPDATE' and old.stato='verificato' and (new.fase_id,new.applicabile_dal,new.applicabile_al) is distinct from (old.fase_id,old.applicabile_dal,old.applicabile_al) then
  raise exception 'Riapri in integrazione il documento prima di modificarne fase o periodo di applicabilità';
 end if;
 return new;
end $$;
revoke all on function public.sicurezza_fascicolo_applicabilita_guardia() from public,anon,authenticated;
drop trigger if exists sicurezza_fascicolo_applicabilita_guardia on public.sicurezza_fascicolo;
create trigger sicurezza_fascicolo_applicabilita_guardia before insert or update on public.sicurezza_fascicolo for each row execute function public.sicurezza_fascicolo_applicabilita_guardia();
create or replace function public.sicurezza_fase_con_requisiti_guardia()
returns trigger language plpgsql security definer set search_path=public as $$
begin
 if tg_op='DELETE' then
  if exists(select 1 from public.sicurezza_fascicolo e where e.fase_id=old.id) then raise exception 'La fase ha requisiti di sicurezza collegati: conserva la fase per mantenere lo storico';end if;
  return old;
 end if;
 if (new.company_id,new.order_id) is distinct from (old.company_id,old.order_id) and exists(select 1 from public.sicurezza_fascicolo e where e.fase_id=old.id) then
  raise exception 'La fase ha requisiti di sicurezza collegati e non si sposta a un’altra commessa';
 end if;
 return new;
end $$;
revoke all on function public.sicurezza_fase_con_requisiti_guardia() from public,anon,authenticated;
drop trigger if exists sicurezza_fase_con_requisiti_guardia on public.order_work_phases;
create trigger sicurezza_fase_con_requisiti_guardia before update or delete on public.order_work_phases for each row execute function public.sicurezza_fase_con_requisiti_guardia();
