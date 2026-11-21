set local lock_timeout = '3s';
set local statement_timeout = '60s';

create table if not exists private.operazioni_eccezioni (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  tipo text not null check (tipo in ('ddt','pagamento','cantiere')),
  origine_id uuid not null,
  commessa_id uuid,
  responsabile uuid references auth.users(id) on delete set null,
  scadenza date not null,
  titolo text not null,
  dati jsonb not null,
  aperta_il timestamptz not null default now(),
  aggiornata_il timestamptz not null default now(),
  chiusa_il timestamptz,
  unique (company_id,tipo,origine_id)
);
create index if not exists operazioni_eccezioni_aperte
  on private.operazioni_eccezioni(company_id,scadenza,id) where chiusa_il is null;
alter table private.operazioni_eccezioni enable row level security;

create table if not exists private.operazioni_coda (
  tipo text not null check (tipo in ('fattura','materiale')),
  origine_id uuid not null,
  quando timestamptz not null default now(),
  tentativi integer not null default 0,
  ultimo_errore text,
  primary key(tipo,origine_id)
);
create index if not exists operazioni_coda_quando on private.operazioni_coda(quando);
alter table private.operazioni_coda enable row level security;

create table if not exists private.pagamenti_verifiche_fornitori (
  company_id uuid not null references public.companies(id) on delete cascade,
  fattura_id uuid not null references public.fatture_ricevute(id) on delete cascade,
  impronta text not null,
  nota text not null,
  verificata_da uuid references auth.users(id) on delete set null,
  verificata_il timestamptz not null default now(),
  primary key (fattura_id,impronta)
);
alter table private.pagamenti_verifiche_fornitori enable row level security;

revoke all on private.operazioni_eccezioni,private.operazioni_coda,private.pagamenti_verifiche_fornitori
  from public,anon,authenticated,service_role;

create or replace function private.operazioni_puo_approvare(p_company uuid)
returns boolean language sql stable set search_path='' as $$
  select coalesce(auth.uid() is not null and not public.utente_bloccato()
    and not public.utente_e_cliente_esterno() and not public.utente_sola_lettura(p_company)
    and public.puo_gestire_scadenze(p_company)
    and (public.e_super_admin_dentro(p_company) or public.e_amministratore_di(p_company)
      or p_company=any(public.aziende_con_permesso('can_manage_payments'))),false)
$$;

create or replace function private.operazioni_puo_fattura(p_company uuid)
returns boolean language sql stable set search_path='' as $$
  select coalesce(auth.uid() is not null and not public.utente_bloccato()
    and not public.utente_e_cliente_esterno() and (
      (p_company=public.get_my_company_id() and public.puo_vedere_documenti_fornitore())
      or public.e_super_admin_dentro(p_company) or public.user_can_read_accountant_company(p_company)
      or private.operazioni_puo_approvare(p_company)
    ),false)
$$;

-- Un singolo esito con le prove usate per approvare. La contabilità della fattura
-- e la registrazione di un movimento bancario già avvenuto hanno i propri flussi.
create or replace function private.pagamento_fornitore_controllo(p_fattura uuid)
returns jsonb language plpgsql stable set search_path='' as $$
declare
  f public.fatture_ricevute%rowtype;
  g public.company_governance_settings%rowtype;
  corpo xml;
  riferimenti jsonb;
  bolle uuid[];
  ordini uuid[];
  legami jsonb;
  r record;
  d record;
  o record;
  ddts_riga uuid[];
  odas_riga uuid[];
  gia_usate uuid[]:='{}';
  mancanti jsonb:='[]';
  problemi jsonb:='[]';
  impronta_attuale text;
  nota text;
  residuo numeric;
  prezzo numeric;
  q_calcolata numeric;
  somma_consegnata numeric;
  somma_consumata numeric;
  q_margine numeric;
  p_margine numeric;
  data_consegna date;
  ha_oda boolean;
  ordine_irrisolto boolean;
  ordine_storico boolean;
  stato_fattura jsonb;
