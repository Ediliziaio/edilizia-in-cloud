-- Documenti delle ditte subappaltatrici: ognuno vede solo i suoi (26/11/2026, piano campo completo, fase 0.2).
--
-- documenti_subappaltatore, subappaltatori_documenti e il bucket «subappaltatori-documenti» si leggevano
-- (e il bucket si scriveva e cancellava) per azienda: chiunque avesse il profilo nell'azienda, quindi anche
-- un operaio o una ditta subappaltatrice, poteva leggere DURC, visure e polizze delle altre ditte.
-- Ora chi entra SOLO dall'area operai (operaio o subappaltatore, senza un ruolo d'ufficio) vede e tocca
-- soltanto i documenti della propria ditta (subappaltatori.user_id = sé stesso). L'ufficio non cambia.
-- Serve anche perché da oggi il subappaltatore carica i suoi documenti dall'app direttamente qui, dove li
-- guarda l'ufficio (prima finivano in documenti_dipendenti, che la scheda della ditta non legge).

create or replace function private.utente_solo_campo()
returns boolean
language sql
stable security definer
set search_path to ''
as $$
  select exists (select 1 from public.user_roles r where r.user_id = auth.uid() and r.role in ('employee', 'subcontractor'))
     and not exists (select 1 from public.user_roles r where r.user_id = auth.uid()
                     and r.role in ('company_admin', 'company_staff', 'super_admin', 'accountant'));
$$;

-- La ditta (per id, anche in forma di testo: la seconda cartella del percorso nel bucket) è la mia?
create or replace function private.documenti_ditta_visibili(p_azienda text, p_ditta text)
returns boolean
language sql
stable security definer
set search_path to ''
as $$
  select not private.utente_solo_campo()
      or exists (select 1 from public.subappaltatori s
                 where s.id::text = p_ditta and s.company_id::text = p_azienda and s.user_id = auth.uid());
$$;

revoke all on function private.utente_solo_campo() from public, anon;
revoke all on function private.documenti_ditta_visibili(text, text) from public, anon;
grant execute on function private.utente_solo_campo() to authenticated;
grant execute on function private.documenti_ditta_visibili(text, text) to authenticated;

-- documenti_subappaltatore
drop policy if exists sub_company_4 on public.documenti_subappaltatore;
create policy sub_company_4 on public.documenti_subappaltatore for all to authenticated
  using (company_id = (select profiles.company_id from public.profiles where profiles.id = (select auth.uid()))
         and private.documenti_ditta_visibili(company_id::text, subappaltatore_id::text))
  with check (company_id = (select profiles.company_id from public.profiles where profiles.id = (select auth.uid()))
         and private.documenti_ditta_visibili(company_id::text, subappaltatore_id::text));

-- subappaltatori_documenti (fascicolo): lettura
drop policy if exists sub_docs_company_read on public.subappaltatori_documenti;
create policy sub_docs_company_read on public.subappaltatori_documenti for select to authenticated
  using (company_id = (select public.get_my_company_id())
         and private.documenti_ditta_visibili(company_id::text, subappaltatore_id::text));

-- bucket subappaltatori-documenti: percorso «azienda/ditta/file»
drop policy if exists subappaltatori_documenti_company_read on storage.objects;
create policy subappaltatori_documenti_company_read on storage.objects for select
  using (bucket_id = 'subappaltatori-documenti'
         and (storage.foldername(name))[1] in (select profiles.company_id::text from public.profiles where profiles.id = auth.uid()
                                               union select m.company_id::text from public.multi_company_access m where m.user_id = auth.uid())
         and private.documenti_ditta_visibili((storage.foldername(name))[1], (storage.foldername(name))[2]));

drop policy if exists subappaltatori_documenti_company_write on storage.objects;
create policy subappaltatori_documenti_company_write on storage.objects for insert
  with check (bucket_id = 'subappaltatori-documenti'
         and (storage.foldername(name))[1] in (select profiles.company_id::text from public.profiles where profiles.id = auth.uid()
                                               union select m.company_id::text from public.multi_company_access m where m.user_id = auth.uid())
         and private.documenti_ditta_visibili((storage.foldername(name))[1], (storage.foldername(name))[2]));

drop policy if exists subappaltatori_documenti_company_update on storage.objects;
create policy subappaltatori_documenti_company_update on storage.objects for update
  using (bucket_id = 'subappaltatori-documenti'
         and (storage.foldername(name))[1] in (select profiles.company_id::text from public.profiles where profiles.id = auth.uid()
                                               union select m.company_id::text from public.multi_company_access m where m.user_id = auth.uid())
         and private.documenti_ditta_visibili((storage.foldername(name))[1], (storage.foldername(name))[2]))
  with check (bucket_id = 'subappaltatori-documenti'
         and (storage.foldername(name))[1] in (select profiles.company_id::text from public.profiles where profiles.id = auth.uid()
                                               union select m.company_id::text from public.multi_company_access m where m.user_id = auth.uid())
         and private.documenti_ditta_visibili((storage.foldername(name))[1], (storage.foldername(name))[2]));

drop policy if exists subappaltatori_documenti_company_delete on storage.objects;
create policy subappaltatori_documenti_company_delete on storage.objects for delete
  using (bucket_id = 'subappaltatori-documenti'
         and (storage.foldername(name))[1] in (select profiles.company_id::text from public.profiles where profiles.id = auth.uid()
                                               union select m.company_id::text from public.multi_company_access m where m.user_id = auth.uid())
         and private.documenti_ditta_visibili((storage.foldername(name))[1], (storage.foldername(name))[2]));
