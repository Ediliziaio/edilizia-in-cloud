-- Le destinazioni provate dai DDT si riflettono sul costo della fattura già contabilizzata.
-- Nessuna contabilizzazione, modifica della lettura o riclassificazione massiva dello storico.
set local lock_timeout = '3s';
set local statement_timeout = '60s';

create table if not exists private.fattura_ddt_ripartizioni (
  fattura_id uuid primary key references public.fatture_ricevute(id) on delete cascade,
  cost_id uuid not null references public.company_costs(id) on delete cascade,
  applicata jsonb not null,
  bloccata boolean not null default false,
  updated_at timestamptz not null default now()
);
revoke all on private.fattura_ddt_ripartizioni from public, anon, authenticated;
alter table private.fattura_ddt_ripartizioni enable row level security;
create index if not exists fattura_ddt_ripartizioni_costo on private.fattura_ddt_ripartizioni(cost_id);

create or replace function private.fattura_ddt_piano(p_fattura uuid)
returns jsonb language plpgsql security invoker set search_path = '' as $function$
declare
  f public.fatture_ricevute%rowtype;
  documento xml; corpo xml; riferimenti jsonb := '[]'; bolle jsonb := '[]';
  righe jsonb := '[]'; attribuite jsonb := '[]'; quote jsonb := '[]'; destinazioni jsonb;
  r record; x jsonb; scelta jsonb; costo jsonb; risultato jsonb;
  base numeric; totale numeric; accessori numeric := 0; assegnato numeric := 0; quota numeric; magazzino numeric := 0;
  motivo text; n integer; indice integer := 0;