begin
  select * into f from public.fatture_ricevute where id=p_fattura;
  if not found or f.stato in ('rifiutata','scartata','annullata','eliminata')
    or public.e_nota_credito_ricevuta(f.tipo_documento) or public.e_autofattura_ricevuta(f.tipo_documento) then
    return jsonb_build_object('stato','non_applicabile','bloccata',false);
  end if;

  select * into g from public.company_governance_settings where company_id=f.company_id;
  if nullif(f.xml_raw,'') is not null then
    begin
      corpo:=(xpath('(//*[local-name()="FatturaElettronicaBody"])['||(coalesce(f.indice_corpo,0)+1)||']',
        xmlparse(document f.xml_raw)))[1];
    exception when data_exception then corpo:=null;
    end;
  end if;

  -- I riferimenti strutturati precedono le descrizioni libere. Una bolla è
  -- risolta quando la stessa azienda e lo stesso fornitore hanno un esito univoco.
  with xml_ddt as (
    select x.numero,public.acquisti_data_italiana(x.data) data
    from xmltable('/*/*[local-name()="DatiGenerali"]/*[local-name()="DatiDDT"]' passing corpo
      columns numero text path 'normalize-space(*[local-name()="NumeroDDT"])',
        data text path 'normalize-space(*[local-name()="DataDDT"])') x
    where nullif(x.numero,'') is not null
  ), ref as (
    select numero,data from xml_ddt
    union
    select coalesce(nullif(l.numero_ddt,''),b.numero_ddt),coalesce(l.data_ddt,b.data_ricezione)
    from public.fattura_ddt l left join public.ddt_ricezione b on b.id=l.ddt_ricezione_id and b.company_id=f.company_id
    where l.fattura_ricevuta_id=f.id and l.company_id=f.company_id
      and not exists(select 1 from xml_ddt x where (x.numero,x.data) is not distinct from
        (coalesce(nullif(l.numero_ddt,''),b.numero_ddt),coalesce(l.data_ddt,b.data_ricezione)))
  ), candidati as (
    select citazione.*,
      array(select distinct c.ddt_id
        from public.acquisti_ddt_candidati(f.company_id,f.fornitore_id,citazione.numero,citazione.data) c
        where citazione.data is null or c.data=citazione.data) ids
    from ref citazione
  )
  select coalesce(jsonb_agg(jsonb_build_object('numero',c.numero,'data',c.data,
      'ddt_id',case when cardinality(c.ids)=1 then c.ids[1] end,'candidati',cardinality(c.ids))
      order by c.numero,c.data),'[]'),
    coalesce(array_agg(distinct c.ids[1]) filter(where cardinality(c.ids)=1),'{}')
  into riferimenti,bolle from candidati c;

  select coalesce(jsonb_agg(x),'[]') into mancanti
  from jsonb_array_elements(riferimenti) x where x->>'ddt_id' is null;
  if private.ddt_prezzi_documentata(f) and jsonb_array_length(riferimenti)=0 then
    mancanti:=jsonb_build_array(jsonb_build_object('candidati',0));
  end if;

  ha_oda:=coalesce(xpath_exists('/*/*[local-name()="DatiGenerali"]/*[local-name()="DatiOrdineAcquisto"]',corpo),false);
  ordine_storico:=exists(select 1 from public.acquisti_collegamenti l
    where l.company_id=f.company_id and l.da_tipo='fattura_ricevuta' and l.da_id=f.id
      and l.a_id=f.purchase_order_id and l.stato='collegato' and l.regola='oda_importo_fornitore_storico');
  with od_xml as (
    select x.numero,public.acquisti_data_italiana(x.data) data
    from xmltable('/*/*[local-name()="DatiGenerali"]/*[local-name()="DatiOrdineAcquisto"]' passing corpo
      columns numero text path 'normalize-space(*[local-name()="IdDocumento"])',
        data text path 'normalize-space(*[local-name()="Data"])') x
  ), od_match as (
    select array(select distinct p.id from public.purchase_orders p
      cross join lateral (values(p.oda_number),(p.supplier_reference)) codici(codice)
      cross join lateral public.acquisti_numero_documento(codici.codice) n
      cross join lateral public.acquisti_numero_documento(citazione.numero) rc
      where p.company_id=f.company_id and p.supplier_id=f.fornitore_id
        and p.status not in ('bozza','annullato') and p.issue_date<=f.data_fattura
        and n.chiave=rc.chiave and (rc.serie is null or n.serie is null or rc.serie=n.serie)
        and (rc.anno is null or rc.anno=coalesce(n.anno,extract(year from p.issue_date)::int))
        and (citazione.data is null or citazione.data=p.issue_date)) ids
    from od_xml citazione
  )
  select coalesce(array_agg(distinct v.id) filter(where v.id is not null),'{}'),
    exists(select 1 from od_match where cardinality(ids)<>1) into ordini,ordine_irrisolto
  from (
    select ids[1] id from od_match where cardinality(ids)=1
    union select p.id from public.purchase_orders p where p.id=f.purchase_order_id
      and p.company_id=f.company_id and p.supplier_id=f.fornitore_id and p.status not in ('bozza','annullato') and not ordine_storico
  ) v;
  if ordine_irrisolto or ((ha_oda or f.purchase_order_id is not null) and cardinality(ordini)=0) then
    problemi:=problemi||jsonb_build_array(jsonb_build_object('tipo','ordine'));
  end if;
  if xpath_exists('/*/*[local-name()="DatiGenerali"]/*[local-name()="DatiGeneraliDocumento"]/*[local-name()="Divisa"][normalize-space(.) != "EUR"]',corpo) then
    problemi:=problemi||jsonb_build_array(jsonb_build_object('tipo','divisa'));
  end if;
  if f.verifica_manuale='da_rettificare' then
    problemi:=problemi||jsonb_build_array(jsonb_build_object('tipo','rettifica','motivo',f.rettifica_motivo));
  end if;

  if jsonb_array_length(riferimenti)>0 or cardinality(ordini)>0 then
    if not coalesce(xpath_exists('/*/*[local-name()="DatiBeniServizi"]/*[local-name()="DettaglioLinee"]',corpo),false) then
      problemi:=problemi||jsonb_build_array(jsonb_build_object('tipo','righe'));
    end if;
    legami:=private.fattura_documenti_per_riga(f,bolle,ordini);
    for r in
      select x.n,x.descrizione,public.fattura_numero(x.q) q,public.fattura_unita(x.um) um,
        public.fattura_numero(x.tot) tot,
        array(select distinct public.fattura_identita(a::text)
          from unnest(xpath('/*/*[local-name()="CodiceArticolo"]/*[local-name()="CodiceValore"]/text()',x.dettaglio)) a
          where public.fattura_identita(a::text)<>'') codici
      from xmltable('/*/*[local-name()="DatiBeniServizi"]/*[local-name()="DettaglioLinee"]' passing corpo
        columns n integer path '*[local-name()="NumeroLinea"]', descrizione text path '*[local-name()="Descrizione"]',
          q text path '*[local-name()="Quantita"]', um text path '*[local-name()="UnitaMisura"]',
          tot text path '*[local-name()="PrezzoTotale"]', dettaglio xml path '.') x order by x.n
    loop
      -- Oneri senza merce (trasporto, sconto, testo) non si confrontano come pezzi.
      if cardinality(r.codici)=0 and (r.q is null or coalesce(r.um,'')='') then continue; end if;
      if r.q is null or r.q<=0 or r.um='' or r.tot is null or r.tot<0 then
        problemi:=problemi||jsonb_build_array(jsonb_build_object('tipo','articolo','riga',r.n,'descrizione',r.descrizione));
        continue;
      end if;
      ddts_riga:=case when legami->'ddt_per_riga' ? r.n::text then
        array(select x::uuid from jsonb_array_elements_text(legami->'ddt_per_riga'->r.n::text) x) else bolle end;
      odas_riga:=case when legami->'oda_per_riga' ? r.n::text then
        array(select x::uuid from jsonb_array_elements_text(legami->'oda_per_riga'->r.n::text) x) else ordini end;
      if legami->'ddt_per_riga' ? r.n::text and cardinality(ddts_riga)=0 then
        if jsonb_array_length(mancanti)=0 then
          problemi:=problemi||jsonb_build_array(jsonb_build_object('tipo','articolo','riga',r.n,'descrizione',r.descrizione));
        end if;
        continue;
      end if;
      q_margine:=r.q*coalesce(g.acquisti_quantita_toll_perc,0)/100;
      q_calcolata:=null;

      select count(*) n,(array_agg(b.id))[1] id,(array_agg(b.ddt_ricezione_id))[1] bolla,
        (array_agg(b.purchase_order_item_id))[1] riga_ordine,(array_agg(b.quantita))[1] quantita,
        (array_agg(b.arrivo_registrato_il))[1] arrivo
      into d from public.ddt_righe b where b.company_id=f.company_id and b.ddt_ricezione_id=any(ddts_riga)
        and public.fattura_unita(b.unita_misura)=r.um
        and (public.fattura_identita(b.codice_articolo)=any(r.codici)
          or ((cardinality(r.codici)=0 or public.fattura_identita(b.codice_articolo)='')
            and length(public.fattura_identita(r.descrizione))>=8
            and public.fattura_identita(b.descrizione)=public.fattura_identita(r.descrizione)));

      if cardinality(ddts_riga)>0 and (d.n<>1 or d.id=any(gia_usate)) then
        problemi:=problemi||jsonb_build_array(jsonb_build_object('tipo','articolo','riga',r.n,'descrizione',r.descrizione));
        continue;
      end if;
      if d.n=1 then
        gia_usate:=array_append(gia_usate,d.id);
        select coalesce(sum(greatest(c.quantita-coalesce(resi.totale,0),0)),0)
        into somma_consegnata from public.ddt_consegne c
        left join lateral (
          select sum(s.quantita) totale from public.ddt_consegne s where s.company_id=f.company_id
            and s.consegna_origine_id=c.id and s.tipo='reso'
        ) resi on true
        where c.company_id=f.company_id and c.riga_id=d.id and c.tipo='ingresso'
          and public.fattura_unita(c.unita_misura)=r.um;
        if somma_consegnata=0 and d.arrivo is not null
          and not exists(select 1 from public.ddt_consegne c where c.company_id=f.company_id and c.riga_id=d.id) then
          somma_consegnata:=coalesce(d.quantita,0);
        end if;
        select coalesce(sum(c.quantita),0) into somma_consumata
        from public.fattura_ddt_consumi(f.company_id,array[d.bolla],f.id) c where c.riga_id=d.id;
        q_calcolata:=greatest(0,somma_consegnata-somma_consumata);
      end if;

      select count(*) n,(array_agg(i.purchase_order_id))[1] ordine,
        (array_agg(i.unit_price*(1-coalesce(i.discount_percent,0)/100)))[1] unitario,
        (array_agg(i.quantity_received))[1] ricevuto, (array_agg(i.quantity))[1] ordinato
      into o from public.purchase_order_items i
      join public.purchase_orders po on po.id=i.purchase_order_id and po.company_id=f.company_id
        and po.supplier_id=f.fornitore_id and po.status not in ('bozza','annullato')
      where i.company_id=f.company_id and public.fattura_unita(i.unit_of_measure)=r.um and (
        (i.id=d.riga_ordine and (not ha_oda or po.id=any(odas_riga)))
        or (d.riga_ordine is null and (po.id=any(odas_riga) or (not ha_oda and exists(
          select 1 from public.ddt_consegne c where c.company_id=f.company_id and c.riga_id=d.id and c.purchase_order_item_id=i.id
        )))
          and public.fattura_identita(i.sku)=any(r.codici))
      ) and not i.price_pending;
      if o.n=1 then
        if q_calcolata is null and jsonb_array_length(riferimenti)=0 then q_calcolata:=coalesce(o.ricevuto,0); end if;
        prezzo:=round(r.tot/r.q,4);
        p_margine:=greatest(abs(o.unitario)*coalesce(g.acquisti_prezzo_toll_perc,0)/100,
          coalesce(g.acquisti_prezzo_toll_cent,1)/100);
        if o.unitario is not null and abs(prezzo-o.unitario)>p_margine then
          problemi:=problemi||jsonb_build_array(jsonb_build_object('tipo','prezzo','riga',r.n,'descrizione',r.descrizione,
            'ordine_id',o.ordine,'prezzo_fattura',prezzo,'prezzo_ordine',round(o.unitario,4)));
        end if;
      elsif ha_oda or cardinality(odas_riga)>0 then
        problemi:=problemi||jsonb_build_array(jsonb_build_object('tipo','ordine','riga',r.n,'descrizione',r.descrizione));
      end if;
      if q_calcolata is not null and r.q-q_calcolata>greatest(q_margine,0.000001) then
        problemi:=problemi||jsonb_build_array(jsonb_build_object('tipo','quantita','riga',r.n,'descrizione',r.descrizione,
          'ddt_id',d.bolla,'ordine_id',o.ordine,'fatturata',r.q,'ricevuta',q_calcolata,'mancante',r.q-q_calcolata,'unita',r.um));
      end if;
    end loop;
  end if;

  if jsonb_array_length(mancanti)=0 and jsonb_array_length(problemi)=0 then
    return jsonb_build_object('stato',case when f.pagata_il is null then 'pronta' else 'chiusa' end,
      'bloccata',false,'numero',f.numero_fattura,'ddt',mancanti,'problemi',problemi);
  end if;
  select s.residuo into residuo from private.fatture_ricevute_calcola_saldi(f.company_id,null,f.id) s;
  data_consegna:=coalesce((select min(rata.scadenza) from public.rate_fornitori rata where rata.company_id=f.company_id
      and rata.fattura_ricevuta_id=f.id and rata.stato not in ('pagata','stornata') and rata.scadenza<date '9999-12-31'),
    (select min(nullif(s.due_date,date '9999-12-31')) from public.scadenze s where s.company_id=f.company_id
      and s.cost_id=f.company_cost_id and s.direction='uscita' and s.status in ('da_pagare','parziale')));
  impronta_attuale:=md5(jsonb_build_array(f.fornitore_id,f.totale_documento,md5(f.xml_raw),mancanti,problemi)::text);
  select v.nota into nota from private.pagamenti_verifiche_fornitori v
  where v.company_id=f.company_id and v.fattura_id=f.id and v.impronta=impronta_attuale;
  stato_fattura:=jsonb_build_object('stato',case when f.pagata_il is not null or residuo=0 then 'chiusa'
    when nota is not null and coalesce(f.verifica_manuale,'')<>'da_rettificare'
      and not (problemi @> '[{"tipo":"divisa"}]') then 'verificata'
    when jsonb_array_length(mancanti)>0 or jsonb_array_length(problemi)>0 then 'da_verificare'
    else 'pronta' end,'bloccata',false,'impronta',impronta_attuale,'ddt',mancanti,'problemi',problemi,'nota',nota,
    'scadenza',data_consegna,'numero',f.numero_fattura,'data',f.data_fattura,'fornitore',f.cedente_ragione_sociale,
    'puo_confermare',coalesce(f.verifica_manuale,'')<>'da_rettificare' and not (problemi @> '[{"tipo":"divisa"}]'));
  return jsonb_set(stato_fattura,'{bloccata}',to_jsonb(stato_fattura->>'stato'='da_verificare'));
