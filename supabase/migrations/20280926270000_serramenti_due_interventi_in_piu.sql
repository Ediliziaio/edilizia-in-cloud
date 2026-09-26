-- Serramenti: due modelli in più nel preventivatore (Lotto 9): portoni per garage
-- e grate/inferriate. Il vincolo del modello congelato (sr_progetti) aggiunge i due
-- id ai sette già presenti. Stesso corpo di 20280925232500; l'elenco si allunga,
-- non si accorcia.

set local lock_timeout = '3s';
set local statement_timeout = '60s';

alter table public.sr_progetti drop constraint if exists sr_quote_model_snapshot_valid;
alter table public.sr_progetti add constraint sr_quote_model_snapshot_valid check (
  modello_snapshot is null or coalesce((
    jsonb_typeof(modello_snapshot) = 'object'
    and modello_snapshot ->> 'version' = '1'
    and modello_snapshot ->> 'modelId' in ('finestre', 'persiane', 'avvolgibili', 'zanzariere', 'porte-ingresso', 'porte-interne', 'combinato', 'portoni-garage', 'grate')
    and modello_snapshot ->> 'companyId' = company_id::text
    and modello_snapshot #>> '{template,company_id}' = company_id::text
    and modello_snapshot #>> '{template,pdf_blocchi,modulo_intervento}' = modello_snapshot ->> 'modelId'
    and jsonb_typeof(modello_snapshot -> 'template') = 'object'
    and jsonb_typeof(modello_snapshot #> '{template,pdf_pages_order}') = 'array'
    and length(modello_snapshot #>> '{template,pdf_cover_hero}') > 0
    and octet_length(modello_snapshot::text) <= 8388608
  ), false)
);
