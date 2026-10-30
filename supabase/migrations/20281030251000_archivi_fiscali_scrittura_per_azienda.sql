-- Archivi fiscali: si scrive solo nella cartella della propria azienda (30/10/2026).
--
-- «Service role can insert docs» e «… xml» erano concesse ad authenticated senza
-- filtro sulla cartella: qualunque utente con un login, di qualunque azienda,
-- poteva caricare file nella cartella di un'altra azienda in documenti-fiscali e
-- fatture-xml. Il service role non ha bisogno di policy (la RLS non lo ferma).
-- La lettura era già per azienda (get_my_company_id(), che ai clienti del portale
-- non restituisce l'azienda: provato, cliente 0 file, amministratore 330).
--
-- documenti-fiscali: dal browser si salva il PDF del DDT (useShipmentDDTPDF,
--   upsert) → caricare e aggiornare nella propria cartella. L'aggiornamento
--   mancava: risalvare un DDT già salvato falliva.
-- fatture-xml: dal browser si legge e basta; lo scrivono le funzioni del server.
set local lock_timeout = '3s';
set local statement_timeout = '60s';

drop policy if exists "Service role can insert docs" on storage.objects;
drop policy if exists "Service role can insert xml" on storage.objects;

drop policy if exists documenti_fiscali_carica_azienda on storage.objects;
create policy documenti_fiscali_carica_azienda on storage.objects for insert to authenticated
  with check (bucket_id = 'documenti-fiscali'
              and not (select public.utente_bloccato())
              and (storage.foldername(name))[1] = (select public.get_my_company_id())::text);

drop policy if exists documenti_fiscali_aggiorna_azienda on storage.objects;
create policy documenti_fiscali_aggiorna_azienda on storage.objects for update to authenticated
  using (bucket_id = 'documenti-fiscali'
         and not (select public.utente_bloccato())
         and (storage.foldername(name))[1] = (select public.get_my_company_id())::text)
  with check (bucket_id = 'documenti-fiscali'
              and (storage.foldername(name))[1] = (select public.get_my_company_id())::text);
