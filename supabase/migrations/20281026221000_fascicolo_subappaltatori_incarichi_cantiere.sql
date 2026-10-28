-- File ricostruito il 27/10/2026 dal registro del database (supabase_migrations.schema_migrations).
-- La migrazione era già applicata in produzione con questa versione, ma il file non era mai stato salvato nel repository:
-- il controllo «Supabase Preview» segnalava «Remote migration versions not found in local migrations directory».
-- Sotto c'è l'SQL esattamente come applicato.

-- Additive: no existing dossiers, assignments, documents or contracts are rewritten.
set local lock_timeout = '3s';
set local statement_timeout = '60s';

create unique index if not exists sub_sicurezza_id_azienda on public.subappaltatori_sicurezza(id, company_id);
create unique index if not exists orders_id_azienda on public.orders(id, company_id);

create table if not exists public.subappaltatori_operai (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  subappaltatore_id uuid not null,
  nome text not null check (length(trim(nome)) > 0),
  cognome text not null check (length(trim(cognome)) > 0),
  mansione text not null check (length(trim(mansione)) > 0),
  telefono text,
  attivo boolean not null default true,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(id, subappaltatore_id, company_id),
  foreign key (subappaltatore_id,company_id) references public.subappaltatori_sicurezza(id,company_id)
);
create index if not exists sub_operai_impresa on public.subappaltatori_operai(company_id,subappaltatore_id);

create table if not exists public.subappaltatori_assegnazioni (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  subappaltatore_id uuid not null,
  operaio_id uuid not null,
  order_id uuid not null,
  dal date not null,
  al date,
  area text,
  attivita text not null check (length(trim(attivita)) > 0),
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (al is null or al >= dal),
  unique(operaio_id,order_id,dal),
  foreign key (operaio_id,subappaltatore_id,company_id) references public.subappaltatori_operai(id,subappaltatore_id,company_id),
  foreign key (order_id,company_id) references public.orders(id,company_id)
);
create index if not exists sub_assegnazioni_commessa on public.subappaltatori_assegnazioni(company_id,order_id);
create index if not exists sub_assegnazioni_impresa on public.subappaltatori_assegnazioni(company_id,subappaltatore_id,operaio_id);

create table if not exists public.sicurezza_incarichi (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  order_id uuid,
  subappaltatore_id uuid,
  ruolo text not null check (ruolo in ('datore_lavoro','responsabile_lavori','progettista','direttore_lavori','csp','cse','rup','direttore_tecnico','capocantiere','preposto','rspp','rls','rlst','medico_competente','addetto_antincendio','addetto_primo_soccorso','referente_operativo','referente_amministrativo')),
  nominativo text not null check (length(trim(nominativo)) > 0),
  telefono text,
  email text,
  nominante text,
  dal date not null,
  al date,
  area text,
  stato text not null default 'proposto' check (stato in ('proposto','documentato','cessato')),
  atto_riferimento text,
  mansioni_sicurezza text,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (order_id is not null or subappaltatore_id is not null),
  check (al is null or al >= dal),
  check (stato <> 'documentato' or (length(trim(coalesce(nominante,''))) > 0 and length(trim(coalesce(atto_riferimento,''))) > 0)),
  foreign key (order_id,company_id) references public.orders(id,company_id),
  foreign key (subappaltatore_id,company_id) references public.subappaltatori_sicurezza(id,company_id)
);
create index if not exists sicurezza_incarichi_commessa on public.sicurezza_incarichi(company_id,order_id,dal);
create index if not exists sicurezza_incarichi_impresa on public.sicurezza_incarichi(company_id,subappaltatore_id);

