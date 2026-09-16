-- Documenti della commessa divisi in cartelle, e ogni azienda ha le sue.
-- Richiesta Green Energy (16/09/2026): nel vecchio gestionale caricavano ogni
-- file nella cartella giusta (Enel I-II-GSE, Pratica edilizia, Foto…); qui
-- c'era un elenco unico e caricava solo l'amministratore.

create table if not exists public.order_document_folders (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  nome text not null check (length(btrim(nome)) between 1 and 80),
  posizione integer not null default 0,
  -- I file caricati qui nascono visibili al cliente (si può sempre cambiare sul file).
  visibile_cliente boolean not null default false,
  -- La commessa segnala «Mancano: …» finché la cartella è vuota.
  obbligatoria boolean not null default false,
  archiviata_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);

create unique index if not exists order_document_folders_nome_uniq
  on public.order_document_folders (company_id, lower(nome)) where archiviata_at is null;
create index if not exists order_document_folders_company_idx
  on public.order_document_folders (company_id, posizione);

alter table public.order_attachments
  add column if not exists folder_id uuid references public.order_document_folders(id) on delete set null;
create index if not exists order_attachments_folder_idx on public.order_attachments (folder_id);
create index if not exists order_attachments_order_idx on public.order_attachments (order_id);

alter table public.order_document_folders enable row level security;

drop policy if exists "Cartelle documenti: lettura" on public.order_document_folders;
create policy "Cartelle documenti: lettura" on public.order_document_folders
  for select to authenticated
  using (public.user_can_access_company(company_id));

drop policy if exists "Cartelle documenti: gestione" on public.order_document_folders;
create policy "Cartelle documenti: gestione" on public.order_document_folders
  for all to authenticated
  using (
    public.user_can_access_company(company_id)
    and (select public.has_permission((select auth.uid()), 'can_edit_settings_orders'))
  )
  with check (
    public.user_can_access_company(company_id)
    and (select public.has_permission((select auth.uid()), 'can_edit_settings_orders'))
  );

-- Chi può modificare le commesse carica, sposta e toglie i documenti. Prima
-- solo company_admin: il file saliva nello storage e la riga veniva rifiutata.
drop policy if exists "Staff can manage order attachments if permitted" on public.order_attachments;
create policy "Staff can manage order attachments if permitted" on public.order_attachments
  for all to authenticated
  using (
    (select public.has_permission((select auth.uid()), 'can_edit_orders'))
    and public.user_can_access_company(public.get_order_company_id(order_id))
  )
  with check (
    (select public.has_permission((select auth.uid()), 'can_edit_orders'))
    and public.user_can_access_company(public.get_order_company_id(order_id))
  );

-- La cartella deve essere dell'azienda della commessa.
create or replace function public.order_attachment_cartella_coerente()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  if new.folder_id is not null and not exists (
    select 1 from public.order_document_folders f
      join public.orders o on o.company_id = f.company_id
     where f.id = new.folder_id and o.id = new.order_id
  ) then
    raise exception 'La cartella non appartiene all''azienda della commessa';
  end if;
  return new;
end;
$$;
revoke all on function public.order_attachment_cartella_coerente() from public, anon;

drop trigger if exists trg_order_attachment_cartella_coerente on public.order_attachments;
create trigger trg_order_attachment_cartella_coerente
  before insert or update of folder_id, order_id on public.order_attachments
  for each row execute function public.order_attachment_cartella_coerente();

-- Cartelle di partenza: un gruppo base, che l'azienda cambia come vuole.
create or replace function public.cartelle_documenti_iniziali(p_company_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  if exists (select 1 from public.order_document_folders where company_id = p_company_id) then
    return;
  end if;
  insert into public.order_document_folders (company_id, nome, posizione, created_by)
  select p_company_id, n, i, null
    from unnest(array[
      'Contratti', 'Documenti cliente', 'Preventivi', 'Foto',
      'Fatture e pagamenti', 'Pratiche', 'Varie'
    ]) with ordinality as t(n, i);
end;
$$;
revoke all on function public.cartelle_documenti_iniziali(uuid) from public, anon, authenticated;

create or replace function public.trg_fn_cartelle_documenti_nuova_azienda()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  begin
    perform public.cartelle_documenti_iniziali(new.id);
  exception when others then
    -- Una cartella mancante non deve impedire di creare l'azienda.
    raise warning 'cartelle_documenti_iniziali: %', sqlerrm;
  end;
  return new;
end;
$$;
revoke all on function public.trg_fn_cartelle_documenti_nuova_azienda() from public, anon;

drop trigger if exists trg_cartelle_documenti_nuova_azienda on public.companies;
create trigger trg_cartelle_documenti_nuova_azienda
  after insert on public.companies
  for each row execute function public.trg_fn_cartelle_documenti_nuova_azienda();

-- Green Energy Group: le cartelle del loro gestionale (senza Asseverazione).
insert into public.order_document_folders (company_id, nome, posizione, created_by)
select '5c067ea9-1d01-48df-ae84-8ef88a829def'::uuid, n, i, null
  from unnest(array[
    'Contratti + Doc. cliente + Reddito + Bollette',
    'Doc. architettonici',
    'Doc. catastali e visure',
    'Enel I-II-GSE',
    'Fatture e pagamenti',
    'Foto installazione + Dico Ftv',
    'Foto installazione + Dico parte idraulica',
    'Foto installazione + Dico Varie',
    'Mail comunicazioni cliente',
    'Posizionamento',
    'Pratica edilizia',
    'Preventivi',
    'Schede tecniche',
    'Sopralluogo',
    'Studio Tecnico',
    'Varie documenti cliente'
  ]) with ordinality as t(n, i)
 where exists (select 1 from public.companies where id = '5c067ea9-1d01-48df-ae84-8ef88a829def')
   and not exists (
     select 1 from public.order_document_folders
      where company_id = '5c067ea9-1d01-48df-ae84-8ef88a829def'
   );

-- Tutte le altre aziende: gruppo base.
do $$
declare c record;
begin
  for c in select id from public.companies loop
    perform public.cartelle_documenti_iniziali(c.id);
  end loop;
end $$;

-- I documenti già caricati finiscono in «Varie» della loro azienda.
set local lock_timeout = '3s';
update public.order_attachments a
   set folder_id = f.id
  from public.orders o
  join public.order_document_folders f
    on f.company_id = o.company_id and f.nome = 'Varie' and f.archiviata_at is null
 where o.id = a.order_id
   and a.folder_id is null;