exception when data_exception then
  return jsonb_build_object('stato','da_verificare','bloccata',true,'ddt','[]'::jsonb,
    'problemi',jsonb_build_array(jsonb_build_object('tipo','righe')),'impronta',md5(coalesce(f.xml_raw,'')||coalesce(f.righe::text,'')),
    'numero',f.numero_fattura,'data',f.data_fattura,'fornitore',f.cedente_ragione_sociale);
end
$$;

create or replace function private.operazioni_accoda(p_tipo text,p_id uuid)
returns void language sql set search_path='' as $$
  insert into private.operazioni_coda(tipo,origine_id,quando)
  select p_tipo,p_id,now() where p_id is not null
  on conflict(tipo,origine_id) do update set quando=excluded.quando,tentativi=0,ultimo_errore=null
$$;

create or replace function private.operazioni_eccezione_salva(p_company uuid,p_tipo text,p_origine uuid,p_commessa uuid,
  p_responsabile uuid,p_scadenza date,p_titolo text,p_dati jsonb)
returns void language sql set search_path='' as $$
  with aggiornata as (
  insert into private.operazioni_eccezioni as e(company_id,tipo,origine_id,commessa_id,responsabile,scadenza,titolo,dati)
  values(p_company,p_tipo,p_origine,p_commessa,p_responsabile,p_scadenza,p_titolo,p_dati)
  on conflict(company_id,tipo,origine_id) do update set
    commessa_id=excluded.commessa_id,
    responsabile=case when e.chiusa_il is not null then excluded.responsabile else coalesce(e.responsabile,excluded.responsabile) end,
    scadenza=excluded.scadenza,titolo=excluded.titolo,dati=excluded.dati,chiusa_il=null,
    aperta_il=case when e.chiusa_il is not null then now() else e.aperta_il end,aggiornata_il=now()
  where (e.commessa_id,e.scadenza,e.titolo,e.dati,e.chiusa_il) is distinct from
    (excluded.commessa_id,excluded.scadenza,excluded.titolo,excluded.dati,null::timestamptz)
  returning e.*
  )
  insert into public.notifications(company_id,user_id,type,title,body,entity_type,entity_id,action_url)
  select e.company_id,e.responsabile,'warning',e.titolo,
    concat('Da fare entro il ',to_char(e.scadenza,'DD/MM/YYYY')),
    'operazioni_eccezione',e.id,
    case when e.tipo='cantiere' then '/azienda/ordini/'||e.commessa_id::text
         else '/azienda/documenti/fatture-ricevute?fattura='||e.origine_id::text end
  from aggiornata e where e.responsabile is not null and e.aperta_il=now()
    and not exists(select 1 from public.notifications n where n.company_id=e.company_id
      and n.user_id=e.responsabile and n.entity_type='operazioni_eccezione' and n.entity_id=e.id
      and n.created_at>=e.aperta_il)
