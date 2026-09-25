-- Prepared locally, NOT deployed. Review migration order and existing public-read
-- policies before rollout. Existing quotes retain null and their current behavior.
alter table public.tet_progetti add column if not exists modello_snapshot jsonb;
alter table public.tet_progetti add constraint tet_quote_model_snapshot_valid check (
  modello_snapshot is null or coalesce((
    jsonb_typeof(modello_snapshot) = 'object'
    and modello_snapshot ->> 'version' = '1'
    and modello_snapshot ->> 'modelId' in ('rifacimento', 'ripasso', 'riparazioni', 'isolamento', 'impermeabilizzazione', 'lattoneria')
    and modello_snapshot ->> 'companyId' = company_id::text
    and modello_snapshot #>> '{template,company_id}' = company_id::text
    and modello_snapshot #>> '{template,pdf_blocchi,modulo_intervento}' = modello_snapshot ->> 'modelId'
    and jsonb_typeof(modello_snapshot #> '{template,pdf_ordine_capitoli}') = 'array'
    and length(modello_snapshot #>> '{template,cover_title}') > 0
    and octet_length(modello_snapshot::text) <= 8388608
  ), false)
);
comment on column public.tet_progetti.modello_snapshot is
  'Document model captured with the quote. No pricing rows or preview clients. Null for legacy quotes.';
create function public.tet_preserve_quote_model_snapshot()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if new.modello_snapshot is distinct from old.modello_snapshot then
    raise exception 'Il modello del preventivo non può essere sostituito. Crea una nuova offerta.';
  end if;
  return new;
end;
$$;
revoke all on function public.tet_preserve_quote_model_snapshot() from public, anon, authenticated;
create trigger tet_preserve_quote_model_snapshot before update of modello_snapshot
on public.tet_progetti for each row execute function public.tet_preserve_quote_model_snapshot();
