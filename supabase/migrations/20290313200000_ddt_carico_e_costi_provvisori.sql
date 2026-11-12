-- ============================================================================
-- Bolle, magazzino e costi: il carico che si vede, il prezzo che arriva dopo
-- (12/11/2026, Florin: «Sì, falle tutte»)
-- ----------------------------------------------------------------------------
-- 1. ddt_conferma_consegna segna ddt_ricezione.caricata_a_magazzino_at quando
--    la merce per il magazzino è tutta confermata. Prima lo faceva solo
--    bolla_carica_magazzino (percorso morto, tolto nella migrazione dopo).
-- 2. ddt_valorizza_da_fattura: una fattura che copre solo una parte della riga
--    dà il prezzo unitario alla riga che non ne ha uno. Le differenze col
--    prezzo della bolla tornano in «prezzi_diversi», mai in silenzio.
-- 3. Scarichi a costo provvisorio: warehouse_movements.costo_provvisorio.
--    Lo snapshot lo accende quando fotografa il costo di un articolo con
--    prezzo_da_definire o costo 0; ddt_prezzo_stock, quando la fattura
--    completa il medio, riporta quegli scarichi al nuovo medio e lo spegne.
--    Così trg_margine_commessa_upd rifà il margine della commessa.
-- 4. Il ricalcolo del medio che si ferma (storico che non torna con la
--    giacenza, troppi movimenti…) non passa più in silenzio: il motivo resta
--    in warehouse_stock.costo_ricalcolo_sospeso, con la data.
--
-- I corpi di ddt_conferma_consegna e ddt_valorizza_da_fattura sono quelli in
-- produzione al 12/11/2026 (md5 di prosrc verificato contro
-- 20290312123000 e 20290312120000) più i pezzi marcati «12/11/2026».
-- ============================================================================

set local lock_timeout = '3s';
set local statement_timeout = '60s';

alter table public.warehouse_movements
  add column if not exists costo_provvisorio boolean not null default false;
comment on column public.warehouse_movements.costo_provvisorio is
  'Scarico uscito con il costo di un articolo ancora senza prezzo (prezzo_da_definire o costo 0): ddt_prezzo_stock lo riporta al medio quando il prezzo arriva dalla fattura.';
create index if not exists warehouse_movements_costo_provvisorio
  on public.warehouse_movements (stock_item_id, created_at) where costo_provvisorio;

alter table public.warehouse_stock
  add column if not exists costo_ricalcolo_sospeso text,
  add column if not exists costo_ricalcolo_sospeso_at timestamptz;
comment on column public.warehouse_stock.costo_ricalcolo_sospeso is
  'Perché ddt_prezzo_stock non ha ricalcolato il costo medio (storico che non torna con la giacenza, troppi movimenti, troppi scarichi da rivalutare). Vuoto quando l''ultimo ricalcolo è andato.';

-- ── Snapshot del costo: in più segna gli scarichi a costo provvisorio ──────
create or replace function public.warehouse_movement_snapshot_unit_cost()
 returns trigger
 language plpgsql
 set search_path to 'public'
as $function$
declare
  v_prezzo numeric;
  v_costo numeric;
  v_da_definire boolean;
  v_trovato boolean;
  v_fotografato boolean := false;
begin
  if new.unit_cost is null then
    -- Un carico che non dice quanto è stato pagato: si guarda l'ordine d'acquisto
    -- della riga di commessa. I rientri dalla commessa no: quelli il costo lo
    -- portano già, ed è quello con cui la merce era uscita.
    if new.movement_type = 'carico'
       and new.order_item_id is not null
       and not coalesce(new.rientro_commessa, false) then
      v_prezzo := public.magazzino_prezzo_acquisto_riga(new.order_item_id, new.quantity);
      if coalesce(v_prezzo, 0) > 0 then
        new.unit_cost := round(v_prezzo, 4);
        return new;
      end if;
    end if;
  elsif new.movement_type is distinct from 'scarico' then
    -- Costo già detto e non è uno scarico: niente da fotografare né da segnare.
    return new;
  end if;

  select ws.unit_cost, coalesce(ws.prezzo_da_definire, false)
    into v_costo, v_da_definire
    from public.warehouse_stock ws
   where ws.id = new.stock_item_id
     -- Alcuni percorsi legacy valorizzano company_id con un secondo trigger
     -- BEFORE INSERT. Lo stock_item_id resta comunque univoco: non perdiamo
     -- il costo se questo trigger viene eseguito per primo.
     and (new.company_id is null or ws.company_id = new.company_id);
  v_trovato := found;

  if new.unit_cost is null then
    new.unit_cost := v_costo;
    v_fotografato := true;
  end if;

  -- 12/11/2026: lo scarico che porta via il costo di un articolo ancora senza
  -- prezzo è provvisorio. Vale anche per chi passa da sé il costo della scheda
  -- (magazzino_movimento_riga, trg_auto_deduct_stock). Restano fuori i rientri
  -- e le divisioni tra le fasi (valorizza_medio = false), che portano un costo
  -- già deciso.
  if v_trovato
     and new.movement_type = 'scarico'
     and not coalesce(new.rientro_commessa, false)
     and coalesce(new.valorizza_medio, true)
     and (v_fotografato or new.unit_cost is not distinct from v_costo)
     and (v_da_definire or coalesce(new.unit_cost, 0) = 0) then
    new.costo_provvisorio := true;
  end if;
  return new;
