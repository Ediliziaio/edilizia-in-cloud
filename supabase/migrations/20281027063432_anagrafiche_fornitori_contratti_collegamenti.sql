-- File ricostruito il 27/10/2026 dal registro del database (supabase_migrations.schema_migrations).
-- La migrazione era già applicata in produzione con questa versione, ma il file non era mai stato salvato nel repository:
-- il controllo «Supabase Preview» segnalava «Remote migration versions not found in local migrations directory».
-- Sotto c'è l'SQL esattamente come applicato.

-- Solo strutture additive. Nessuna fusione/backfill di anagrafiche o invio.
set local lock_timeout = '3s';
set local statement_timeout = '60s';

alter table public.anagrafiche_native add column if not exists fornitore_id uuid references public.suppliers(id) on delete set null;
alter table public.anagrafica_reconciliation_log add column if not exists fornitore_id uuid references public.suppliers(id) on delete set null;
create index if not exists anagrafiche_native_fornitore_idx on public.anagrafiche_native(company_id,fornitore_id) where fornitore_id is not null;

create or replace function public.partner_tax_key(v text) returns text
language sql immutable set search_path = '' as $$
  select case when x ~ '^IT[0-9]{11}$' then substr(x,3) else x end
  from (select regexp_replace(upper(coalesce(v,'')), '[^A-Z0-9]', '', 'g') x) s;
$$;

-- Un link non deve mai puntare ad altra azienda o confondere cliente e fornitore.
create or replace function public.check_fiscal_partner_link() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if new.cliente_id is not null and (tg_op='INSERT' or new.cliente_id is distinct from old.cliente_id or new.company_id is distinct from old.company_id or new.tipo is distinct from old.tipo) then
    if new.tipo not in ('cliente','entrambi') or not exists(select 1 from public.profiles p where p.id=new.cliente_id and p.company_id=new.company_id and public.profilo_solo_cliente(p.id)) then
      raise exception 'Cliente operativo non valido per questa anagrafica e azienda';
    end if;
  end if;
  if new.fornitore_id is not null then
    if new.tipo not in ('fornitore','entrambi') or not exists(select 1 from public.suppliers s where s.id=new.fornitore_id and s.company_id=new.company_id) then
      raise exception 'Fornitore non valido per questa anagrafica e azienda';
    end if;
  end if;
  if (tg_op='INSERT' and (new.fornitore_id is not null or new.cliente_id is not null)) or (tg_op='UPDATE' and (new.fornitore_id is distinct from old.fornitore_id or new.cliente_id is distinct from old.cliente_id or new.sync_from_cliente is distinct from old.sync_from_cliente)) then
    if coalesce(auth.jwt()->>'role','')<>'service_role' and (auth.uid() is null or public.utente_bloccato() or public.utente_sola_lettura(new.company_id) or not public.has_permission_for_company(auth.uid(),'can_view_billing',new.company_id)) then
      raise exception 'Non autorizzato alla riconciliazione';
    end if;
  end if;
  return new;
end; $$;
create trigger check_fiscal_partner_link before insert or update of cliente_id,fornitore_id,tipo,company_id,sync_from_cliente on public.anagrafiche_native for each row execute function public.check_fiscal_partner_link();

