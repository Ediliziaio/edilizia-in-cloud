-- Il preventivo con computo esce da Demo Azienda 2 (29/10/2026): le bozze nel
-- gestionale e i loro allegati valgono per ogni azienda, con le stesse regole
-- di prima. Legge chi vede i preventivi (e vede quelli di quel collega), scrive
-- chi li modifica; il super admin vede tutto. L'azienda è quella della riga,
-- controllata con `aziende_con_permesso`: nessun identificativo scritto qui.

alter table public.computo_preventivo_drafts drop constraint if exists computo_demo2_only;

drop policy if exists computo_drafts_read on public.computo_preventivo_drafts;
create policy computo_drafts_read on public.computo_preventivo_drafts for select to authenticated using (
  not (select public.utente_bloccato()) and
  ((select public.has_role(auth.uid(), 'super_admin')) or
   (company_id in (select unnest(public.aziende_con_permesso('can_view_preventivi'))) and public.check_staff_visibility(auth.uid(), created_by)))
);
drop policy if exists computo_drafts_insert on public.computo_preventivo_drafts;
create policy computo_drafts_insert on public.computo_preventivo_drafts for insert to authenticated with check (
  created_by = (select auth.uid()) and not (select public.utente_bloccato()) and
  ((select public.has_role(auth.uid(), 'super_admin')) or company_id in (select unnest(public.aziende_con_permesso('can_edit_preventivi'))))
);
drop policy if exists computo_drafts_update on public.computo_preventivo_drafts;
create policy computo_drafts_update on public.computo_preventivo_drafts for update to authenticated using (
  not (select public.utente_bloccato()) and
  ((select public.has_role(auth.uid(), 'super_admin')) or
   (company_id in (select unnest(public.aziende_con_permesso('can_edit_preventivi'))) and public.check_staff_visibility(auth.uid(), created_by)))
) with check (
  not (select public.utente_bloccato()) and
  ((select public.has_role(auth.uid(), 'super_admin')) or company_id in (select unnest(public.aziende_con_permesso('can_edit_preventivi'))))
);

-- Allegati: la prima cartella è l'azienda, e deve essere una in cui chi carica può modificare i preventivi.
drop policy if exists computo_files_insert on storage.objects;
create policy computo_files_insert on storage.objects for insert to authenticated with check (
  bucket_id = 'quote-materials' and name ~ '^[0-9a-f-]{36}/computo-preventivi/[0-9a-f-]{36}/[0-9a-f-]{36}$'
  and not (select public.utente_bloccato()) and
  ((select public.has_role(auth.uid(), 'super_admin')) or (storage.foldername(name))[1] in (select unnest(public.aziende_con_permesso('can_edit_preventivi'))::text))
);
drop policy if exists computo_files_insert_guard on storage.objects;
create policy computo_files_insert_guard on storage.objects as restrictive for insert to authenticated with check (
  not (bucket_id = 'quote-materials' and (storage.foldername(name))[2] = 'computo-preventivi') or
  (name ~ '^[0-9a-f-]{36}/computo-preventivi/[0-9a-f-]{36}/[0-9a-f-]{36}$'
   and not (select public.utente_bloccato()) and
   ((select public.has_role(auth.uid(), 'super_admin')) or (storage.foldername(name))[1] in (select unnest(public.aziende_con_permesso('can_edit_preventivi'))::text)))
);
