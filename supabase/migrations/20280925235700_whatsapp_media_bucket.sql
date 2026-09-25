-- Foto e vocali arrivati su WhatsApp (25/09/2026).
--
-- Il bot operativo (whatsapp-ai-processor) doveva scaricare da Meta le foto
-- (DDT, cantiere) e i vocali (rapportini) e salvarli nel bucket
-- «whatsapp-media», ma il bucket non esisteva e nessuno chiamava lo
-- scaricamento: la foto del DDT arrivava all'analisi come «wa-media://…»
-- (illeggibile) e il vocale come messaggio vuoto.
--
-- Bucket privato: le foto dei DDT e le voci degli operai non si aprono con un
-- link pubblico. Scrive solo il server (service_role); leggono gli utenti
-- dell'azienda, cartella = id azienda ({company_id}/{yyyy-mm}/{uuid}.ext).

set local lock_timeout = '3s';
set local statement_timeout = '60s';

insert into storage.buckets (id, name, public, file_size_limit)
values ('whatsapp-media', 'whatsapp-media', false, 26214400)
on conflict (id) do update set public = false;

drop policy if exists whatsapp_media_lettura_azienda on storage.objects;
create policy whatsapp_media_lettura_azienda on storage.objects
  for select to authenticated
  using (
    bucket_id = 'whatsapp-media'
    and (storage.foldername(name))[1] = (select public.get_my_company_id())::text
  );
