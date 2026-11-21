-- Il confronto del prezzo usa le stesse scritture della conferma manuale.
-- Le verifiche automatiche partono dopo il commit dei documenti e delle consegne.
set local lock_timeout = '3s';
set local statement_timeout = '60s';

alter table public.ddt_valorizzazioni
  add column if not exists origine text not null default 'manuale',
  add column if not exists numero_linea_fattura integer,
  alter column created_by drop not null,
  drop constraint if exists ddt_valorizzazioni_origine_check,
  add constraint ddt_valorizzazioni_origine_check check (
    (origine = 'manuale' and created_by is not null and numero_linea_fattura is null)
    or (origine = 'automatico' and created_by is null and numero_linea_fattura is not null and numero_linea_fattura > 0)
  );

create unique index if not exists ddt_valorizzazioni_xml_linea_unica
  on public.ddt_valorizzazioni(fattura_id, numero_linea_fattura) where origine = 'automatico';

do $copia$
declare
  definizione text := pg_get_functiondef('public.ddt_valorizza_da_fattura(uuid,uuid,jsonb)'::regprocedure);
  firma text := 'public.ddt_valorizza_da_fattura(p_ddt uuid, p_fattura uuid, p_righe jsonb)';
  permesso text := 'if not found or auth.uid() is null or public.utente_bloccato()';
  fine_permesso text := ',false) then raise exception ''Non puoi valorizzare questa bolla''';
  scrittura text := 'quantita,prezzo_unitario,created_by) values(d.company_id,d.id,r.id,f.id,q,prezzo,auth.uid())';
begin
  if to_regprocedure('private.ddt_valorizza_applica(uuid,uuid,jsonb,boolean)') is not null
    and strpos(definizione,'private.ddt_valorizza_applica(')>0 then return; end if;
  if strpos(definizione,firma)=0 or strpos(definizione,permesso)=0 or strpos(definizione,fine_permesso)=0
     or strpos(definizione,scrittura)=0 or strpos(definizione,'materiali_preparati_documenti_v1')=0 then
    raise exception 'Revisionare il servizio di confronto prezzi DDT prima di condividerlo';
  end if;
  definizione := replace(definizione,firma,
    'private.ddt_valorizza_applica(p_ddt uuid, p_fattura uuid, p_righe jsonb, p_automatico boolean)');
  definizione := replace(definizione,'''public''','''public'', ''pg_temp''');
  definizione := replace(definizione,permesso,'if not found or (not p_automatico and (auth.uid() is null or public.utente_bloccato()');
  definizione := replace(definizione,fine_permesso,',false))) then raise exception ''Non puoi valorizzare questa bolla''');
  definizione := replace(definizione,scrittura,$s$quantita,prezzo_unitario,created_by,origine,numero_linea_fattura)
    values(d.company_id,d.id,r.id,f.id,q,prezzo,
      case when not p_automatico then auth.uid() end,
      case when p_automatico then 'automatico' else 'manuale' end,
      case when p_automatico then (x->>'numero_linea_fattura')::integer end)$s$);
  definizione := replace(definizione,
    'if not exists(select 1 from fattura_ddt where fattura_ricevuta_id=f.id and ddt_ricezione_id=d.id) then',
    'if not p_automatico and not exists(select 1 from fattura_ddt where fattura_ricevuta_id=f.id and ddt_ricezione_id=d.id) then');
  execute definizione;
end
$copia$;
revoke all on function private.ddt_valorizza_applica(uuid,uuid,jsonb,boolean) from public,anon,authenticated,service_role;

create or replace function public.ddt_valorizza_da_fattura(p_ddt uuid,p_fattura uuid,p_righe jsonb)
returns jsonb language sql security definer set search_path = '' as $$
  select private.ddt_valorizza_applica(p_ddt,p_fattura,p_righe,false)
$$;
revoke all on function public.ddt_valorizza_da_fattura(uuid,uuid,jsonb) from public,anon;
grant execute on function public.ddt_valorizza_da_fattura(uuid,uuid,jsonb) to authenticated;