begin
  select * into f from public.fatture_ricevute where id=p_fattura;
  if not found then return null; end if;
  base := abs(coalesce(f.imponibile_totale,f.totale_documento,0));
  if nullif(f.xml_raw,'') is not null then
    begin
      documento := xmlparse(document f.xml_raw);
      corpo := (xpath('(//*[local-name()="FatturaElettronicaBody"])[' || (coalesce(f.indice_corpo,0)+1) || ']',documento))[1];
      -- Il corpo è selezionato prima dei riferimenti: un XML multi-corpo non mescola fatture diverse.
      if corpo is null then motivo := 'Il corpo XML della fattura non è disponibile.';
      else
        select coalesce(jsonb_agg(jsonb_build_object('numero',btrim(t.numero),'data',nullif(t.data,''),
          'righe',coalesce((select jsonb_agg((v::text)::integer) from unnest(xpath('//*[local-name()="RiferimentoNumeroLinea"]/text()',t.doc)) v where v::text ~ '^[0-9]{1,8}$'),'[]'::jsonb))),'[]'::jsonb)
          into riferimenti from xmltable('//*[local-name()="DatiDDT"]' passing corpo
          columns numero text path '*[local-name()="NumeroDDT"]',data text path '*[local-name()="DataDDT"]',doc xml path '.') t
          where nullif(btrim(t.numero),'') is not null;
        select coalesce(jsonb_agg(jsonb_build_object('numero',t.numero,'importo',t.importo,'descrizione',t.descrizione,'tipo',t.tipo)),'[]'::jsonb)
          into righe from xmltable('//*[local-name()="DettaglioLinee"]' passing corpo
          columns numero integer path '*[local-name()="NumeroLinea"]',importo numeric path '*[local-name()="PrezzoTotale"]',
            descrizione text path '*[local-name()="Descrizione"]',tipo text path '*[local-name()="TipoCessionePrestazione"]') t;
      end if;
    exception when data_exception then
      motivo := 'I riferimenti XML non sono leggibili: controlla la ripartizione.';
    end;
  end if;

  with legami as materialized (
    select l.id,l.numero_ddt,l.data_ddt,l.ddt_ricezione_id,d.id documento_id,d.order_id,d.purchase_order_id,
      d.warehouse_id,d.destinazione,d.supplier_id
    from public.fattura_ddt l left join public.ddt_ricezione d on d.id=l.ddt_ricezione_id and d.company_id=f.company_id
    where l.company_id=f.company_id and l.fattura_ricevuta_id=f.id
  ), ordini_bolle as (
    select l.documento_id,l.purchase_order_id from legami l where l.purchase_order_id is not null
    union select l.documento_id,q.purchase_order_id from legami l join public.ddt_ordini_acquisto q on q.ddt_id=l.documento_id and q.company_id=f.company_id
  ), possibili as (
    select documento_id,'commessa'::text tipo,order_id::text id from legami where order_id is not null
    union select l.documento_id,'magazzino',coalesce(l.warehouse_id::text,'magazzino') from legami l where l.order_id is null and (l.destinazione='magazzino' or l.warehouse_id is not null)
    union select l.documento_id,'commessa',p.order_id::text from ordini_bolle l join public.purchase_orders p on p.id=l.purchase_order_id and p.company_id=f.company_id where p.order_id is not null
    union select l.documento_id,'magazzino',p.delivery_warehouse_id::text from ordini_bolle l join public.purchase_orders p on p.id=l.purchase_order_id and p.company_id=f.company_id where p.order_id is null and p.delivery_warehouse_id is not null
    union select l.documento_id,'commessa',i.order_id::text from legami l join public.ddt_righe q on q.ddt_ricezione_id=l.documento_id and q.company_id=f.company_id join public.order_items i on i.id=q.order_item_id where i.order_id is not null
    union select l.documento_id,'commessa',q.order_id::text from legami l join public.ddt_consegne q on q.ddt_id=l.documento_id and q.company_id=f.company_id where q.tipo<>'reso' and q.order_id is not null
    union select l.documento_id,'magazzino',coalesce(q.warehouse_id::text,'magazzino') from legami l join public.ddt_consegne q on q.ddt_id=l.documento_id and q.company_id=f.company_id where q.tipo<>'reso' and q.order_id is null and q.destinazione='magazzino'
    union select l.documento_id,'commessa',i.order_id::text from legami l join public.goods_receipts q on q.ddt_ricezione_id=l.documento_id and q.company_id=f.company_id join public.order_items i on i.id=q.order_item_id where i.order_id is not null
    union select l.documento_id,'magazzino',q.warehouse_id::text from legami l join public.goods_receipts q on q.ddt_ricezione_id=l.documento_id and q.company_id=f.company_id left join public.order_items i on i.id=q.order_item_id where i.order_id is null and q.warehouse_id is not null
  ), destinazioni as (
    select p.documento_id,jsonb_agg(jsonb_build_object('tipo',p.tipo,'id',p.id,'codice',case when p.tipo='commessa' then o.order_code else 'Magazzino' end,
      'valida',p.tipo='magazzino' or o.id is not null) order by p.tipo,p.id) valori
    from possibili p left join public.orders o on p.tipo='commessa' and o.id::text=p.id and o.company_id=f.company_id and o.deleted_at is null group by p.documento_id
  ) select coalesce(jsonb_agg(jsonb_build_object('id',l.id,'numero',l.numero_ddt,'data',l.data_ddt,'ddt_id',l.ddt_ricezione_id,
      'destinazioni',coalesce(d.valori,'[]'::jsonb),'esito',case
        when l.ddt_ricezione_id is null then 'mancante'
        when l.documento_id is null then 'non_disponibile'
        when f.fornitore_id is null or l.supplier_id is distinct from f.fornitore_id then 'fornitore_da_verificare'
        when coalesce(jsonb_array_length(d.valori),0)=0 then 'senza_destinazione'
        when exists(select 1 from jsonb_array_elements(d.valori) z where z->>'valida'='false') then 'non_disponibile'
        when jsonb_array_length(d.valori)>1 then 'piu_destinazioni'
        else 'collegato' end) order by l.data_ddt,l.numero_ddt),'[]'::jsonb) into bolle
    from legami l left join destinazioni d on d.documento_id=l.documento_id;

  -- Anche un riferimento che il vecchio import non ha salvato conta tra i mancanti.
  for x in select distinct jsonb_build_object('numero',q->>'numero','data',q->>'data') from jsonb_array_elements(riferimenti) q loop
    if not exists(select 1 from jsonb_array_elements(bolle) d where
      regexp_replace(upper(d->>'numero'),'[^A-Z0-9]','','g')=regexp_replace(upper(x->>'numero'),'[^A-Z0-9]','','g')
      and ((x->>'data') is null or d->>'data'=x->>'data')) then
      bolle := bolle || jsonb_build_array(x || jsonb_build_object('id',null,'ddt_id',null,'destinazioni','[]'::jsonb,'esito','mancante'));
    end if;
  end loop;
  risultato := jsonb_build_object('ddt',bolle,'base',base,'completo',false,'quote','[]'::jsonb,'magazzino',0);
  if motivo is not null then return risultato || jsonb_build_object('motivo',motivo); end if;
  if jsonb_array_length(bolle)=0 then return risultato || jsonb_build_object('motivo','Nessun DDT citato o collegato.'); end if;
  if jsonb_array_length(bolle)>250 or jsonb_array_length(righe)>2000 then return risultato || jsonb_build_object('motivo','Molti riferimenti: verifica manualmente le quote.'); end if;
  if exists(select 1 from jsonb_array_elements(bolle) d where d->>'esito'<>'collegato') then
    return risultato || jsonb_build_object('motivo','Completa i DDT mancanti e le loro destinazioni prima di ripartire il costo.');
  end if;
  if base<=0 or public.e_nota_credito_ricevuta(f.tipo_documento) or f.stato='rifiutata' then
    return risultato || jsonb_build_object('motivo','Questa fattura richiede una ripartizione manuale.');
  end if;
  select jsonb_agg(z) into destinazioni from (select distinct d->'destinazioni'->0 z from jsonb_array_elements(bolle) d) q;
  if jsonb_array_length(destinazioni)=1 then
    attribuite := jsonb_build_array((destinazioni->0) || jsonb_build_object('importo',base,'righe','[]'::jsonb));
  else
    if jsonb_array_length(righe)=0 then return risultato || jsonb_build_object('motivo','Più destinazioni: servono le righe della fattura per calcolare le quote.'); end if;
    select sum((q->>'importo')::numeric),count(distinct q->>'numero') into totale,n from jsonb_array_elements(righe) q;
    if totale is null or abs(totale-base)>0.01 or n<>jsonb_array_length(righe) or exists(select 1 from jsonb_array_elements(righe) q where q->>'importo' is null or q->>'numero' is null) then
      return risultato || jsonb_build_object('motivo','Le righe non coincidono con l’imponibile: verifica manualmente le quote.');
    end if;
    for x in select * from jsonb_array_elements(righe) loop
      select jsonb_agg(z) into destinazioni from (
        select distinct d->'destinazioni'->0 z from jsonb_array_elements(riferimenti) rf join jsonb_array_elements(bolle) d on
          regexp_replace(upper(d->>'numero'),'[^A-Z0-9]','','g')=regexp_replace(upper(rf->>'numero'),'[^A-Z0-9]','','g')
          and ((rf->>'data') is null or rf->>'data'=d->>'data')
        where rf->'righe' @> jsonb_build_array((x->>'numero')::integer)
          or (jsonb_array_length(rf->'righe')=0 and not exists(select 1 from jsonb_array_elements(riferimenti) rr where rr->'righe' @> jsonb_build_array((x->>'numero')::integer)))
      ) q;
      if coalesce(jsonb_array_length(destinazioni),0)=1 then
        attribuite := attribuite || jsonb_build_array((destinazioni->0) || jsonb_build_object('importo',(x->>'importo')::numeric,'righe',jsonb_build_array((x->>'numero')::integer)));
      elsif coalesce(jsonb_array_length(destinazioni),0)=0 and (x->>'tipo'='AC' or coalesce(x->>'descrizione','') ~* '(trasport|spedizion|imball|spese di incasso|contributo conai|bollo)') then
        accessori := accessori+(x->>'importo')::numeric;
      else
        return risultato || jsonb_build_object('motivo','La riga ' || (x->>'numero') || ' non ha una destinazione DDT univoca: completa la ripartizione.');
      end if;
    end loop;
  end if;
  select coalesce(sum((q->>'importo')::numeric),0) into totale from jsonb_array_elements(attribuite) q;
  if totale<=0 then return risultato || jsonb_build_object('motivo','Non ci sono importi attribuibili con certezza.'); end if;
  -- Accessori in proporzione al valore merce, con il resto dei centesimi sull’ultima destinazione.
  for r in select g.*,
      coalesce((select jsonb_agg(distinct v order by v) from jsonb_array_elements(attribuite) z cross join lateral jsonb_array_elements(z->'righe') v where z->>'tipo'=g.tipo and z->>'id'=g.id),'[]'::jsonb) righe
      from (select q->>'tipo' tipo,q->>'id' id,sum((q->>'importo')::numeric) importo from jsonb_array_elements(attribuite) q group by q->>'tipo',q->>'id') g order by g.tipo,g.id
  loop
    indice:=indice+1;
    select count(*) into n from (select distinct q->>'tipo',q->>'id' from jsonb_array_elements(attribuite) q) z;
    quota:=case when indice=n then base-assegnato else round(r.importo+accessori*r.importo/totale,2) end;
    if quota<=0 then return risultato || jsonb_build_object('motivo','Una quota non è positiva: verifica manualmente la ripartizione.'); end if;
    assegnato:=assegnato+quota;
    if r.tipo='magazzino' then magazzino:=magazzino+quota;
    else quote:=quote || jsonb_build_array(jsonb_build_object('order_id',r.id,'importo',quota,'pct',round(quota/base*100,4),'righe',r.righe)); end if;
  end loop;
  costo:=jsonb_build_object('order_id',case when jsonb_array_length(quote)=1 and magazzino=0 then quote->0->>'order_id' end,
    'allocations',case when jsonb_array_length(quote)=1 and magazzino=0 then '[]'::jsonb else quote end,
    'quota_magazzino',nullif(magazzino,0),'quota_magazzino_righe',null);
  return risultato || jsonb_build_object('completo',true,'quote',quote,'magazzino',magazzino,'costo',costo,'motivo','Quote ricavate dalle destinazioni e dalle righe DDT della fattura.');
