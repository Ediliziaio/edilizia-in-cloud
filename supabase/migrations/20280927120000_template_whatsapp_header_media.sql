-- Template WhatsApp completi: header con foto/video/PDF e bottoni (27/09/2026).
--
-- Finora si potevano creare solo template con testo (intestazione, corpo, piè).
-- Meta permette anche l'intestazione con un'immagine, un video o un documento
-- (PDF) e i bottoni (risposta rapida, link a un sito, chiama). I bottoni stanno
-- già in components_json; per l'intestazione media serve sapere, all'INVIO, il
-- formato e il file da allegare ogni volta (Meta all'invio vuole il link del
-- media, non l'esempio usato in creazione). Qui le due colonne, e un bucket
-- pubblico dove teniamo il file di esempio (serve come link agli invii).
--
-- L'audio NON esiste come intestazione di template su WhatsApp: si manda solo
-- nei messaggi liberi, mai in un modello. Quindi niente audio qui.

set local lock_timeout = '3s';
set local statement_timeout = '60s';

alter table public.wa_meta_templates
  add column if not exists header_format text,
  add column if not exists header_media_url text;

comment on column public.wa_meta_templates.header_format is
  'Formato dell''intestazione: TEXT, IMAGE, VIDEO, DOCUMENT (o null se senza intestazione).';
comment on column public.wa_meta_templates.header_media_url is
  'Link pubblico del file dell''intestazione (foto/video/PDF): lo allega ogni invio del modello.';

-- Bucket pubblico dei media dei template: il link deve essere raggiungibile da
-- Meta a ogni invio. Solo il server (service_role) ci scrive; chiunque legge il
-- file col link (è materiale che finisce comunque nei messaggi ai clienti).
insert into storage.buckets (id, name, public, file_size_limit)
values ('whatsapp-template-media', 'whatsapp-template-media', true, 16777216)
on conflict (id) do update set public = true, file_size_limit = 16777216;
