-- Only the empty initial audit of a never-signed draft can follow its deliberate deletion.
set local lock_timeout='3s';
set local statement_timeout='60s';
create or replace function public.pos_guardia_eliminazione()
returns trigger language plpgsql security definer set search_path=public as $$
begin
 if coalesce(old.document_type,'pos')<>'pos' then return old;end if;
 if old.status<>'bozza' or old.approvato_il is not null or old.approvato_da is not null
    or coalesce(old.iter,'{}'::jsonb)<>'{}'::jsonb
    or exists(select 1 from public.pos_contenuti_archiviati a where a.pos_id=old.id)
    or exists(select 1 from public.pos_iter_eventi e where e.pos_id=old.id and (e.stato<>'bozza' or e.iter<>'{}'::jsonb)) then
  raise exception 'Il POS ha un iter o uno storico da conservare e non può essere eliminato';
 end if;
 return old;
end $$;
revoke all on function public.pos_guardia_eliminazione() from public,anon,authenticated;
drop trigger if exists pos_guardia_eliminazione on public.pos_documents;
create trigger pos_guardia_eliminazione before delete on public.pos_documents for each row execute function public.pos_guardia_eliminazione();
alter table public.pos_iter_eventi drop constraint if exists pos_iter_eventi_pos_id_company_id_fkey;
alter table public.pos_iter_eventi add constraint pos_iter_eventi_pos_id_company_id_fkey foreign key(pos_id,company_id) references public.pos_documents(id,company_id) on delete cascade;
create or replace function public.pos_archivio_immutabile()
returns trigger language plpgsql security invoker set search_path=public as $$
begin
 if tg_table_name='pos_iter_eventi' and tg_op='DELETE' and pg_trigger_depth()>1 then
  if old.stato='bozza' and old.iter='{}'::jsonb and not exists(select 1 from public.pos_documents p where p.id=old.pos_id) then return old;end if;
 end if;
 raise exception 'Lo storico POS non si modifica o cancella';
end $$;
revoke all on function public.pos_archivio_immutabile() from public,anon,authenticated;
