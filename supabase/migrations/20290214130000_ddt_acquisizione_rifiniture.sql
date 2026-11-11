-- Rifiniture dell’acquisizione: permessi, dati di trasporto e PDF divisi.
alter table public.ddt_ricezione add column if not exists ricezione_esplicita boolean not null default false;
create or replace function public.trg_ddt_muove_oda() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if new.ricezione_esplicita then return new; end if;
 if new.stato in ('parziale','ricevuto','verificato') then
  update purchase_orders set status='parziale' where id=new.purchase_order_id and status in ('inviato','confermato');
 end if;
 return new;
end $$;
revoke all on function public.trg_ddt_muove_oda() from public,anon,authenticated;
alter table public.ddt_document_jobs add column split_ids uuid[] not null default '{}';
alter table public.ddt_document_jobs drop constraint ddt_document_jobs_status_check;
alter table public.ddt_document_jobs add constraint ddt_document_jobs_status_check check(status in ('queued','processing','review','registered','error','split'));
create or replace function public.ddt_documento_diviso(p_id uuid,p_figli uuid[])
returns void language plpgsql security definer set search_path=public as $$
declare j public.ddt_document_jobs%rowtype;
begin
 select * into j from ddt_document_jobs where id=p_id for update;
 if not found or auth.uid() is null or public.utente_bloccato() or public.utente_e_cliente_esterno() or not coalesce(public.user_can_access_company(j.company_id),false) or not coalesce(j.created_by=auth.uid() or public.campo_e_ufficio(j.company_id) or public.e_super_admin_dentro(j.company_id),false) then raise exception 'Documento non disponibile' using errcode='42501'; end if;
 if j.ddt_id is not null or j.status not in ('review','error','split') then raise exception 'Questo documento non può essere diviso adesso'; end if;
 if p_figli is null or cardinality(p_figli) not between 1 and 300 or p_id=any(p_figli) or (select count(*) from ddt_document_jobs where id=any(p_figli) and company_id=j.company_id)<>cardinality(p_figli) then raise exception 'Prima salva tutte le bolle estratte da questo PDF'; end if;
 update ddt_document_jobs set status='split',split_ids=p_figli,updated_at=now() where id=p_id;
