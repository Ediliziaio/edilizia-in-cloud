-- File ricostruito il 27/10/2026 dal registro del database (supabase_migrations.schema_migrations).
-- La migrazione era già applicata in produzione con questa versione, ma il file non era mai stato salvato nel repository:
-- il controllo «Supabase Preview» segnalava «Remote migration versions not found in local migrations directory».
-- Sotto c'è l'SQL esattamente come applicato.

-- Preserve original structured content before any approved POS is revised.
-- This is a content snapshot, not a claim to preserve signed PDF bytes.
set local lock_timeout='3s';
set local statement_timeout='60s';
create unique index if not exists pos_documents_id_azienda on public.pos_documents(id,company_id);
create table if not exists public.pos_contenuti_archiviati (
 id uuid primary key default gen_random_uuid(),
 company_id uuid not null references public.companies(id),
 pos_id uuid not null,
 revisione integer not null,
 snapshot jsonb not null,
 fonte text not null default 'transizione_app' check(fonte in ('transizione_app','stato_corrente_precedente')),
 acquisito_il timestamptz not null default now(),
 acquisito_da uuid references auth.users(id),
 unique(pos_id,revisione),
 foreign key(pos_id,company_id) references public.pos_documents(id,company_id)
);
create index if not exists pos_archiviati_azienda on public.pos_contenuti_archiviati(company_id,pos_id);
create index if not exists pos_archiviati_autore on public.pos_contenuti_archiviati(acquisito_da) where acquisito_da is not null;
alter table public.pos_contenuti_archiviati enable row level security;
revoke all on public.pos_contenuti_archiviati from anon,authenticated;
grant select on public.pos_contenuti_archiviati to authenticated;
grant all on public.pos_contenuti_archiviati to service_role;
drop policy if exists pos_archiviati_lettura on public.pos_contenuti_archiviati;
create policy pos_archiviati_lettura on public.pos_contenuti_archiviati for select to authenticated using(public.has_permission_for_company((select auth.uid()),'can_view_sicurezza_cantiere',company_id));

create table if not exists public.pos_iter_eventi (
 id uuid primary key default gen_random_uuid(),
 company_id uuid not null references public.companies(id),
 pos_id uuid not null,
 revisione integer not null,
 iter jsonb not null,
 stato text not null,
 registrato_il timestamptz not null default now(),
 autore uuid references auth.users(id),
 foreign key(pos_id,company_id) references public.pos_documents(id,company_id)
);
create index if not exists pos_iter_eventi_documento on public.pos_iter_eventi(company_id,pos_id,revisione,registrato_il);
create index if not exists pos_iter_eventi_autore on public.pos_iter_eventi(autore) where autore is not null;
alter table public.pos_iter_eventi enable row level security;
revoke all on public.pos_iter_eventi from anon,authenticated;
grant select on public.pos_iter_eventi to authenticated;
grant all on public.pos_iter_eventi to service_role;
drop policy if exists pos_iter_eventi_lettura on public.pos_iter_eventi;
create policy pos_iter_eventi_lettura on public.pos_iter_eventi for select to authenticated using(public.has_permission_for_company((select auth.uid()),'can_view_sicurezza_cantiere',company_id));

create or replace function public.pos_archivio_immutabile()
returns trigger language plpgsql security invoker set search_path=public as $$
begin raise exception 'Lo storico POS non si modifica o cancella'; end $$;
revoke all on function public.pos_archivio_immutabile() from public,anon,authenticated;
drop trigger if exists pos_archivio_immutabile on public.pos_contenuti_archiviati;
create trigger pos_archivio_immutabile before update or delete on public.pos_contenuti_archiviati for each row execute function public.pos_archivio_immutabile();
drop trigger if exists pos_iter_immutabile on public.pos_iter_eventi;
create trigger pos_iter_immutabile before update or delete on public.pos_iter_eventi for each row execute function public.pos_archivio_immutabile();

create or replace function public.pos_registra_storico()
returns trigger language plpgsql security definer set search_path=public as $$
begin
 if coalesce(new.document_type,'pos')<>'pos' then return new; end if;
 if tg_op='UPDATE' and old.status='approvato' then
  insert into public.pos_contenuti_archiviati(company_id,pos_id,revisione,snapshot,acquisito_da)
  values(old.company_id,old.id,coalesce(old.revisione,0),to_jsonb(old),auth.uid()) on conflict(pos_id,revisione) do nothing;
 end if;
 if new.status='approvato' then
  insert into public.pos_contenuti_archiviati(company_id,pos_id,revisione,snapshot,acquisito_da)
  values(new.company_id,new.id,coalesce(new.revisione,0),to_jsonb(new),auth.uid()) on conflict(pos_id,revisione) do nothing;
 end if;
 if tg_op='INSERT' or new.iter is distinct from old.iter or new.status is distinct from old.status or new.revisione is distinct from old.revisione then
  insert into public.pos_iter_eventi(company_id,pos_id,revisione,iter,stato,autore)
  values(new.company_id,new.id,coalesce(new.revisione,0),coalesce(new.iter,'{}'::jsonb),new.status,auth.uid());
 end if;
 return new;
end $$;
revoke all on function public.pos_registra_storico() from public,anon,authenticated;
drop trigger if exists trg_pos_registra_storico on public.pos_documents;
create trigger trg_pos_registra_storico after insert or update on public.pos_documents for each row execute function public.pos_registra_storico();