$$;

create or replace function private.operazioni_eccezione_chiudi(p_tipo text,p_origine uuid)
returns void language sql set search_path='' as $$
  update private.operazioni_eccezioni set chiusa_il=now(),aggiornata_il=now()
  where tipo=p_tipo and origine_id=p_origine and chiusa_il is null
$$;

-- Si precompila il responsabile se individuato per la commessa o se l'azienda
-- ha un unico amministratore. Altrimenti il lavoro rimane al gruppo competente.
create or replace function private.operazioni_responsabile(p_company uuid,p_persona uuid default null,p_tipo text default null)
returns uuid language sql stable set search_path='' as $$
  select coalesce(
    (select p.id from public.profiles p where p.id=p_persona and p.company_id=p_company
      and p.deleted_at is null and not coalesce(p.is_blocked,false)),
    (select (array_agg(p.id order by p.id))[1] from public.profiles p
      where p.company_id=p_company and p.deleted_at is null and not coalesce(p.is_blocked,false)
        and exists(select 1 from public.staff_permissions perm where perm.company_id=p_company and perm.user_id=p.id
          and (p_tipo='ddt' and perm.can_manage_purchasing or p_tipo='pagamento' and perm.can_manage_payments))
      having count(*)=1),
    (select (array_agg(p.id order by p.id))[1] from public.profiles p
      where p.company_id=p_company and p.deleted_at is null and not coalesce(p.is_blocked,false)
        and exists(select 1 from public.user_roles r where r.user_id=p.id and r.role='company_admin')
      having count(*)=1))
