-- Le righe XML devono appartenere a un solo DDT. Valuta ciascun gruppo con
-- gli stessi controlli del confronto completo e conserva le verifiche aperte.
set local lock_timeout = '3s';
set local statement_timeout = '60s';

do $copia$
declare
  d text;
  firma text := 'private.ddt_piano_prezzi(p_fattura uuid)';
  rif text := $s$    select * from xmltable('/*/*[local-name()="DatiGenerali"]/*[local-name()="DatiDDT"]' passing corpo
      columns numero text path 'normalize-space(*[local-name()="NumeroDDT"])',
              data text path 'normalize-space(*[local-name()="DataDDT"])', xml_rif xml path '.')$s$;
  manuale text := $s$  if exists (
    select 1 from public.fattura_ddt l
    where l.fattura_ricevuta_id=f.id and l.company_id=f.company_id
      and l.origine='manuale' and (l.ddt_ricezione_id is null or not l.ddt_ricezione_id=any(ddts))
  ) then$s$;
  scope_riga text := '    ddts_voce:=per_riga->voce.n::text;';
  registrazione text := '    prezzo:=round(voce.totale/voce.quantita,4);';
  gia_valorizzata text := $s$    if altra_bolla is not null then return private.ddt_prezzi_esito('altre_consegne',altra_bolla); end if;$s$;
begin
  if to_regprocedure('private.ddt_piano_prezzi_riferimento(uuid,integer)') is not null then return; end if;
  d := pg_get_functiondef('private.ddt_piano_prezzi(uuid)'::regprocedure);
  if strpos(d,firma)=0 or strpos(d,rif)=0 or strpos(d,manuale)=0
    or strpos(d,scope_riga)=0 or strpos(d,registrazione)=0 or strpos(d,gia_valorizzata)=0 then
    raise exception 'Revisionare il piano di valorizzazione DDT';
  end if;
  d := replace(d,firma,'private.ddt_piano_prezzi_riferimento(p_fattura uuid, p_posizione integer)');
  d := replace(d,rif,$s$    select x.* from xmltable('/*/*[local-name()="DatiGenerali"]/*[local-name()="DatiDDT"]' passing corpo
      columns posizione for ordinality, numero text path 'normalize-space(*[local-name()="NumeroDDT"])',
              data text path 'normalize-space(*[local-name()="DataDDT"])', xml_rif xml path '.') x
    where p_posizione is null or x.posizione=p_posizione$s$);
  d := replace(d,manuale,replace(manuale,'  if exists (','  if p_posizione is null and exists ('));
  d := replace(d,scope_riga,scope_riga||$s$
    if p_posizione is not null and ddts_voce is null then continue; end if;$s$);
  d := replace(d,registrazione,$s$    if exists(select 1 from public.ddt_valorizzazioni v
      where v.company_id=f.company_id and v.fattura_id=f.id and v.origine='automatico'
        and v.numero_linea_fattura=voce.n and v.riga_id<>bolla.id) then
      return private.ddt_prezzi_esito('valorizzazione_precedente',id_ddt,voce.n);
    end if;
$s$||registrazione);
  d := replace(d,gia_valorizzata,$s$    if altra_bolla is not null then
      return private.ddt_prezzi_esito('altre_consegne',altra_bolla) ||
        case when p_posizione is null then '{}'::jsonb
          else jsonb_build_object('aggiornate',gia_auto,'confermate',gia_manuali) end;
    end if;$s$);
  execute d;
end
$copia$;
revoke all on function private.ddt_piano_prezzi_riferimento(uuid,integer) from public,anon,authenticated,service_role;

create or replace function private.ddt_piano_prezzi(p_fattura uuid)
returns jsonb language plpgsql stable set search_path = '' as $$
declare
  esito jsonb := private.ddt_piano_prezzi_riferimento(p_fattura,null);
  f public.fatture_ricevute%rowtype;
  corpo xml;
  riferimenti jsonb;
  indipendenti boolean;
  rif record;
  parte jsonb;
  righe jsonb := '[]';
  ddts jsonb := '[]';
  materiali jsonb := '[]';
  pendenti jsonb := '[]';
  valorizzati integer := 0;
  auto integer := 0;
  manuali integer := 0;
  prezzo_atteso jsonb;
