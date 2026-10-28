-- Administrative monthly evidence stays outside the safety dossier and POS.
set local lock_timeout='3s';
set local statement_timeout='60s';
alter table public.staff_permissions add column if not exists can_view_subappaltatori_amministrazione boolean not null default false;
create unique index if not exists contratti_subappalto_id_azienda_impresa on public.contratti_subappalto(id,company_id,subappaltatore_id);
create table if not exists public.subappaltatori_documenti_mensili (
 id uuid primary key default gen_random_uuid(),
 company_id uuid not null references public.companies(id),
 subappaltatore_id uuid not null,
 contratto_id uuid not null,
 competenza text not null check(competenza ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
 tipo text not null check(tipo in ('lul','bonifico_lul','quietanza_f24','denuncia_cassa_edile','bonifico_cassa_edile','uniemens')),
 stato text not null default 'da_richiedere' check(stato in ('da_richiedere','richiesto','ricevuto','integrazione','verificato','non_applicabile','superato')),
 origine_requisito text not null default 'da_verificare' check(origine_requisito in ('da_verificare','contratto','interna','normativa')),
 riferimento_requisito text,
 termine date,
 referente text,
 file_path text unique,
 file_name text,
 note text,
 verificato_da uuid references auth.users(id),
 verificato_il timestamptz,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 check(file_path is null or file_path like company_id::text||'/'||id::text||'/%'),
 check(stato not in ('ricevuto','verificato') or file_path is not null),
 check(stato<>'non_applicabile' or length(trim(coalesce(note,'')))>0),
 foreign key(subappaltatore_id,company_id) references public.subappaltatori_sicurezza(id,company_id),
 foreign key(contratto_id,company_id,subappaltatore_id) references public.contratti_subappalto(id,company_id,subappaltatore_id)
);
create unique index if not exists sub_mensili_correnti on public.subappaltatori_documenti_mensili(company_id,contratto_id,competenza,tipo) where stato<>'superato';
create index if not exists sub_mensili_impresa on public.subappaltatori_documenti_mensili(company_id,subappaltatore_id,competenza);
create index if not exists sub_mensili_contratto on public.subappaltatori_documenti_mensili(contratto_id,company_id,subappaltatore_id);
create index if not exists sub_mensili_verificatore on public.subappaltatori_documenti_mensili(verificato_da) where verificato_da is not null;
alter table public.subappaltatori_documenti_mensili enable row level security;
revoke all on public.subappaltatori_documenti_mensili from anon,authenticated;
grant select,insert,update on public.subappaltatori_documenti_mensili to authenticated;
grant all on public.subappaltatori_documenti_mensili to service_role;
drop policy if exists mensili_lettura on public.subappaltatori_documenti_mensili;
create policy mensili_lettura on public.subappaltatori_documenti_mensili for select to authenticated using(public.has_permission_for_company((select auth.uid()),'can_view_subappaltatori_amministrazione',company_id));
drop policy if exists mensili_creazione on public.subappaltatori_documenti_mensili;
create policy mensili_creazione on public.subappaltatori_documenti_mensili for insert to authenticated with check(public.has_permission_for_company((select auth.uid()),'can_view_subappaltatori_amministrazione',company_id) and not public.utente_sola_lettura(company_id));
drop policy if exists mensili_modifica on public.subappaltatori_documenti_mensili;
create policy mensili_modifica on public.subappaltatori_documenti_mensili for update to authenticated using(public.has_permission_for_company((select auth.uid()),'can_view_subappaltatori_amministrazione',company_id) and not public.utente_sola_lettura(company_id)) with check(public.has_permission_for_company((select auth.uid()),'can_view_subappaltatori_amministrazione',company_id) and not public.utente_sola_lettura(company_id));

create or replace function public.sub_mensili_guardia()
returns trigger language plpgsql security definer set search_path=public as $$
begin
 if tg_op='UPDATE' then
  if (new.company_id,new.subappaltatore_id,new.contratto_id,new.competenza,new.tipo) is distinct from (old.company_id,old.subappaltatore_id,old.contratto_id,old.competenza,old.tipo) then raise exception 'Impresa, contratto, mese e tipo sono stabili: crea una nuova richiesta'; end if;
  if old.file_path is not null and new.file_path is distinct from old.file_path then raise exception 'Il file non si sostituisce: conserva lo storico e crea una nuova evidenza'; end if;
 end if;
 if new.file_path is not null and not exists(select 1 from storage.objects o where o.bucket_id='subappaltatori-amministrazione' and o.name=new.file_path) then raise exception 'Completa il caricamento del file amministrativo'; end if;
 if new.stato='verificato' then
  if auth.uid() is null then raise exception 'La verifica richiede un utente autenticato'; end if;
  if tg_op='INSERT' or old.stato is distinct from 'verificato' then new.verificato_da:=auth.uid();new.verificato_il:=now();
  else new.verificato_da:=old.verificato_da;new.verificato_il:=old.verificato_il;end if;
 else new.verificato_da:=null;new.verificato_il:=null;end if;
 new.updated_at:=clock_timestamp();
 return new;
end $$;
revoke all on function public.sub_mensili_guardia() from public,anon,authenticated;
drop trigger if exists sub_mensili_guardia on public.subappaltatori_documenti_mensili;
create trigger sub_mensili_guardia before insert or update on public.subappaltatori_documenti_mensili for each row execute function public.sub_mensili_guardia();

create table if not exists public.subappaltatori_mensili_eventi (
 id uuid primary key default gen_random_uuid(),company_id uuid not null references public.companies(id),documento_id uuid not null references public.subappaltatori_documenti_mensili(id),autore uuid references auth.users(id),registrato_il timestamptz not null default now(),prima jsonb,dopo jsonb not null
);
create index if not exists sub_mensili_eventi_documento on public.subappaltatori_mensili_eventi(company_id,documento_id,registrato_il);
create index if not exists sub_mensili_eventi_id on public.subappaltatori_mensili_eventi(documento_id);
create index if not exists sub_mensili_eventi_autore on public.subappaltatori_mensili_eventi(autore) where autore is not null;
alter table public.subappaltatori_mensili_eventi enable row level security;
revoke all on public.subappaltatori_mensili_eventi from anon,authenticated;
grant select on public.subappaltatori_mensili_eventi to authenticated;
grant all on public.subappaltatori_mensili_eventi to service_role;
drop policy if exists mensili_eventi_lettura on public.subappaltatori_mensili_eventi;
create policy mensili_eventi_lettura on public.subappaltatori_mensili_eventi for select to authenticated using(public.has_permission_for_company((select auth.uid()),'can_view_subappaltatori_amministrazione',company_id));
create or replace function public.sub_mensili_evento()
returns trigger language plpgsql security definer set search_path=public as $$
begin
 insert into public.subappaltatori_mensili_eventi(company_id,documento_id,autore,prima,dopo)
 values(new.company_id,new.id,auth.uid(),case when tg_op='UPDATE' then to_jsonb(old) else null end,to_jsonb(new));
 return new;
end $$;
revoke all on function public.sub_mensili_evento() from public,anon,authenticated;
drop trigger if exists sub_mensili_evento on public.subappaltatori_documenti_mensili;
create trigger sub_mensili_evento after insert or update on public.subappaltatori_documenti_mensili for each row execute function public.sub_mensili_evento();

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('subappaltatori-amministrazione','subappaltatori-amministrazione',false,20971520,array['application/pdf','image/jpeg','image/png','image/webp'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
drop policy if exists mensili_file_lettura on storage.objects;
create policy mensili_file_lettura on storage.objects for select to authenticated using(bucket_id='subappaltatori-amministrazione' and exists(select 1 from public.subappaltatori_documenti_mensili d where d.file_path=name and public.has_permission_for_company((select auth.uid()),'can_view_subappaltatori_amministrazione',d.company_id)));
drop policy if exists mensili_file_creazione on storage.objects;
create policy mensili_file_creazione on storage.objects for insert to authenticated with check(bucket_id='subappaltatori-amministrazione' and exists(select 1 from public.subappaltatori_documenti_mensili d where d.id::text=(storage.foldername(name))[2] and d.company_id::text=(storage.foldername(name))[1] and d.file_path is null and public.has_permission_for_company((select auth.uid()),'can_view_subappaltatori_amministrazione',d.company_id) and not public.utente_sola_lettura(d.company_id)));
notify pgrst,'reload schema';

-- Restrictive fences: unrelated permissive storage policies cannot widen these buckets.
drop policy if exists mensili_storage_limite_lettura on storage.objects;
create policy mensili_storage_limite_lettura on storage.objects as restrictive for select to authenticated using(bucket_id<>'subappaltatori-amministrazione' or exists(select 1 from public.subappaltatori_documenti_mensili d where d.file_path=name and public.has_permission_for_company((select auth.uid()),'can_view_subappaltatori_amministrazione',d.company_id)));
drop policy if exists mensili_storage_limite_creazione on storage.objects;
create policy mensili_storage_limite_creazione on storage.objects as restrictive for insert to authenticated with check(bucket_id<>'subappaltatori-amministrazione' or exists(select 1 from public.subappaltatori_documenti_mensili d where d.id::text=(storage.foldername(name))[2] and d.company_id::text=(storage.foldername(name))[1] and d.file_path is null and public.has_permission_for_company((select auth.uid()),'can_view_subappaltatori_amministrazione',d.company_id) and not public.utente_sola_lettura(d.company_id)));
drop policy if exists mensili_storage_no_sostituzione on storage.objects;
create policy mensili_storage_no_sostituzione on storage.objects as restrictive for update to authenticated using(bucket_id<>'subappaltatori-amministrazione') with check(bucket_id<>'subappaltatori-amministrazione');
drop policy if exists mensili_storage_no_cancellazione on storage.objects;
create policy mensili_storage_no_cancellazione on storage.objects as restrictive for delete to authenticated using(bucket_id<>'subappaltatori-amministrazione');

drop policy if exists fascicolo_storage_limite_lettura on storage.objects;
create policy fascicolo_storage_limite_lettura on storage.objects as restrictive for select to authenticated using(bucket_id<>'fascicoli-cantiere' or exists(select 1 from public.sicurezza_fascicolo d where d.file_path=name and public.has_permission_for_company((select auth.uid()),'can_view_sicurezza_cantiere',d.company_id)));
drop policy if exists fascicolo_storage_limite_creazione on storage.objects;
create policy fascicolo_storage_limite_creazione on storage.objects as restrictive for insert to authenticated with check(bucket_id<>'fascicoli-cantiere' or exists(select 1 from public.sicurezza_fascicolo d where d.id::text=(storage.foldername(name))[2] and d.company_id::text=(storage.foldername(name))[1] and d.file_path is null and public.has_permission_for_company((select auth.uid()),'can_view_sicurezza_cantiere',d.company_id) and not public.utente_sola_lettura(d.company_id)));
drop policy if exists fascicolo_storage_no_sostituzione on storage.objects;
create policy fascicolo_storage_no_sostituzione on storage.objects as restrictive for update to authenticated using(bucket_id<>'fascicoli-cantiere') with check(bucket_id<>'fascicoli-cantiere');
drop policy if exists fascicolo_storage_no_cancellazione on storage.objects;
create policy fascicolo_storage_no_cancellazione on storage.objects as restrictive for delete to authenticated using(bucket_id<>'fascicoli-cantiere');
