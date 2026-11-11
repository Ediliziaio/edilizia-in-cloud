-- Archivio aziendale delle tabelle di noleggio e parametri FV. Nessun dato cliente aggiunto.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '60s';
create table if not exists public.eic_tabelle_noleggio (
 id uuid primary key,
 company_id uuid not null references public.companies(id),
 contenuto jsonb not null,
 attiva boolean not null default true,
 originali_paths text[] not null default '{}',
 created_at timestamptz not null default now(),
 constraint noleggio_coerenza check (coalesce((
  jsonb_typeof(contenuto)='object' and contenuto->>'versione'='1'
  and contenuto->>'id'=id::text and contenuto->>'companyId'=company_id::text
  and jsonb_typeof(contenuto->'righe')='array'
  and jsonb_array_length(contenuto->'righe') between 1 and 1000
  and cardinality(originali_paths)<=2
 ),false))
);
drop policy if exists noleggio_utente_bloccato on public.eic_tabelle_noleggio;
create policy noleggio_utente_bloccato on public.eic_tabelle_noleggio as restrictive for all to authenticated
 using(not (select public.utente_bloccato())) with check(not (select public.utente_bloccato()));
create index if not exists eic_tabelle_noleggio_azienda on public.eic_tabelle_noleggio(company_id,created_at desc);
alter table public.eic_tabelle_noleggio enable row level security;
revoke all on public.eic_tabelle_noleggio from public,anon,authenticated;
grant select,insert on public.eic_tabelle_noleggio to authenticated;
grant update(attiva) on public.eic_tabelle_noleggio to authenticated;
grant all on public.eic_tabelle_noleggio to service_role;
drop policy if exists noleggio_lettura on public.eic_tabelle_noleggio;
create policy noleggio_lettura on public.eic_tabelle_noleggio for select to authenticated
 using(company_id=(select public.get_effective_company_id()) and not (select public.utente_e_cliente_esterno()));
drop policy if exists noleggio_inserimento on public.eic_tabelle_noleggio;
create policy noleggio_inserimento on public.eic_tabelle_noleggio for insert to authenticated with check(
 company_id=(select public.get_effective_company_id()) and not (select public.utente_e_cliente_esterno())
 and (company_id in(select unnest(public.aziende_con_uno_dei_permessi(array['can_edit_settings_finanziamenti','can_edit_settings_pricing'])))
 or (select public.has_role((select auth.uid()),'super_admin'::public.app_role))));
drop policy if exists noleggio_stato on public.eic_tabelle_noleggio;
create policy noleggio_stato on public.eic_tabelle_noleggio for update to authenticated
 using(company_id=(select public.get_effective_company_id()) and not (select public.utente_e_cliente_esterno())
 and (company_id in(select unnest(public.aziende_con_uno_dei_permessi(array['can_edit_settings_finanziamenti','can_edit_settings_pricing'])))
 or (select public.has_role((select auth.uid()),'super_admin'::public.app_role))))
 with check(company_id=(select public.get_effective_company_id()) and not (select public.utente_e_cliente_esterno())
 and (company_id in(select unnest(public.aziende_con_uno_dei_permessi(array['can_edit_settings_finanziamenti','can_edit_settings_pricing'])))
 or (select public.has_role((select auth.uid()),'super_admin'::public.app_role))));
-- Le condizioni restano immutabili anche con service role: una modifica crea un nuovo UUID.
create or replace function public.proteggi_versione_noleggio() returns trigger language plpgsql set search_path='' as $$
begin
 if new.id is distinct from old.id or new.company_id is distinct from old.company_id
 or new.contenuto is distinct from old.contenuto or new.originali_paths is distinct from old.originali_paths
 or new.created_at is distinct from old.created_at then raise exception 'Creare una nuova versione delle condizioni'; end if;
 return new;