-- Un'unica transazione per collegamento, eventuale copia dei soli recapiti e storico.
-- Nessun cambio del nome fiscale, CF, P.IVA o delle fatture già emesse.
create or replace function public.collega_anagrafica_operativa(p_company_id uuid,p_anagrafica_id uuid,p_tipo text,p_target_id uuid,p_sync boolean default false)
returns void language plpgsql security invoker set search_path = '' as $$
declare a public.anagrafiche_native%rowtype; t record; old_id uuid;
begin
  if auth.uid() is null or public.utente_bloccato() or public.utente_sola_lettura(p_company_id) or not public.has_permission_for_company(auth.uid(),'can_view_billing',p_company_id) then raise exception 'Non autorizzato'; end if;
  select * into a from public.anagrafiche_native where id=p_anagrafica_id and company_id=p_company_id for update;
  if not found then raise exception 'Anagrafica non accessibile'; end if;
  if p_tipo not in ('cliente','fornitore') or (a.tipo<>p_tipo and a.tipo<>'entrambi') then raise exception 'Tipo di anagrafica non compatibile'; end if;
  old_id := case when p_tipo='cliente' then a.cliente_id else a.fornitore_id end;
  if old_id is not null and p_target_id is not null and old_id<>p_target_id then raise exception 'Scollega prima il riferimento esistente'; end if;
  if p_tipo='cliente' then
    if p_target_id is not null then
      select fiscal_code cf,vat_number vat,email,phone from public.profiles where id=p_target_id and company_id=p_company_id and public.profilo_solo_cliente(id) into t;
      if not found then raise exception 'Cliente non accessibile o non cliente dei cantieri'; end if;
    end if;
  else
    if p_target_id is not null then
      select fiscal_code cf,vat_number vat,email,phone from public.suppliers where id=p_target_id and company_id=p_company_id and is_active into t;
      if not found then raise exception 'Fornitore non accessibile o non attivo'; end if;
    end if;
  end if;
  if p_target_id is not null then
    if (public.partner_tax_key(a.codice_fiscale)<>'' and public.partner_tax_key(t.cf)<>'' and public.partner_tax_key(a.codice_fiscale)<>public.partner_tax_key(t.cf))
      or (public.partner_tax_key(a.partita_iva)<>'' and public.partner_tax_key(t.vat)<>'' and public.partner_tax_key(a.partita_iva)<>public.partner_tax_key(t.vat)) then
      raise exception 'Identificativi fiscali discordanti: correggi i dati prima di collegare';
    end if;
  end if;
  if p_tipo='cliente' then
    update public.anagrafiche_native set cliente_id=p_target_id,sync_from_cliente=false,last_synced_at=case when p_sync and p_target_id is not null then now() else null end where id=a.id and company_id=p_company_id;
  else
    update public.anagrafiche_native set fornitore_id=p_target_id where id=a.id and company_id=p_company_id;
  end if;
  if p_sync and p_target_id is not null then
    update public.anagrafiche_native set email=coalesce(nullif(email,''),nullif(t.email,'')),telefono=coalesce(nullif(telefono,''),nullif(t.phone,'')) where id=a.id and company_id=p_company_id;
  end if;
  insert into public.anagrafica_reconciliation_log(company_id,anagrafica_id,cliente_id,fornitore_id,action,performed_by,notes)
    values(p_company_id,a.id,case when p_tipo='cliente' then coalesce(p_target_id,old_id) end,case when p_tipo='fornitore' then coalesce(p_target_id,old_id) end,case when p_target_id is null then 'unlinked' else 'linked' end,auth.uid(),case when p_sync then 'Collegamento e completamento dei soli recapiti mancanti; nessuna sincronizzazione automatica' else 'Solo collegamento operativo' end);
end; $$;
revoke all on function public.collega_anagrafica_operativa(uuid,uuid,text,uuid,boolean) from public,anon;
grant execute on function public.collega_anagrafica_operativa(uuid,uuid,text,uuid,boolean) to authenticated;

create or replace function public.fiscal_customer_candidates(p_company_id uuid)
returns table(id uuid,company_id uuid,first_name text,last_name text,email text,phone text,fiscal_code text,vat_number text)
language sql stable security invoker set search_path = '' as $$
  select p.id,p.company_id,p.first_name,p.last_name,p.email,p.phone,p.fiscal_code,p.vat_number
  from public.profiles p where p.company_id=p_company_id and public.profilo_solo_cliente(p.id)
  and auth.uid() is not null and not public.utente_bloccato() and public.has_permission_for_company(auth.uid(),'can_view_billing',p_company_id);
$$;
revoke all on function public.fiscal_customer_candidates(uuid) from public,anon;
grant execute on function public.fiscal_customer_candidates(uuid) to authenticated;