create table if not exists private.fattura_prezzi_verifiche (
  fattura_id uuid primary key references public.fatture_ricevute(id) on delete cascade,
  revisione bigint not null default 1,
  prossima_verifica timestamptz,
  tentativi integer not null default 0,
  esito jsonb
);
alter table private.fattura_prezzi_verifiche enable row level security;
revoke all on private.fattura_prezzi_verifiche from public,anon,authenticated,service_role;
create index if not exists fattura_prezzi_verifiche_in_attesa
  on private.fattura_prezzi_verifiche(prossima_verifica,fattura_id) where prossima_verifica is not null;

create or replace function private.ddt_prezzi_esito(p_motivo text, p_ddt uuid default null, p_riga integer default null, p_riferimento text default null)
returns jsonb language sql immutable set search_path = '' as $$
  select jsonb_strip_nulls(jsonb_build_object('stato','da_verificare','motivo',p_motivo,
    'ddt_id',p_ddt,'riga',p_riga,'riferimento',p_riferimento))
$$;
revoke all on function private.ddt_prezzi_esito(text,uuid,integer,text) from public,anon,authenticated,service_role;

create or replace function private.ddt_prezzi_documentata(f public.fatture_ricevute)
returns boolean language sql stable set search_path = '' as $$
  select coalesce(f.stato not in ('rifiutata','scartata','annullata','eliminata'),true)
    and not public.e_nota_credito_ricevuta(f.tipo_documento)
    and not public.e_autofattura_ricevuta(f.tipo_documento)
    and (f.tipo_documento in ('TD24','TD25') or strpos(coalesce(f.xml_raw,''),'DatiDDT')>0
      or exists (select 1 from public.fattura_ddt l where l.fattura_ricevuta_id=f.id and l.company_id=f.company_id))
$$;
revoke all on function private.ddt_prezzi_documentata(public.fatture_ricevute) from public,anon,authenticated,service_role;

-- Lettura pura, usata anche per mostrare gli avvisi sulle fatture storiche.
create or replace function private.ddt_piano_prezzi(p_fattura uuid)
returns jsonb language plpgsql stable set search_path = '' as $$
declare
  f public.fatture_ricevute%rowtype;
  bolla public.ddt_righe%rowtype;
  fornitore public.suppliers%rowtype;
  corpo xml;
  rif record;
  voce record;
  numero_linea text;
  data_rif date;
  candidati uuid[];
  ddts uuid[] := '{}';
  ddts_generali uuid[] := '{}';
  ddts_voce jsonb;
  per_riga jsonb := '{}';
  numeri_riga integer[] := '{}';
  righe_viste uuid[] := '{}';
  materiali uuid[] := '{}';
  proposte jsonb := '[]';
  consegnata numeric;
  ha_cantiere boolean;
  destinazioni_valide boolean;
  prezzo numeric;
  id_ddt uuid;
  altra_bolla uuid;
  gia_auto integer := 0;
  gia_manuali integer := 0;
  piva text;
  cf text;