end $$;
revoke all on function public.ddt_documento_diviso(uuid,uuid[]) from public,anon;
grant execute on function public.ddt_documento_diviso(uuid,uuid[]) to authenticated;
create or replace function public.ddt_documento_accoda(p_id uuid,p_company uuid,p_order uuid,p_files jsonb,p_hash text,p_source text default 'desktop')
returns jsonb language plpgsql security definer set search_path=public as $$
declare j public.ddt_document_jobs%rowtype; f jsonb; percorso text; prefisso text;
begin
 if auth.uid() is null or public.utente_bloccato() or public.utente_e_cliente_esterno() or not coalesce(public.user_can_access_company(p_company),false) then raise exception 'Non puoi acquisire documenti di questa azienda' using errcode='42501'; end if;
 if p_source not in ('desktop','campo') or p_id is null or p_hash !~ '^[0-9a-f]{64}$' or p_hash is null then raise exception 'Documento non valido' using errcode='22023'; end if;
 if p_order is not null and not exists(select 1 from orders where id=p_order and company_id=p_company and deleted_at is null) then raise exception 'Commessa non disponibile' using errcode='42501'; end if;
 if not coalesce(public.campo_e_ufficio(p_company) or public.e_super_admin_dentro(p_company),false) and (p_order is null or not coalesce(public.campo_lavoro_su_commessa(p_order),false)) then raise exception 'Puoi caricare solo sui tuoi cantieri' using errcode='42501'; end if;
 if p_files is null or jsonb_typeof(p_files)<>'array' or jsonb_array_length(p_files) not between 1 and 12 then raise exception 'Scegli da una a dodici pagine dello stesso documento' using errcode='22023'; end if;
 if exists(select 1 from jsonb_array_elements(p_files) x where coalesce((x->>'size')::bigint,0)<=0 or coalesce(x->>'mime','') not in ('application/pdf','image/jpeg','image/png','image/webp','image/heic','image/heif','image/bmp')) then raise exception 'Formato o dimensione non validi'; end if;
 if (select coalesce(sum((x->>'size')::bigint),0) from jsonb_array_elements(p_files) x)>18874368 then raise exception 'Il documento supera 18 MB'; end if;
 prefisso:=p_company::text||'/'||auth.uid()::text||'/'||p_id::text||'/';
 for f in select * from jsonb_array_elements(p_files) loop
  if f ? 'bucket' and f->>'bucket'<>'ddt-documenti' then raise exception 'Deposito documento non valido' using errcode='42501'; end if;
  foreach percorso in array array[f->>'path',coalesce(f->>'prepared_path',f->>'path')] loop
   if percorso is null or left(percorso,length(prefisso))<>prefisso or percorso ~ '[%?#\\]' or percorso ~ '(^|/)\.\.?(/|$)' or percorso ~ '[[:cntrl:]]' then raise exception 'Percorso documento non valido' using errcode='42501'; end if;
   if not exists(select 1 from storage.objects where bucket_id='ddt-documenti' and name=percorso) then raise exception 'Il caricamento non è completo: ritenta senza scattare di nuovo'; end if;
  end loop;
 end loop;
 select * into j from ddt_document_jobs where id=p_id;
 if found then
  if j.company_id<>p_company or j.created_by is distinct from auth.uid() or j.file_hash<>p_hash then raise exception 'Identità documento già usata' using errcode='42501'; end if;
  return jsonb_build_object('id',j.id,'status',j.status,'duplicate',true);
 end if;
 insert into ddt_document_jobs(id,company_id,created_by,order_id,source,file_hash,files)
 values(p_id,p_company,auth.uid(),p_order,p_source,p_hash,p_files) on conflict(company_id,file_hash) do nothing returning * into j;
 if not found then
  select * into j from ddt_document_jobs where company_id=p_company and file_hash=p_hash;
  if j.created_by is distinct from auth.uid() and not coalesce(public.campo_e_ufficio(p_company) or public.e_super_admin_dentro(p_company),false) then return jsonb_build_object('duplicate',true,'id',null,'status','already_present'); end if;
  return jsonb_build_object('id',j.id,'status',j.status,'duplicate',true);
 end if;
 return jsonb_build_object('id',j.id,'status',j.status,'duplicate',false);
end $$;
revoke all on function public.ddt_documento_accoda(uuid,uuid,uuid,jsonb,text,text) from public,anon;
grant execute on function public.ddt_documento_accoda(uuid,uuid,uuid,jsonb,text,text) to authenticated;

