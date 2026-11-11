-- I riferimenti ai documenti non sono ricezioni: le quantità restano in ddt_consegne.
create table public.ddt_ordini_acquisto (
  ddt_id uuid not null references public.ddt_ricezione(id) on delete cascade,
  purchase_order_id uuid not null references public.purchase_orders(id) on delete restrict,
  company_id uuid not null references public.companies(id) on delete cascade,
  created_by uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key(ddt_id,purchase_order_id)
);
create index ddt_ordini_acquisto_ordine on public.ddt_ordini_acquisto(purchase_order_id,ddt_id);
create index ddt_ordini_acquisto_company on public.ddt_ordini_acquisto(company_id);
alter table public.ddt_ordini_acquisto enable row level security;
revoke all on public.ddt_ordini_acquisto from public,anon;
grant select,insert,delete on public.ddt_ordini_acquisto to authenticated;
grant all on public.ddt_ordini_acquisto to service_role;
create policy ddt_ordini_lettura on public.ddt_ordini_acquisto for select to authenticated
using (not public.utente_bloccato() and not public.utente_e_cliente_esterno() and
 (public.e_super_admin_dentro(company_id) or company_id=any(public.aziende_con_permesso('can_view_orders')||public.aziende_con_permesso('can_view_warehouse')||public.aziende_con_permesso('can_manage_purchasing')||public.aziende_con_permesso('can_view_costs'))));
create policy ddt_ordini_scrittura on public.ddt_ordini_acquisto for insert to authenticated
with check (not public.utente_bloccato() and not public.utente_e_cliente_esterno() and not public.utente_sola_lettura(company_id) and
 (public.e_super_admin_dentro(company_id) or company_id=any(public.aziende_con_permesso('can_edit_orders')||public.aziende_con_permesso('can_edit_warehouse')||public.aziende_con_permesso('can_manage_purchasing'))));
create policy ddt_ordini_rimozione on public.ddt_ordini_acquisto for delete to authenticated
using (not public.utente_bloccato() and not public.utente_e_cliente_esterno() and not public.utente_sola_lettura(company_id) and
 (public.e_super_admin_dentro(company_id) or company_id=any(public.aziende_con_permesso('can_edit_orders')||public.aziende_con_permesso('can_edit_warehouse')||public.aziende_con_permesso('can_manage_purchasing'))));

create or replace function public.ddt_ordine_controlla() returns trigger
language plpgsql security definer set search_path=public as $$
declare d ddt_ricezione%rowtype; p purchase_orders%rowtype;
begin
 select * into d from ddt_ricezione where id=new.ddt_id;
 select * into p from purchase_orders where id=new.purchase_order_id;
 if d.id is null or p.id is null or new.company_id is distinct from d.company_id or p.company_id is distinct from d.company_id
 or d.supplier_id is null or p.supplier_id is distinct from d.supplier_id then
  raise exception 'Collega un ordine della stessa azienda e dello stesso fornitore.' using errcode='23514';
 end if;
 if p.status in ('bozza','annullato') then raise exception 'Emetti l’ordine prima di collegare una consegna.' using errcode='23514';end if;
 new.created_by:=auth.uid();return new;
end $$;
revoke all on function public.ddt_ordine_controlla() from public,anon,authenticated;
create trigger ddt_ordine_controlla before insert or update on public.ddt_ordini_acquisto for each row execute function public.ddt_ordine_controlla();

-- Una sola relazione, compresi i collegamenti storici e gli arrivi ripartiti fra più OdA.
create view public.ddt_ordini_collegati with(security_invoker=true) as
 select legami.ddt_id::text||':'||legami.purchase_order_id::text as id,legami.company_id,legami.ddt_id,legami.purchase_order_id,d.stato from (
 select d.company_id,d.id as ddt_id,d.purchase_order_id from public.ddt_ricezione d where d.purchase_order_id is not null
 union select company_id,ddt_id,purchase_order_id from public.ddt_ordini_acquisto
 union select r.company_id,r.ddt_ricezione_id,p.purchase_order_id from public.ddt_righe r join public.purchase_order_items p on p.id=r.purchase_order_item_id and p.company_id=r.company_id
 union select c.company_id,c.ddt_id,p.purchase_order_id from public.ddt_consegne c join public.purchase_order_items p on p.id=c.purchase_order_item_id and p.company_id=c.company_id
 ) legami join public.ddt_ricezione d on d.id=legami.ddt_id and d.company_id=legami.company_id;