end $function$;
revoke all on function private.fattura_ddt_piano(uuid) from public,anon,authenticated;

create or replace function private.fattura_ddt_allinea(p_fattura uuid)
returns text language plpgsql security definer set search_path = '' as $function$
declare
  f public.fatture_ricevute%rowtype; c public.company_costs%rowtype;
  precedente private.fattura_ddt_ripartizioni%rowtype;
  piano jsonb; attuale jsonb; prossimo jsonb;
begin
  select * into f from public.fatture_ricevute where id=p_fattura for update;
  if not found or f.company_cost_id is null then return 'senza_costo'; end if;
  if not public.azienda_collegamento_automatico(f.company_id) then return 'automatico_spento'; end if;
  if f.purchase_order_id is not null or exists(select 1 from public.fattura_ricevuta_ordini where fattura_id=f.id)
    or exists(select 1 from public.fatture_ricevute where company_cost_id=f.company_cost_id and id<>f.id) then return 'gestita_altrove'; end if;
  select * into c from public.company_costs where id=f.company_cost_id and company_id=f.company_id for update;
  if not found or c.purchase_order_id is not null or c.order_external_team_id is not null or c.annullato_il is not null then return 'gestita_altrove'; end if;
  select * into precedente from private.fattura_ddt_ripartizioni where fattura_id=f.id;
  attuale:=jsonb_build_object('order_id',c.order_id,'allocations',coalesce(c.allocations,'[]'::jsonb),
    'quota_magazzino',nullif(c.quota_magazzino,0),'quota_magazzino_righe',c.quota_magazzino_righe);
  if precedente.bloccata or (precedente.fattura_id is not null and (precedente.cost_id<>c.id or precedente.applicata<>attuale))
    or coalesce(f.aggancio_oda_manuale,false) or (precedente.fattura_id is null and (c.order_id is not null or jsonb_array_length(coalesce(c.allocations,'[]'))>0 or coalesce(c.quota_magazzino,0)>0)) then return 'manuale'; end if;
  piano:=private.fattura_ddt_piano(f.id);
  if abs(abs(coalesce(c.amount,0))-(piano->>'base')::numeric)>0.01 then return 'gestita_altrove'; end if;
  prossimo:=case when (piano->>'completo')::boolean then piano->'costo' else
    jsonb_build_object('order_id',null,'allocations','[]'::jsonb,'quota_magazzino',null,'quota_magazzino_righe',null) end;
  if attuale=prossimo then return case when (piano->>'completo')::boolean then 'allineata' else 'da_completare' end; end if;
  -- La provenienza viene salvata PRIMA del costo: una scelta manuale successiva la blocca.
  insert into private.fattura_ddt_ripartizioni(fattura_id,cost_id,applicata) values(f.id,c.id,prossimo)
    on conflict(fattura_id) do update set cost_id=excluded.cost_id,applicata=excluded.applicata,updated_at=now();
  update public.company_costs set order_id=(prossimo->>'order_id')::uuid,allocations=prossimo->'allocations',
    quota_magazzino=(prossimo->>'quota_magazzino')::numeric,quota_magazzino_righe=null,updated_at=now() where id=c.id;
  return case when (piano->>'completo')::boolean then 'allineata' else 'da_completare' end;
