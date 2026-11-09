-- Listino da Excel e contratto firmato sulla scheda del committente (09/11/2026).
--
-- customer_documents.appalto_contratto_id: il file firmato sta sul suo contratto,
-- non sul mucchio dei documenti dell'impresa. Un contratto cancellato non si
-- porta via il file: la riga resta e torna fra i documenti dell'impresa.
--
-- appalto_listino_carica: tutte le voci insieme o nessuna, con le regole di
-- accesso di chi carica (SECURITY INVOKER). «Sostituisci» non cancella: spegne
-- le voci di prima, come fa già la pagina del contratto. Cancellarle si
-- porterebbe via le eccezioni di cantiere (appalto_tariffe_commessa, CASCADE) e
-- staccherebbe le righe di rendiconto dalla loro voce.

set local lock_timeout = '3s';
set local statement_timeout = '60s';

alter table public.customer_documents
  add column if not exists appalto_contratto_id uuid references public.appalto_contratti(id) on delete set null;

create index if not exists customer_documents_appalto_contratto_idx
  on public.customer_documents (appalto_contratto_id)
  where appalto_contratto_id is not null;

comment on column public.customer_documents.appalto_contratto_id is
  'Il contratto col committente a cui appartiene il file (per esempio la copia firmata).';

create or replace function public.appalto_listino_carica(p_contratto_id uuid, p_sostituisci boolean, p_righe jsonb)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_company uuid;
  v_ordine integer;
  v_inserite integer;
begin
  select company_id into v_company from public.appalto_contratti where id = p_contratto_id;
  if v_company is null then
    raise exception 'Contratto non trovato' using errcode = 'P0002';
  end if;
  if jsonb_typeof(p_righe) <> 'array' or jsonb_array_length(p_righe) = 0 or jsonb_array_length(p_righe) > 2000 then
    raise exception 'Le voci da caricare devono essere da 1 a 2000' using errcode = '22023';
  end if;

  if p_sostituisci then
    update public.appalto_tariffe t set attivo = false
     where t.contratto_id = p_contratto_id and t.attivo;
  end if;

  -- Il codice è unico nel contratto: una voce spenta non deve tenere occupato quello di una nuova.
  update public.appalto_tariffe t set codice = null
   where t.contratto_id = p_contratto_id and not t.attivo
     and t.codice in (select nullif(btrim(e->>'codice'), '') from jsonb_array_elements(p_righe) e);

  select coalesce(max(ordine) + 1, 0) into v_ordine from public.appalto_tariffe where contratto_id = p_contratto_id;

  insert into public.appalto_tariffe (company_id, contratto_id, tipo, codice, descrizione, unita_misura, prezzo_unitario, qualifica, note, ordine, attivo)
  select v_company, p_contratto_id, e.v->>'tipo', nullif(btrim(e.v->>'codice'), ''), btrim(e.v->>'descrizione'), e.v->>'unita_misura',
         (e.v->>'prezzo_unitario')::numeric, nullif(btrim(e.v->>'qualifica'), ''), nullif(btrim(e.v->>'note'), ''), v_ordine + e.n::integer - 1, true
    from jsonb_array_elements(p_righe) with ordinality as e(v, n);

  get diagnostics v_inserite = row_count;
  return v_inserite;
end
$$;

revoke all on function public.appalto_listino_carica(uuid, boolean, jsonb) from public, anon;
grant execute on function public.appalto_listino_carica(uuid, boolean, jsonb) to authenticated, service_role;
