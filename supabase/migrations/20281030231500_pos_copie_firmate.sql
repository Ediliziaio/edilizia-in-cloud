create table if not exists public.pos_copie_firmate (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  pos_id uuid not null,
  emissione_id uuid not null references public.pos_emissioni(id),
  revisione integer not null,
  file_path text not null unique,
  file_name text not null check (length(btrim(file_name)) between 1 and 200),
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  dimensione bigint not null check (dimensione > 0 and dimensione <= 20971520),
  firmato_il date,
  note text check (note is null or length(note) <= 1000),
  caricata_da uuid not null references auth.users(id),
  caricata_il timestamptz not null default now(),
  constraint pos_copie_firmate_pos_fkey foreign key (pos_id, company_id) references public.pos_documents (id, company_id),
  constraint pos_copie_firmate_percorso check (file_path ~ '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}/[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}/[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}\.pdf$'),
  constraint pos_copie_firmate_percorso_proprio check (file_path like company_id::text || '/' || pos_id::text || '/%')
);
create index if not exists pos_copie_firmate_pos_idx on public.pos_copie_firmate (pos_id, caricata_il desc);

create or replace function public.pos_copie_firmate_guardia()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  em public.pos_emissioni%rowtype;
  dim bigint;
begin
  if tg_op <> 'INSERT' then
    raise exception 'Le copie firmate di un POS non si modificano né si cancellano: carica la nuova copia' using errcode = 'P0001';
  end if;
  select * into em from public.pos_emissioni where id = new.emissione_id;
  if not found or em.stato <> 'completa' or em.pos_id <> new.pos_id or em.company_id <> new.company_id then
    raise exception 'La copia firmata deve riferirsi a un PDF emesso di questo POS' using errcode = 'P0001';
  end if;
  new.revisione := em.revisione;
  select nullif(o.metadata ->> 'size', '')::bigint into dim
    from storage.objects o where o.bucket_id = 'pos-firmati' and o.name = new.file_path;
  if dim is null then
    raise exception 'Il file della copia firmata non risulta caricato' using errcode = 'P0001';
  end if;
  if dim <> new.dimensione then
    raise exception 'La dimensione dichiarata non coincide con quella del file caricato' using errcode = 'P0001';
  end if;
  return new;
end
$$;
revoke all on function public.pos_copie_firmate_guardia() from public, anon, authenticated;

drop trigger if exists pos_copie_firmate_guardia on public.pos_copie_firmate;
create trigger pos_copie_firmate_guardia before insert or update or delete on public.pos_copie_firmate
  for each row execute function public.pos_copie_firmate_guardia();

alter table public.pos_copie_firmate enable row level security;
revoke all on public.pos_copie_firmate from anon, authenticated;
grant select, insert on public.pos_copie_firmate to authenticated;
grant all on public.pos_copie_firmate to service_role;

drop policy if exists pos_copie_firmate_lettura on public.pos_copie_firmate;
create policy pos_copie_firmate_lettura on public.pos_copie_firmate for select to authenticated
  using (public.has_permission_for_company((select auth.uid()), 'can_view_sicurezza_cantiere', company_id));

drop policy if exists pos_copie_firmate_inserimento on public.pos_copie_firmate;
create policy pos_copie_firmate_inserimento on public.pos_copie_firmate for insert to authenticated
  with check (
    public.has_permission_for_company((select auth.uid()), 'can_view_sicurezza_cantiere', company_id)
    and not public.utente_sola_lettura(company_id)
    and caricata_da = (select auth.uid())
  );

drop policy if exists blocco_utente_bloccato on public.pos_copie_firmate;
create policy blocco_utente_bloccato on public.pos_copie_firmate as restrictive for all to authenticated
  using (not (select public.utente_bloccato())) with check (not (select public.utente_bloccato()));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('pos-firmati', 'pos-firmati', false, 20971520, array['application/pdf'])
on conflict (id) do nothing;

drop policy if exists pos_firmati_caricamento on storage.objects;
create policy pos_firmati_caricamento on storage.objects for insert to authenticated
  with check (
    bucket_id = 'pos-firmati'
    and name ~ '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}/[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}/[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}\.pdf$'
    and exists (
      select 1 from public.pos_documents d
       where d.id::text = (storage.foldername(name))[2]
         and d.company_id::text = (storage.foldername(name))[1]
         and public.has_permission_for_company((select auth.uid()), 'can_view_sicurezza_cantiere', d.company_id)
         and not public.utente_sola_lettura(d.company_id)
    )
  );

drop policy if exists pos_firmati_lettura on storage.objects;
create policy pos_firmati_lettura on storage.objects for select to authenticated
  using (
    bucket_id = 'pos-firmati'
    and exists (
      select 1 from public.pos_copie_firmate c
       where c.file_path = objects.name
         and public.has_permission_for_company((select auth.uid()), 'can_view_sicurezza_cantiere', c.company_id)
    )
  );

drop policy if exists pos_firmati_nessuna_modifica on storage.objects;
create policy pos_firmati_nessuna_modifica on storage.objects as restrictive for update to authenticated
  using (bucket_id <> 'pos-firmati') with check (bucket_id <> 'pos-firmati');
drop policy if exists pos_firmati_nessuna_cancellazione on storage.objects;
create policy pos_firmati_nessuna_cancellazione on storage.objects as restrictive for delete to authenticated
  using (bucket_id <> 'pos-firmati');

notify pgrst, 'reload schema';
