-- EiC Drive: sottocartelle a più livelli.
-- Una cartella manuale può contenere altre cartelle (manuali). La madre sta in
-- parent_id; un trigger controlla che sia della stessa azienda, manuale, non
-- archiviata, senza cicli e a non più di 8 livelli. Una cartella si elimina
-- davvero solo se è vuota: niente sottocartelle (anche archiviate) e niente file.
set local lock_timeout = '3s';
set local statement_timeout = '60s';

alter table public.media_library_folders
  add column if not exists parent_id uuid references public.media_library_folders(id);
create index if not exists media_library_folders_parent on public.media_library_folders(parent_id) where parent_id is not null;

-- Due cartelle attive con lo stesso nome nello stesso posto confondono: una sola.
create unique index if not exists media_library_folders_nome_nel_posto
  on public.media_library_folders(company_id, coalesce(parent_id, company_id), lower(btrim(name)))
  where archived_at is null;

create or replace function private.drive_cartella_coerente()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  v_madre public.media_library_folders%rowtype;
  v_cursore uuid;
  v_livelli int := 1;
begin
  if new.parent_id is not null then
    if new.parent_id = new.id then
      raise exception 'Una cartella non può stare dentro sé stessa' using errcode = '23514';
    end if;
    select * into v_madre from public.media_library_folders where id = new.parent_id;
    if not found or v_madre.company_id <> new.company_id then
      raise exception 'Cartella madre non trovata' using errcode = '23503';
    end if;
    if v_madre.mode <> 'manual' or new.mode <> 'manual' then
      raise exception 'Le sottocartelle stanno solo in cartelle manuali' using errcode = '23514';
    end if;
    if new.archived_at is null and v_madre.archived_at is not null then
      raise exception 'La cartella madre è archiviata' using errcode = '23514';
    end if;
    v_cursore := v_madre.parent_id;
    while v_cursore is not null loop
      if v_cursore = new.id then
        raise exception 'Una cartella non può stare dentro una sua sottocartella' using errcode = '23514';
      end if;
      v_livelli := v_livelli + 1;
      if v_livelli >= 8 then
        raise exception 'Troppi livelli di sottocartelle (massimo 8)' using errcode = '23514';
      end if;
      select parent_id into v_cursore from public.media_library_folders where id = v_cursore;
    end loop;
  end if;

  if tg_op = 'UPDATE' then
    if new.archived_at is not null and old.archived_at is null and exists(
      select 1 from public.media_library_folders f where f.parent_id = new.id and f.archived_at is null) then
      raise exception 'Archivia prima le sottocartelle' using errcode = '23514';
    end if;
    if new.mode <> 'manual' and exists(select 1 from public.media_library_folders f where f.parent_id = new.id) then
      raise exception 'Una cartella con sottocartelle resta manuale' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function private.drive_cartella_coerente() from public, anon, authenticated;

drop trigger if exists media_library_folders_coerente on public.media_library_folders;
create trigger media_library_folders_coerente
  before insert or update of parent_id, archived_at, mode, company_id on public.media_library_folders
  for each row execute function private.drive_cartella_coerente();

-- Vuota = nessuna sottocartella e nessun file, anche di altri utenti che chi elimina non vede.
create or replace function private.drive_cartella_vuota(p_folder uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select not exists(select 1 from public.media_library_folders f where f.parent_id = p_folder)
     and not exists(select 1 from public.media_library_files f where f.folder_id = p_folder);
$$;
revoke all on function private.drive_cartella_vuota(uuid) from public, anon;
grant execute on function private.drive_cartella_vuota(uuid) to authenticated;

drop policy if exists eic_drive_cartella_elimina_guardia on public.media_library_folders;
create policy eic_drive_cartella_elimina_guardia on public.media_library_folders as restrictive for delete to authenticated
  using (private.puo_usare_eic_drive(company_id) and not public.utente_sola_lettura(company_id)
    and private.drive_cartella_vuota(id));

notify pgrst, 'reload schema';