create table public.supplier_relations (
  id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id),
  supplier_id uuid not null references public.suppliers(id),
  roles text[] not null default '{}', subappaltatore_id uuid references public.subappaltatori_sicurezza(id),
  updated_at timestamptz not null default now(), unique(company_id,supplier_id),
  check (roles <@ array['materiali','servizi','consulente','professionista','subappaltatore','altro']::text[]),
  check (subappaltatore_id is null or 'subappaltatore'=any(roles))
);
create unique index supplier_relations_sub_unique on public.supplier_relations(company_id,subappaltatore_id) where subappaltatore_id is not null;
create table public.supplier_contracts (
  id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id),
  supplier_id uuid not null references public.suppliers(id), title text not null check(length(btrim(title)) between 1 and 200),
  kind text not null check(kind in ('fornitura','consulenza','servizi','accordo_quadro','altro')),
  status text not null default 'bozza' check(status in ('bozza','attivo','concluso','risolto')),
  signed_on date,starts_on date,ends_on date,notice_days integer check(notice_days between 0 and 3650),
  automatic_renewal boolean not null default false,conditions text check(length(conditions)<=20000),
  amount numeric(15,2) check(amount>=0),currency text not null default 'EUR' check(currency='EUR'),
  created_by uuid not null default auth.uid(),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
  check(starts_on is null or ends_on is null or ends_on>=starts_on)
);
create index supplier_contracts_parent on public.supplier_contracts(company_id,supplier_id,ends_on);
create table public.supplier_contract_documents (
  id uuid primary key default gen_random_uuid(),company_id uuid not null references public.companies(id),
  supplier_id uuid not null references public.suppliers(id),contract_id uuid not null references public.supplier_contracts(id),
  file_name text not null check(length(file_name) between 1 and 255),storage_path text not null unique,
  mime_type text not null check(mime_type in ('application/pdf','image/jpeg','image/png')),
  size_bytes bigint not null check(size_bytes between 1 and 20971520),sha256 text not null check(sha256 ~ '^[a-f0-9]{64}$'),
  created_by uuid not null default auth.uid(),created_at timestamptz not null default now(),unique(contract_id,sha256)
);
create index supplier_contract_documents_parent on public.supplier_contract_documents(company_id,supplier_id,contract_id);
create index supplier_contracts_supplier_fk on public.supplier_contracts(supplier_id);
create index supplier_relations_supplier_fk on public.supplier_relations(supplier_id);
create index supplier_contract_documents_supplier_fk on public.supplier_contract_documents(supplier_id);
create index supplier_contract_documents_contract_fk on public.supplier_contract_documents(contract_id);
create index supplier_relations_sub_fk on public.supplier_relations(subappaltatore_id);
create index if not exists fiscal_reconciliation_supplier_fk on public.anagrafica_reconciliation_log(fornitore_id);

create or replace function public.check_supplier_workspace_parent() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if auth.uid() is null or public.utente_bloccato() or public.utente_sola_lettura(new.company_id) or not public.has_permission_for_company(auth.uid(),'can_edit_settings_suppliers',new.company_id) then raise exception 'Non autorizzato a modificare il fascicolo fornitore'; end if;
  if tg_op='UPDATE' and (new.company_id<>old.company_id or new.supplier_id<>old.supplier_id or new.id<>old.id) then raise exception 'Non puoi spostare il fascicolo'; end if;
  if not exists(select 1 from public.suppliers s where s.id=new.supplier_id and s.company_id=new.company_id) then raise exception 'Fornitore non accessibile'; end if;
  if tg_table_name='supplier_relations' then
    if new.subappaltatore_id is not null and not exists(select 1 from public.subappaltatori_sicurezza s where s.id=new.subappaltatore_id and s.company_id=new.company_id) then raise exception 'Subappaltatore non accessibile'; end if;
    if new.subappaltatore_id is not null and not public.has_permission_for_company(auth.uid(),'can_view_subappaltatori',new.company_id) then raise exception 'Serve il permesso Subappaltatori'; end if;
    new.updated_at := clock_timestamp();
  elsif tg_table_name='supplier_contracts' then
    new.updated_at := clock_timestamp();
  else
    if not exists(select 1 from public.supplier_contracts c where c.id=new.contract_id and c.company_id=new.company_id and c.supplier_id=new.supplier_id) then raise exception 'Contratto non accessibile'; end if;
    if new.storage_path not like new.company_id::text||'/'||new.supplier_id::text||'/'||new.contract_id::text||'/%' or new.storage_path like '%..%' or length(new.storage_path)>600 then raise exception 'Percorso allegato non valido'; end if;
    if not exists(select 1 from storage.objects o where o.bucket_id='supplier-contracts' and o.name=new.storage_path) then raise exception 'Il file non risulta caricato'; end if;
  end if;
  if tg_op='INSERT' and tg_table_name<>'supplier_relations' then new.created_by:=auth.uid(); end if;
  if tg_op='UPDATE' and tg_table_name='supplier_contracts' then new.created_by:=old.created_by;new.created_at:=old.created_at; end if;
  return new;
