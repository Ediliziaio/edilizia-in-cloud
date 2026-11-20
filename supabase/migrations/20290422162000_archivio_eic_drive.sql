set local lock_timeout = '3s';
set local statement_timeout = '60s';

alter table public.media_library_folders add column if not exists mode text not null default 'automatic'
  check (mode in ('automatic', 'manual'));

create table if not exists public.media_library_files (
  id uuid primary key,
  company_id uuid not null references public.companies(id) on delete cascade,
  folder_id uuid references public.media_library_folders(id) on delete set null,
  name text not null check (length(btrim(name)) > 0),
  mime_type text not null,
  size_bytes bigint not null check (size_bytes between 1 and 50000000),
  storage_path text not null unique,
  shared boolean not null default false,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists media_library_files_company_date on public.media_library_files(company_id, created_at desc, id);
create index if not exists media_library_files_folder on public.media_library_files(folder_id);
alter table public.media_library_files enable row level security;
revoke all on public.media_library_files from public, anon, authenticated;
grant select on public.media_library_files to authenticated;
grant insert (id, company_id, folder_id, name, mime_type, size_bytes, storage_path, shared), update (folder_id) on public.media_library_files to authenticated;

create or replace function private.puo_usare_eic_drive(p_company uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select coalesce(auth.uid() is not null and p_company = public.get_effective_company_id()
    and not public.utente_bloccato() and not public.utente_e_cliente_esterno()
    and (public.e_amministratore_di(p_company) or public.has_role(auth.uid(), 'super_admin'::public.app_role)
      or exists(select 1 from unnest(array[
        'can_view_orders', 'can_view_tickets', 'can_view_customers', 'can_view_billing', 'can_view_prima_nota',
        'can_view_tesoreria', 'can_view_costs', 'can_view_marketing', 'can_view_marketing_contacts',
        'can_view_marketing_opportunities', 'can_view_marketing_reports', 'can_view_marketing_dashboard',
        'can_view_settings_customization', 'can_view_render_ai', 'can_view_warehouse',
        'can_view_sicurezza_cantiere', 'can_view_subappaltatori', 'can_view_giornale_lavori'
      ]) permission where public.has_permission_for_company(auth.uid(), permission, p_company))), false);
$$;
revoke all on function private.puo_usare_eic_drive(uuid) from public, anon;
grant execute on function private.puo_usare_eic_drive(uuid) to authenticated;

drop policy if exists eic_drive_cartella_crea_guardia on public.media_library_folders;
create policy eic_drive_cartella_crea_guardia on public.media_library_folders as restrictive for insert to authenticated
  with check (private.puo_usare_eic_drive(company_id) and not public.utente_sola_lettura(company_id));

drop policy if exists eic_drive_cartella_modifica_guardia on public.media_library_folders;
create policy eic_drive_cartella_modifica_guardia on public.media_library_folders as restrictive for update to authenticated
  using (private.puo_usare_eic_drive(company_id) and not public.utente_sola_lettura(company_id))
  with check (private.puo_usare_eic_drive(company_id) and not public.utente_sola_lettura(company_id));

create or replace function private.cartella_manual_drive_valida(p_company uuid, p_folder uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select p_folder is null or exists(select 1 from public.media_library_folders f
    where f.id = p_folder and f.company_id = p_company and f.mode = 'manual' and f.archived_at is null);
$$;
revoke all on function private.cartella_manual_drive_valida(uuid, uuid) from public, anon;
grant execute on function private.cartella_manual_drive_valida(uuid, uuid) to authenticated;

create or replace function private.drive_oggetto_proprio(p_name text)
returns boolean language sql stable security definer set search_path = ''
as $$
  select coalesce(private.puo_usare_eic_drive(public.get_effective_company_id())
    and split_part(p_name, '/', 1) = public.get_effective_company_id()::text
    and split_part(p_name, '/', 2) = auth.uid()::text
    and split_part(p_name, '/', 3) ~ '^[0-9a-f-]{36}$' and cardinality(string_to_array(p_name, '/')) = 3, false);
$$;
revoke all on function private.drive_oggetto_proprio(text) from public, anon;
grant execute on function private.drive_oggetto_proprio(text) to authenticated;

insert into storage.buckets(id, name, public, file_size_limit)
  values ('eic-drive', 'eic-drive', false, 50000000) on conflict (id) do nothing;

create or replace function private.drive_oggetto_caricato(p_name text)
returns boolean language sql stable security definer set search_path = ''
as $$
  select private.drive_oggetto_proprio(p_name) and exists(select 1 from storage.objects s where s.bucket_id = 'eic-drive' and s.name = p_name);
$$;
revoke all on function private.drive_oggetto_caricato(text) from public, anon;
grant execute on function private.drive_oggetto_caricato(text) to authenticated;

drop policy if exists eic_drive_leggi on public.media_library_files;
create policy eic_drive_leggi on public.media_library_files for select to authenticated using (
  private.puo_usare_eic_drive(company_id) and (shared or created_by = auth.uid()
    or public.e_amministratore_di(company_id) or public.has_role(auth.uid(), 'super_admin'::public.app_role))
);
drop policy if exists eic_drive_archivia on public.media_library_files;
create policy eic_drive_archivia on public.media_library_files for insert to authenticated with check (
  private.puo_usare_eic_drive(company_id) and not public.utente_sola_lettura(company_id) and created_by = auth.uid()
  and storage_path = company_id::text || '/' || created_by::text || '/' || id::text
  and private.cartella_manual_drive_valida(company_id, folder_id) and private.drive_oggetto_caricato(storage_path)
);
drop policy if exists eic_drive_sposta on public.media_library_files;
create policy eic_drive_sposta on public.media_library_files for update to authenticated using (
  private.puo_usare_eic_drive(company_id) and not public.utente_sola_lettura(company_id)
  and (created_by = auth.uid() or public.e_amministratore_di(company_id) or public.has_role(auth.uid(), 'super_admin'::public.app_role))
) with check (
  private.puo_usare_eic_drive(company_id) and not public.utente_sola_lettura(company_id)
  and (created_by = auth.uid() or public.e_amministratore_di(company_id) or public.has_role(auth.uid(), 'super_admin'::public.app_role))
  and private.cartella_manual_drive_valida(company_id, folder_id)
);

drop policy if exists eic_drive_storage_leggi on storage.objects;
create policy eic_drive_storage_leggi on storage.objects for select to authenticated using (
  bucket_id = 'eic-drive' and (private.drive_oggetto_proprio(name) or exists(select 1 from public.media_library_files f where f.storage_path = objects.name))
);
drop policy if exists eic_drive_storage_carica on storage.objects;
create policy eic_drive_storage_carica on storage.objects for insert to authenticated with check (
  bucket_id = 'eic-drive' and private.drive_oggetto_proprio(name) and not public.utente_sola_lettura(public.get_effective_company_id())
);
drop policy if exists eic_drive_storage_rimuovi_incompleto on storage.objects;
create policy eic_drive_storage_rimuovi_incompleto on storage.objects for delete to authenticated using (
  bucket_id = 'eic-drive' and private.drive_oggetto_proprio(name) and not public.utente_sola_lettura(public.get_effective_company_id())
  and not exists(select 1 from public.media_library_files f where f.storage_path = objects.name)
);
-- Impedisce che eventuali policy generiche di altri moduli allarghino il bucket del Drive.
drop policy if exists eic_drive_storage_anon on storage.objects;
create policy eic_drive_storage_anon on storage.objects as restrictive for all to anon
  using (bucket_id <> 'eic-drive') with check (bucket_id <> 'eic-drive');
drop policy if exists eic_drive_storage_leggi_guardia on storage.objects;
create policy eic_drive_storage_leggi_guardia on storage.objects as restrictive for select to authenticated using (
  bucket_id <> 'eic-drive' or private.drive_oggetto_proprio(name) or exists(select 1 from public.media_library_files f where f.storage_path = objects.name)
);
drop policy if exists eic_drive_storage_carica_guardia on storage.objects;
create policy eic_drive_storage_carica_guardia on storage.objects as restrictive for insert to authenticated with check (
  bucket_id <> 'eic-drive' or (private.drive_oggetto_proprio(name) and not public.utente_sola_lettura(public.get_effective_company_id()))
);
drop policy if exists eic_drive_storage_aggiorna_guardia on storage.objects;
create policy eic_drive_storage_aggiorna_guardia on storage.objects as restrictive for update to authenticated
  using (bucket_id <> 'eic-drive') with check (bucket_id <> 'eic-drive');
drop policy if exists eic_drive_storage_rimuovi_guardia on storage.objects;
create policy eic_drive_storage_rimuovi_guardia on storage.objects as restrictive for delete to authenticated using (
  bucket_id <> 'eic-drive' or (private.drive_oggetto_proprio(name) and not public.utente_sola_lettura(public.get_effective_company_id())
    and not exists(select 1 from public.media_library_files f where f.storage_path = objects.name))
);

notify pgrst, 'reload schema';