end;
$function$;
revoke all on function public.warehouse_movement_snapshot_unit_cost() from public, anon, authenticated;

-- ── Conferma delle consegne ────────────────────────────────────────────────
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
 -- 12/11/2026: la bolla dice «caricata in magazzino» anche quando il carico
 -- passa dalle consegne. Prima lo scriveva solo bolla_carica_magazzino, che
 -- nessuno chiamava più, e la scheda Collegamenti diceva «Carico non ancora
 -- confermato» a merce già in giacenza. La data si mette quando c'è almeno un
 -- ingresso in magazzino, la bolla è per il magazzino (il vincolo
 -- ddt_ricezione_cantiere_non_carica_magazzino lo vieta alle bolle per il cantiere:
 -- per quelle lo stato si legge da ddt_consegne) e non resta nessuna riga da
 -- confermare (stessa regola delle «righe aperte» della scheda).
 update ddt_ricezione d2 set caricata_a_magazzino_at=now()
  where d2.id=d.id and d2.caricata_a_magazzino_at is null
  and exists(select 1 from ddt_consegne k where k.ddt_id=d.id and k.company_id=d.company_id and k.destinazione='magazzino' and k.tipo='ingresso')
  and d.destinazione='magazzino' and (not exists(
   select 1 from ddt_righe x where x.ddt_ricezione_id=d.id and x.movimento_id is null
   and not (x.arrivo_registrato_il is not null and not exists(select 1 from ddt_consegne k2 where k2.riga_id=x.id))
   and coalesce(x.quantita,0)>(select coalesce(sum(k3.quantita),0) from ddt_consegne k3 where k3.riga_id=x.id)));
 return jsonb_build_object('gia_registrata',false,'righe',n);
end $function$;
revoke all on function public.ddt_conferma_consegna(uuid,uuid,jsonb) from public,anon;
grant execute on function public.ddt_conferma_consegna(uuid,uuid,jsonb) to authenticated;