begin
  select * into f from public.fatture_ricevute where id=p_fattura;
  if not found or not private.ddt_prezzi_documentata(f) then return null; end if;

  select * into fornitore from public.suppliers where id=f.fornitore_id and company_id=f.company_id;
  piva := regexp_replace(upper(coalesce(f.cedente_piva,'')),'[^A-Z0-9]','','g');
  cf := regexp_replace(upper(coalesce(f.cedente_cf,'')),'[^A-Z0-9]','','g');
  if fornitore.id is null or not (
    (piva not in ('','IT') and regexp_replace(piva,'^IT','') =
      regexp_replace(regexp_replace(upper(coalesce(fornitore.vat_number,'')),'[^A-Z0-9]','','g'),'^IT',''))
    or (piva in ('','IT') and cf<>'' and cf=regexp_replace(upper(coalesce(fornitore.fiscal_code,'')),'[^A-Z0-9]','','g'))
  ) then
    return private.ddt_prezzi_esito('fornitore');
  end if;
  if nullif(f.xml_raw,'') is null then return private.ddt_prezzi_esito('xml'); end if;

  corpo := (xpath('(//*[local-name()="FatturaElettronicaBody"])[' || (coalesce(f.indice_corpo,0)+1) || ']',
    xmlparse(document f.xml_raw)))[1];
  if corpo is null then return private.ddt_prezzi_esito('xml'); end if;
  if not xpath_exists('/*/*[local-name()="DatiGenerali"]/*[local-name()="DatiGeneraliDocumento"]/*[local-name()="Divisa"][.="EUR"]',corpo) then
    return private.ddt_prezzi_esito('divisa');
  end if;
  if xpath_exists('/*/*[local-name()="DatiGenerali"]/*[local-name()="DatiGeneraliDocumento"]/*[local-name()="ScontoMaggiorazione"]',corpo) then
    return private.ddt_prezzi_esito('sconto_documento');
  end if;

  for rif in
    select * from xmltable('/*/*[local-name()="DatiGenerali"]/*[local-name()="DatiDDT"]' passing corpo
      columns numero text path 'normalize-space(*[local-name()="NumeroDDT"])',
              data text path 'normalize-space(*[local-name()="DataDDT"])', xml_rif xml path '.')
  loop
    data_rif := public.acquisti_data_italiana(rif.data);
    if nullif(rif.numero,'') is null or data_rif is null then
      return private.ddt_prezzi_esito('riferimento_ddt',null,null,rif.numero);
    end if;
    select array_agg(d.ddt_id) into candidati
    from public.acquisti_ddt_candidati(f.company_id,f.fornitore_id,rif.numero,data_rif) d;
    if coalesce(cardinality(candidati),0)=0 then
      return private.ddt_prezzi_esito('ddt_mancante',null,null,rif.numero);
    elsif cardinality(candidati)>1 then
      return private.ddt_prezzi_esito('ddt_ambiguo',null,null,rif.numero);
    end if;
    id_ddt := candidati[1];
    if not exists (
      select 1 from public.fattura_ddt l
      join public.ddt_ricezione d on d.id=l.ddt_ricezione_id and d.company_id=l.company_id
      where l.fattura_ricevuta_id=f.id and l.company_id=f.company_id and d.id=id_ddt
      and (l.numero_ddt=rif.numero or
        public.acquisti_numero_documento(l.numero_ddt)=public.acquisti_numero_documento(rif.numero))
      and l.data_ddt=data_rif and abs(d.data_ricezione-data_rif)<=10
      and (public.acquisti_numero_documento(d.numero_ddt)).serie is not distinct from
          (public.acquisti_numero_documento(rif.numero)).serie
    ) then
      return private.ddt_prezzi_esito('ddt_da_collegare',id_ddt,null,rif.numero);
    end if;
    if not id_ddt=any(ddts) then ddts:=array_append(ddts,id_ddt); end if;
    if not xpath_exists('/*/*[local-name()="RiferimentoNumeroLinea"]',rif.xml_rif) then
      if not id_ddt=any(ddts_generali) then ddts_generali:=array_append(ddts_generali,id_ddt); end if;
    end if;
    for numero_linea in select x::text from unnest(xpath('/*/*[local-name()="RiferimentoNumeroLinea"]/text()',rif.xml_rif)) x
    loop
      if btrim(numero_linea) !~ '^[0-9]{1,8}$' then
        return private.ddt_prezzi_esito('riferimento_riga',id_ddt,null,rif.numero);
      end if;
      numero_linea := (btrim(numero_linea)::integer)::text;
      ddts_voce := coalesce(per_riga->numero_linea,'[]');
      if not ddts_voce ? id_ddt::text then
        per_riga := jsonb_set(per_riga,array[numero_linea],ddts_voce||to_jsonb(id_ddt));
      end if;
    end loop;
  end loop;
  if cardinality(ddts)=0 then return private.ddt_prezzi_esito('riferimento_ddt'); end if;
  if exists (
    select 1 from public.fattura_ddt l
    where l.fattura_ricevuta_id=f.id and l.company_id=f.company_id
      and l.origine='manuale' and (l.ddt_ricezione_id is null or not l.ddt_ricezione_id=any(ddts))
  ) then
    return private.ddt_prezzi_esito('ddt_ambiguo');
  end if;

  for voce in
    select x.*, public.fattura_numero(x.q) quantita, public.fattura_unita(x.um) unita,
      public.fattura_numero(x.tot) totale,
      array(select distinct public.fattura_identita(a.codice)
        from xmltable('/*/*[local-name()="CodiceArticolo"]' passing x.dettaglio
          columns codice text path '*[local-name()="CodiceValore"]') a
        where public.fattura_identita(a.codice)<>'') codici
    from xmltable('/*/*[local-name()="DatiBeniServizi"]/*[local-name()="DettaglioLinee"]' passing corpo
      columns n integer path '*[local-name()="NumeroLinea"]', q text path '*[local-name()="Quantita"]',
              um text path '*[local-name()="UnitaMisura"]', tot text path '*[local-name()="PrezzoTotale"]',
              descrizione text path '*[local-name()="Descrizione"]', dettaglio xml path '.') x
  loop
    if voce.n is null or voce.n<=0 or voce.n=any(numeri_riga) then return private.ddt_prezzi_esito('riferimento_riga',null,voce.n); end if;
    numeri_riga:=array_append(numeri_riga,voce.n);
    -- Le righe di testo con importo zero non rappresentano articoli.
    if voce.q is null and voce.um is null and voce.totale=0 and cardinality(voce.codici)=0 then continue; end if;

    ddts_voce:=per_riga->voce.n::text;
    if jsonb_array_length(ddts_voce)=1 then
      id_ddt:=(ddts_voce->>0)::uuid;
    elsif ddts_voce is null and cardinality(ddts)=1 and cardinality(ddts_generali)=1 then
      id_ddt:=ddts_generali[1];
    else
      return private.ddt_prezzi_esito('riferimento_riga',null,voce.n);
    end if;
    if voce.quantita is null or voce.quantita<=0 or voce.quantita>1000000000 or voce.unita=''
        or voce.totale is null or voce.totale<0 or voce.totale>=1000000000000
        or voce.totale/voce.quantita>1000000000 then
      return private.ddt_prezzi_esito('quantita_prezzo',id_ddt,voce.n);
    end if;

    select array_agg(r.id) into candidati from public.ddt_righe r
    where r.company_id=f.company_id and r.ddt_ricezione_id=id_ddt and (
      public.fattura_identita(r.codice_articolo)=any(voce.codici)
      or ((cardinality(voce.codici)=0 or public.fattura_identita(r.codice_articolo)='')
        and length(public.fattura_identita(voce.descrizione))>=8
        and public.fattura_identita(r.descrizione)=public.fattura_identita(voce.descrizione)));
    if coalesce(cardinality(candidati),0)<>1 or candidati[1]=any(righe_viste) then
      return private.ddt_prezzi_esito('articolo',id_ddt,voce.n);
    end if;
    select * into bolla from public.ddt_righe where id=candidati[1];
    if public.fattura_unita(bolla.unita_misura)<>voce.unita or bolla.quantita is distinct from voce.quantita then
      return private.ddt_prezzi_esito('quantita_prezzo',id_ddt,voce.n);
    end if;
    righe_viste:=array_append(righe_viste,bolla.id);

    if exists (select 1 from public.fattura_ddt_consumi(f.company_id,array[id_ddt],f.id) u where u.riga_id=bolla.id and u.quantita>0)
      or exists (
        select 1 from public.fattura_ddt l
        join public.fatture_ricevute altra on altra.id=l.fattura_ricevuta_id and altra.company_id=f.company_id
        where l.ddt_ricezione_id=id_ddt and l.company_id=f.company_id and altra.id<>f.id
          and not public.e_nota_credito_ricevuta(altra.tipo_documento)
          and coalesce(altra.stato not in ('rifiutata','scartata','annullata','eliminata'),true)
      ) then
      return private.ddt_prezzi_esito('fattura_concorrente',id_ddt,voce.n);
    end if;
    if exists (select 1 from public.fattura_ddt_quantita q where q.company_id=f.company_id
      and q.fattura_id=f.id and q.ddt_riga=bolla.id) and not exists (
        select 1 from public.ddt_valorizzazioni v where v.fattura_id=f.id and v.riga_id=bolla.id
    ) then
      return private.ddt_prezzi_esito('ripartizione_manuale',id_ddt,voce.n);
    end if;

    select coalesce(sum(c.quantita) filter (where c.tipo='ingresso'),0),
      coalesce(bool_or(c.destinazione='cantiere' and c.tipo='ingresso'),false),
      coalesce(bool_and(c.tipo='ingresso' and public.fattura_unita(c.unita_misura)=voce.unita
        and not exists (select 1 from public.ddt_consegne reso
          where reso.consegna_origine_id=c.id and reso.company_id=f.company_id and reso.tipo='reso')
        and (c.destinazione='magazzino' or (o.id is not null and m.id is not null))),false)
    into consegnata,ha_cantiere,destinazioni_valide
    from public.ddt_consegne c
    left join public.orders o on o.id=c.order_id and o.company_id=f.company_id and o.deleted_at is null
    left join public.order_items m on m.id=c.order_item_id and m.order_id=o.id and m.natura_riga='materiale'
    where c.ddt_id=id_ddt and c.riga_id=bolla.id and c.company_id=f.company_id;
    if not ha_cantiere or not destinazioni_valide or consegnata<>bolla.quantita then
      return private.ddt_prezzi_esito('consegna',id_ddt,voce.n);
    end if;
    materiali:=array(select distinct id from (
      select unnest(materiali) id
      union all
      select c.order_item_id from public.ddt_consegne c where c.riga_id=bolla.id and c.company_id=f.company_id and c.destinazione='cantiere'
    ) i order by id);

    prezzo:=round(voce.totale/voce.quantita,4);
    if round(bolla.quantita*prezzo,2)>=1000000000000 then
      return private.ddt_prezzi_esito('quantita_prezzo',id_ddt,voce.n);
    end if;
    if exists (select 1 from public.ddt_valorizzazioni v where v.fattura_id=f.id and v.riga_id=bolla.id) then
      if exists (select 1 from public.ddt_valorizzazioni v where v.fattura_id=f.id and v.riga_id=bolla.id
          and (v.quantita<>voce.quantita or round(v.prezzo_unitario,4)<>prezzo
            or (v.origine='automatico' and v.numero_linea_fattura<>voce.n))) then
        return private.ddt_prezzi_esito('valorizzazione_precedente',id_ddt,voce.n);
      end if;
      if exists (select 1 from public.ddt_valorizzazioni v where v.fattura_id=f.id and v.riga_id=bolla.id and v.origine='automatico') then
        gia_auto:=gia_auto+1;
      else
        gia_manuali:=gia_manuali+1;
      end if;
    else
      proposte:=proposte||jsonb_build_object('ddt_id',id_ddt,'riga_id',bolla.id,
        'numero_linea_fattura',voce.n,'quantita',voce.quantita,'prezzo_unitario',prezzo);
    end if;
  end loop;

  if exists (select 1 from jsonb_object_keys(per_riga) n where n::integer<>all(numeri_riga))
    or (select count(distinct r.ddt_ricezione_id) from public.ddt_righe r where r.id=any(righe_viste))<>cardinality(ddts) then
    return private.ddt_prezzi_esito('riferimento_riga');
  end if;
  -- Anche fatture diverse possono concorrere al prezzo medio dello stesso
  -- materiale. Ognuna apporta i suoi prezzi, con la commessa in attesa delle altre.
  select c.ddt_id into altra_bolla
  from public.ddt_consegne c join public.ddt_righe r on r.id=c.riga_id and r.company_id=c.company_id
  where c.company_id=f.company_id and c.order_item_id=any(materiali) and c.destinazione='cantiere'
    and c.tipo='ingresso' and not r.id=any(righe_viste) and r.prezzo_unitario is null
    and c.quantita>coalesce((select sum(s.quantita) from public.ddt_consegne s
      where s.consegna_origine_id=c.id and s.company_id=c.company_id and s.tipo='reso'),0)
  order by c.ddt_id limit 1;
  if jsonb_array_length(proposte)=0 then
    if gia_auto+gia_manuali=0 then return private.ddt_prezzi_esito('articolo'); end if;
    if altra_bolla is not null then return private.ddt_prezzi_esito('altre_consegne',altra_bolla); end if;
    return jsonb_build_object('stato',case when gia_auto=0 then 'confermata' else 'aggiornata' end,
      'aggiornate',gia_auto,'confermate',gia_manuali);
  end if;

  return jsonb_build_object('stato','pronta','righe',proposte,'ddts',ddts,'materiali',materiali,
    'aggiornate',gia_auto,'confermate',gia_manuali);