revoke all on public.ddt_ordini_collegati from public,anon;
grant select on public.ddt_ordini_collegati to authenticated,service_role;

CREATE OR REPLACE FUNCTION public.ddt_conferma_consegna(p_id uuid, p_ddt uuid, p_righe jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare d public.ddt_ricezione%rowtype; r public.ddt_righe%rowtype; op public.ddt_operazioni_consegna%rowtype;
 c public.ddt_consegne%rowtype; precedente public.ddt_consegne%rowtype;
 pi public.purchase_order_items%rowtype; po public.purchase_orders%rowtype; oi public.order_items%rowtype; ws public.warehouse_stock%rowtype;
 x jsonb; q numeric; gia numeric; v_tipo text; v_dest text; v_order uuid; v_wh uuid; v_oi uuid; v_stock uuid; v_mov uuid; v_unita text; v_id uuid; segno integer; n integer:=0;
begin
 select * into d from ddt_ricezione where id=p_ddt for update;
 if not found or auth.uid() is null or public.utente_bloccato() or public.utente_e_cliente_esterno() or public.utente_sola_lettura(d.company_id) or not coalesce(public.user_can_access_company(d.company_id),false)
 or not coalesce(public.has_permission_for_company(auth.uid(),'can_edit_orders',d.company_id) or public.has_permission_for_company(auth.uid(),'can_manage_purchasing',d.company_id) or public.has_permission_for_company(auth.uid(),'can_edit_warehouse',d.company_id) or public.e_super_admin_dentro(d.company_id),false) then raise exception 'Non puoi confermare questa consegna' using errcode='42501'; end if;
 if p_id is null or jsonb_typeof(p_righe) is distinct from 'array' or jsonb_array_length(p_righe) not between 1 and 500 then raise exception 'Scegli almeno una riga della consegna'; end if;
 select * into op from ddt_operazioni_consegna where id=p_id;
 if found then
  if op.company_id<>d.company_id or op.ddt_id<>d.id or op.payload<>p_righe then raise exception 'Identità dell’operazione già usata' using errcode='42501'; end if;
  return jsonb_build_object('gia_registrata',true,'righe',(select count(*) from ddt_consegne where operazione_id=p_id));
 end if;
 insert into ddt_operazioni_consegna(id,company_id,ddt_id,payload,created_by) values(p_id,d.company_id,d.id,p_righe,auth.uid());
 -- Ordine stabile fra più OdA: due DDT non si bloccano in ordine inverso.
 perform p.id from purchase_orders p where p.company_id=d.company_id and p.id in (
  select i.purchase_order_id from purchase_order_items i where i.id in (
   select coalesce(nullif(t->>'purchase_order_item_id','')::uuid,rr.purchase_order_item_id) from jsonb_array_elements(p_righe) t
    join ddt_righe rr on rr.id=nullif(t->>'riga_id','')::uuid and rr.ddt_ricezione_id=d.id
   union select cc.purchase_order_item_id from jsonb_array_elements(p_righe) t
    join ddt_consegne cc on cc.id=nullif(t->>'consegna_origine_id','')::uuid and cc.company_id=d.company_id
  )
 ) order by p.id for update;

 for x in select * from jsonb_array_elements(p_righe) loop
  select * into r from ddt_righe where id=nullif(x->>'riga_id','')::uuid and ddt_ricezione_id=d.id for update;
  if not found then raise exception 'Una riga non appartiene alla bolla' using errcode='42501'; end if;
  -- Un'unica riga del DDT può essere ripartita su più ordini in conferme parziali.
  -- La bolla originale resta immutata; ciascuna consegna conserva la propria riga OdA.
  if x ? 'purchase_order_item_id' then
   r.purchase_order_item_id:=nullif(x->>'purchase_order_item_id','')::uuid;
   r.order_item_id:=null;
   r.abbinamento:='manuale';
  end if;
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
end $function$;

revoke all on function public.ddt_conferma_consegna(uuid,uuid,jsonb) from public,anon;
grant execute on function public.ddt_conferma_consegna(uuid,uuid,jsonb) to authenticated;

create or replace function public.ddt_confronto_ai_contesto(p_ddt uuid) returns jsonb
language plpgsql security definer set search_path=public set statement_timeout='10s' as $$
declare d ddt_ricezione%rowtype; c jsonb;
begin
 select * into d from ddt_ricezione where id=p_ddt;
 if not found or auth.uid() is null or public.utente_bloccato() or public.utente_e_cliente_esterno() or public.utente_sola_lettura(d.company_id)
 or not coalesce(public.user_can_access_company(d.company_id) and (public.has_permission_for_company(auth.uid(),'can_manage_purchasing',d.company_id) or public.has_permission_for_company(auth.uid(),'can_edit_orders',d.company_id) or public.has_permission_for_company(auth.uid(),'can_edit_warehouse',d.company_id) or public.e_super_admin_dentro(d.company_id)),false) then
  raise exception 'Non puoi analizzare questa bolla.' using errcode='42501';
 end if;
 c:=jsonb_build_object('company_id',d.company_id,'ddt_id',d.id,
 'righe',(select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'descrizione',r.descrizione,'codice',r.codice_articolo,'um',r.unita_misura,'quantita',r.quantita,'purchase_order_item_id',r.purchase_order_item_id,'arrivo_registrato_il',r.arrivo_registrato_il) order by r.posizione,r.id),'[]'::jsonb) from ddt_righe r where r.ddt_ricezione_id=d.id and r.company_id=d.company_id),
 'ordini',(select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'purchase_order_id',p.id,'numero',p.oda_number,'descrizione',r.description,'codice',r.sku,'um',r.unit_of_measure,'ordinata',r.quantity,'ricevuta',r.quantity_received) order by p.id,r.sort_order,r.id),'[]'::jsonb) from purchase_order_items r join purchase_orders p on p.id=r.purchase_order_id and p.company_id=d.company_id and p.supplier_id=d.supplier_id where r.company_id=d.company_id and p.status in ('inviato','confermato','parziale','ricevuto') and p.id in (select purchase_order_id from ddt_ordini_collegati where ddt_id=d.id and company_id=d.company_id)));
 return c||jsonb_build_object('impronta',md5(c::text));