end $function$;
revoke all on function private.fattura_ddt_allinea(uuid) from public,anon,authenticated;

create or replace function private.fattura_ddt_proteggi_scelta()
returns trigger language plpgsql security definer set search_path = '' as $function$
begin
  update private.fattura_ddt_ripartizioni set bloccata=true,updated_at=now() where cost_id=new.id and not bloccata and applicata <>
    jsonb_build_object('order_id',new.order_id,'allocations',coalesce(new.allocations,'[]'::jsonb),
      'quota_magazzino',nullif(new.quota_magazzino,0),'quota_magazzino_righe',new.quota_magazzino_righe);
  return new;
end $function$;
revoke all on function private.fattura_ddt_proteggi_scelta() from public,anon,authenticated;
drop trigger if exists fattura_ddt_proteggi_scelta on public.company_costs;
create trigger fattura_ddt_proteggi_scelta after update of order_id,allocations,quota_magazzino,quota_magazzino_righe on public.company_costs for each row execute function private.fattura_ddt_proteggi_scelta();

create or replace function private.fattura_ddt_aggiorna_fattura()
returns trigger language plpgsql security definer set search_path = '' as $function$
begin
  if tg_table_name='fatture_ricevute' then
    perform private.fattura_ddt_allinea(new.id);
  else
    if tg_op<>'DELETE' then perform private.fattura_ddt_allinea(new.fattura_ricevuta_id); end if;
    if tg_op='DELETE' or (tg_op='UPDATE' and old.fattura_ricevuta_id<>new.fattura_ricevuta_id) then perform private.fattura_ddt_allinea(old.fattura_ricevuta_id); end if;
  end if;
  return null;