create or replace function public.ddt_documento_registra(p_id uuid,p_dati jsonb,p_altra_versione boolean default false)
returns uuid language plpgsql security definer set search_path=public as $$
declare j public.ddt_document_jobs%rowtype; v_id uuid; v_order uuid; v_supplier uuid; v_oda uuid; v_numero text; v_data date; v_dest text; v_wh uuid; r jsonb; n int:=0; f jsonb;
begin
 select * into j from ddt_document_jobs where id=p_id for update;
 if not found or auth.uid() is null or public.utente_bloccato() or not coalesce(public.user_can_access_company(j.company_id),false)
 or not coalesce(public.has_permission_for_company(auth.uid(),'can_edit_orders',j.company_id) or public.has_permission_for_company(auth.uid(),'can_manage_purchasing',j.company_id) or public.has_permission_for_company(auth.uid(),'can_edit_warehouse',j.company_id) or public.e_super_admin_dentro(j.company_id),false) then raise exception 'Non puoi registrare questo documento' using errcode='42501'; end if;
 if j.ddt_id is not null then return j.ddt_id; end if;
 if j.status not in ('review','error') then raise exception 'Aspetta la lettura del documento'; end if;
 v_order:=nullif(p_dati->>'order_id','')::uuid;v_supplier:=nullif(p_dati->>'supplier_id','')::uuid;v_oda:=nullif(p_dati->>'purchase_order_id','')::uuid;
 v_dest:=coalesce(p_dati->>'destinazione','cantiere');v_numero:=btrim(p_dati->>'numero_ddt');v_data:=nullif(p_dati->>'data_ricezione','')::date;
 if coalesce(v_numero,'')='' or length(v_numero)>100 or v_data is null or v_dest not in ('cantiere','magazzino') then raise exception 'Controlla numero, data e destinazione'; end if;
 if v_order is not null and not exists(select 1 from orders where id=v_order and company_id=j.company_id and deleted_at is null) then raise exception 'Commessa non disponibile' using errcode='42501'; end if;
 if v_dest='cantiere' and v_order is null then raise exception 'Per la consegna in cantiere scegli la commessa'; end if;
 if v_supplier is not null and not exists(select 1 from suppliers where id=v_supplier and company_id=j.company_id) then raise exception 'Fornitore non valido' using errcode='42501'; end if;
 if v_oda is not null and not exists(select 1 from purchase_orders where id=v_oda and company_id=j.company_id and supplier_id is not distinct from v_supplier and (order_id is null or order_id=v_order) and status in ('inviato','confermato','parziale','ricevuto')) then raise exception 'L’OdA deve essere emesso e appartenere al fornitore e alla commessa scelti'; end if;
 if not p_altra_versione and exists(select 1 from ddt_ricezione where company_id=j.company_id and supplier_id is not distinct from v_supplier and upper(regexp_replace(numero_ddt,'[[:space:]./_-]','','g'))=upper(regexp_replace(v_numero,'[[:space:]./_-]','','g')) and data_ricezione=v_data) then raise exception 'Stesso numero, data e fornitore già presenti: confronta le versioni prima di registrare'; end if;
 v_wh:=case when v_dest='magazzino' then nullif(p_dati->>'warehouse_id','')::uuid else null end;
 if v_dest='magazzino' and not exists(select 1 from warehouses where id=v_wh and company_id=j.company_id) then raise exception 'Scegli il magazzino di arrivo'; end if;
 if jsonb_typeof(p_dati->'righe') is distinct from 'array' or jsonb_array_length(p_dati->'righe')>500 then raise exception 'Righe del documento non valide'; end if;
 f:=j.files->0;
 insert into ddt_ricezione(company_id,created_by,order_id,supplier_id,purchase_order_id,numero_ddt,data_ricezione,destinazione,warehouse_id,stato,quantita_ricevuta,note,source,ai_lettura,ai_confidenza,ddt_file_url,ddt_file_name,ddt_file_mime,ddt_file_bucket,corriere,targa_mezzo,autista_nome,trasporto_a_cura_di,porto,ai_avvisi,ricezione_esplicita)
 values(j.company_id,auth.uid(),v_order,v_supplier,v_oda,v_numero,v_data,v_dest,v_wh,'ricevuto',0,nullif(p_dati->>'note',''),case j.source when 'desktop' then 'manual' else j.source end,j.result,least(1,greatest(0,public.num_da_json(j.result->>'confidence'))),f->>'path',f->>'name',f->>'mime',coalesce(f->>'bucket','ddt-documenti'),nullif(p_dati->>'corriere',''),nullif(p_dati->>'targa_mezzo',''),nullif(p_dati->>'autista_nome',''),case when p_dati->>'trasporto_a_cura_di' in ('fornitore','noi','terzi') then p_dati->>'trasporto_a_cura_di' end,case when p_dati->>'porto' in ('franco','assegnato') then p_dati->>'porto' end,array(select jsonb_array_elements_text(case when jsonb_typeof(j.result->'warnings')='array' then j.result->'warnings' else '[]'::jsonb end)),true) returning id into v_id;
 for r in select * from jsonb_array_elements(p_dati->'righe') loop
  n:=n+1;
  if nullif(btrim(r->>'descrizione'),'') is null or coalesce((r->>'quantita')::numeric,0)<0 or coalesce((r->>'prezzo_unitario')::numeric,0)<0 then raise exception 'Controlla descrizioni, quantità e prezzi'; end if;
  if nullif(r->>'purchase_order_item_id','') is not null and not exists(select 1 from purchase_order_items where id=(r->>'purchase_order_item_id')::uuid and purchase_order_id=v_oda and company_id=j.company_id) then raise exception 'La riga non appartiene all’OdA scelto' using errcode='42501'; end if;
  insert into ddt_righe(ddt_ricezione_id,company_id,posizione,descrizione,codice_articolo,quantita,unita_misura,prezzo_unitario,importo,iva_percentuale,origine,ai_originale,purchase_order_item_id,abbinamento)
  values(v_id,j.company_id,n,left(r->>'descrizione',4000),nullif(r->>'codice_articolo',''),nullif(r->>'quantita','')::numeric,nullif(r->>'unita_misura',''),nullif(r->>'prezzo_unitario','')::numeric,nullif(r->>'importo','')::numeric,nullif(r->>'iva_percentuale','')::numeric,case when r->>'origine'='manuale' then 'manuale' else 'ai' end,r->'ai_originale',nullif(r->>'purchase_order_item_id','')::uuid,case when nullif(r->>'purchase_order_item_id','') is not null then 'manuale' else null end);
 end loop;
 update ddt_ricezione set quantita_ricevuta=(select coalesce(sum(quantita),0) from ddt_righe where ddt_ricezione_id=v_id) where id=v_id;
 update ddt_document_jobs set ddt_id=v_id,order_id=v_order,status='registered',updated_at=now() where id=p_id;
 return v_id;
