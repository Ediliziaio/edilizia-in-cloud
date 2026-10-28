set local lock_timeout='3s';
set local statement_timeout='60s';
create or replace function public.pos_guardia_controlli_editor()
returns trigger language plpgsql security invoker set search_path=public as $$
begin
 if coalesce(old.document_type,'pos')='pos' and old.contenuto->>'versione_controlli'='2'
    and new.contenuto->>'versione_controlli' is distinct from '2' then
  raise exception 'Questo POS usa i controlli aggiornati: ricarica l’app prima di salvarlo';
 end if;
 return new;
end $$;
revoke all on function public.pos_guardia_controlli_editor() from public,anon,authenticated;
drop trigger if exists pos_guardia_controlli_editor on public.pos_documents;
create trigger pos_guardia_controlli_editor before update of contenuto on public.pos_documents for each row execute function public.pos_guardia_controlli_editor();
