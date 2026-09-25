-- LOCAL PREPARATION ONLY. Review the deployment order (this checkout contains
-- future-dated migrations) and existing sr_progetti public-read policies before rollout.
-- No backfill: legacy quotes keep their existing document behavior.
alter table public.sr_progetti
  add column if not exists modello_snapshot jsonb;

alter table public.sr_progetti
  add constraint sr_quote_model_snapshot_valid check (
    modello_snapshot is null or coalesce((
      jsonb_typeof(modello_snapshot) = 'object'
      and modello_snapshot ->> 'version' = '1'
      and modello_snapshot ->> 'modelId' in ('finestre', 'persiane', 'combinato')
      and modello_snapshot ->> 'companyId' = company_id::text
      and modello_snapshot #>> '{template,company_id}' = company_id::text
      and modello_snapshot #>> '{template,pdf_blocchi,modulo_intervento}' = modello_snapshot ->> 'modelId'
      and jsonb_typeof(modello_snapshot -> 'template') = 'object'
      and jsonb_typeof(modello_snapshot #> '{template,pdf_pages_order}') = 'array'
      and length(modello_snapshot #>> '{template,pdf_cover_hero}') > 0
      and octet_length(modello_snapshot::text) <= 8388608
    ), false)
  );

-- The snapshot is document content, never prices, cost data or internal notes.
-- No new grants/policies: existing tenant/role checks on sr_progetti still apply.
comment on column public.sr_progetti.modello_snapshot is
  'Immutable document model captured with the quote; null for legacy quotes. Schema v1. Not an editor or pricing archive.';

create function public.sr_preserve_quote_model_snapshot()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.modello_snapshot is distinct from old.modello_snapshot then
    raise exception 'Il modello di un preventivo salvato non può essere sostituito. Crea una nuova offerta.';
  end if;
  return new;
end;
$$;
revoke all on function public.sr_preserve_quote_model_snapshot() from public, anon, authenticated;
create trigger sr_preserve_quote_model_snapshot
before update of modello_snapshot on public.sr_progetti
for each row execute function public.sr_preserve_quote_model_snapshot();