exception when data_exception then
  return private.ddt_prezzi_esito('xml');
end
$$;
revoke all on function private.ddt_piano_prezzi(uuid) from public,anon,authenticated,service_role;

create or replace function private.ddt_prezzi_accoda(p_fattura uuid, p_ddt uuid default null)
returns void language sql security definer set search_path = '' as $$
  insert into private.fattura_prezzi_verifiche as v (fattura_id,prossima_verifica)
  select f.id,now()+interval '30 seconds'
  from (
    select p_fattura id where p_fattura is not null
    union
    select l.fattura_ricevuta_id from public.fattura_ddt l where l.ddt_ricezione_id=p_ddt
  ) coinvolte join public.fatture_ricevute f on f.id=coinvolte.id
  where private.ddt_prezzi_documentata(f) or exists(
    select 1 from private.fattura_prezzi_verifiche precedente where precedente.fattura_id=f.id)
  order by f.id
  on conflict (fattura_id) do update set
    revisione=v.revisione+1, prossima_verifica=excluded.prossima_verifica,tentativi=0
$$;
revoke all on function private.ddt_prezzi_accoda(uuid,uuid) from public,anon,authenticated,service_role;

create or replace function private.ddt_prezzi_accoda_evento()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  case tg_table_name
  when 'fatture_ricevute' then
    perform private.ddt_prezzi_accoda(new.id);
  when 'fattura_ddt' then
    if tg_op<>'DELETE' then perform private.ddt_prezzi_accoda(new.fattura_ricevuta_id,new.ddt_ricezione_id); end if;
    if tg_op='DELETE' or (tg_op='UPDATE' and (old.fattura_ricevuta_id,old.ddt_ricezione_id)
        is distinct from (new.fattura_ricevuta_id,new.ddt_ricezione_id)) then
      perform private.ddt_prezzi_accoda(old.fattura_ricevuta_id,old.ddt_ricezione_id);
    end if;
  when 'ddt_ricezione' then
    perform private.ddt_prezzi_accoda(null,new.id);
  when 'ddt_righe' then
    if tg_op<>'DELETE' then perform private.ddt_prezzi_accoda(null,new.ddt_ricezione_id); end if;
    if tg_op='DELETE' or (tg_op='UPDATE' and old.ddt_ricezione_id<>new.ddt_ricezione_id) then
      perform private.ddt_prezzi_accoda(null,old.ddt_ricezione_id);
    end if;
  when 'ddt_consegne' then
    if tg_op<>'DELETE' then perform private.ddt_prezzi_accoda(null,new.ddt_id); end if;
    if tg_op='DELETE' or (tg_op='UPDATE' and old.ddt_id<>new.ddt_id) then
      perform private.ddt_prezzi_accoda(null,old.ddt_id);
    end if;
  when 'ddt_valorizzazioni' then
    perform private.ddt_prezzi_accoda(new.fattura_id);
  end case;
  return null;