$$;

create or replace function private.operazioni_fattura_processa(p_fattura uuid)
returns void language plpgsql set search_path='' as $$
declare
  f public.fatture_ricevute%rowtype;
  verifica jsonb;
  scad date;
  referente uuid;
begin
  select * into f from public.fatture_ricevute where id=p_fattura;
  verifica:=private.pagamento_fornitore_controllo(p_fattura);
  if verifica->>'stato'='non_applicabile' then
    perform private.operazioni_eccezione_chiudi('ddt',p_fattura);
    perform private.operazioni_eccezione_chiudi('pagamento',p_fattura);
    return;
  end if;
  scad:=coalesce((verifica->>'scadenza')::date,
    (select min(e.scadenza) from private.operazioni_eccezioni e where e.company_id=f.company_id
      and e.origine_id=f.id and e.chiusa_il is null),(now() at time zone 'Europe/Rome')::date+2);
  if jsonb_array_length(verifica->'ddt')>0 then
    referente:=private.operazioni_responsabile(f.company_id,null,'ddt');
    perform private.operazioni_eccezione_salva(f.company_id,'ddt',f.id,null,referente,scad,
      'Completa i DDT della fattura '||f.numero_fattura,verifica-'problemi'-'nota');
  else
    perform private.operazioni_eccezione_chiudi('ddt',p_fattura);
  end if;
  if verifica->>'stato'='da_verificare' and jsonb_array_length(verifica->'problemi')>0 then
    referente:=private.operazioni_responsabile(f.company_id,null,'pagamento');
    perform private.operazioni_eccezione_salva(f.company_id,'pagamento',f.id,null,referente,scad,
      'Verifica la fattura '||f.numero_fattura||' prima del pagamento',verifica-'ddt'-'nota');
  else
    perform private.operazioni_eccezione_chiudi('pagamento',p_fattura);
  end if;
