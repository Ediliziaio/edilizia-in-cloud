-- La provenienza della nuova voce non deve rendere ambiguo il collegamento
-- storico ddt_righe -> order_items usato anche dalle versioni già pubblicate.
alter table public.order_items drop constraint if exists order_items_ddt_riga_origine_id_fkey;
create index if not exists order_items_ddt_riga_origine on public.order_items(ddt_riga_origine_id) where ddt_riga_origine_id is not null;
create index if not exists ddt_document_jobs_ddt on public.ddt_document_jobs(ddt_id) where ddt_id is not null;
create index if not exists ddt_document_jobs_employee on public.ddt_document_jobs(employee_id) where employee_id is not null;
create or replace function public.ddt_origine_articolo_valida() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if new.ddt_riga_origine_id is not null and not exists(
  select 1 from ddt_righe r join ddt_ricezione d on d.id=r.ddt_ricezione_id join orders o on o.id=new.order_id where r.id=new.ddt_riga_origine_id and d.company_id=o.company_id
 ) then raise exception 'La bolla di origine non appartiene all’azienda della commessa' using errcode='42501'; end if;
 if tg_op='UPDATE' and old.ddt_riga_origine_id is not null and new.ddt_riga_origine_id is distinct from old.ddt_riga_origine_id then raise exception 'La provenienza di un materiale consegnato non si modifica'; end if;
 return new;
end $$;
revoke all on function public.ddt_origine_articolo_valida() from public,anon,authenticated;
create trigger ddt_origine_articolo_valida before insert or update of ddt_riga_origine_id,order_id on public.order_items for each row execute function public.ddt_origine_articolo_valida();
