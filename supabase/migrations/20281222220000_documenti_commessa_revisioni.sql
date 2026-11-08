-- Documenti di commessa con revisioni: tavole, computo, specifiche.
--
-- Quarto passo del piano docs/piano-fabbisogno-acquisti-da-progetto.md. I
-- documenti della commessa (order_attachments) avevano solo le cartelle: niente
-- tipo, niente revisione, niente «approvato». La richiesta del cliente: per ogni
-- commessa le tavole esecutive, il computo e le specifiche tecniche, con le
-- revisioni e il documento approvato riconoscibile.
--
--   * tipo_documento (tavola, computo, specifica, relazione, contratto, altro),
--     codice_elaborato (es. «A-01»), revisione (es. «B», «02»), stato_revisione
--     (in_lavorazione, approvato, superato), chi l'ha approvato e quando, e
--     quale documento sostituisce. Tutto facoltativo: i 3.355 documenti di oggi
--     restano come sono.
--   * documento_commessa_revisione(...): scrive questi dati. Approvando una
--     revisione, le altre approvate con lo stesso codice nella stessa commessa
--     diventano «superato» e la nuova ricorda quale sostituisce: le vecchie
--     restano consultabili, ma si vede quale vale. Lo fa chi può modificare la
--     commessa.

set local lock_timeout = '3s';

alter table public.order_attachments
  add column if not exists tipo_documento text,
  add column if not exists codice_elaborato text,
  add column if not exists revisione text,
  add column if not exists stato_revisione text,
  add column if not exists approvato_da uuid references auth.users(id) on delete set null,
  add column if not exists approvato_il timestamptz,
  add column if not exists sostituisce_id uuid references public.order_attachments(id) on delete set null;

do $vincoli$
begin
  if not exists (select 1 from pg_constraint where conname = 'order_attachments_tipo_documento_check') then
    alter table public.order_attachments add constraint order_attachments_tipo_documento_check
      check (tipo_documento is null or tipo_documento in ('tavola', 'computo', 'specifica', 'relazione', 'contratto', 'altro'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'order_attachments_stato_revisione_check') then
    alter table public.order_attachments add constraint order_attachments_stato_revisione_check
      check (stato_revisione is null or stato_revisione in ('in_lavorazione', 'approvato', 'superato'));
  end if;
end
$vincoli$;

create index if not exists order_attachments_codice_idx
  on public.order_attachments (order_id, lower(codice_elaborato)) where codice_elaborato is not null;

comment on column public.order_attachments.stato_revisione is
  'in_lavorazione, approvato, superato (quando un''altra revisione dello stesso codice viene approvata). Si scrive con documento_commessa_revisione.';

create or replace function public.documento_commessa_revisione(
  p_id uuid, p_tipo text, p_codice text, p_revisione text, p_stato text)
 returns public.order_attachments
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  doc public.order_attachments;
  codice text := nullif(btrim(coalesce(p_codice, '')), '');
  precedente uuid;
begin
  if auth.uid() is null then
    raise exception 'Accesso richiesto' using errcode = '42501';
  end if;
  select a.* into doc from public.order_attachments a
    join public.orders o on o.id = a.order_id and o.deleted_at is null
   where a.id = p_id;
  if doc.id is null then
    raise exception 'Documento non trovato' using errcode = 'P0002';
  end if;
  if not public.puo_modificare_commessa(doc.order_id) then
    raise exception 'Le revisioni dei documenti le segna chi può modificare la commessa' using errcode = '42501';
  end if;
  if p_tipo is not null and p_tipo not in ('tavola', 'computo', 'specifica', 'relazione', 'contratto', 'altro') then
    raise exception 'Tipo di documento non previsto' using errcode = '22023';
  end if;
  if p_stato is not null and p_stato not in ('in_lavorazione', 'approvato', 'superato') then
    raise exception 'Stato della revisione non previsto' using errcode = '22023';
  end if;

  if p_stato = 'approvato' and codice is not null then
    -- La revisione approvata di prima con lo stesso codice: diventa superata.
    select a.id into precedente from public.order_attachments a
     where a.order_id = doc.order_id and a.id <> doc.id
       and lower(a.codice_elaborato) = lower(codice) and a.stato_revisione = 'approvato'
     order by a.approvato_il desc nulls last, a.created_at desc
     limit 1;
    update public.order_attachments a
       set stato_revisione = 'superato'
     where a.order_id = doc.order_id and a.id <> doc.id
       and lower(a.codice_elaborato) = lower(codice) and a.stato_revisione = 'approvato';
  end if;

  update public.order_attachments
     set tipo_documento = p_tipo,
         codice_elaborato = codice,
         revisione = nullif(btrim(coalesce(p_revisione, '')), ''),
         stato_revisione = p_stato,
         approvato_da = case when p_stato = 'approvato' then auth.uid() when p_stato is null or p_stato = 'in_lavorazione' then null else approvato_da end,
         approvato_il = case when p_stato = 'approvato' then now() when p_stato is null or p_stato = 'in_lavorazione' then null else approvato_il end,
         sostituisce_id = coalesce(precedente, case when p_stato = 'approvato' then sostituisce_id end)
   where id = doc.id
  returning * into doc;
  return doc;
end;
$function$;

revoke all on function public.documento_commessa_revisione(uuid, text, text, text, text) from public, anon;
grant execute on function public.documento_commessa_revisione(uuid, text, text, text, text) to authenticated, service_role;