end
$$;

create or replace function private.operazioni_fattura_evento()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if tg_table_name='fattura_prezzi_verifiche' then
    perform private.operazioni_accoda('fattura',new.fattura_id);
  elsif tg_table_name='note_credito_storni' then
    if tg_op<>'DELETE' then perform private.operazioni_accoda('fattura',new.fattura_id); end if;
    if tg_op<>'INSERT' then perform private.operazioni_accoda('fattura',old.fattura_id); end if;
  elsif tg_op='DELETE' then
    perform private.operazioni_accoda('fattura',old.id);
  elsif new.purchase_order_id is not null or private.ddt_prezzi_documentata(new) or new.verifica_manuale='da_rettificare'
    or exists(select 1 from private.operazioni_eccezioni e where e.company_id=new.company_id and e.origine_id=new.id
      and e.tipo in ('ddt','pagamento') and e.chiusa_il is null) then
    perform private.operazioni_accoda('fattura',new.id);
  end if;
  return null;
end
$$;
create or replace trigger operazioni_fattura_evento
  after insert or update of stato,pagata_il,purchase_order_id,xml_raw,indice_corpo,righe,totale_documento,verifica_manuale,rettifica_motivo or delete
  on public.fatture_ricevute for each row execute function private.operazioni_fattura_evento();
