-- Firma elettronica: livello scelto dall'azienda.
--
-- 'avanzata' (predefinito): al primo documento chi firma si identifica con un
-- documento di riconoscimento e accetta le condizioni del servizio (DPCM
-- 22/02/2013 art. 57 c.1 a); il certificato dice «firma elettronica avanzata».
-- 'semplice': si firma col solo codice via email/SMS, come prima del 22/10/2026;
-- il certificato dice «firma elettronica semplice», senza promettere di più.
-- Senza riga in fea_configurazione vale 'semplice' (predefinito cambiato in
-- 20281022180500: la firma avanzata la accende l'azienda).
alter table public.fea_configurazione
  add column if not exists livello_firma text not null default 'avanzata';
alter table public.fea_configurazione drop constraint if exists fea_configurazione_livello_firma_check;
alter table public.fea_configurazione add constraint fea_configurazione_livello_firma_check
  check (livello_firma in ('avanzata', 'semplice'));

-- Il livello vale per la singola richiesta, fissato all'invio: cambiare
-- l'impostazione dopo non cambia ciò che un documento già inviato promette.
alter table public.signature_requests
  add column if not exists livello_firma text not null default 'semplice';
alter table public.signature_requests drop constraint if exists signature_requests_livello_firma_check;
alter table public.signature_requests add constraint signature_requests_livello_firma_check
  check (livello_firma in ('avanzata', 'semplice'));
grant select (livello_firma) on public.signature_requests to authenticated;
