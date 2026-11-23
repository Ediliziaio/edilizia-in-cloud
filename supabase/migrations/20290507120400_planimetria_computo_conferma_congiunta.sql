-- Conferma la modifica al disegno e alle misure della stessa bozza, in una transazione.
-- I costi riservati e gli allegati già caricati restano nelle rispettive tabelle.
create or replace function public.planimetria_computo_conferma(
  p_company_id uuid,
  p_planimetria_id uuid,
  p_versione_attesa integer,
  p_documento jsonb,
  p_quantita jsonb,
  p_bozza_id uuid,
  p_revisione_attesa bigint,
  p_payload jsonb,
  p_totale numeric
)
returns table(versione integer, revisione bigint, aggiornato_il timestamptz)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_origine jsonb;
  v_nuova_origine jsonb := p_payload -> 'piantaOrigine';
  v_versione integer;
begin
  if p_versione_attesa is null or p_versione_attesa < 1 or
     p_revisione_attesa is null or p_revisione_attesa < 1 or
     jsonb_typeof(p_payload -> 'voci') is distinct from 'array' or
     v_nuova_origine ->> 'id' is distinct from p_planimetria_id::text or
     v_nuova_origine ->> 'versione' is distinct from (p_versione_attesa + 1)::text then
    raise exception using errcode = '22023', message = 'Versioni o collegamento del computo non validi.';
  end if;

  select d.payload -> 'piantaOrigine' into v_origine
    from public.computo_preventivo_drafts d
   where d.id = p_bozza_id and d.company_id = p_company_id and d.revision = p_revisione_attesa
   for update;
  if not found then
    raise exception using errcode = 'PT409', message = 'La bozza è cambiata o non è modificabile.';
  end if;
  if v_origine ->> 'id' is distinct from p_planimetria_id::text or
     v_origine ->> 'livelloId' is distinct from v_nuova_origine ->> 'livelloId' or
     v_origine ->> 'propostaId' is distinct from v_nuova_origine ->> 'propostaId' then
    raise exception using errcode = 'PT409', message = 'Il collegamento della bozza è cambiato.';
  end if;
  if not exists (select 1 from public.planimetrie p where p.id = p_planimetria_id and p.company_id = p_company_id and p.deleted_at is null) then
    raise exception using errcode = 'P0002', message = 'Planimetria non disponibile per questa azienda.';
  end if;

  if jsonb_typeof(p_documento -> 'livelli') is distinct from 'array' then
    raise exception using errcode = '22023', message = 'Livelli della planimetria non validi.';
  end if;
  if not exists (
    select 1 from jsonb_array_elements(p_documento -> 'livelli') l
     where l ->> 'id' = v_origine ->> 'livelloId'
       and (v_origine ->> 'propostaId' is null or exists (
         select 1 from jsonb_array_elements(l -> 'proposte') p
          where p ->> 'id' = v_origine ->> 'propostaId'
       ))
  ) then
    raise exception using errcode = '22023', message = 'Il livello o la variante collegata non sono presenti.';
  end if;

  v_versione := public.planimetria_salva_versione(
    p_planimetria_id, p_documento, p_quantita, 'manuale', null, p_versione_attesa
  );
  return query
    update public.computo_preventivo_drafts d
       set payload = p_payload, total = p_totale, revision = d.revision + 1
     where d.id = p_bozza_id and d.company_id = p_company_id and d.revision = p_revisione_attesa
    returning v_versione, d.revision, d.updated_at;
  if not found then
    raise exception using errcode = 'PT409', message = 'La bozza è cambiata o non è modificabile.';
  end if;
end;
$$;

revoke all on function public.planimetria_computo_conferma(uuid, uuid, integer, jsonb, jsonb, uuid, bigint, jsonb, numeric) from public, anon;
grant execute on function public.planimetria_computo_conferma(uuid, uuid, integer, jsonb, jsonb, uuid, bigint, jsonb, numeric) to authenticated;
