-- Allegati dei contatti marketing: il caricamento non era mai riuscito a nessuno.
--
-- Le policy del bucket `marketing-attachments` cercavano l'azienda in
-- auth.jwt() -> 'raw_app_meta_data' -> 'company_id': nel token quella chiave non
-- esiste (si chiama app_metadata, e comunque non porta company_id). Il confronto
-- era sempre falso: in tutto il bucket c'è un solo file, scritto dal lead
-- scraper con la service role. Il 16/09 Elena di Ener Italia ha provato a
-- caricare un PDF su un contatto e ha ricevuto un 400.
--
-- Il pannello documenti scrive in `<azienda>/<contatto>/<uuid>.<ext>`. Ora:
-- - carica e cancella chi può modificare i contatti di quell'azienda;
-- - legge chi può vederli;
-- - il super admin legge tutto (il lead scraper scrive in `openapi/…`).
--
-- Il bucket era anche pubblico: chiunque avesse il link apriva il documento.
-- Chi legge usa già URL firmati (MarketingDocumentsPanel, Contenuti
-- multimediali), quindi si chiude.

drop policy if exists ma_ins on storage.objects;
drop policy if exists ma_sel on storage.objects;
drop policy if exists ma_del on storage.objects;
drop policy if exists allegati_contatti_carica on storage.objects;
drop policy if exists allegati_contatti_leggi on storage.objects;
drop policy if exists allegati_contatti_cancella on storage.objects;

create policy allegati_contatti_carica on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'marketing-attachments'
    and (storage.foldername(name))[1] in (
      select unnest(public.aziende_con_permesso('can_edit_marketing_contacts'))::text
    )
  );

create policy allegati_contatti_leggi on storage.objects
  for select to authenticated
  using (
    bucket_id = 'marketing-attachments'
    and (
      (storage.foldername(name))[1] in (
        select unnest(public.aziende_con_permesso('can_view_marketing_contacts'))::text
      )
      or (select public.has_role((select auth.uid()), 'super_admin'::app_role))
    )
  );

create policy allegati_contatti_cancella on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'marketing-attachments'
    and (storage.foldername(name))[1] in (
      select unnest(public.aziende_con_permesso('can_edit_marketing_contacts'))::text
    )
  );

update storage.buckets set public = false where id = 'marketing-attachments';
