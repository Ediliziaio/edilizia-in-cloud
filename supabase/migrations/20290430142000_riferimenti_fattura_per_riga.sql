-- Il riferimento XML di una riga limita i documenti ammessi nel confronto.
set local lock_timeout = '3s';
set local statement_timeout = '60s';

create or replace function private.fattura_documenti_per_riga(
  f public.fatture_ricevute, p_ddt uuid[], p_oda uuid[]
) returns jsonb language plpgsql stable set search_path = '' as $$
declare corpo xml; esito jsonb;
begin
  if nullif(f.xml_raw,'') is null then return '{}'::jsonb; end if;
  begin
    corpo := (xpath('(//*[local-name()="FatturaElettronicaBody"])[' || (coalesce(f.indice_corpo,0)+1) || ']',
      xmlparse(document f.xml_raw)))[1];
  exception when data_exception then
    return '{}'::jsonb;
  end;
  if corpo is null then return '{}'::jsonb; end if;

  with riferimenti as (
    select t.tipo, t.numero, nullif(t.data,'') data, l::text riga
    from (
      select 'ddt_per_riga' tipo, x.numero, x.data, x.blocco from xmltable('//*[local-name()="DatiDDT"]' passing corpo
        columns numero text path '*[local-name()="NumeroDDT"]', data text path '*[local-name()="DataDDT"]', blocco xml path '.') x
      union all
      select 'oda_per_riga', x.numero, x.data, x.blocco from xmltable('//*[local-name()="DatiOrdineAcquisto"]' passing corpo
        columns numero text path '*[local-name()="IdDocumento"]', data text path '*[local-name()="Data"]', blocco xml path '.') x
    ) t
    cross join lateral unnest(xpath('/*/*[local-name()="RiferimentoNumeroLinea"]/text()', t.blocco)) l
    where l::text ~ '^[0-9]{1,8}$' and nullif(btrim(t.numero),'') is not null
  ), risolti as (
    select r.tipo, (r.riga::integer)::text riga,
      case when cardinality(c.ddt)=1 then c.ddt[1] end documento,
      case when cardinality(o.oda)=1 then o.oda[1] end ordine
    from riferimenti r
    cross join lateral public.acquisti_numero_documento(r.numero) n
    left join lateral (
      select array_agg(distinct d.id) ddt
      from public.fattura_ddt l
      join public.ddt_ricezione d on d.id=l.ddt_ricezione_id and d.company_id=f.company_id and d.supplier_id=f.fornitore_id
      cross join lateral public.acquisti_numero_documento(l.numero_ddt) v
      where r.tipo='ddt_per_riga' and l.fattura_ricevuta_id=f.id and l.company_id=f.company_id and v.chiave=n.chiave
      and (n.serie is null or v.serie is null or n.serie=v.serie)
      and (r.data is null or r.data=l.data_ddt::text)
      and (n.anno is null or n.anno=coalesce(v.anno,extract(year from l.data_ddt)::int))
    ) c on true
    left join lateral (
      select array_agg(distinct po.id) oda
      from public.purchase_orders po
      cross join lateral (values (po.oda_number),(po.supplier_reference)) numeri(numero)
      cross join lateral public.acquisti_numero_documento(numeri.numero) v
      where r.tipo='oda_per_riga' and po.company_id=f.company_id and po.supplier_id=f.fornitore_id
      and po.status in ('inviato','confermato','parziale','ricevuto') and v.chiave=n.chiave
      and (f.data_fattura is null or po.issue_date<=f.data_fattura)
      and (n.serie is null or v.serie is null or n.serie=v.serie)
      and (r.data is null or r.data=po.issue_date::text)
      and (n.anno is null or n.anno=coalesce(v.anno,extract(year from po.issue_date)::int))
    ) o on true
  ), per_riga as (
    select tipo, riga, case
      when tipo='ddt_per_riga' and bool_and(coalesce(documento=any(p_ddt),false))
        then jsonb_agg(distinct documento)
      when tipo='oda_per_riga' and bool_and(coalesce(ordine=any(p_oda),false))
        then jsonb_agg(distinct ordine)
      else '[]'::jsonb
    end ids
    from risolti group by tipo,riga
  ), righe_originale as materialized (
    select x.posizione, x.descrizione,
      case when x.numero ~ '^[0-9]{1,8}$' then (x.numero::integer)::text end numero
    from xmltable('//*[local-name()="DettaglioLinee"]' passing corpo columns
      posizione for ordinality, descrizione text path '*[local-name()="Descrizione"]',
      numero text path '*[local-name()="NumeroLinea"]') x
  ), righe_registrate as materialized (
    select posizione, coalesce(nullif(riga->>'numero_linea',''),posizione::text) numero, riga->>'descrizione' descrizione
    from jsonb_array_elements(case when jsonb_typeof(f.righe)='array' then f.righe else '[]'::jsonb end)
      with ordinality z(riga,posizione)
  ), coerenti as (
    select (select count(*) from righe_originale)=(select count(*) from righe_registrate)
      and (select count(distinct numero) from righe_originale)=(select count(*) from righe_originale)
      and (select count(distinct numero) from righe_registrate)=(select count(*) from righe_registrate)
      and not exists(select 1 from per_riga p where not exists(select 1 from righe_originale ro where ro.numero=p.riga))
      and not exists(select 1 from righe_registrate rr join righe_originale ro using(posizione)
        where btrim(ro.descrizione) is distinct from btrim(rr.descrizione)) as allineate
  ), ambiti as (
    -- Le vecchie importazioni usano la posizione come identificativo della voce.
    -- Il confronto mantiene quell'identificativo, mentre il lettore XML dei prezzi usa NumeroLinea.
    select 'ddt_per_numero_xml' tipo, riga, ids from per_riga where tipo='ddt_per_riga'
    union all
    select t.tipo, rr.numero, case when c.allineate then p.ids else '[]'::jsonb end
    from righe_registrate rr cross join (select distinct tipo from per_riga) t cross join coerenti c
    left join righe_originale ro using(posizione)
    left join per_riga p on p.tipo=t.tipo and p.riga=ro.numero
    where p.ids is not null or not c.allineate
  )
  select coalesce(jsonb_object_agg(tipo, righe),'{}') into esito
  from (select tipo,jsonb_object_agg(riga,ids) righe from ambiti group by tipo) m;
  return esito;
end $$;
revoke all on function private.fattura_documenti_per_riga(public.fatture_ricevute,uuid[],uuid[]) from public,anon,authenticated;

do $patch$
declare
  d text := pg_get_functiondef('public.fattura_riconciliazione_contesto(uuid,jsonb)'::regprocedure);
  prima text := $old$  return jsonb_build_object('contesto',c,'impronta'$old$;
begin
  if position('private.fattura_documenti_per_riga(' in d)>0 then return; end if;
  if position(prima in d)=0 then raise exception 'Aggiornare il confronto fattura prima di aggiungere i riferimenti per riga.'; end if;
  execute replace(d,prima,'  c := c || private.fattura_documenti_per_riga(f,v_ddt,v_oda);' || chr(10) || prima);
end $patch$;

notify pgrst, 'reload schema';