end $function$;
revoke all on function private.fattura_ddt_aggiorna_fattura() from public,anon,authenticated;
drop trigger if exists fattura_ddt_aggiorna_fattura on public.fattura_ddt;
create trigger fattura_ddt_aggiorna_fattura after insert or update or delete on public.fattura_ddt for each row execute function private.fattura_ddt_aggiorna_fattura();
drop trigger if exists fattura_ddt_aggiorna_costo on public.fatture_ricevute;
create trigger fattura_ddt_aggiorna_costo after insert or update of company_cost_id,xml_raw,indice_corpo,imponibile_totale,totale_documento,tipo_documento on public.fatture_ricevute for each row execute function private.fattura_ddt_aggiorna_fattura();

create or replace function private.fattura_ddt_destinazione_cambiata()
returns trigger language plpgsql security definer set search_path = '' as $function$
declare ids uuid[]; r record;
begin
  if tg_table_name='ddt_ricezione' then ids:=array[new.id];
  elsif tg_table_name in ('ddt_ordini_acquisto','ddt_consegne') then
    ids:=case when tg_op='DELETE' then array[old.ddt_id] when tg_op='INSERT' then array[new.ddt_id] else array[old.ddt_id,new.ddt_id] end;
  elsif tg_table_name in ('ddt_righe','goods_receipts') then
    ids:=case when tg_op='DELETE' then array[old.ddt_ricezione_id] when tg_op='INSERT' then array[new.ddt_ricezione_id] else array[old.ddt_ricezione_id,new.ddt_ricezione_id] end;
  elsif tg_table_name='order_items' then select array_agg(distinct ddt_id) into ids from (
    select ddt_ricezione_id ddt_id from public.ddt_righe where order_item_id=new.id union
    select ddt_ricezione_id from public.goods_receipts where order_item_id=new.id union
    select ddt_id from public.ddt_consegne where order_item_id=new.id) q;
  else
    select array_agg(id) into ids from (select id from public.ddt_ricezione where purchase_order_id=new.id union select ddt_id from public.ddt_ordini_acquisto where purchase_order_id=new.id) q;
  end if;
  for r in select distinct fattura_ricevuta_id id from public.fattura_ddt where ddt_ricezione_id=any(ids) loop perform private.fattura_ddt_allinea(r.id); end loop;
  return null;
