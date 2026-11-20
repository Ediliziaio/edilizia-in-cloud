-- L'identificativo registrato può essere la posizione e differire da NumeroLinea dell'XML.
set local lock_timeout = '3s';
set local statement_timeout = '60s';

do $patch$
declare
  definizione text := pg_get_functiondef('private.fattura_documenti_per_riga(public.fatture_ricevute,uuid[],uuid[])'::regprocedure);
  prima text := $prima$    from risolti group by tipo,riga
  )
  select coalesce(jsonb_object_agg(tipo, righe),'{}') into esito
  from (select tipo,jsonb_object_agg(riga,ids) righe from per_riga group by tipo) m;
$prima$;
  dopo text := $dopo$    from risolti group by tipo,riga
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
$dopo$;
begin
  if position('ddt_per_numero_xml' in definizione)>0 then return; end if;
  if position(prima in definizione)=0 then raise exception 'Verifica la funzione che confronta le righe XML con quelle registrate.'; end if;
  execute replace(definizione,prima,dopo);
end $patch$;

notify pgrst, 'reload schema';
