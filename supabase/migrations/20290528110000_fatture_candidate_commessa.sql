-- Commessa → Fatture dei fornitori → «Collega fattura» (piano docs/piano-collega-fatture-ricevute-da-commessa-20261124.md, lotto 1).
-- Le fatture ricevute che si possono ancora assegnare a questa commessa, con in testa le probabili e il perché.
-- SECURITY INVOKER: valgono le regole di fatture_ricevute e company_costs di chi chiama.
--   punteggio: bolla della commessa 100, suggerita dall'AI 60 × confidenza, fornitore della commessa 40.
--   assegnata_pct: quanto della fattura è già su commesse (costo con order_id = 100, altrimenti somma delle quote
--   + magazzino); si nascondono quelle già tutte assegnate (salvo p_anche_assegnate) e quelle già su questa commessa.

-- La firma del risultato è cambiata durante lo sviluppo (company_cost_id): si ricrea.
drop function if exists public.fatture_candidate_commessa(uuid, text, int, boolean);

create or replace function public.fatture_candidate_commessa(
  p_order uuid,
  p_cerca text default null,
  p_limit int default 60,
  p_anche_assegnate boolean default false
)
returns table (
  id uuid, numero_fattura text, data_fattura date, fornitore text,
  imponibile numeric, totale numeric, tipo_documento text,
  assegnata_pct numeric, commesse_collegate text[],
  punteggio numeric, motivi text[], company_cost_id uuid, riferimenti text[]
)
language sql
stable
security invoker
set search_path = public
as $$
  with o as (
    select id, company_id from orders where id = p_order
  ),
  oda as (
    select po.id, po.supplier_id, po.oda_number from purchase_orders po join o on po.company_id = o.company_id and po.order_id = o.id
  ),
  fornitori as (
    select supplier_id from oda where supplier_id is not null
    union
    select cc.supplier_id from company_costs cc join o on cc.company_id = o.company_id
     where cc.order_id = o.id and cc.supplier_id is not null and cc.annullato_il is null
  ),
  bolle as (
    select fd.fattura_ricevuta_id as fid, min(coalesce(d.numero_ddt, fd.numero_ddt)) as numero
      from fattura_ddt fd
      join o on fd.company_id = o.company_id
      join ddt_ricezione d on d.id = fd.ddt_ricezione_id
     where d.order_id = o.id or d.purchase_order_id in (select id from oda)
     group by 1
  ),
  base as (
    select f.*,
      cc.order_id as costo_order, cc.allocations, cc.amount as costo_importo, cc.quota_magazzino,
      po.order_id as oda_order
    from fatture_ricevute f
    join o on f.company_id = o.company_id
    left join company_costs cc on cc.id = f.company_cost_id and cc.annullato_il is null
    left join purchase_orders po on po.id = f.purchase_order_id
    where coalesce(f.stato, '') <> 'rifiutata'
      and (p_cerca is null or p_cerca = ''
        or f.cedente_ragione_sociale ilike '%' || p_cerca || '%'
        or f.numero_fattura ilike '%' || p_cerca || '%'
        or f.totale_documento::text like replace(p_cerca, ',', '.') || '%')
  ),
  calcolo as (
    select b.*,
      case
        when b.oda_order is not null or b.costo_order is not null then 100
        else least(100, coalesce((select sum(coalesce((a->>'pct')::numeric, 0)) from jsonb_array_elements(
               case when jsonb_typeof(b.allocations) = 'array' then b.allocations else '[]'::jsonb end) a), 0)
             + case when coalesce(b.costo_importo, 0) > 0 then coalesce(b.quota_magazzino, 0) / b.costo_importo * 100 else 0 end)
      end as pct,
      coalesce(b.oda_order = p_order, false) or coalesce(b.costo_order = p_order, false)
        or coalesce(b.allocations @> jsonb_build_array(jsonb_build_object('order_id', p_order)), false) as gia_qui,
      bl.numero as bolla,
      -- Un ODA di questa commessa citato nell'XML: confronto veloce sul testo, la lettura vera dei riferimenti
      -- si fa sotto, solo sulle righe che si mostrano.
      (select min(oda.oda_number) from oda
        where nullif(trim(oda.oda_number), '') is not null and b.xml_raw is not null
          and strpos(b.xml_raw, 'DatiOrdineAcquisto') > 0
          and b.xml_raw ~* ('<(?:\w+:)?IdDocumento>\s*' || regexp_replace(trim(oda.oda_number), '([^\w])', '\\\1', 'g') || '\s*<')) as oda_xml
    from base b
    left join bolle bl on bl.fid = b.id
  ),
  scelte as (
  select c.id, c.numero_fattura, c.data_fattura, c.cedente_ragione_sociale,
    c.imponibile_totale, c.totale_documento, c.tipo_documento,
    round(c.pct, 2) as assegnata_pct,
    array(select distinct x.order_code from orders x where x.id in (
      select c.costo_order union select c.oda_order
      union select (a->>'order_id')::uuid from jsonb_array_elements(
        case when jsonb_typeof(c.allocations) = 'array' then c.allocations else '[]'::jsonb end) a
    ) and x.order_code is not null) as commesse_collegate,
    (case when c.bolla is not null then 100 else 0 end
      + case when c.oda_xml is not null then 90 else 0 end
      + case when c.order_id_suggerito = p_order then 60 * coalesce(c.order_match_confidenza, 0.5)
             / case when coalesce(c.order_match_confidenza, 0) > 1 then 100 else 1 end else 0 end
      + case when c.fornitore_id in (select supplier_id from fornitori) then 40 else 0 end)::numeric as punteggio,
    array_remove(array[
      case when c.bolla is not null then 'Bolla ' || c.bolla || ' di questa commessa' end,
      case when c.oda_xml is not null then 'Cita l''ordine ' || c.oda_xml || ' della commessa' end,
      case when c.order_id_suggerito = p_order then coalesce('Suggerita: ' || nullif(c.order_suggerito_motivo, ''), 'Suggerita dall''AI') end,
      case when c.fornitore_id in (select supplier_id from fornitori) then 'Fornitore della commessa' end
    ], null) as motivi
    , c.company_cost_id as costo_id, c.xml_raw
  from calcolo c
  where not c.gia_qui
    and (p_anche_assegnate or c.pct < 99.5)
  order by 10 desc, c.data_fattura desc nulls last
  limit least(greatest(coalesce(p_limit, 60), 1), 200)
  )
  select s.id, s.numero_fattura, s.data_fattura, s.cedente_ragione_sociale, s.imponibile_totale, s.totale_documento,
    s.tipo_documento, s.assegnata_pct, s.commesse_collegate, s.punteggio, s.motivi, s.costo_id,
    -- Tutti i riferimenti della fattura, anche di altre commesse: bolle collegate e ordini citati nell'XML.
    array(
      select 'DDT ' || coalesce(fd.numero_ddt, d.numero_ddt, '?')
             || coalesce(' del ' || to_char(coalesce(fd.data_ddt, d.data_ricezione), 'DD/MM/YYYY'), '')
             || coalesce(' → ' || oo.order_code, '')
        from fattura_ddt fd
        left join ddt_ricezione d on d.id = fd.ddt_ricezione_id
        left join purchase_orders pd on pd.id = d.purchase_order_id
        left join orders oo on oo.id = coalesce(d.order_id, pd.order_id)
       where fd.fattura_ricevuta_id = s.id
      union all
      select distinct 'Ordine ' || trim(m[1]) from regexp_matches(coalesce(s.xml_raw, ''),
        '<(?:\w+:)?DatiOrdineAcquisto>.*?<(?:\w+:)?IdDocumento>([^<]+)<', 'g') m
    )
  from scelte s
  order by s.punteggio desc, s.data_fattura desc nulls last;
$$;

revoke all on function public.fatture_candidate_commessa(uuid, text, int, boolean) from public, anon;
grant execute on function public.fatture_candidate_commessa(uuid, text, int, boolean) to authenticated, service_role;