end $$;
revoke all on function public.proteggi_versione_noleggio() from public,anon,authenticated;
drop trigger if exists versione_noleggio_immutabile on public.eic_tabelle_noleggio;
create trigger versione_noleggio_immutabile before update on public.eic_tabelle_noleggio for each row execute function public.proteggi_versione_noleggio();
-- Restrizioni solo sul percorso /noleggio/: non ampliano i permessi Storage preesistenti.
drop policy if exists noleggio_originali_immutabili on storage.objects;
create policy noleggio_originali_immutabili on storage.objects as restrictive for update to authenticated
 using(not (bucket_id='finanziamenti-tabelle' and (storage.foldername(name))[2]='noleggio'))
 with check(not (bucket_id='finanziamenti-tabelle' and (storage.foldername(name))[2]='noleggio'));
drop policy if exists noleggio_originali_lettura on storage.objects;
create policy noleggio_originali_lettura on storage.objects as restrictive for select to authenticated
 using(not (bucket_id='finanziamenti-tabelle' and (storage.foldername(name))[2]='noleggio')
 or ((storage.foldername(name))[1]=(select public.get_effective_company_id())::text and not (select public.utente_e_cliente_esterno())));
drop policy if exists noleggio_originali_inserimento on storage.objects;
create policy noleggio_originali_inserimento on storage.objects as restrictive for insert to authenticated
 with check(not (bucket_id='finanziamenti-tabelle' and (storage.foldername(name))[2]='noleggio')
 or ((storage.foldername(name))[1]=(select public.get_effective_company_id())::text
 and not (select public.utente_e_cliente_esterno())
 and ((select public.get_effective_company_id()) in(select unnest(public.aziende_con_uno_dei_permessi(array['can_edit_settings_finanziamenti','can_edit_settings_pricing'])))
 or (select public.has_role((select auth.uid()),'super_admin'::public.app_role)))));
drop policy if exists noleggio_originali_eliminazione on storage.objects;
create policy noleggio_originali_eliminazione on storage.objects as restrictive for delete to authenticated
 using(not (bucket_id='finanziamenti-tabelle' and (storage.foldername(name))[2]='noleggio')
 or ((storage.foldername(name))[1]=(select public.get_effective_company_id())::text
 and not (select public.utente_e_cliente_esterno())
 and ((select public.get_effective_company_id()) in(select unnest(public.aziende_con_uno_dei_permessi(array['can_edit_settings_finanziamenti','can_edit_settings_pricing'])))
 or (select public.has_role((select auth.uid()),'super_admin'::public.app_role)))
 and not exists(select 1 from public.eic_tabelle_noleggio t where t.company_id=(select public.get_effective_company_id()) and storage.objects.name=any(t.originali_paths))));
alter table public.fv_progetti add column if not exists economia_azienda jsonb;
comment on column public.fv_progetti.economia_azienda is 'Parametri e snapshot del prospetto aziendale. Risultati ricalcolati dal server, non attestazione crittografica.';
-- Estende soltanto i due nuovi modelli aziendali; mantiene i controlli di appartenenza e dimensione.
alter table public.fv_progetti drop constraint if exists fv_progetti_modello_valido;
alter table public.fv_progetti add constraint fv_progetti_modello_valido check (
  modello_snapshot is null or coalesce((
    jsonb_typeof(modello_snapshot) = 'object'
    and modello_snapshot ->> 'version' = '1'
    and modello_snapshot ->> 'modelId' in ('nuovo', 'accumulo', 'ampliamento', 'componenti', 'manutenzione', 'aziendale', 'aziendale-noleggio')
    and modello_snapshot ->> 'companyId' = company_id::text
    and jsonb_typeof(modello_snapshot -> 'template') = 'object'
    and modello_snapshot #>> '{template,company_id}' = company_id::text
    and modello_snapshot #>> '{template,pdf_blocchi,modulo_intervento}' = modello_snapshot ->> 'modelId'
    and octet_length(modello_snapshot::text) <= 8388608
  ), false)
);

commit;
