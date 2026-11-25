-- File delle planimetrie (bucket «planimetrie»): l'azienda è quella scelta, come per le tabelle
-- (25/11/2026, seguito di 20290601120000_planimetrie_azienda_scelta).
--
-- Quella migrazione ha portato planimetrie, planimetrie_versioni e planimetrie_file su
-- `get_my_company_id()`, ma le regole del bucket guardavano ancora l'azienda del profilo. Il
-- superadmin che sta visualizzando un'azienda, o chi lavora in più aziende, apriva la pianta ma
-- al salvataggio di un DWG la tavola da ricalcare non si caricava («L'immagine non si è
-- caricata: riprova»): la cartella `<azienda>/ricalco/` non era la sua. Ora la cartella deve
-- essere quella dell'azienda scelta; il resto delle condizioni non cambia.
--
-- Breve e con lock_timeout: ALTER POLICY tiene bloccato auth finché non finisce
-- (memoria feedback-policy-bloccano-auth-supautils).
set local lock_timeout = '3s';
set local statement_timeout = '30s';

alter policy planimetrie_file_storage_carica on storage.objects
  with check (bucket_id = 'planimetrie' and not (select public.utente_bloccato())
    and not (select public.utente_e_cliente_esterno())
    and (storage.foldername(name))[1] = (select public.get_my_company_id())::text
    and not public.utente_sola_lettura((select public.get_my_company_id())));

alter policy planimetrie_file_storage_legge on storage.objects
  using (bucket_id = 'planimetrie' and not (select public.utente_bloccato())
    and not (select public.utente_e_cliente_esterno())
    and (storage.foldername(name))[1] = (select public.get_my_company_id())::text);

alter policy planimetrie_file_storage_toglie on storage.objects
  using (bucket_id = 'planimetrie' and not (select public.utente_bloccato())
    and not (select public.utente_e_cliente_esterno())
    and (storage.foldername(name))[1] = (select public.get_my_company_id())::text
    and not public.utente_sola_lettura((select public.get_my_company_id())));
