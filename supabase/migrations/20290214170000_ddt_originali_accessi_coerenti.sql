-- Scheda e file applicano lo stesso blocco. Un JWT ancora valido non autorizza
-- un account sospeso o cliente esterno a leggere/caricare gli originali DDT.
alter policy ddt_originali_carica on storage.objects with check (
 bucket_id='ddt-documenti'
 and not (select public.utente_bloccato())
 and not (select public.utente_e_cliente_esterno())
 and (storage.foldername(name))[2]=(select auth.uid())::text
 and (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
 and public.user_can_access_company(((storage.foldername(name))[1])::uuid)
);
alter policy ddt_originali_leggi on storage.objects using (
 bucket_id='ddt-documenti'
 and not (select public.utente_bloccato())
 and not (select public.utente_e_cliente_esterno())
 and (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
 and public.user_can_access_company(((storage.foldername(name))[1])::uuid)
 and ((storage.foldername(name))[2]=(select auth.uid())::text
      or public.campo_e_ufficio(((storage.foldername(name))[1])::uuid)
      or public.e_super_admin_dentro(((storage.foldername(name))[1])::uuid))
);