end
$$;
revoke all on function private.ddt_prezzi_accoda_evento() from public,anon,authenticated,service_role;

create or replace trigger ddt_prezzi_fattura
  after insert or update of fornitore_id,cedente_piva,cedente_cf,xml_raw,indice_corpo,tipo_documento on public.fatture_ricevute
  for each row execute function private.ddt_prezzi_accoda_evento();
create or replace trigger ddt_prezzi_fattura_stato
  after update of stato on public.fatture_ricevute for each row when (
    (old.stato in ('rifiutata','scartata','annullata','eliminata')) is distinct from
    (new.stato in ('rifiutata','scartata','annullata','eliminata')))
  execute function private.ddt_prezzi_accoda_evento();
create or replace trigger ddt_prezzi_legame
  after insert or update of ddt_ricezione_id,fattura_ricevuta_id,numero_ddt,data_ddt or delete on public.fattura_ddt
  for each row execute function private.ddt_prezzi_accoda_evento();
create or replace trigger ddt_prezzi_bolla
  after update of numero_ddt,data_ricezione,supplier_id on public.ddt_ricezione for each row
  when ((old.numero_ddt,old.data_ricezione,old.supplier_id) is distinct from (new.numero_ddt,new.data_ricezione,new.supplier_id))
  execute function private.ddt_prezzi_accoda_evento();
