-- Archivi fiscali: i clienti del portale non scrivono (30/10/2026).
--
-- 20281030251000 legava la scrittura in documenti-fiscali alla cartella di
-- get_my_company_id(), che ai clienti del portale restituisce l'azienda: un
-- cliente avrebbe potuto caricare file nella cartella fiscale della sua impresa.
-- (La lettura resta chiusa ai clienti perché passa da companies, che a loro non
-- mostra la riga dell'azienda.) Qui il ruolo cliente è escluso in chiaro.
set local lock_timeout = '3s';
set local statement_timeout = '60s';

drop policy if exists documenti_fiscali_carica_azienda on storage.objects;
create policy documenti_fiscali_carica_azienda on storage.objects for insert to authenticated
  with check (bucket_id = 'documenti-fiscali'
              and not (select public.utente_bloccato())
              and not (select public.has_role(auth.uid(), 'customer'::public.app_role))
              and (storage.foldername(name))[1] = (select public.get_my_company_id())::text);

drop policy if exists documenti_fiscali_aggiorna_azienda on storage.objects;
create policy documenti_fiscali_aggiorna_azienda on storage.objects for update to authenticated
  using (bucket_id = 'documenti-fiscali'
         and not (select public.utente_bloccato())
         and not (select public.has_role(auth.uid(), 'customer'::public.app_role))
         and (storage.foldername(name))[1] = (select public.get_my_company_id())::text)
  with check (bucket_id = 'documenti-fiscali'
              and (storage.foldername(name))[1] = (select public.get_my_company_id())::text);
