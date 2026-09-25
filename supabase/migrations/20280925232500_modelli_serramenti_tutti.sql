-- Serramenti: tutti e sette i modelli della libreria aprono il preventivatore
-- (25/09/2026).
--
-- Fino a oggi solo finestre, persiane e intervento combinato potevano stare in un
-- preventivo (sr_quote_model_snapshot_valid, migrazione 20260924125854); avvolgibili,
-- zanzariere, porte d'ingresso e porte interne restavano «Collegamento in
-- preparazione». Il documento Serramenti è lo stesso per tutti i modelli, e il
-- modello decide i testi, non i prodotti: dal preventivo si aggiunge sempre tutto
-- il listino dell'area (src/lib/serramenti/modelCatalog.ts suggerisce, non limita).
-- Cambia solo l'elenco dei modelli ammessi; il resto del vincolo resta identico.

set local lock_timeout = '3s';
set local statement_timeout = '60s';

alter table public.sr_progetti drop constraint if exists sr_quote_model_snapshot_valid;
alter table public.sr_progetti add constraint sr_quote_model_snapshot_valid check (
  modello_snapshot is null or coalesce((
    jsonb_typeof(modello_snapshot) = 'object'
    and modello_snapshot ->> 'version' = '1'
    and modello_snapshot ->> 'modelId' in ('finestre', 'persiane', 'avvolgibili', 'zanzariere', 'porte-ingresso', 'porte-interne', 'combinato')
    and modello_snapshot ->> 'companyId' = company_id::text
    and modello_snapshot #>> '{template,company_id}' = company_id::text
    and modello_snapshot #>> '{template,pdf_blocchi,modulo_intervento}' = modello_snapshot ->> 'modelId'
    and jsonb_typeof(modello_snapshot -> 'template') = 'object'
    and jsonb_typeof(modello_snapshot #> '{template,pdf_pages_order}') = 'array'
    and length(modello_snapshot #>> '{template,pdf_cover_hero}') > 0
    and octet_length(modello_snapshot::text) <= 8388608
  ), false)
);