end $$;
revoke all on function public.ddt_confronto_ai_contesto(uuid) from public,anon;
grant execute on function public.ddt_confronto_ai_contesto(uuid) to authenticated;

create or replace function public.ddt_accetta_abbinamento_ai(p_ddt uuid,p_riga uuid,p_ordine_riga uuid,p_impronta text) returns jsonb
language plpgsql security definer set search_path=public set lock_timeout='3s' as $$
declare c jsonb;
begin
 perform id from ddt_ricezione where id=p_ddt for update;
 c:=public.ddt_confronto_ai_contesto(p_ddt);
 if c->>'impronta' is distinct from p_impronta then raise exception 'Il confronto è cambiato: ripeti l’analisi.' using errcode='PT409';end if;
 if not exists(select 1 from jsonb_array_elements(c->'ordini') o where o->>'id'=p_ordine_riga::text) then raise exception 'Riga d’ordine non disponibile nel confronto.' using errcode='42501';end if;
 update ddt_righe set purchase_order_item_id=p_ordine_riga,abbinamento='manuale'
 where id=p_riga and ddt_ricezione_id=p_ddt and company_id=(c->>'company_id')::uuid and arrivo_registrato_il is null and movimento_id is null;
 if not found then raise exception 'Riga già ricevuta o non modificabile.' using errcode='PT409';end if;
 return jsonb_build_object('impronta',public.ddt_confronto_ai_contesto(p_ddt)->>'impronta');
end $$;
revoke all on function public.ddt_accetta_abbinamento_ai(uuid,uuid,uuid,text) from public,anon;
grant execute on function public.ddt_accetta_abbinamento_ai(uuid,uuid,uuid,text) to authenticated;
