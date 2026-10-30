-- Hub fatture uguale per chi fattura con un gestionale esterno.
--
-- Un'azienda con billing_mode <> 'native' (Fatture in Cloud, Zucchetti, import XML…)
-- ha le emesse in `invoices`, non in `documenti_fiscali`: l'hub /azienda/documenti
-- le mostrava vuote. Qui:
--   1. `documenti_fiscali_elenco_con_importate`: le righe dell'elenco nativo più le
--      importate, con gli stessi nomi di colonna che l'elenco usa (numero, data,
--      cliente_snapshot, stato italiano, totale_da_pagare, elenco_scaduta…);
--   2. `clienti_fiscali_importati`: i clienti delle importate, uno per P.IVA/CF;
--   3. conteggi e striscia mensile dell'hub contano anche le importate, ma solo per
--      le aziende che non fatturano in nativo (per le native l'elenco non cambia).
-- Le viste sono security_invoker: valgono le policy di documenti_fiscali e invoices.

create or replace view public.documenti_fiscali_elenco_con_importate
with (security_invoker = true) as
select
  e.id, e.company_id, 'nativa'::text as origine, null::text as external_provider,
  e.tipo, e.numero, e.numero_progressivo, e.anno, e.serie,
  e.data_emissione, e.data_scadenza, e.anagrafica_id, e.cliente_snapshot, e.stato,
  e.sdi_id_trasmissione, e.sdi_stato, e.sdi_file_xml_url, e.trasmissione,
  e.imponibile_totale, e.iva_totale, e.totale_documento, e.totale_da_pagare,
  e.importo_pagato, e.pagato_at, e.documento_correlato_id, e.ddt_fattura_id,
  e.ddt_fatturato, e.note_documento, e.deleted_at, e.created_at, e.updated_at,
  e.elenco_cliente, e.elenco_scaduta, e.elenco_fase_sdi
from public.documenti_fiscali_elenco e
union all
select
  i.id, i.company_id, 'importata'::text, i.external_provider,
  x.tipo, i.invoice_number, x.progressivo, x.anno, null::text,
  i.issue_date, i.due_date, null::uuid,
  jsonb_strip_nulls(jsonb_build_object(
    'ragione_sociale', nullif(btrim(i.client_company_name), ''),
    'partita_iva', nullif(btrim(i.client_vat_number), ''),
    'codice_fiscale', nullif(btrim(i.client_fiscal_code), ''),
    'indirizzo', nullif(btrim(i.client_address), ''),
    'cap', nullif(btrim(i.client_zip), ''),
    'comune', nullif(btrim(i.client_city), ''),
    'pec', nullif(btrim(i.client_pec), ''),
    'codice_destinatario', nullif(btrim(i.client_sdi_code), '')
  )),
  x.stato,
  i.external_sdi_id, null::text, null::text, 'esterna'::text,
  coalesce(i.subtotal, 0), coalesce(i.tax_amount, 0), coalesce(i.total, 0), x.da_pagare,
  coalesce(i.paid_amount, 0), i.payment_date::timestamptz, i.credited_invoice_id, null::uuid,
  null::boolean, i.notes, i.deleted_at, i.created_at, i.updated_at,
  nullif(btrim(i.client_company_name), ''),
  coalesce(
    i.deleted_at is null
    and x.stato not in ('bozza', 'annullata', 'stornata', 'pagata')
    and x.tipo <> 'nota_credito'
    and i.due_date < (now() at time zone 'Europe/Rome')::date
    and round(x.da_pagare - coalesce(i.paid_amount, 0), 2) > 0,
    false),
  -- La fase SDI la segue il gestionale esterno: l'hub non la inventa.
  null::text
from public.invoices i
cross join lateral (
  select coalesce(sum(nc.total), 0) as stornato
  from public.invoices nc
  where nc.credited_invoice_id = i.id
    and nc.company_id = i.company_id
    and nc.deleted_at is null
    and nc.status not in ('cancelled', 'draft')
) s
cross join lateral (
  select
    case
      when i.document_type in ('credit_note', 'TD04', 'TD08') then 'nota_credito'
      when i.document_type = 'proforma' then 'proforma'
      when i.external_document_type = 'TD05' or i.document_type in ('debit_note', 'TD05') then 'nota_debito'
      else 'fattura'
    end as tipo,
    coalesce(i.invoice_year, extract(year from i.issue_date)::int) as anno,
    coalesce(
      i.progressive_number,
      nullif(substring(i.invoice_number from '(\d{1,9})\s*/\s*\d{2,4}\s*$'), '')::int,
      nullif(substring(i.invoice_number from '(\d{1,9})\s*$'), '')::int
    ) as progressivo,
    greatest(round(coalesce(i.total, 0) - s.stornato, 2), 0) as da_pagare,
    case
      when i.status = 'draft' then 'bozza'
      when i.status in ('cancelled', 'canceled', 'void', 'deleted') then 'annullata'
      when i.status = 'credited' then 'stornata'
      when i.document_type in ('credit_note', 'TD04', 'TD08') then 'emessa'
      when i.status = 'paid' then 'pagata'
      when coalesce(i.total, 0) > 0 and s.stornato >= coalesce(i.total, 0) - 0.005 then 'stornata'
      when coalesce(i.paid_amount, 0) > 0.005
        and coalesce(i.paid_amount, 0) >= greatest(coalesce(i.total, 0) - s.stornato, 0) - 0.005 then 'pagata'
      when coalesce(i.paid_amount, 0) > 0.005 then 'parzialmente_pagata'
      else 'emessa'
    end as stato
) x;

comment on view public.documenti_fiscali_elenco_con_importate is
  'Elenco dell''hub fatture: documenti nativi + fatture importate da un gestionale esterno (origine). Per le aziende che non fatturano in nativo.';

revoke all on public.documenti_fiscali_elenco_con_importate from public, anon;
grant select on public.documenti_fiscali_elenco_con_importate to authenticated, service_role;

-- Clienti fiscali di chi importa: uno per partita IVA, poi codice fiscale, poi nome.
create or replace view public.clienti_fiscali_importati
with (security_invoker = true) as
select
  i.company_id,
  k.chiave,
  max(nullif(btrim(i.client_company_name), '')) as ragione_sociale,
  max(nullif(upper(btrim(i.client_vat_number)), '')) as partita_iva,
  max(nullif(upper(btrim(i.client_fiscal_code)), '')) as codice_fiscale,
  max(nullif(btrim(i.client_city), '')) as comune,
  max(nullif(btrim(i.client_pec), '')) as pec,
  max(nullif(btrim(i.client_sdi_code), '')) as codice_destinatario,
  (array_agg(i.client_id order by i.issue_date desc) filter (where i.client_id is not null))[1] as client_id,
  count(*) filter (where i.document_type not in ('credit_note', 'TD04', 'TD08'))::int as fatture,
  count(*) filter (where i.document_type in ('credit_note', 'TD04', 'TD08'))::int as note_credito,
  round(sum(case when i.document_type in ('credit_note', 'TD04', 'TD08') then -coalesce(i.total, 0) else coalesce(i.total, 0) end), 2) as fatturato,
  round(sum(case when i.document_type in ('credit_note', 'TD04', 'TD08') or i.status in ('paid', 'credited') then 0
                 else greatest(coalesce(i.total, 0) - coalesce(i.paid_amount, 0), 0) end), 2) as residuo_lordo,
  max(i.issue_date) as ultima_fattura
from public.invoices i
cross join lateral (
  select coalesce(
    'piva:' || nullif(regexp_replace(upper(btrim(i.client_vat_number)), '^IT', ''), ''),
    'cf:' || nullif(upper(btrim(i.client_fiscal_code)), ''),
    'nome:' || nullif(lower(btrim(i.client_company_name)), ''),
    'senza-nome'
  ) as chiave
) k
where i.deleted_at is null
  and i.status not in ('draft', 'cancelled', 'canceled', 'void', 'deleted')
  and i.document_type <> 'proforma'
group by i.company_id, k.chiave;

comment on view public.clienti_fiscali_importati is
  'Clienti delle fatture importate da un gestionale esterno, per la scheda Clienti fiscali dell''hub.';

revoke all on public.clienti_fiscali_importati from public, anon;
grant select on public.clienti_fiscali_importati to authenticated, service_role;

-- Conteggi delle linguette: per chi non fattura in nativo contano anche le importate.
create or replace function public.get_documenti_counts(p_company_id uuid)
returns json
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_result json;
  v_esterna boolean;
begin
  perform public.assert_company_access(p_company_id);
  select coalesce(c.billing_mode, 'external') <> 'native' into v_esterna
  from public.companies c where c.id = p_company_id;

  if coalesce(v_esterna, false) then
    select json_build_object(
      'fatture',      count(*) filter (where tipo in ('fattura', 'fattura_pa') and stato <> 'annullata' and deleted_at is null),
      'proforma',     count(*) filter (where tipo = 'proforma' and stato <> 'annullata' and deleted_at is null),
      'nota_credito', count(*) filter (where tipo = 'nota_credito' and stato <> 'annullata' and deleted_at is null),
      'ddt',          count(*) filter (where tipo = 'ddt' and stato <> 'annullata' and deleted_at is null),
      'preventivo',   count(*) filter (where tipo = 'preventivo' and stato <> 'annullata' and deleted_at is null),
      'annullate',    count(*) filter (where stato = 'annullata'),
      'cestinati',    count(*) filter (where deleted_at is not null)
    ) into v_result
    from public.documenti_fiscali_elenco_con_importate
    where company_id = p_company_id;
    return v_result;
  end if;

  select json_build_object(
    -- I conteggi per tipo seguono la lista: niente cestinati
    'fatture',      count(*) filter (where tipo in ('fattura', 'fattura_pa') and stato != 'annullata' and deleted_at is null),
    'proforma',     count(*) filter (where tipo = 'proforma' and stato != 'annullata' and deleted_at is null),
    'nota_credito', count(*) filter (where tipo = 'nota_credito' and stato != 'annullata' and deleted_at is null),
    'ddt',          count(*) filter (where tipo = 'ddt' and stato != 'annullata' and deleted_at is null),
    'preventivo',   count(*) filter (where tipo = 'preventivo' and stato != 'annullata' and deleted_at is null),
    -- Stato fiscale 'annullata' (tenuto per compatibilita')
    'annullate',    count(*) filter (where stato = 'annullata'),
    -- Quello che c'e' davvero nel cestino: e' cio' che la scheda mostra
    'cestinati',    count(*) filter (where deleted_at is not null)
  ) into v_result
  from public.documenti_fiscali
  where company_id = p_company_id;

  return v_result;
end;
$function$;

-- Striscia dei mesi: stessa regola dei conteggi.
create or replace function public.get_documenti_monthly_timeline(p_company_id uuid, p_tipos text[] default null::text[])
returns json
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_result json;
  v_esterna boolean;
begin
  perform public.assert_company_access(p_company_id);
  select coalesce(c.billing_mode, 'external') <> 'native' into v_esterna
  from public.companies c where c.id = p_company_id;

  select json_agg(row_to_json(t)) into v_result
  from (
    select
      extract(year from data_emissione)::integer as year,
      extract(month from data_emissione)::integer as month,
      count(*)::integer as doc_count,
      coalesce(sum(totale_documento), 0)::numeric as total_amount
    from (
      select d.data_emissione, d.totale_documento, d.tipo, d.stato, d.deleted_at
      from public.documenti_fiscali d
      where d.company_id = p_company_id and not coalesce(v_esterna, false)
      union all
      select e.data_emissione, e.totale_documento, e.tipo, e.stato, e.deleted_at
      from public.documenti_fiscali_elenco_con_importate e
      where e.company_id = p_company_id and coalesce(v_esterna, false)
    ) d
    where stato != 'annullata'
      and deleted_at is null   -- la striscia conta cio' che la lista sa mostrare
      and (p_tipos is null or tipo = any(p_tipos))
      and data_emissione >= (date_trunc('month', now()) - interval '12 months')::date
      and data_emissione < (date_trunc('month', now()) + interval '4 months')::date
    group by 1, 2
    order by 1, 2
  ) t;

  return coalesce(v_result, '[]'::json);
end;
$function$;
