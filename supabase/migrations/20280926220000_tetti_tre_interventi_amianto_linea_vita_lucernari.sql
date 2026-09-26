-- Tetti: tre interventi in più nel preventivatore (Lotto 5): bonifica amianto,
-- linea vita e lucernari. Il vincolo del modello congelato (tet_progetti) aggiunge
-- i tre id ai sei già presenti: ogni preventivo tetti già valido resta valido.
-- Stesso corpo di 20260924134009; l'elenco si allunga, non si accorcia. Il trigger
-- tet_preserve_quote_model_snapshot resta.

set local lock_timeout = '3s';
set local statement_timeout = '60s';

alter table public.tet_progetti drop constraint if exists tet_quote_model_snapshot_valid;
alter table public.tet_progetti add constraint tet_quote_model_snapshot_valid check (
  modello_snapshot is null or coalesce((
    jsonb_typeof(modello_snapshot) = 'object'
    and modello_snapshot ->> 'version' = '1'
    and modello_snapshot ->> 'modelId' in ('rifacimento', 'ripasso', 'riparazioni', 'isolamento', 'impermeabilizzazione', 'lattoneria', 'amianto', 'linea-vita', 'lucernari')
    and modello_snapshot ->> 'companyId' = company_id::text
    and modello_snapshot #>> '{template,company_id}' = company_id::text
    and modello_snapshot #>> '{template,pdf_blocchi,modulo_intervento}' = modello_snapshot ->> 'modelId'
    and jsonb_typeof(modello_snapshot #> '{template,pdf_ordine_capitoli}') = 'array'
    and length(modello_snapshot #>> '{template,cover_title}') > 0
    and octet_length(modello_snapshot::text) <= 8388608
  ), false)
);

do $$
begin
  if not exists (select 1 from pg_trigger g where g.tgrelid = 'public.tet_progetti'::regclass and g.tgname = 'tet_preserve_quote_model_snapshot') then
    raise exception 'tet_progetti: manca il trigger tet_preserve_quote_model_snapshot';
  end if;
end;
$$;