end; $$;

alter table public.supplier_relations enable row level security;
alter table public.supplier_contracts enable row level security;
alter table public.supplier_contract_documents enable row level security;
do $$ declare t text; begin
  foreach t in array array['supplier_relations','supplier_contracts','supplier_contract_documents'] loop
    execute format('create policy workspace_read on public.%I for select to authenticated using (not public.utente_bloccato() and (public.has_permission_for_company(auth.uid(),''can_view_settings_suppliers'',company_id) or public.has_permission_for_company(auth.uid(),''can_edit_settings_suppliers'',company_id)) and exists(select 1 from public.suppliers s where s.id=supplier_id and s.company_id=%I.company_id))',t,t);
    execute format('create policy workspace_insert on public.%I for insert to authenticated with check (not public.utente_bloccato() and not public.utente_sola_lettura(company_id) and public.has_permission_for_company(auth.uid(),''can_edit_settings_suppliers'',company_id))',t);
    execute format('create trigger workspace_parent before insert or update on public.%I for each row execute function public.check_supplier_workspace_parent()',t);
    execute format('revoke all on public.%I from public,anon,authenticated',t);
    execute format('grant select,insert on public.%I to authenticated',t);
  end loop;
end $$;
create policy workspace_update on public.supplier_contracts for update to authenticated using (not public.utente_bloccato() and not public.utente_sola_lettura(company_id) and public.has_permission_for_company(auth.uid(),'can_edit_settings_suppliers',company_id)) with check(not public.utente_bloccato() and not public.utente_sola_lettura(company_id) and public.has_permission_for_company(auth.uid(),'can_edit_settings_suppliers',company_id));
create policy workspace_update on public.supplier_relations for update to authenticated using (not public.utente_bloccato() and not public.utente_sola_lettura(company_id) and public.has_permission_for_company(auth.uid(),'can_edit_settings_suppliers',company_id)) with check(not public.utente_bloccato() and not public.utente_sola_lettura(company_id) and public.has_permission_for_company(auth.uid(),'can_edit_settings_suppliers',company_id));
grant update on public.supplier_relations,public.supplier_contracts to authenticated;