create table if not exists public.sicurezza_fascicolo (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  subappaltatore_id uuid,
  operaio_id uuid,
  order_id uuid,
  tipo text not null,
  titolo text not null check (length(trim(titolo)) > 0),
  origine_requisito text not null default 'da_verificare' check (origine_requisito in ('da_verificare','normativa','contratto','interna')),
  riferimento_requisito text,
  stato text not null default 'da_richiedere' check (stato in ('da_richiedere','richiesto','ricevuto','integrazione','verificato','non_applicabile','superato')),
  file_path text unique,
  file_name text,
  data_rilascio date,
  data_scadenza date,
  competenza text check (competenza is null or competenza ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  revisione text,
  termine date,
  referente text,
  verificato_da uuid references auth.users(id),
  verificato_il timestamptz,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (order_id is not null or subappaltatore_id is not null),
  check (operaio_id is null or subappaltatore_id is not null),
  check (data_scadenza is null or data_rilascio is null or data_scadenza >= data_rilascio),
  check (file_path is null or file_path like company_id::text || '/' || id::text || '/%'),
  check (stato not in ('ricevuto','verificato') or file_path is not null),
  check (stato <> 'non_applicabile' or length(trim(coalesce(note,''))) > 0),
  check (tipo <> 'pos' or stato not in ('ricevuto','verificato') or order_id is not null),
  foreign key (order_id,company_id) references public.orders(id,company_id),
  foreign key (subappaltatore_id,company_id) references public.subappaltatori_sicurezza(id,company_id),
  foreign key (operaio_id,subappaltatore_id,company_id) references public.subappaltatori_operai(id,subappaltatore_id,company_id)
);
create index if not exists sicurezza_fascicolo_impresa on public.sicurezza_fascicolo(company_id,subappaltatore_id);
create index if not exists sicurezza_fascicolo_operaio on public.sicurezza_fascicolo(operaio_id) where operaio_id is not null;
create index if not exists sicurezza_fascicolo_commessa on public.sicurezza_fascicolo(company_id,order_id);
create index if not exists sicurezza_fascicolo_verificatore on public.sicurezza_fascicolo(verificato_da) where verificato_da is not null;

-- Owner/scope and uploaded file are stable. A replacement is a new evidence row.
create or replace function public.sicurezza_fascicolo_guardia()
returns trigger language plpgsql security invoker set search_path=public as $$
begin
  if tg_op='UPDATE' then
    if (new.company_id,new.subappaltatore_id,new.operaio_id) is distinct from (old.company_id,old.subappaltatore_id,old.operaio_id) then
      raise exception 'Il titolare del documento non si cambia: crea una nuova evidenza';
    end if;
    if old.file_path is not null and new.file_path is distinct from old.file_path then
      raise exception 'Il file non si sostituisce: carica una nuova versione';
    end if;
    if old.stato='verificato' and (new.order_id,new.tipo,new.data_rilascio,new.data_scadenza,new.revisione) is distinct from (old.order_id,old.tipo,old.data_rilascio,old.data_scadenza,old.revisione) then
      raise exception 'Per modificare i dati di un documento verificato riaprilo prima in integrazione';
    end if;
  end if;
  if new.stato='verificato' then
    if tg_op='INSERT' or old.stato is distinct from 'verificato' then
      new.verificato_da := auth.uid(); new.verificato_il := now();
    else
      new.verificato_da := old.verificato_da; new.verificato_il := old.verificato_il;
    end if;
  else
    new.verificato_da := null; new.verificato_il := null;
  end if;
  new.updated_at := now();
  return new;
end; $$;
revoke all on function public.sicurezza_fascicolo_guardia() from public,anon,authenticated;
drop trigger if exists sicurezza_fascicolo_guardia on public.sicurezza_fascicolo;
create trigger sicurezza_fascicolo_guardia before insert or update on public.sicurezza_fascicolo for each row execute function public.sicurezza_fascicolo_guardia();

-- Reuse the module permission; no new access for external accounts or clients.
do $$ declare t text; begin
  foreach t in array array['subappaltatori_operai','subappaltatori_assegnazioni','sicurezza_incarichi','sicurezza_fascicolo'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from anon,authenticated',t);
    execute format('grant select,insert,update on public.%I to authenticated',t);
    execute format('grant all on public.%I to service_role',t);
    execute format('drop policy if exists sicurezza_lettura on public.%I',t);
    execute format('create policy sicurezza_lettura on public.%I for select to authenticated using (public.has_permission_for_company((select auth.uid()),''can_view_sicurezza_cantiere'',company_id))',t);
    execute format('drop policy if exists sicurezza_crea on public.%I',t);
    execute format('create policy sicurezza_crea on public.%I for insert to authenticated with check (public.has_permission_for_company((select auth.uid()),''can_view_sicurezza_cantiere'',company_id) and not public.utente_sola_lettura(company_id))',t);
    execute format('drop policy if exists sicurezza_modifica on public.%I',t);
    execute format('create policy sicurezza_modifica on public.%I for update to authenticated using (public.has_permission_for_company((select auth.uid()),''can_view_sicurezza_cantiere'',company_id) and not public.utente_sola_lettura(company_id)) with check (public.has_permission_for_company((select auth.uid()),''can_view_sicurezza_cantiere'',company_id) and not public.utente_sola_lettura(company_id))',t);
    execute format('drop trigger if exists fascicolo_updated on public.%I',t);
    execute format('create trigger fascicolo_updated before update on public.%I for each row execute function public.update_updated_at_column()',t);
  end loop;
end $$;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('fascicoli-cantiere','fascicoli-cantiere',false,15728640,array['application/pdf','image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;
drop policy if exists fascicoli_lettura on storage.objects;
create policy fascicoli_lettura on storage.objects for select to authenticated using (
  bucket_id='fascicoli-cantiere' and exists(select 1 from public.sicurezza_fascicolo e where e.file_path=name)
);
drop policy if exists fascicoli_caricamento on storage.objects;
create policy fascicoli_caricamento on storage.objects for insert to authenticated with check (
  bucket_id='fascicoli-cantiere' and exists(
    select 1 from public.sicurezza_fascicolo e
    where (storage.foldername(name))[1]=e.company_id::text and (storage.foldername(name))[2]=e.id::text
      and e.file_path is null and public.has_permission_for_company((select auth.uid()),'can_view_sicurezza_cantiere',e.company_id)
      and not public.utente_sola_lettura(e.company_id)
  )
);
notify pgrst,'reload schema';