end $function$;
revoke all on function private.fattura_ddt_destinazione_cambiata() from public,anon,authenticated;
drop trigger if exists fattura_ddt_destinazione_cambiata on public.ddt_ricezione;
create trigger fattura_ddt_destinazione_cambiata after update of order_id,warehouse_id,destinazione,purchase_order_id,supplier_id on public.ddt_ricezione for each row execute function private.fattura_ddt_destinazione_cambiata();
drop trigger if exists fattura_ddt_ordini_cambiati on public.ddt_ordini_acquisto;
create trigger fattura_ddt_ordini_cambiati after insert or update or delete on public.ddt_ordini_acquisto for each row execute function private.fattura_ddt_destinazione_cambiata();
drop trigger if exists fattura_ddt_righe_cambiate on public.ddt_righe;
create trigger fattura_ddt_righe_cambiate after insert or delete or update of order_item_id,ddt_ricezione_id on public.ddt_righe for each row execute function private.fattura_ddt_destinazione_cambiata();
drop trigger if exists fattura_ddt_consegne_cambiate on public.ddt_consegne;
create trigger fattura_ddt_consegne_cambiate after insert or delete or update of order_id,warehouse_id,destinazione,ddt_id,tipo on public.ddt_consegne for each row execute function private.fattura_ddt_destinazione_cambiata();
drop trigger if exists fattura_ddt_ricezioni_cambiate on public.goods_receipts;
create trigger fattura_ddt_ricezioni_cambiate after insert or delete or update of order_item_id,ddt_ricezione_id on public.goods_receipts for each row execute function private.fattura_ddt_destinazione_cambiata();
drop trigger if exists fattura_ddt_ordine_cambiato on public.purchase_orders;
create trigger fattura_ddt_ordine_cambiato after update of order_id,delivery_warehouse_id on public.purchase_orders for each row execute function private.fattura_ddt_destinazione_cambiata();
drop trigger if exists fattura_ddt_voce_cambiata on public.order_items;
create trigger fattura_ddt_voce_cambiata after update of order_id on public.order_items for each row execute function private.fattura_ddt_destinazione_cambiata();

create or replace function public.fattura_ddt_riepilogo(p_fattura uuid)
returns jsonb language plpgsql security definer set search_path = '' as $function$
declare f public.fatture_ricevute%rowtype; piano jsonb; c public.company_costs%rowtype; t private.fattura_ddt_ripartizioni%rowtype; attuale jsonb;
begin
  select * into f from public.fatture_ricevute where id=p_fattura;
  if not found or auth.uid() is null or public.utente_bloccato() or public.utente_e_cliente_esterno()
    or not coalesce(public.user_can_access_company(f.company_id),false)
    or not coalesce(public.has_permission_for_company(auth.uid(),'can_view_costs',f.company_id) or public.e_super_admin_dentro(f.company_id),false) then
    raise exception 'Non puoi consultare questa fattura.' using errcode='42501';
  end if;
  piano:=private.fattura_ddt_piano(f.id);
  select * into c from public.company_costs where id=f.company_cost_id and company_id=f.company_id;
  select * into t from private.fattura_ddt_ripartizioni where fattura_id=f.id;
  attuale:=jsonb_build_object('order_id',c.order_id,'allocations',coalesce(c.allocations,'[]'::jsonb),
    'quota_magazzino',nullif(c.quota_magazzino,0),'quota_magazzino_righe',c.quota_magazzino_righe);
  return piano || jsonb_build_object('automatico',public.azienda_collegamento_automatico(f.company_id),'senza_costo',c.id is null,
    'allineata',coalesce(attuale=piano->'costo',false),'manuale',coalesce(t.bloccata,false) or coalesce(f.aggancio_oda_manuale,false)
      or (t.fattura_id is not null and (t.cost_id is distinct from c.id or t.applicata<>attuale))
      or (t.fattura_id is null and (c.order_id is not null or jsonb_array_length(coalesce(c.allocations,'[]'))>0 or coalesce(c.quota_magazzino,0)>0)),
    'gestita_altrove',f.purchase_order_id is not null or c.purchase_order_id is not null or c.order_external_team_id is not null
      or (c.id is not null and abs(abs(coalesce(c.amount,0))-(piano->>'base')::numeric)>0.01)
      or exists(select 1 from public.fattura_ricevuta_ordini where fattura_id=f.id)
      or exists(select 1 from public.fatture_ricevute where company_cost_id=f.company_cost_id and id<>f.id));
end $function$;
revoke all on function public.fattura_ddt_riepilogo(uuid) from public,anon;
grant execute on function public.fattura_ddt_riepilogo(uuid) to authenticated;

create or replace function public.fattura_ddt_allinea_commesse(p_fattura uuid)
returns text language plpgsql security definer set search_path = '' as $function$
declare azienda uuid;
begin
  select company_id into azienda from public.fatture_ricevute where id=p_fattura;
  if azienda is null or not public.puo_registrare_costi(azienda) then raise exception 'Non puoi modificare i costi di questa fattura.' using errcode='42501'; end if;
  return private.fattura_ddt_allinea(p_fattura);
end $function$;
revoke all on function public.fattura_ddt_allinea_commesse(uuid) from public,anon;
grant execute on function public.fattura_ddt_allinea_commesse(uuid) to authenticated;

notify pgrst,'reload schema';