end $$;
revoke all on function public.ddt_documento_registra(uuid,jsonb,boolean) from public,anon;
grant execute on function public.ddt_documento_registra(uuid,jsonb,boolean) to authenticated;


-- Unità esplicitamente confermate e materiali già consegnati.
create or replace function public.ddt_conferma_consegna(p_id uuid,p_ddt uuid,p_righe jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare d public.ddt_ricezione%rowtype; r public.ddt_righe%rowtype; op public.ddt_operazioni_consegna%rowtype;
 c public.ddt_consegne%rowtype; precedente public.ddt_consegne%rowtype;
 pi public.purchase_order_items%rowtype; po public.purchase_orders%rowtype; oi public.order_items%rowtype; ws public.warehouse_stock%rowtype;
 x jsonb; q numeric; gia numeric; v_tipo text; v_dest text; v_order uuid; v_wh uuid; v_oi uuid; v_stock uuid; v_mov uuid; v_unita text; v_id uuid; segno integer; n integer:=0;
begin
 select * into d from ddt_ricezione where id=p_ddt for update;
 if not found or auth.uid() is null or public.utente_bloccato() or public.utente_e_cliente_esterno() or not coalesce(public.user_can_access_company(d.company_id),false)
 or not coalesce(public.has_permission_for_company(auth.uid(),'can_edit_orders',d.company_id) or public.has_permission_for_company(auth.uid(),'can_manage_purchasing',d.company_id) or public.has_permission_for_company(auth.uid(),'can_edit_warehouse',d.company_id) or public.e_super_admin_dentro(d.company_id),false) then raise exception 'Non puoi confermare questa consegna' using errcode='42501'; end if;
 if p_id is null or jsonb_typeof(p_righe) is distinct from 'array' or jsonb_array_length(p_righe) not between 1 and 500 then raise exception 'Scegli almeno una riga della consegna'; end if;
 select * into op from ddt_operazioni_consegna where id=p_id;
 if found then
  if op.company_id<>d.company_id or op.ddt_id<>d.id or op.payload<>p_righe then raise exception 'Identità dell’operazione già usata' using errcode='42501'; end if;
  return jsonb_build_object('gia_registrata',true,'righe',(select count(*) from ddt_consegne where operazione_id=p_id));
 end if;
 insert into ddt_operazioni_consegna(id,company_id,ddt_id,payload,created_by) values(p_id,d.company_id,d.id,p_righe,auth.uid());
 -- Un ordine e le sue righe si bloccano prima di incrementare le quantità: due bolle non perdono aggiornamenti.
 for x in select * from jsonb_array_elements(p_righe) loop
  select * into r from ddt_righe where id=nullif(x->>'riga_id','')::uuid and ddt_ricezione_id=d.id for update;
  if not found then raise exception 'Una riga non appartiene alla bolla' using errcode='42501'; end if;
  if (r.arrivo_registrato_il is not null or r.movimento_id is not null) and not exists(select 1 from ddt_consegne where riga_id=r.id) then raise exception 'Questa riga è già stata ricevuta con la procedura precedente'; end if;
  q:=nullif(x->>'quantita','')::numeric;v_unita:=public.ddt_unita(r.unita_misura);
  if q is null or q<=0 or q>1000000000 or q::text in ('NaN','Infinity','-Infinity') or r.quantita is null or r.quantita<=0 or v_unita='' then raise exception 'Controlla quantità e unità sulla bolla prima di confermare'; end if;
  select coalesce(sum(quantita),0) into gia from ddt_consegne where riga_id=r.id;
  if gia+q>r.quantita then raise exception 'La quantità supera quella ancora da confermare sulla bolla'; end if;
  v_tipo:=coalesce(x->>'tipo','ingresso');v_dest:=coalesce(x->>'destinazione',d.destinazione);v_mov:=null;v_oi:=null;v_stock:=null;
  if v_tipo not in ('ingresso','reso','servizio') or v_dest not in ('cantiere','magazzino') then raise exception 'Tipo o destinazione non validi'; end if;
  v_order:=coalesce(nullif(x->>'order_id','')::uuid,d.order_id);v_wh:=case when v_dest='magazzino' then coalesce(nullif(x->>'warehouse_id','')::uuid,d.warehouse_id) else null end;
  if v_dest='cantiere' and not exists(select 1 from orders where id=v_order and company_id=d.company_id and deleted_at is null) then raise exception 'Scegli una commessa attiva di questa azienda'; end if;
  if v_dest='magazzino' and (not coalesce(public.has_permission_for_company(auth.uid(),'can_edit_warehouse',d.company_id) or public.e_super_admin_dentro(d.company_id),false) or not exists(select 1 from warehouses where id=v_wh and company_id=d.company_id)) then raise exception 'Magazzino non disponibile o permesso mancante' using errcode='42501'; end if;
  pi:=null;po:=null;precedente:=null;segno:=case when v_tipo='reso' then -1 else 1 end;
  if v_tipo='reso' then
   select * into precedente from ddt_consegne where id=nullif(x->>'consegna_origine_id','')::uuid and company_id=d.company_id and tipo='ingresso' for update;
   if not found or precedente.destinazione<>v_dest or precedente.order_id is distinct from v_order or precedente.warehouse_id is distinct from v_wh or precedente.unita_misura<>v_unita
    or not exists(select 1 from ddt_ricezione a where a.id=precedente.ddt_id and a.supplier_id is not distinct from d.supplier_id) then raise exception 'Scegli la consegna originale dello stesso fornitore e destinazione'; end if;
   if q+(select coalesce(sum(quantita),0) from ddt_consegne where consegna_origine_id=precedente.id)>precedente.quantita then raise exception 'Il reso supera la quantità della consegna originale'; end if;
   v_oi:=precedente.order_item_id;v_stock:=precedente.stock_item_id;
  end if;
  if v_tipo<>'servizio' and coalesce(precedente.purchase_order_item_id,r.purchase_order_item_id) is not null then
   select * into pi from purchase_order_items where id=coalesce(precedente.purchase_order_item_id,r.purchase_order_item_id) and company_id=d.company_id for update;
   if not found then raise exception 'Riga OdA non disponibile'; end if;
   select * into po from purchase_orders where id=pi.purchase_order_id and company_id=d.company_id for update;
   if not found or po.status not in ('inviato','confermato','parziale','ricevuto') or po.supplier_id is distinct from d.supplier_id or (po.order_id is not null and po.order_id is distinct from v_order) then raise exception 'L’OdA deve essere emesso e coerente con fornitore e commessa'; end if;
   if public.ddt_unita(pi.unit_of_measure)<>v_unita then
    if pi.unit_of_measure is not null or not coalesce((x->>'conferma_unita')::boolean,false) then raise exception 'L’unità della bolla non coincide con quella dell’OdA: correggi l’abbinamento'; end if;
    update purchase_order_items set unit_of_measure=r.unita_misura where id=pi.id;
   end if;
   if segno=1 and coalesce(pi.quantity_received,0)+q>pi.quantity and not coalesce((x->>'accetta_eccedenza')::boolean,false) then raise exception 'Quantità superiore all’OdA: serve accettare esplicitamente l’eccedenza'; end if;
   if coalesce(pi.quantity_received,0)+segno*q<0 then raise exception 'Il reso supera la quantità ricevuta sull’OdA'; end if;
   v_oi:=coalesce(v_oi,pi.order_item_id);
  elsif v_tipo='ingresso' and d.purchase_order_id is not null and r.abbinamento is distinct from 'manuale' then
   raise exception 'Abbina la riga all’OdA o conferma che è un articolo fuori ordine';
  end if;
  if v_tipo<>'servizio' and v_dest='cantiere' then
   v_oi:=coalesce(v_oi,nullif(x->>'order_item_id','')::uuid,r.order_item_id);
   if v_oi is not null then
    select i.* into oi from order_items i join orders o on o.id=i.order_id where i.id=v_oi and i.order_id=v_order and o.company_id=d.company_id for update of i;
    if not found then raise exception 'Articolo della commessa non valido'; end if;
    if public.ddt_unita(oi.unita_misura)<>v_unita then
     if oi.unita_misura is not null or (pi.id is null and not coalesce((x->>'conferma_unita')::boolean,false)) then raise exception 'Conferma l’unità dell’articolo della commessa prima di sommare le quantità'; end if;
     update order_items set unita_misura=r.unita_misura where id=v_oi;
    end if;
   else
    if not coalesce((x->>'crea_articolo')::boolean,false) or v_tipo='reso' then raise exception 'Scegli un articolo della commessa oppure conferma la creazione di un nuovo articolo'; end if;
    insert into order_items(order_id,name,description,quantity,quantity_received,purchase_price,prezzo_da_definire,stock_item_id,supplier_id,product_code,unita_misura,status,origine_materiale,natura_riga,ddt_riga_origine_id,origini)
    values(v_order,r.descrizione,r.descrizione,0,0,r.prezzo_unitario,r.prezzo_unitario is null,null,d.supplier_id,r.codice_articolo,r.unita_misura,'in_cantiere','manuale','materiale',r.id,jsonb_build_array(jsonb_build_object('tipo','ddt','ddt_id',d.id)))
    on conflict(order_id,ddt_riga_origine_id) where ddt_riga_origine_id is not null do update set updated_at=now() returning * into oi;
    v_oi:=oi.id;
   end if;
   if coalesce(oi.quantity_received,0)+segno*q<0 then raise exception 'Il reso supera i materiali ricevuti in cantiere'; end if;
   update order_items set quantity=case when ddt_riga_origine_id=r.id then greatest(coalesce(quantity,0),coalesce(quantity_received,0)+segno*q) else quantity end,
    quantity_received=coalesce(quantity_received,0)+segno*q,last_goods_receipt_date=now(),fulfillment_status=case when coalesce(quantity_received,0)+segno*q>=coalesce(quantity,0) then 'received' else 'not_started' end,updated_at=now() where id=v_oi;
   -- stock_item_id dell'articolo preesistente non viene usato per carichi/scarichi: consegna diretta.
  elsif v_tipo<>'servizio' and v_dest='magazzino' then
   v_stock:=coalesce(v_stock,nullif(x->>'stock_item_id','')::uuid,pi.stock_item_id);
   if v_stock is not null then
    select * into ws from warehouse_stock where id=v_stock and company_id=d.company_id and warehouse_id=v_wh for update;
    if not found or ws.tracking_mode='serialized' then raise exception 'Articolo di magazzino non valido o con numeri di serie da registrare'; end if;
    if public.ddt_unita(ws.unita_misura)<>v_unita then
     if ws.unita_misura is not null or not coalesce((x->>'conferma_unita')::boolean,false) then raise exception 'Conferma l’unità dell’articolo di magazzino prima di sommare le quantità'; end if;
     update warehouse_stock set unita_misura=r.unita_misura where id=v_stock;
    end if;
   else
    if not coalesce((x->>'crea_articolo')::boolean,false) or v_tipo='reso' then raise exception 'Scegli l’articolo di magazzino o conferma la creazione'; end if;
    insert into warehouse_stock(company_id,warehouse_id,name,quantity,unit_cost,prezzo_da_definire,supplier_id,internal_code,unita_misura)
    values(d.company_id,v_wh,r.descrizione,0,coalesce(r.prezzo_unitario,0),r.prezzo_unitario is null,d.supplier_id,r.codice_articolo,r.unita_misura) returning * into ws;
    v_stock:=ws.id;
   end if;
   if ws.quantity+segno*q<0 then raise exception 'Giacenza insufficiente per il reso'; end if;
   insert into warehouse_movements(company_id,warehouse_id,stock_item_id,quantity,movement_type,performed_by,order_id,order_item_id,unit_cost,notes)
   values(d.company_id,v_wh,v_stock,q,case when segno=1 then 'carico' else 'scarico' end,auth.uid(),null,null,r.prezzo_unitario,'DDT '||d.numero_ddt||' · consegna '||p_id::text) returning id into v_mov;
   update warehouse_stock set quantity=quantity+segno*q,last_delivery_date=d.data_ricezione,updated_at=now() where id=v_stock;
  end if;
  if pi.id is not null then
   update purchase_order_items set quantity_received=coalesce(quantity_received,0)+segno*q,received_date=d.data_ricezione,stock_item_id=case when v_dest='magazzino' then v_stock else null end where id=pi.id;
   update purchase_orders set status=case when not exists(select 1 from purchase_order_items where purchase_order_id=po.id and coalesce(quantity_received,0)<quantity) then 'ricevuto' else 'parziale' end,updated_at=now() where id=po.id;
  end if;
  insert into ddt_consegne(company_id,operazione_id,ddt_id,riga_id,tipo,consegna_origine_id,quantita,unita_misura,destinazione,order_id,warehouse_id,order_item_id,stock_item_id,purchase_order_item_id,movimento_id,created_by)
  values(d.company_id,p_id,d.id,r.id,v_tipo,precedente.id,q,v_unita,v_dest,v_order,v_wh,v_oi,v_stock,pi.id,v_mov,auth.uid()) returning id into v_id;
  -- Questa marca esclude anche le vecchie procedure di ricezione: non possono contare la riga di nuovo.
  update ddt_righe set arrivo_registrato_il=now() where id=r.id;
  n:=n+1;
 end loop;
 return jsonb_build_object('gia_registrata',false,'righe',n);
end $$;
revoke all on function public.ddt_conferma_consegna(uuid,uuid,jsonb) from public,anon;
grant execute on function public.ddt_conferma_consegna(uuid,uuid,jsonb) to authenticated;