begin
  if esito->>'stato' is distinct from 'da_verificare'
    or esito->>'motivo' in ('fornitore','xml','divisa','sconto_documento','altre_consegne') then return esito; end if;

  select * into f from public.fatture_ricevute where id=p_fattura;
  corpo := (xpath('(//*[local-name()="FatturaElettronicaBody"])[' || (coalesce(f.indice_corpo,0)+1) || ']',
    xmlparse(document f.xml_raw)))[1];

  with ref as materialized (
    select x.posizione, x.numero, public.acquisti_data_italiana(x.data) data,
      xpath('/*/*[local-name()="RiferimentoNumeroLinea"]/text()',x.rif) linee
    from xmltable('/*/*[local-name()="DatiGenerali"]/*[local-name()="DatiDDT"]' passing corpo
      columns posizione for ordinality, numero text path 'normalize-space(*[local-name()="NumeroDDT"])',
        data text path 'normalize-space(*[local-name()="DataDDT"])', rif xml path '.') x
  ), legami as materialized (
    select r.posizione, btrim(n::text)::integer n from ref r cross join lateral unnest(r.linee) n
  ), voci as materialized (
    select v.n, coalesce(not v.codice and v.q is null and v.um is null and public.fattura_numero(v.tot)=0,false) solo_testo
    from xmltable('/*/*[local-name()="DatiBeniServizi"]/*[local-name()="DettaglioLinee"]' passing corpo
      columns n integer path '*[local-name()="NumeroLinea"]', q text path '*[local-name()="Quantita"]',
        um text path '*[local-name()="UnitaMisura"]', tot text path '*[local-name()="PrezzoTotale"]',
        codice boolean path 'boolean(*[local-name()="CodiceArticolo"]/*[local-name()="CodiceValore"][normalize-space(.) != ""])') v
  ), candidati as materialized (
    select r.posizione,c.ddt_id from ref r
    cross join lateral public.acquisti_ddt_candidati(f.company_id,f.fornitore_id,r.numero,r.data) c
  )
  select (select jsonb_agg(jsonb_build_object('posizione',r.posizione,'numero',r.numero,'data',r.data) order by r.posizione) from ref r),
    (select count(*)>1 from ref)
    and not exists(select 1 from ref r where cardinality(r.linee)=0)
    and not exists(select 1 from voci v where n is null or n<=0)
    and not exists(select 1 from voci v group by n having count(*)>1)
    and not exists(select 1 from legami l group by n having count(*)>1)
    and not exists(select 1 from legami l where not exists(select 1 from voci v where v.n=l.n))
    and not exists(select 1 from voci v where not solo_testo and not exists(select 1 from legami l where l.n=v.n))
    and not exists(select 1 from candidati c group by c.ddt_id having count(*)>1)
    and not exists (
      select 1 from public.fattura_ddt l where l.company_id=f.company_id and l.fattura_ricevuta_id=f.id and l.origine='manuale'
        and not exists(select 1 from candidati c where c.ddt_id=l.ddt_ricezione_id
          and not exists(select 1 from candidati altro where altro.posizione=c.posizione and altro.ddt_id<>c.ddt_id))
    )
  into riferimenti,indipendenti;
  if not indipendenti then return esito; end if;

  for rif in select * from jsonb_to_recordset(riferimenti) as r(posizione int,numero text,data date) order by posizione
  loop
    parte:=private.ddt_piano_prezzi_riferimento(p_fattura,rif.posizione);
    if parte->>'stato'='pronta' then
      righe:=righe||(parte->'righe');
      ddts:=ddts||(parte->'ddts');
      materiali:=materiali||(parte->'materiali');
    elsif parte->>'stato' in ('aggiornata','confermata') or parte->>'motivo'='altre_consegne' then
      valorizzati:=valorizzati+1;
      if parte->>'motivo'='altre_consegne' then prezzo_atteso:=coalesce(prezzo_atteso,parte->'ddt_id'); end if;
    else
      pendenti:=pendenti||jsonb_strip_nulls(jsonb_build_object(
        'posizione',rif.posizione,'numero',nullif(rif.numero,''),'data',rif.data,
        'motivo',coalesce(parte->>'motivo','verifica_fallita'),'ddt_id',parte->'ddt_id','riga',parte->'riga'));
    end if;
    auto:=auto+coalesce((parte->>'aggiornate')::integer,0);
    manuali:=manuali+coalesce((parte->>'confermate')::integer,0);
  end loop;
  return esito||jsonb_build_object(
    'stato',case when jsonb_array_length(righe)>0 then 'pronta'
      when valorizzati>0 then 'parziale' else 'da_verificare' end,
    'righe',righe,'ddts',ddts,
    'materiali',(select coalesce(jsonb_agg(distinct id order by id),'[]') from jsonb_array_elements_text(materiali) id),
    'ddt_totali',jsonb_array_length(riferimenti),'ddt_valorizzati',valorizzati,
    'ddt_pendenti',pendenti,'aggiornate',auto,'confermate',manuali,'attesa_materiale',prezzo_atteso);
exception when data_exception then
  return esito;
end
$$;
revoke all on function private.ddt_piano_prezzi(uuid) from public,anon,authenticated,service_role;

-- Aggiorna l'anteprima degli esiti salvati prima della verifica parziale.
-- Il riepilogo continua a essere in sola lettura.
create or replace function private.ddt_prezzi_stato(p_fattura uuid)
returns jsonb language plpgsql stable set search_path = '' as $$
declare v private.fattura_prezzi_verifiche%rowtype; piano jsonb; manuali bigint;
begin
  select * into v from private.fattura_prezzi_verifiche where fattura_id=p_fattura;
  if v.prossima_verifica is not null and v.tentativi=0 then
    return jsonb_build_object('stato','in_verifica');
  end if;
  if found and v.esito->>'motivo' is distinct from 'altre_consegne'
    and v.esito->>'attesa_materiale' is null
    and (coalesce(v.esito->>'motivo','') not in ('ddt_mancante','ddt_da_collegare','ddt_ambiguo','riferimento_ddt',
      'riferimento_riga','consegna','articolo','quantita_prezzo','valorizzazione_precedente','fattura_concorrente','ripartizione_manuale')
      or v.esito ? 'ddt_pendenti') then
    piano:=v.esito;
  else
    piano:=private.ddt_piano_prezzi(p_fattura);
  end if;
  if piano->>'stato'='da_verificare' then
    select count(*) into manuali from public.ddt_valorizzazioni where fattura_id=p_fattura and origine='manuale';
    if manuali>0 then piano:=piano||jsonb_build_object('confermate',manuali); end if;
  end if;
  return piano - 'righe' - 'ddts' - 'materiali';
end
$$;
revoke all on function private.ddt_prezzi_stato(uuid) from public,anon,authenticated,service_role;