create or replace trigger ddt_prezzi_articolo
  after insert or update of codice_articolo,descrizione,quantita,unita_misura,ddt_ricezione_id or delete on public.ddt_righe
  for each row execute function private.ddt_prezzi_accoda_evento();
create or replace trigger ddt_prezzi_consegna
  after insert or update of quantita,destinazione,order_id,order_item_id,unita_misura,tipo,riga_id,ddt_id or delete on public.ddt_consegne
  for each row execute function private.ddt_prezzi_accoda_evento();
create or replace trigger ddt_prezzi_conferma
  after insert on public.ddt_valorizzazioni for each row when (new.origine='manuale')
  execute function private.ddt_prezzi_accoda_evento();

create or replace function private.ddt_prezzi_verifica(p_fattura uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  esito jsonb := private.ddt_piano_prezzi(p_fattura);
  ddts jsonb;
  materiali jsonb;
  d record;
  azienda uuid;
begin
  if esito->>'stato' is distinct from 'pronta' then return esito; end if;
  ddts:=esito->'ddts';
  materiali:=esito->'materiali';
  -- Stesso ordine di lock dei flussi di conferma e riconciliazione.
  perform b.id from public.ddt_ricezione b where b.id in (select x::uuid from jsonb_array_elements_text(ddts) x) order by b.id for update;
  select f.company_id into azienda from public.fatture_ricevute f where f.id=p_fattura for update;
  if azienda is null then return null; end if;
  perform s.id from public.suppliers s join public.fatture_ricevute f on f.fornitore_id=s.id
    where f.id=p_fattura and s.company_id=azienda for share of s;
  perform g.company_id from public.company_governance_settings g where g.company_id=azienda for share;
  if not public.azienda_collegamento_automatico(azienda) then return private.ddt_prezzi_esito('automatico_disattivato'); end if;
  perform r.id from public.ddt_righe r where r.ddt_ricezione_id in (select x::uuid from jsonb_array_elements_text(ddts) x) order by r.id for update;
  perform m.id from public.order_items m where m.id in (select x::uuid from jsonb_array_elements_text(materiali) x) order by m.id for update;
  esito:=private.ddt_piano_prezzi(p_fattura);
  if esito->>'stato' is distinct from 'pronta' then return esito; end if;
  if esito->'ddts' is distinct from ddts or esito->'materiali' is distinct from materiali then
    raise exception 'I documenti sono cambiati durante il confronto' using errcode='PT409';
  end if;
  for d in
    select (r->>'ddt_id')::uuid id,jsonb_agg(r order by (r->>'riga_id')::uuid) righe
    from jsonb_array_elements(esito->'righe') r group by 1 order by 1
  loop
    perform private.ddt_valorizza_applica(d.id,p_fattura,d.righe,true);
  end loop;
  return private.ddt_piano_prezzi(p_fattura);
end
$$;
revoke all on function private.ddt_prezzi_verifica(uuid) from public,anon,authenticated,service_role;

create or replace function private.ddt_prezzi_esegui_coda()
returns integer language plpgsql security definer set search_path = '' set lock_timeout='900ms' as $$
declare v record; risultato jsonb; n integer:=0;
begin
  for v in
    select fattura_id,revisione,tentativi from private.fattura_prezzi_verifiche
    where prossima_verifica<=now() order by prossima_verifica,fattura_id limit 12
  loop
    if not pg_try_advisory_xact_lock(hashtextextended('ddt_prezzi:'||v.fattura_id::text,0)) then continue; end if;
    begin
      risultato:=private.ddt_prezzi_verifica(v.fattura_id);
      update private.fattura_prezzi_verifiche
      set esito=risultato - 'righe' - 'ddts' - 'materiali',prossima_verifica=null,tentativi=0
      where fattura_id=v.fattura_id and revisione=v.revisione;
      n:=n+1;
    exception
      when sqlstate 'PT409' or lock_not_available or deadlock_detected or serialization_failure then
        update private.fattura_prezzi_verifiche set prossima_verifica=now()+interval '2 minutes'
        where fattura_id=v.fattura_id and revisione=v.revisione;
      when others then
        raise log 'Verifica prezzi DDT, fattura %, errore %',v.fattura_id,sqlstate;
        update private.fattura_prezzi_verifiche set tentativi=v.tentativi+1,
          prossima_verifica=case when v.tentativi<2 then now()+interval '5 minutes' end,
          esito=private.ddt_prezzi_esito('verifica_fallita')
        where fattura_id=v.fattura_id and revisione=v.revisione;
    end;
  end loop;
  return n;
end
$$;
revoke all on function private.ddt_prezzi_esegui_coda() from public,anon,authenticated,service_role;

do $cron$
begin
  if to_regprocedure('cron.schedule(text,text,text)') is not null then
    perform cron.schedule('ddt-prezzi-fatture','* * * * *',
      $job$set statement_timeout='30s'; select private.ddt_prezzi_esegui_coda()$job$);
  end if;
end
$cron$;

create or replace function private.ddt_prezzi_stato(p_fattura uuid)
returns jsonb language plpgsql stable set search_path = '' as $$
declare v private.fattura_prezzi_verifiche%rowtype; piano jsonb; manuali bigint;
begin
  select * into v from private.fattura_prezzi_verifiche where fattura_id=p_fattura;
  if v.prossima_verifica is not null and v.tentativi=0 then
    return jsonb_build_object('stato','in_verifica');
  end if;
  if found and v.esito->>'motivo' is distinct from 'altre_consegne' then
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

-- Il riepilogo già verifica che il ruolo possa leggere la fattura e i suoi DDT.
do $riepilogo$
declare
  definizione text:=pg_get_functiondef('public.fattura_ddt_riepilogo(uuid)'::regprocedure);
  ancora text:=$s$return piano || jsonb_build_object('automatico',$s$;
begin
  if strpos(definizione,'private.ddt_prezzi_stato(')>0 then return; end if;
  if strpos(definizione,ancora)=0 then raise exception 'Revisionare il riepilogo fattura DDT'; end if;
  execute replace(definizione,ancora,
    $s$return piano || jsonb_build_object('prezzi',private.ddt_prezzi_stato(f.id),'automatico',$s$);
end
$riepilogo$;

notify pgrst, 'reload schema';