create or replace trigger operazioni_fattura_ddt_evento
  after insert or update of revisione on private.fattura_prezzi_verifiche
  for each row execute function private.operazioni_fattura_evento();
create or replace trigger operazioni_storno_evento
  after insert or update or delete on public.note_credito_storni
  for each row execute function private.operazioni_fattura_evento();

create or replace function private.operazioni_eccezione_visibile(e private.operazioni_eccezioni)
returns boolean language sql stable set search_path='' as $$
  select coalesce(case e.tipo
    when 'ddt' then private.operazioni_puo_fattura(e.company_id)
      or public.acquisti_puo_collegare(e.company_id)
    when 'pagamento' then private.operazioni_puo_fattura(e.company_id)
    when 'cantiere' then exists(
      select 1 from public.orders o where o.id=e.commessa_id and o.company_id=e.company_id and o.deleted_at is null
        and public.user_can_access_company(o.company_id)
        and public.can_see_order(o.id,o.assigned_to,o.destination_warehouse_id))
    else false end,false)
$$;

create or replace function public.operazioni_eccezioni_elenco(p_company uuid,p_tipo text default null,
  p_chiuse boolean default false,p_commessa uuid default null,p_offset integer default 0)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  perform public.assert_company_access(p_company);
  if auth.uid() is null or public.utente_bloccato() or public.utente_e_cliente_esterno() then
    raise exception 'Accesso alle attività non consentito' using errcode='42501';
  end if;
  return (select coalesce(jsonb_agg(to_jsonb(v) order by v.scadenza,v.id),'[]') from (
    select e.id,e.tipo,e.origine_id,e.commessa_id,e.scadenza,e.titolo,e.dati,e.aperta_il,e.chiusa_il,e.responsabile,
      nullif(concat_ws(' ',p.first_name,p.last_name),'') nome_responsabile,
      not public.utente_sola_lettura(p_company) and (e.responsabile is null or private.operazioni_puo_approvare(p_company)) puo_prendere
    from private.operazioni_eccezioni e left join public.profiles p on p.id=e.responsabile and p.company_id=e.company_id
    where e.company_id=p_company and (e.chiusa_il is not null)=p_chiuse and (p_tipo is null or e.tipo=p_tipo)
      and (p_commessa is null or e.commessa_id=p_commessa) and private.operazioni_eccezione_visibile(e)
    order by e.scadenza,e.id limit 50 offset greatest(coalesce(p_offset,0),0)
  ) v);
end
$$;

