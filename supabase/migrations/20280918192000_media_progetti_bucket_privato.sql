-- Foto e allegati dei progetti di bagni, tetti, elettrico, termoidraulico,
-- piscine, ristrutturazione, pavimenti e climatizzazione: bucket privato.
--
-- Gli StepMedia caricavano foto della casa del cliente, render e allegati nel
-- bucket pubblico company-photo-library e salvavano nel progetto l'URL
-- pubblico: chiunque avesse l'indirizzo avrebbe aperto il file, e la policy
-- cpl_storage_read_public (lettura al ruolo public) permetteva anche di elencare
-- il bucket senza essere collegati. Al 17/09/2026 le otto tabelle
-- *_progetti_media erano vuote e il bucket non aveva file: nessun dato è uscito.
--
-- Da qui i file vanno nel bucket privato progetti-media, con lo stesso percorso
-- {company_id}/<modulo>/{progetto_id}/{uuid}.{ext}, e nel progetto c'è il
-- riferimento "progetti-media/<percorso>", firmato quando serve (vedi
-- src/lib/storage/fileRiservati.ts). Limiti del bucket uguali a quelli dello
-- StepMedia: 8 MB, PNG, JPG, WEBP e PDF.
--
-- company-photo-library resta pubblico: logo, copertina e galleria dei modelli
-- sono fatti per il cliente, e un URL pubblico si apre senza alcuna policy di
-- lettura. La lettura attraverso le API (elenco, download da collegati, e la
-- rimozione, che la richiede) resta solo nella cartella dell'azienda su cui si
-- lavora.
--
-- Idempotente: bucket con ON CONFLICT, policy con DROP IF EXISTS. Non c'è nessuna
-- riga da convertire, e un file non si sposta da un bucket all'altro in SQL: se
-- nel frattempo fossero comparsi media di progetto nel bucket pubblico, la
-- migrazione si ferma e vanno spostati prima con lo storage.

set local lock_timeout = '3s';
set local statement_timeout = '60s';

do $$
declare
  v_righe bigint;
  v_file bigint;
begin
  select (select count(*) from public.bgn_progetti_media where url ~ 'company-photo-library')
       + (select count(*) from public.tet_progetti_media where url ~ 'company-photo-library')
       + (select count(*) from public.ele_progetti_media where url ~ 'company-photo-library')
       + (select count(*) from public.idr_progetti_media where url ~ 'company-photo-library')
       + (select count(*) from public.pis_progetti_media where url ~ 'company-photo-library')
       + (select count(*) from public.rst_progetti_media where url ~ 'company-photo-library')
       + (select count(*) from public.pav_progetti_media where url ~ 'company-photo-library')
       + (select count(*) from public.clm_progetti_media where url ~ 'company-photo-library')
    into v_righe;

  -- I file dei progetti hanno l'id del progetto come terza cartella; modelli e
  -- galleria usano template/ e gallery/, la libreria foto nessuna sottocartella.
  select count(*) into v_file
  from storage.objects
  where bucket_id = 'company-photo-library'
    and name ~ '^[^/]+/(bagni|tetti|elettrico|termoidraulico|piscine|ristrutturazione|pavimenti|climatizzazione)/[0-9a-f-]{36}/';

  if v_righe > 0 or v_file > 0 then
    raise exception 'Media di progetto ancora nel bucket pubblico (% righe, % file): spostarli con lo storage prima di questa migrazione', v_righe, v_file;
  end if;
end $$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('progetti-media', 'progetti-media', false, 8388608,
        array['image/png', 'image/jpeg', 'image/webp', 'application/pdf'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- progetti-media: solo la cartella dell'azienda su cui si lavora, mai un utente
-- bloccato (get_effective_company_id non lo guarda da sola).
drop policy if exists "progetti_media_select" on storage.objects;
create policy "progetti_media_select" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'progetti-media'
    and (storage.foldername(name))[1] = (public.get_effective_company_id())::text
    and not public.utente_bloccato()
  );

drop policy if exists "progetti_media_insert" on storage.objects;
create policy "progetti_media_insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'progetti-media'
    and (storage.foldername(name))[1] = (public.get_effective_company_id())::text
    and not public.utente_bloccato()
  );

drop policy if exists "progetti_media_update" on storage.objects;
create policy "progetti_media_update" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'progetti-media'
    and (storage.foldername(name))[1] = (public.get_effective_company_id())::text
    and not public.utente_bloccato()
  );

drop policy if exists "progetti_media_delete" on storage.objects;
create policy "progetti_media_delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'progetti-media'
    and (storage.foldername(name))[1] = (public.get_effective_company_id())::text
    and not public.utente_bloccato()
  );

-- company-photo-library: niente più lettura anonima attraverso le API.
drop policy if exists "cpl_storage_read_public" on storage.objects;
drop policy if exists "cpl_storage_read_own_company" on storage.objects;
create policy "cpl_storage_read_own_company" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'company-photo-library'
    and (storage.foldername(name))[1] = (public.get_effective_company_id())::text
    and not public.utente_bloccato()
  );
