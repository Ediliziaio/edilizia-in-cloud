-- Libreria foto aziendale (bucket company-photo-library): si carica nella
-- cartella dell'azienda su cui si lavora.
--
-- Tutti quelli che scrivono in questo bucket mettono il file nella cartella
-- dell'azienda effettiva (useEffectiveCompanyId):
--   - gli 8 editor dei modelli PDF (bagni, tetti, elettrico, termoidraulico,
--     piscine, ristrutturazione, pavimenti, climatizzazione), galleria lavori
--     compresa;
--   - i loro StepMedia;
--   - la libreria foto (useCompanyPhotoLibrary).
-- Le policy di scrittura invece controllavano l'azienda del profilo
-- (get_user_company_id): chi lavora su più aziende non poteva caricare nulla
-- fuori dalla propria, e il super admin passava solo grazie a
-- cpl_storage_super_admin.
--
-- Ora vale l'azienda effettiva, come per sr-progetti e fv-progetti. A differenza
-- di get_user_company_id, get_effective_company_id non guarda il blocco
-- dell'utente, e su storage.objects non c'è una policy RESTRICTIVE che lo faccia:
-- per questo resta la condizione esplicita `not utente_bloccato()`.
--
-- Cambiano solo policy, nessuna riga. Riscrivere una policy prende un lock
-- esclusivo su storage.objects: meglio fallire dopo 3 secondi e riprovare che
-- mettere in coda tutto lo storage.

set local lock_timeout = '3s';

-- INSERT: solo nella cartella dell'azienda su cui si lavora
drop policy if exists "cpl_storage_insert_own_company" on storage.objects;
create policy "cpl_storage_insert_own_company" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'company-photo-library'
    and (storage.foldername(name))[1] = (public.get_effective_company_id())::text
    and not public.utente_bloccato()
  );

-- UPDATE: solo nella cartella dell'azienda su cui si lavora
drop policy if exists "cpl_storage_update_own_company" on storage.objects;
create policy "cpl_storage_update_own_company" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'company-photo-library'
    and (storage.foldername(name))[1] = (public.get_effective_company_id())::text
    and not public.utente_bloccato()
  );

-- DELETE: solo nella cartella dell'azienda su cui si lavora
drop policy if exists "cpl_storage_delete_own_company" on storage.objects;
create policy "cpl_storage_delete_own_company" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'company-photo-library'
    and (storage.foldername(name))[1] = (public.get_effective_company_id())::text
    and not public.utente_bloccato()
  );