-- New safety guard supplements the existing approval-only-from-server guard.
create or replace function public.pos_guardia_revisioni()
returns trigger language plpgsql security invoker set search_path=public as $$
begin
 if tg_op='DELETE' then
  if coalesce(old.document_type,'pos')='pos' and old.status='approvato' then raise exception 'Un POS approvato si conserva nello storico'; end if;
  return old;
 end if;
 if coalesce(old.document_type,'pos')<>'pos' then return new; end if;
 if (new.company_id,new.order_id,new.document_type) is distinct from (old.company_id,old.order_id,old.document_type) then
  raise exception 'Non si cambia azienda o cantiere di un POS esistente';
 end if;
 if old.status='approvato' and new.status='approvato' and
   (new.contenuto,new.revisione,new.approvato_da,new.approvato_da_nome,new.approvato_il) is distinct from
   (old.contenuto,old.revisione,old.approvato_da,old.approvato_da_nome,old.approvato_il) then
  raise exception 'Contenuto e approvazione si conservano: apri una nuova revisione';
 end if;
 if old.status='approvato' and new.status<>'approvato' then
  if new.contenuto->'versione_controlli' is distinct from '2'::jsonb then raise exception 'La nuova revisione deve usare i controlli aggiornati'; end if;
  if new.status<>'bozza' or new.revisione is distinct from coalesce(old.revisione,0)+1 or coalesce(new.iter,'{}'::jsonb)<>'{}'::jsonb or new.approvato_il is not null or new.approvato_da is not null then
   raise exception 'Apri una nuova revisione in bozza senza ereditare firme o approvazioni';
  end if;
 elsif new.revisione is distinct from old.revisione then
  raise exception 'Il numero revisione cambia solo aprendo una nuova bozza da un POS approvato';
 end if;
 return new;
end $$;
revoke all on function public.pos_guardia_revisioni() from public,anon,authenticated;
drop trigger if exists trg_pos_guardia_revisioni on public.pos_documents;
create trigger trg_pos_guardia_revisioni before update or delete on public.pos_documents for each row execute function public.pos_guardia_revisioni();

-- Lock and expected timestamp prevent two revision requests from replacing history.
create or replace function public.pos_apri_revisione(_pos_id uuid,_descrizione text,_attesa_updated_at timestamptz)
returns uuid language plpgsql security invoker set search_path=public as $$
declare p public.pos_documents%rowtype; v_contenuto jsonb; v_rev integer; v_formazione jsonb;
begin
 if auth.uid() is null then raise exception 'Autenticazione richiesta' using errcode='42501'; end if;
 if length(trim(coalesce(_descrizione,'')))=0 then raise exception 'Descrivi la modifica della revisione'; end if;
 select * into p from public.pos_documents where id=_pos_id for update;
 if not found then raise exception 'POS non disponibile o permesso insufficiente' using errcode='42501'; end if;
 if not public.has_permission_for_company(auth.uid(),'can_view_sicurezza_cantiere',p.company_id) or public.utente_sola_lettura(p.company_id) then raise exception 'Non puoi aprire una revisione' using errcode='42501'; end if;
 if coalesce(p.document_type,'pos')<>'pos' or p.status<>'approvato' then raise exception 'Si revisiona un POS approvato'; end if;
 if p.updated_at is distinct from _attesa_updated_at then raise exception 'Il POS è cambiato: ricarica prima di revisionare'; end if;
 v_rev:=coalesce(p.revisione,0)+1;
 v_contenuto:=coalesce(p.contenuto,'{}'::jsonb);
 v_contenuto:=jsonb_set(v_contenuto,'{versione_controlli}','2'::jsonb,true);
 select coalesce(jsonb_agg(jsonb_set(f,'{verificata}','false'::jsonb,true)),'[]'::jsonb) into v_formazione
 from jsonb_array_elements(case when jsonb_typeof(v_contenuto->'formazione')='array' then v_contenuto->'formazione' else '[]'::jsonb end) f;
 v_contenuto:=jsonb_set(v_contenuto,'{formazione}',v_formazione,true);
 update public.pos_documents set status='bozza',revisione=v_rev,contenuto=v_contenuto,
  revisioni=coalesce(p.revisioni,'[]'::jsonb)||jsonb_build_array(jsonb_build_object('rev',v_rev,'data',to_char(now() at time zone 'Europe/Rome','YYYY-MM-DD'),'descrizione',trim(_descrizione))),
  approvato_da=null,approvato_da_nome=null,approvato_il=null,iter='{}'::jsonb,updated_at=clock_timestamp()
 where id=p.id;
 if not found then raise exception 'Revisione non salvata' using errcode='42501'; end if;
 return p.id;
end $$;
revoke all on function public.pos_apri_revisione(uuid,text,timestamptz) from public,anon;
grant execute on function public.pos_apri_revisione(uuid,text,timestamptz) to authenticated;

-- Capture only the current stored state of earlier approved POS, explicitly labelled.
insert into public.pos_contenuti_archiviati(company_id,pos_id,revisione,snapshot,fonte)
select p.company_id,p.id,coalesce(p.revisione,0),to_jsonb(p),'stato_corrente_precedente'
from public.pos_documents p where coalesce(p.document_type,'pos')='pos' and p.status='approvato'
on conflict(pos_id,revisione) do nothing;
notify pgrst,'reload schema';
