-- Fatture ricevute: quello che mancava leggendo i pagamenti di un archivio vero
-- (04/11/2026).
--   1. metodo_da_codice_mp non conosceva RID (MP09-11) e domiciliazioni (MP16-17):
--      davano un costo e una rata senza metodo. piano_pagamento_da_xml ne aveva una
--      copia sua: ora usa questa.
--   2. rate_pagamento_da_xml: chi scrive la DataRiferimentoTerminiPagamento senza
--      giorni (quasi sempre carta) restava «senza data». Senza
--      giorni, i termini sono zero: la data è quella.
--   3. fatture_ricevute_pagamento dice anche quante rate sono pagate, su quante:
--      una fattura a rate pagata a metà risultava semplicemente «da pagare».
-- Nessuna scrittura sui dati: solo funzioni e vista.

set local lock_timeout = '3s';
set local statement_timeout = '60s';

create or replace function public.metodo_da_codice_mp(p_mp text)
returns text
language sql
immutable
set search_path to ''
as $function$
  select case
           when p_mp in ('MP01', 'MP04')                                 then 'contanti'
           when p_mp in ('MP02', 'MP03')                                 then 'assegno'
           when p_mp = 'MP05'                                            then 'bonifico'
           when p_mp = 'MP08'                                            then 'carta'
           when p_mp = 'MP12'                                            then 'riba'
           when p_mp in ('MP09', 'MP10', 'MP11', 'MP16', 'MP17',
                         'MP19', 'MP20', 'MP21')                         then 'rid'
           else null
         end
$function$;

create or replace function public.rate_pagamento_da_xml(p_xml text, p_indice_corpo integer default 0)
returns jsonb
language plpgsql
stable
set search_path to ''
as $function$
declare
  v_testo  text;
  v_doc    xml;
  v_corpo  xml;
  v_rata   xml;
  v_out    jsonb := '[]'::jsonb;
  v_scad   text;
  v_giorni text;
  v_rif    text;
  v_imp    text;
  v_data   date;
  v_cond   text;
begin
  if p_xml is null or btrim(p_xml) = '' then
    return v_out;
  end if;
  v_testo := regexp_replace(p_xml, '^' || chr(65279), '');
  v_testo := regexp_replace(v_testo, '^\s*<\?xml[^>]*\?>', '');
  begin
    v_doc := xmlparse(document v_testo);
  exception when others then
    return v_out;
  end;

  v_corpo := (xpath('(//*[local-name()="FatturaElettronicaBody"])['
                    || (coalesce(p_indice_corpo, 0) + 1) || ']', v_doc))[1];
  if v_corpo is null then
    return v_out;
  end if;

  v_cond := nullif(btrim((xpath(
    'string(//*[local-name()="DatiPagamento"]/*[local-name()="CondizioniPagamento"])',
    v_corpo))[1]::text), '');

  for v_rata in
    select unnest(xpath('//*[local-name()="DettaglioPagamento"]', v_corpo))
  loop
    v_scad   := nullif(btrim((xpath('string(/*/*[local-name()="DataScadenzaPagamento"])', v_rata))[1]::text), '');
    v_giorni := nullif(btrim((xpath('string(/*/*[local-name()="GiorniTerminiPagamento"])', v_rata))[1]::text), '');
    v_rif    := nullif(btrim((xpath('string(/*/*[local-name()="DataRiferimentoTerminiPagamento"])', v_rata))[1]::text), '');
    v_imp    := nullif(btrim((xpath('string(/*/*[local-name()="ImportoPagamento"])', v_rata))[1]::text), '');

    v_data := null;
    if v_scad ~ '^\d{4}-\d{2}-\d{2}$' then
      v_data := v_scad::date;
    elsif v_rif ~ '^\d{4}-\d{2}-\d{2}$' and (v_giorni is null or v_giorni ~ '^\d{1,3}$') then
      v_data := v_rif::date + coalesce(v_giorni::int, 0);
    end if;

    v_out := v_out || jsonb_build_object(
      'scadenza',   v_data,
      'importo',    case when v_imp ~ '^-?\d+(\.\d+)?$' then v_imp::numeric end,
      'modalita',   nullif(btrim((xpath('string(/*/*[local-name()="ModalitaPagamento"])', v_rata))[1]::text), ''),
      'iban',       nullif(btrim((xpath('string(/*/*[local-name()="IBAN"])', v_rata))[1]::text), ''),
      'condizioni', v_cond
    );
  end loop;

  return v_out;
end
$function$;

create or replace function public.piano_pagamento_da_xml(p_xml text, p_indice_corpo integer, p_data_fattura date)
returns jsonb
language plpgsql
stable
set search_path to ''
as $function$
declare
  v_rate     jsonb := public.rate_pagamento_da_xml(p_xml, p_indice_corpo);
  v_prima    date;
  v_mp       text;
  v_metodo   text;
  v_scadenza date;
  v_nota     text;
begin
  select min((e->>'scadenza')::date) into v_prima
    from jsonb_array_elements(v_rate) e
   where e->>'scadenza' is not null;

  v_mp := v_rate->0->>'modalita';
  v_metodo := public.metodo_da_codice_mp(v_mp);

  v_scadenza := case
    when v_prima is not null then v_prima
    when v_mp in ('MP01', 'MP08') then p_data_fattura
    else date '9999-12-31'
  end;

  if jsonb_array_length(v_rate) > 1 then
    select ' · Rate dall''XML: ' || string_agg(
             coalesce(to_char((e->>'scadenza')::date, 'DD/MM/YYYY'), 'senza data')
             || coalesce(' ' || replace(to_char((e->>'importo')::numeric, 'FM999999990.00'), '.', ',') || ' €', '')
             || coalesce(' ' || nullif(e->>'modalita', ''), ''),
             ' · ' order by (e->>'scadenza')::date nulls last)
      into v_nota
      from jsonb_array_elements(v_rate) e;
  end if;

  return jsonb_build_object(
    'scadenza', v_scadenza,
    'metodo',   v_metodo,
    'nota',     v_nota,
    'rate',     jsonb_array_length(v_rate)
  );
end
$function$;

create or replace view public.fatture_ricevute_pagamento
with (security_invoker = true) as
select
  f.id,
  f.company_id,
  coalesce(f.pagata_il, case when r.n > 0 and r.aperte = 0 then r.ultima end) as pagata_il,
  coalesce(r.n, 0)::integer as rate_totali,
  coalesce(r.n - r.aperte, 0)::integer as rate_pagate
from public.fatture_ricevute f
left join lateral (
  select count(*) as n,
         count(*) filter (where rf.stato <> 'pagata') as aperte,
         max(rf.pagata_il) as ultima
  from public.rate_fornitori rf
  where rf.fattura_ricevuta_id = f.id
) r on true;

revoke all on public.fatture_ricevute_pagamento from public, anon;
grant select on public.fatture_ricevute_pagamento to authenticated, service_role;