-- Una scheda dedicata, senza account/app/inviti, e solo su conferma dell'utente.
create or replace function public.salva_relazione_fornitore(p_company_id uuid,p_supplier_id uuid,p_roles text[],p_subappaltatore_id uuid default null,p_crea_subappaltatore boolean default false)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare s public.suppliers%rowtype; subid uuid:=p_subappaltatore_id; ids uuid[];
begin
  if auth.uid() is null or public.utente_bloccato() or public.utente_sola_lettura(p_company_id) or not public.has_permission_for_company(auth.uid(),'can_edit_settings_suppliers',p_company_id) then raise exception 'Non autorizzato'; end if;
  select * into s from public.suppliers where id=p_supplier_id and company_id=p_company_id for update;
  if not found then raise exception 'Fornitore non accessibile'; end if;
  if (p_crea_subappaltatore or subid is not null) and not public.has_permission_for_company(auth.uid(),'can_view_subappaltatori',p_company_id) then raise exception 'Serve anche il permesso Subappaltatori'; end if;
  if (p_crea_subappaltatore or subid is not null) and not ('subappaltatore'=any(p_roles)) then raise exception 'Seleziona il ruolo subappaltatore'; end if;
  if p_crea_subappaltatore then
    if subid is not null then raise exception 'Scegli se collegare o creare'; end if;
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_company_id::text||coalesce(nullif(public.partner_tax_key(s.vat_number),''),nullif(public.partner_tax_key(s.fiscal_code),''),lower(btrim(s.name))),0));
    select array_agg(id) into ids from public.subappaltatori_sicurezza x where company_id=p_company_id and
      ((public.partner_tax_key(s.vat_number)<>'' and public.partner_tax_key(x.piva)=public.partner_tax_key(s.vat_number)) or (public.partner_tax_key(s.fiscal_code)<>'' and public.partner_tax_key(x.codice_fiscale)=public.partner_tax_key(s.fiscal_code)));
    if coalesce(array_length(ids,1),0)>0 then raise exception 'Esistono schede con gli stessi identificativi: seleziona quella corretta, senza crearne altre'; end if;
    if exists(select 1 from public.subappaltatori_sicurezza x where company_id=p_company_id and lower(btrim(x.ragione_sociale))=lower(btrim(s.name))) then raise exception 'Esiste una scheda con lo stesso nome: verifica prima di creare'; end if;
    insert into public.subappaltatori_sicurezza(company_id,ragione_sociale,piva,codice_fiscale,email,telefono,pec,indirizzo,responsabile)
      values(p_company_id,s.name,s.vat_number,s.fiscal_code,s.email,s.phone,s.pec,s.address,s.contact_name) returning id into subid;
  end if;
  if subid is not null then
    if not exists(select 1 from public.subappaltatori_sicurezza x where x.id=subid and x.company_id=p_company_id and
      not (public.partner_tax_key(s.vat_number)<>'' and public.partner_tax_key(x.piva)<>'' and public.partner_tax_key(s.vat_number)<>public.partner_tax_key(x.piva)) and
      not (public.partner_tax_key(s.fiscal_code)<>'' and public.partner_tax_key(x.codice_fiscale)<>'' and public.partner_tax_key(s.fiscal_code)<>public.partner_tax_key(x.codice_fiscale))) then raise exception 'Scheda subappaltatore non accessibile o dati fiscali discordanti'; end if;
  end if;
  insert into public.supplier_relations(company_id,supplier_id,roles,subappaltatore_id) values(p_company_id,p_supplier_id,p_roles,subid)
  on conflict(company_id,supplier_id) do update set roles=excluded.roles,subappaltatore_id=excluded.subappaltatore_id;
  return subid;
end; $$;
revoke all on function public.salva_relazione_fornitore(uuid,uuid,text[],uuid,boolean) from public,anon;
grant execute on function public.salva_relazione_fornitore(uuid,uuid,text[],uuid,boolean) to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('supplier-contracts','supplier-contracts',false,20971520,array['application/pdf','image/jpeg','image/png']);
create policy supplier_contract_file_read on storage.objects for select to authenticated using (
  bucket_id='supplier-contracts' and not public.utente_bloccato() and exists(select 1 from public.supplier_contracts c where c.company_id::text=split_part(name,'/',1) and c.supplier_id::text=split_part(name,'/',2) and c.id::text=split_part(name,'/',3))
);
create policy supplier_contract_file_insert on storage.objects for insert to authenticated with check (
  bucket_id='supplier-contracts' and not public.utente_bloccato() and name not like '%..%' and exists(select 1 from public.supplier_contracts c where c.company_id::text=split_part(name,'/',1) and c.supplier_id::text=split_part(name,'/',2) and c.id::text=split_part(name,'/',3) and not public.utente_sola_lettura(c.company_id) and public.has_permission_for_company(auth.uid(),'can_edit_settings_suppliers',c.company_id))
);
-- Solo pulizia di upload non registrati; allegati confermati immutabili.
create policy supplier_contract_file_cleanup on storage.objects for delete to authenticated using (
  bucket_id='supplier-contracts' and owner_id=auth.uid()::text and not public.utente_bloccato() and not exists(select 1 from public.supplier_contract_documents d where d.storage_path=name) and exists(select 1 from public.supplier_contracts c where c.company_id::text=split_part(name,'/',1) and c.supplier_id::text=split_part(name,'/',2) and c.id::text=split_part(name,'/',3) and not public.utente_sola_lettura(c.company_id) and public.has_permission_for_company(auth.uid(),'can_edit_settings_suppliers',c.company_id))
);