create or replace function public.operazioni_eccezione_prendi(p_company uuid,p_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare e private.operazioni_eccezioni%rowtype;
begin
  perform public.assert_company_access(p_company);
  if auth.uid() is null or public.utente_bloccato() or public.utente_e_cliente_esterno() or public.utente_sola_lettura(p_company) then
    raise exception 'Non puoi prendere in carico questa attività' using errcode='42501';
  end if;
  select * into e from private.operazioni_eccezioni where id=p_id and company_id=p_company and chiusa_il is null for update;
  if not found or not private.operazioni_eccezione_visibile(e) then
    raise exception 'Attività non disponibile' using errcode='42501';
  end if;
  if e.responsabile is not null and e.responsabile<>auth.uid() and not private.operazioni_puo_approvare(p_company) then
    raise exception 'L’attività è già assegnata' using errcode='PT409';
  end if;
  update private.operazioni_eccezioni set responsabile=auth.uid(),aggiornata_il=now() where id=e.id;
end
$$;

create or replace function public.operazioni_fattura_controllo(p_company uuid,p_fattura uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  if not private.operazioni_puo_fattura(p_company) or not exists(
    select 1 from public.fatture_ricevute where id=p_fattura and company_id=p_company) then
    raise exception 'Non puoi verificare questa fattura' using errcode='42501';
  end if;
  return private.pagamento_fornitore_controllo(p_fattura)||jsonb_build_object('puo_approvare',private.operazioni_puo_approvare(p_company));
end
$$;

create or replace function public.operazioni_fattura_conferma(p_company uuid,p_fattura uuid,p_impronta text,p_nota text)
returns void language plpgsql security definer set search_path='' as $$
declare verifica jsonb;
begin
  if not private.operazioni_puo_approvare(p_company) then
    raise exception 'Serve il permesso di approvare i pagamenti' using errcode='42501';
  end if;
  if p_nota is null or length(btrim(p_nota)) not between 3 and 1000 then
    raise exception 'Indica il motivo della conferma' using errcode='22023';
  end if;
  perform 1 from public.fatture_ricevute where id=p_fattura and company_id=p_company for update;
  if not found then raise exception 'Fattura non disponibile' using errcode='P0002'; end if;
  verifica:=private.pagamento_fornitore_controllo(p_fattura);
  if verifica->>'puo_confermare'='false' then
    raise exception 'Completa la rettifica o verifica la valuta prima di confermare.' using errcode='PT409';
  end if;
  if verifica->>'stato'<>'da_verificare' or p_impronta is distinct from verifica->>'impronta' then
    raise exception 'La verifica è cambiata. Ricaricala prima di confermare.' using errcode='PT409';
  end if;
  insert into private.pagamenti_verifiche_fornitori(company_id,fattura_id,impronta,nota,verificata_da)
  values(p_company,p_fattura,p_impronta,btrim(p_nota),auth.uid()) on conflict do nothing;
  perform private.operazioni_fattura_processa(p_fattura);
end
$$;

create or replace function private.operazioni_coda_lavora(p_limite integer default 25)
returns integer language plpgsql set search_path='' as $$
declare r record; numero integer:=0;
begin
  for r in select q.* from private.operazioni_coda q where q.tipo='fattura' and q.quando<=now()
    order by q.quando,q.origine_id limit least(greatest(p_limite,1),50) for update skip locked
  loop
    begin
      perform private.operazioni_fattura_processa(r.origine_id);
      delete from private.operazioni_coda where tipo=r.tipo and origine_id=r.origine_id;
      numero:=numero+1;
    exception when others then
      update private.operazioni_coda set tentativi=r.tentativi+1,
        quando=now()+make_interval(mins=>least(60,1+r.tentativi*5)),ultimo_errore=left(sqlstate||' '||sqlerrm,300)
      where tipo=r.tipo and origine_id=r.origine_id;
    end;
  end loop;
  return numero;
end
$$;
select cron.schedule('operazioni-eccezioni','* * * * *',
  $$set statement_timeout='45s'; select private.operazioni_coda_lavora(25);$$);

revoke all on function private.operazioni_puo_approvare(uuid),private.operazioni_puo_fattura(uuid),
  private.pagamento_fornitore_controllo(uuid),private.operazioni_accoda(text,uuid),
  private.operazioni_eccezione_salva(uuid,text,uuid,uuid,uuid,date,text,jsonb),
  private.operazioni_eccezione_chiudi(text,uuid),private.operazioni_responsabile(uuid,uuid,text),
  private.operazioni_fattura_processa(uuid),private.operazioni_fattura_evento(),
  private.operazioni_eccezione_visibile(private.operazioni_eccezioni),private.operazioni_coda_lavora(integer)
from public,anon,authenticated,service_role;
revoke all on function public.operazioni_eccezioni_elenco(uuid,text,boolean,uuid,integer),public.operazioni_eccezione_prendi(uuid,uuid),
  public.operazioni_fattura_controllo(uuid,uuid),public.operazioni_fattura_conferma(uuid,uuid,text,text)
from public,anon,service_role;
grant execute on function public.operazioni_eccezioni_elenco(uuid,text,boolean,uuid,integer),public.operazioni_eccezione_prendi(uuid,uuid),
  public.operazioni_fattura_controllo(uuid,uuid),public.operazioni_fattura_conferma(uuid,uuid,text,text) to authenticated;
notify pgrst,'reload schema';