-- ── Prezzi dalla fattura ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.ddt_valorizza_da_fattura(p_ddt uuid, p_fattura uuid, p_righe jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare d public.ddt_ricezione%rowtype; f public.fatture_ricevute%rowtype; r public.ddt_righe%rowtype; v public.ddt_valorizzazioni%rowtype;
 x jsonb; q numeric; prezzo numeric; totale_q numeric; medio numeric; medio_prima numeric; n integer:=0; diversi jsonb:='[]'::jsonb;
begin
 select * into d from ddt_ricezione where id=p_ddt for update;
 if not found or auth.uid() is null or public.utente_bloccato() or public.utente_e_cliente_esterno() or public.utente_sola_lettura(d.company_id) or not coalesce(public.user_can_access_company(d.company_id),false)
 or not coalesce(public.has_permission_for_company(auth.uid(),'can_manage_purchasing',d.company_id) or public.e_super_admin_dentro(d.company_id),false) then raise exception 'Non puoi valorizzare questa bolla' using errcode='42501'; end if;
 select * into f from fatture_ricevute where id=p_fattura and company_id=d.company_id for update;
 if not found or d.supplier_id is null or not exists(select 1 from suppliers s where s.id=d.supplier_id and s.company_id=d.company_id and (f.fornitore_id=s.id or (nullif(regexp_replace(regexp_replace(upper(coalesce(f.cedente_piva,'')),'[^A-Z0-9]','','g'),'^IT',''),'') is not null and regexp_replace(regexp_replace(upper(coalesce(f.cedente_piva,'')),'[^A-Z0-9]','','g'),'^IT','')=regexp_replace(regexp_replace(upper(coalesce(s.vat_number,'')),'[^A-Z0-9]','','g'),'^IT','')))) then raise exception 'La fattura deve appartenere allo stesso fornitore e alla stessa azienda' using errcode='42501'; end if;
 if f.tipo_documento='TD04' then raise exception 'Per una nota di credito ripartisci lo storno sulla fattura originale.' using errcode='22023';end if;
 if jsonb_typeof(p_righe) is distinct from 'array' or jsonb_array_length(p_righe) not between 1 and 500 then raise exception 'Scegli le righe della fattura da confrontare'; end if;
 for x in select * from jsonb_array_elements(p_righe) loop
  select * into r from ddt_righe where id=nullif(x->>'riga_id','')::uuid and ddt_ricezione_id=d.id for update;
  if not found then raise exception 'La riga non appartiene alla bolla' using errcode='42501'; end if;
  q:=nullif(x->>'quantita','')::numeric;prezzo:=nullif(x->>'prezzo_unitario','')::numeric;
  if q is null or q<=0 or q>1000000000 or q::text in ('NaN','Infinity','-Infinity') or prezzo is null or prezzo<0 or prezzo>1000000000 or prezzo::text in ('NaN','Infinity','-Infinity') then raise exception 'Controlla quantità fatturata e prezzo unitario IVA esclusa'; end if;
  select * into v from ddt_valorizzazioni where fattura_id=f.id and riga_id=r.id;
  if found then
   if v.quantita<>q or v.prezzo_unitario<>prezzo then raise exception 'Questa riga è già stata valorizzata con dati diversi: controlla la fattura e la registrazione precedente'; end if;
   continue;
  end if;
  if r.quantita is null then raise exception 'Le quantità fatturate superano la quantità sulla bolla'; end if;
  -- Il prezzo che le fatture precedenti avevano già dato alla riga (senza questa).
  select sum(c.quantita*pv.prezzo_unitario)/nullif(sum(c.quantita),0) into medio_prima from fattura_ddt_consumi(d.company_id,array[d.id],f.id) c join ddt_valorizzazioni pv on pv.fattura_id=c.fattura_id and pv.riga_id=c.riga_id where c.riga_id=r.id;
  insert into ddt_valorizzazioni(company_id,ddt_id,riga_id,fattura_id,quantita,prezzo_unitario,created_by) values(d.company_id,d.id,r.id,f.id,q,prezzo,auth.uid());
  select sum(c.quantita),sum(c.quantita*pv.prezzo_unitario)/nullif(sum(c.quantita),0) into totale_q,medio from fattura_ddt_consumi(d.company_id,array[d.id],null) c join ddt_valorizzazioni pv on pv.fattura_id=c.fattura_id and pv.riga_id=c.riga_id where c.riga_id=r.id;
  -- 12/11/2026: il prezzo è unitario, la quantità fatturata non conta per il
  -- prezzo. Una fattura che copre solo una parte della riga dà comunque il
  -- prezzo alla riga che non ne ha uno (o che ha quello di una fattura
  -- precedente, che si affina con la media ponderata). Un prezzo diverso già
  -- scritto sulla bolla non si tocca finché la fattura non copre tutta la
  -- riga — come prima: a copertura piena vince la fattura — e in entrambi i
  -- casi la differenza torna a chi ha chiamato in «prezzi_diversi».
  if totale_q>=r.quantita or r.prezzo_unitario is null
   or (medio_prima is not null and round(r.prezzo_unitario,4)=round(medio_prima,4)) then
   if r.prezzo_unitario is not null and round(r.prezzo_unitario,4)<>round(medio,4)
    and (medio_prima is null or round(r.prezzo_unitario,4)<>round(medio_prima,4)) then
    diversi:=diversi||jsonb_build_object('riga_id',r.id,'descrizione',r.descrizione,'prezzo_bolla',r.prezzo_unitario,'prezzo_fattura',round(medio,4),'sostituito',true);
   end if;
   update ddt_righe set prezzo_unitario=medio,importo=round(r.quantita*medio,2) where id=r.id;
   update order_items set purchase_price=medio,prezzo_da_definire=false,updated_at=now() where ddt_riga_origine_id=r.id and exists(select 1 from orders o where o.id=order_items.order_id and o.company_id=d.company_id);
  elsif round(r.prezzo_unitario,4)<>round(medio,4) then
   diversi:=diversi||jsonb_build_object('riga_id',r.id,'descrizione',r.descrizione,'prezzo_bolla',r.prezzo_unitario,'prezzo_fattura',round(medio,4),'sostituito',false);
  end if;
  n:=n+1;
 end loop;
 if not exists(select 1 from fattura_ddt where fattura_ricevuta_id=f.id and ddt_ricezione_id=d.id) then
  insert into fattura_ddt(company_id,fattura_ricevuta_id,ddt_ricezione_id,numero_ddt,data_ddt,origine,created_by) values(d.company_id,f.id,d.id,d.numero_ddt,d.data_ricezione,'manuale',auth.uid());
 end if;
 return jsonb_build_object('righe',n,'fattura_id',f.id,'prezzi_diversi',diversi);
end $function$;
revoke all on function public.ddt_valorizza_da_fattura(uuid,uuid,jsonb) from public,anon;
grant execute on function public.ddt_valorizza_da_fattura(uuid,uuid,jsonb) to authenticated;

-- ── Medio dell'articolo e scarichi provvisori ──────────────────────────────
-- La guardia «somma dei movimenti = giacenza» resta: il medio si ricostruisce
-- rileggendo la storia, e una storia incompleta (giacenza iniziale scritta a
-- mano senza carico, quantità ritoccate fuori dai movimenti) darebbe un medio
-- sbagliato con l'aria di quello giusto. Adesso però il motivo si vede.
create or replace function public.ddt_prezzo_stock(p_company uuid,p_stock uuid)
returns void language plpgsql security definer set search_path=public set lock_timeout='3s' as $$
declare s public.warehouse_stock%rowtype; m record; saldo numeric:=0; medio numeric:=0;
 prezzo numeric; incerto boolean:=false; incoerente boolean:=false; n integer:=0;
 motivo text; primo_carico timestamptz; da_rivalutare integer:=0;
 tetto_scarichi constant integer:=5000;
begin
 select * into s from warehouse_stock where id=p_stock and company_id=p_company for update;
 if not found then return; end if;
 -- Si corregge solo il prezzo dei movimenti riconducibili alla riga originale.
 update warehouse_movements w set unit_cost=r.prezzo_unitario
 from ddt_consegne c join ddt_righe r on r.id=c.riga_id and r.company_id=c.company_id
 where c.movimento_id=w.id and c.stock_item_id=s.id and c.company_id=p_company
 and w.company_id=p_company and c.tipo='ingresso' and r.prezzo_unitario is not null
 and w.unit_cost is distinct from r.prezzo_unitario;

 for m in
  select w.*,c.id as consegna_ddt,r.prezzo_unitario as prezzo_ddt
  from warehouse_movements w
  left join ddt_consegne c on c.movimento_id=w.id and c.company_id=p_company
  left join ddt_righe r on r.id=c.riga_id and r.company_id=p_company
  where w.stock_item_id=s.id and w.company_id=p_company
  order by w.created_at,w.id limit 10001
 loop
  n:=n+1;
  if n>10000 then incoerente:=true;motivo:=coalesce(motivo,'oltre 10.000 movimenti: il medio non si ricostruisce da qui');exit;end if;
  if m.quantity is null or m.quantity<=0 then incoerente:=true;motivo:=coalesce(motivo,'un movimento ha quantità vuota o non positiva');continue;end if;
  if m.movement_type='carico' then
   prezzo:=case when m.consegna_ddt is not null then m.prezzo_ddt else m.unit_cost end;
   if prezzo is null or (m.consegna_ddt is null and prezzo<=0) then incerto:=true;
   elsif coalesce(m.valorizza_medio,true) then
    medio:=case when saldo<=0 then prezzo else (saldo*medio+m.quantity*prezzo)/(saldo+m.quantity) end;
   end if;
   saldo:=saldo+m.quantity;
  elsif m.movement_type='scarico' then
   saldo:=saldo-m.quantity;
   if saldo<0 then incoerente:=true;motivo:=coalesce(motivo,'gli scarichi superano i carichi: manca un carico nello storico');end if;
   if saldo=0 then incerto:=false;medio:=0;end if;
  else incoerente:=true;motivo:=coalesce(motivo,'movimento di tipo sconosciuto: '||coalesce(m.movement_type,'vuoto'));
  end if;
 end loop;
 if n=0 then incoerente:=true;motivo:=coalesce(motivo,'nessun movimento registrato');
 elsif abs(saldo-s.quantity)>0.000001 then
  incoerente:=true;
  motivo:=coalesce(motivo,format('la somma dei movimenti (%s) non coincide con la giacenza (%s)',trim_scale(saldo),trim_scale(s.quantity::numeric)));
 end if;

 if not incerto and not incoerente then
  update warehouse_stock set unit_cost=round(medio,4),prezzo_da_definire=false,
   costo_ricalcolo_sospeso=null,costo_ricalcolo_sospeso_at=null,updated_at=now()
  where id=s.id and company_id=p_company;
  -- 12/11/2026: gli scarichi usciti a costo provvisorio dopo il primo carico
  -- da bolla prendono il medio appena ricostruito. L'UPDATE fa scattare
  -- trg_margine_commessa_upd: il margine della commessa si rifà da solo.
  select min(w.created_at) into primo_carico
   from warehouse_movements w join ddt_consegne c on c.movimento_id=w.id and c.company_id=p_company
   where w.stock_item_id=s.id and w.company_id=p_company and w.movement_type='carico' and c.tipo='ingresso';
  if primo_carico is not null then
   select count(*) into da_rivalutare from (
    select 1 from warehouse_movements w
    where w.stock_item_id=s.id and w.company_id=p_company and w.movement_type='scarico'
    and w.costo_provvisorio and w.created_at>=primo_carico limit tetto_scarichi+1) t;
   if da_rivalutare>tetto_scarichi then
    motivo:=format('più di %s scarichi a costo provvisorio: non li rivaluto in un colpo solo',tetto_scarichi);
    update warehouse_stock set costo_ricalcolo_sospeso=motivo,costo_ricalcolo_sospeso_at=now()
    where id=s.id and company_id=p_company;
    raise warning 'ddt_prezzo_stock %: %',s.id,motivo;
   elsif da_rivalutare>0 then
    update warehouse_movements w set unit_cost=round(medio,4),costo_provvisorio=false
    where w.stock_item_id=s.id and w.company_id=p_company and w.movement_type='scarico'
    and w.costo_provvisorio and w.created_at>=primo_carico;
   end if;
  end if;
  return;
 end if;

 if incerto or s.prezzo_da_definire then
  update warehouse_stock set prezzo_da_definire=true,updated_at=now() where id=s.id and company_id=p_company;
 end if;
 if incoerente then
  -- La guardia resta, ma dice perché: il motivo si vede sulla scheda articolo.
  update warehouse_stock set costo_ricalcolo_sospeso=motivo,
   costo_ricalcolo_sospeso_at=case when costo_ricalcolo_sospeso is distinct from motivo then now() else costo_ricalcolo_sospeso_at end
  where id=s.id and company_id=p_company;
  raise warning 'ddt_prezzo_stock %: medio non ricalcolato, %',s.id,motivo;
 end if;
end $$;
revoke all on function public.ddt_prezzo_stock(uuid,uuid) from public,anon,authenticated;

-- ── Dati già presenti ──────────────────────────────────────────────────────
-- Conteggi del 12/11/2026 in produzione (18.419 movimenti, 205 articoli):
--   scarichi a costo 0 o vuoto di articoli con prezzo_da_definire: 0;
--   bolle con un ingresso in magazzino dalle consegne e senza data di carico: 1.
-- Le due istruzioni restano qui per ciò che nasce fra oggi e l'applicazione,
-- strette all'ambito e sotto i timeout impostati in cima.

-- Scarichi storici a costo zero di articoli ancora senza prezzo: provvisori.
update public.warehouse_movements w
   set costo_provvisorio = true
  from public.warehouse_stock s
 where s.id = w.stock_item_id
   and s.prezzo_da_definire
   and w.movement_type = 'scarico'
   and coalesce(w.unit_cost, 0) = 0
   and not coalesce(w.rientro_commessa, false)
   and coalesce(w.valorizza_medio, true)
   and not w.costo_provvisorio;

-- Bolle già confermate dalle consegne prima di oggi: la data del carico è
-- quella dell'ultimo ingresso in magazzino, con la stessa regola della conferma.
update public.ddt_ricezione d
   set caricata_a_magazzino_at = (
     select max(k.created_at) from public.ddt_consegne k
      where k.ddt_id = d.id and k.company_id = d.company_id
        and k.destinazione = 'magazzino' and k.tipo = 'ingresso')
 where d.caricata_a_magazzino_at is null
   and exists (select 1 from public.ddt_consegne k
                where k.ddt_id = d.id and k.company_id = d.company_id
                  and k.destinazione = 'magazzino' and k.tipo = 'ingresso')
   and d.destinazione = 'magazzino' and (not exists (
     select 1 from public.ddt_righe x
      where x.ddt_ricezione_id = d.id and x.movimento_id is null
        and not (x.arrivo_registrato_il is not null
                 and not exists (select 1 from public.ddt_consegne k2 where k2.riga_id = x.id))
        and coalesce(x.quantita, 0) > (select coalesce(sum(k3.quantita), 0)
                                         from public.ddt_consegne k3 where k3.riga_id = x.id)));
