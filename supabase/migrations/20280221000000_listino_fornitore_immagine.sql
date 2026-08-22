-- Foto prodotto sulle voci di listino fornitore.
--
-- Un listino di accumuli senza immagini è una lista di codici: chi prepara un
-- preventivo deve andare a cercare su Google che aspetto ha un SMILE-G3-T10.
--
-- Le immagini si COPIANO nel nostro bucket (article-images, pubblico), non si
-- linkano al sito del produttore: il link diretto si rompe appena loro
-- riorganizzano i file, e succede — le schede AlphaESS del 2024 stanno già in
-- una cartella diversa da quelle del 2026.
alter table public.listino_fornitore_voci
  add column if not exists immagine_url text;

comment on column public.listino_fornitore_voci.immagine_url is
  'Foto prodotto (bucket article-images). Copiata dal sito del fornitore e ospitata da noi: '
  'il link diretto al sito del produttore si rompe appena loro riorganizzano i file.';
