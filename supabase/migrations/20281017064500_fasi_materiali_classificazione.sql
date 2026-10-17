begin;
set local lock_timeout = '3s';
set local statement_timeout = '60s';
-- Preserve amounts and existing assignments. Historical rows are reclassified only by explicit user action.
alter table public.order_items add column natura_riga text not null default 'materiale' check(natura_riga in('materiale','lavorazione','descrizione'));
alter table public.order_work_phases add column legacy_order_item_id uuid unique references public.order_items(id) on delete restrict;
-- Il solo esito booleano evita che RLS nasconda collegamenti destinati al CASCADE.
create function public.fase_storica_protetta(p_phase_id uuid,p_company_id uuid,p_item_id uuid)
returns boolean language plpgsql security definer set search_path='' as $$
declare p public.order_work_phases%rowtype; i public.order_items%rowtype;
begin
 if auth.uid() is null or public.utente_bloccato() or public.utente_e_cliente_esterno() or public.utente_sola_lettura(p_company_id)
 or not coalesce(p_company_id=any(public.aziende_con_permesso('can_edit_orders')),false) then raise exception 'Fase non disponibile.' using errcode='42501';end if;
 select f.* into p from public.order_work_phases f join public.orders o on o.id=f.order_id
 where f.id=p_phase_id and f.company_id=p_company_id and o.company_id=p_company_id and f.legacy_order_item_id=p_item_id
 and public.can_see_order(o.id,o.assigned_to,o.destination_warehouse_id);
 if not found then return true;end if;
 select * into i from public.order_items where id=p_item_id and order_id=p.order_id;
 return p.status is distinct from 'da_iniziare' or coalesce(p.percentuale,0)>0
 or p.start_date is not null or p.end_date is not null
 or p.name is distinct from left(split_part(i.name,'  ',1),200)
 or p.notes is distinct from concat_ws(E'\n',i.name,i.description)
 or p.importo_venduto is distinct from (case when i.unit_price is null then null else round(i.quantity*i.unit_price*(1-coalesce(i.discount_percent,0)/100),2) end)
 or exists(select 1 from public.order_employees where phase_id=p.id)
 or exists(select 1 from public.order_external_teams where phase_id=p.id)
 or exists(select 1 from public.order_work_subphases where phase_id=p.id)
 or exists(select 1 from public.order_phase_assignments where phase_id=p.id)
 or exists(select 1 from public.squadre_commesse where phase_id=p.id)
 or exists(select 1 from public.note_cantiere where phase_id=p.id)
 or exists(select 1 from public.ordini_variazione where work_phase_id=p.id)
 or exists(select 1 from public.order_items where phase_id=p.id and id<>p_item_id);
end $$;
revoke all on function public.fase_storica_protetta(uuid,uuid,uuid) from public,anon;
grant execute on function public.fase_storica_protetta(uuid,uuid,uuid) to authenticated;
create or replace function public.riclassifica_righe_storiche(p_company_id uuid,p_order_id uuid,p_item_ids uuid[],p_natura text,p_expected jsonb default null)
returns integer language plpgsql security invoker set search_path='' as $$
declare o public.orders%rowtype; i public.order_items%rowtype; pid uuid; totale integer:=0; expected jsonb;
begin
  if auth.uid() is null or public.utente_bloccato() or public.utente_e_cliente_esterno() or public.utente_sola_lettura(p_company_id)
    or not coalesce(p_company_id=any(public.aziende_con_permesso('can_edit_orders')),false) then raise exception 'Non hai il permesso di modificare le commesse.' using errcode='42501'; end if;
  if p_natura not in('materiale','lavorazione','descrizione') or p_natura is null or coalesce(cardinality(p_item_ids),0)=0 then raise exception 'Seleziona le righe da classificare.'; end if;
  select * into o from public.orders where id=p_order_id and company_id=p_company_id and deleted_at is null for update;
  if not found or not public.can_see_order(o.id,o.assigned_to,o.destination_warehouse_id) then raise exception 'Commessa non disponibile.' using errcode='42501'; end if;
  for i in select * from public.order_items where order_id=o.id and id=any(p_item_ids) order by id for update loop
    if p_expected is not null then
      select v into expected from jsonb_array_elements(p_expected) v where v->>'id'=i.id::text;
      if expected is null or i.name is distinct from expected->>'name'
        or i.quantity is distinct from (expected->>'quantity')::numeric
        or i.unit_price is distinct from (expected->>'unit_price')::numeric
        or i.discount_percent is distinct from (expected->>'discount_percent')::numeric
        or i.natura_riga is distinct from coalesce(expected->>'natura_riga','materiale')
        or i.phase_id is distinct from (expected->>'phase_id')::uuid then
        raise exception 'Le righe sono cambiate: ricarica la commessa e ricontrolla la selezione.' using errcode='40001';
      end if;
    end if;
    if i.natura_riga=p_natura then continue; end if;
    if i.phase_id is not null and not exists(select 1 from public.order_work_phases where id=i.phase_id and legacy_order_item_id=i.id) then raise exception 'Riga già assegnata a una fase: verifica il collegamento prima di riclassificarla.'; end if;
    if i.supplier_id is not null or i.stock_item_id is not null or coalesce(i.purchase_price,0)<>0 or coalesce(i.standard_cost,0)<>0 or i.is_paid or i.deposit_paid or i.balance_paid
      or i.status is distinct from 'da_ordinare' or coalesce(i.quantity_received,0)>0 or coalesce(i.quantity_reserved,0)>0
      or i.receipt_id is not null or i.shipment_id is not null or i.installation_id is not null
      or exists(select 1 from public.purchase_order_items where order_item_id=i.id)
      or exists(select 1 from public.warehouse_movements where order_item_id=i.id)
      or exists(select 1 from public.stock_units where reserved_order_id=o.id or delivered_to_order_id=o.id)
      then raise exception 'Riga già collegata ad acquisti, budget, pagamenti o magazzino: revisione manuale necessaria.'; end if;
    if i.natura_riga<>'materiale' and i.phase_id is not null then
      perform id from public.order_work_phases where id=i.phase_id for update;
      if public.fase_storica_protetta(i.phase_id,p_company_id,i.id)
        then raise exception 'La fase è già utilizzata: conserva lo storico del cantiere.'; end if;
    end if;
    if p_natura='lavorazione' then
      insert into public.order_work_phases(company_id,order_id,name,position,notes,legacy_order_item_id,importo_venduto)
        values(p_company_id,o.id,left(split_part(i.name,'  ',1),200),i.position,concat_ws(E'\n',i.name,i.description),i.id,case when i.unit_price is null then null else round(i.quantity*i.unit_price*(1-coalesce(i.discount_percent,0)/100),2) end)
        on conflict(legacy_order_item_id) do update set legacy_order_item_id=excluded.legacy_order_item_id returning id into pid;
      update public.order_items set natura_riga=p_natura,phase_id=pid where id=i.id;
    else
      update public.order_items set natura_riga=p_natura,phase_id=null where id=i.id;
      delete from public.order_work_phases where legacy_order_item_id=i.id;
    end if;
    totale:=totale+1;
  end loop;
  if (select count(*) from public.order_items where order_id=o.id and id=any(p_item_ids))<>cardinality(p_item_ids) then raise exception 'Alcune righe non appartengono alla commessa o sono duplicate.'; end if;
  return totale;
end $$;
revoke all on function public.riclassifica_righe_storiche(uuid,uuid,uuid[],text,jsonb) from public,anon;
grant execute on function public.riclassifica_righe_storiche(uuid,uuid,uuid[],text,jsonb) to authenticated;


create or replace function public.duplica_lavoro_atomic(
 p_tipo text,p_source_id uuid,p_mantieni_cliente boolean default false,
 p_anteprima boolean default true,p_impronta text default null,p_request_id uuid default null
) returns jsonb language plpgsql security definer set search_path=public as $$
declare
 q jsonb; azienda uuid; materiali jsonb:='[]'; fasi jsonb:='[]'; voci jsonb:='[]'; rate jsonb:='[]';
 r jsonb; s jsonb; pos integer:=0; idx integer; nuova_fase uuid; nuovo uuid; ordine_origine uuid;
 impronta text; riepilogo jsonb; esito jsonb; dati jsonb; codice text; numero integer; richiesta record;
begin
 if auth.uid() is null or public.utente_bloccato() or public.utente_e_cliente_esterno() then
  raise exception 'Sessione non autorizzata.' using errcode='42501'; end if;
 if p_tipo='commessa' then
  select to_jsonb(o) into q from public.orders o where id=p_source_id and deleted_at is null for share;
 elsif p_tipo='rst' then
  select to_jsonb(p) into q from public.rst_progetti p where id=p_source_id and deleted_at is null for share;
 else raise exception 'Tipo di copia non valido.'; end if;
 if q is null then raise exception 'Origine non trovata.'; end if;
 azienda:=(q->>'company_id')::uuid;
 perform public.assert_company_access(azienda);
 if azienda is distinct from public.get_effective_company_id() then
  raise exception 'Apri l’azienda del documento prima di duplicarlo.' using errcode='42501'; end if;
 if azienda is distinct from public.get_user_company_id(auth.uid()) and not public.has_role(auth.uid(),'super_admin'::app_role)
 and not exists(select 1 from public.multi_company_access m where m.company_id=azienda and m.user_id=auth.uid()
  and m.status='active' and (m.expires_at is null or m.expires_at>now())) then
  raise exception 'Accesso azienda scaduto o revocato.' using errcode='42501'; end if;
 if p_tipo='commessa' then
  if public.has_permission_for_company(auth.uid(),'can_edit_orders',azienda) is not true
   or public.has_permission_for_company(auth.uid(),'can_view_orders',azienda) is not true
   or public.can_see_order(p_source_id,(q->>'assigned_to')::uuid,(q->>'destination_warehouse_id')::uuid) is not true then
   raise exception 'Non hai il permesso di duplicare questa commessa.' using errcode='42501'; end if;
  ordine_origine:=p_source_id;
  select coalesce(jsonb_agg(to_jsonb(i) order by position,id),'[]') into materiali from public.order_items i where order_id=p_source_id;
  select coalesce(jsonb_agg(to_jsonb(i) order by position,id),'[]') into rate from public.order_installments i where order_id=p_source_id;
 else
  if public.has_permission_for_company(auth.uid(),'can_edit_preventivi',azienda) is not true
   or public.check_staff_visibility(auth.uid(),(q->>'created_by')::uuid) is not true then
   raise exception 'Non hai il permesso di duplicare questo preventivo.' using errcode='42501'; end if;
  select coalesce(jsonb_agg(to_jsonb(v) order by v.ordine,v.id),'[]') into voci from public.rst_computo_voci v where progetto_id=p_source_id and company_id=azienda;
  if (q->>'ordine_id') is not null and public.has_permission_for_company(auth.uid(),'can_view_orders',azienda) then
   select id into ordine_origine from public.orders o where id=(q->>'ordine_id')::uuid and company_id=azienda and deleted_at is null
    and public.can_see_order(o.id,o.assigned_to,o.destination_warehouse_id);
  end if;
 end if;
 if ordine_origine is not null then
  select coalesce(jsonb_agg(jsonb_build_object('source_id',case when p_tipo='commessa' then f.id else null end,'name',f.name,'notes',f.notes,'importo_venduto',f.importo_venduto,'sottofasi',
   coalesce((select jsonb_agg(jsonb_build_object('name',s.name,'peso',s.peso) order by s.position,s.id)
    from public.order_work_subphases s where s.phase_id=f.id),'[]')) order by f.position,f.id),'[]') into fasi
   from public.order_work_phases f where f.order_id=ordine_origine;
 elsif p_tipo='rst' then
  fasi:=coalesce(q->'fasi_previste','[]');
 end if;
 impronta:=md5(jsonb_build_array(q,materiali,rate,voci,fasi,p_mantieni_cliente)::text);
 riepilogo:=jsonb_build_object('tipo',p_tipo,'source_id',p_source_id,
  'titolo',coalesce(q->>'description',q->>'note',q->>'code','Documento'),
  'numero',coalesce(q->>'order_code',q->>'code'),'materiali',(select count(*) from jsonb_array_elements(materiali) z where coalesce(z->>'natura_riga','materiale')='materiale'),
  'voci',jsonb_array_length(voci),'fasi',jsonb_array_length(fasi),
  'sottofasi',(select count(*) from jsonb_array_elements(fasi) f cross join lateral jsonb_array_elements(f->'sottofasi') s),
  'totale',case when p_tipo='rst' then (q->>'totale')::numeric
    when public.has_permission_for_company(auth.uid(),'can_view_order_amounts',azienda) then
      round((q->>'total_amount')::numeric*(1+coalesce((q->>'vat_rate')::numeric,22)/100),2) else null end,
  'mantieni_cliente',p_mantieni_cliente,'impronta',impronta);
 if p_anteprima then return riepilogo; end if;
 if p_request_id is null then raise exception 'Riapri il riepilogo prima di duplicare.'; end if;
 perform pg_advisory_xact_lock(hashtext(p_request_id::text));
 select * into richiesta from private.work_copy_requests where request_id=p_request_id;
 if found then
  if richiesta.user_id is distinct from auth.uid() or richiesta.company_id is distinct from azienda
   or richiesta.source_type<>p_tipo or richiesta.source_id<>p_source_id then
   raise exception 'Richiesta non valida.' using errcode='42501'; end if;
  return riepilogo||jsonb_build_object('id',richiesta.target_id,'gia_creata',true);
 end if;
 if p_impronta is distinct from impronta then
  raise exception 'L’origine è cambiata: aggiorna il riepilogo prima di duplicare.' using errcode='40001'; end if;
 if p_tipo='commessa' then
  -- Copia solo dati contrattuali, mai acquisti pagati, costi reali o giacenze.
  dati:=jsonb_build_object('company_id',azienda,'order_code',public.prossimo_numero_commessa(azienda),
   'description',q->>'description','total_amount',q->'total_amount','vat_rate',q->'vat_rate',
   'deposit_amount',q->'deposit_amount','deposit_2_amount',q->'deposit_2_amount',
   'financing_amount',q->'financing_amount','balance_amount',q->'balance_amount','payment_type',q->>'payment_type',
   'assigned_to',case when public.solo_assegnati_attivo() or exists(
     select 1 from public.staff_permissions where user_id=auth.uid() and company_id=azienda and only_my_warehouse)
     then auth.uid() else null end,
   'customer_id',case when p_mantieni_cliente then q->'customer_id' else null end);
  select coalesce(jsonb_agg(jsonb_build_object('name',i->>'name','description',i->>'description','quantity',(i->>'quantity')::integer,
   'unit_price',i->'unit_price','discount_percent',i->'discount_percent','vat_rate',i->'vat_rate',
   'natura_riga',coalesce(i->>'natura_riga','materiale'),'source_phase_id',i->'phase_id','product_code',i->>'product_code','family_id',i->'family_id','axis_selections',i->'axis_selections',
   'misure_preventivo',i->'misure_preventivo','status','da_ordinare','position',n-1)),'[]') into materiali
   from jsonb_array_elements(materiali) with ordinality a(i,n);
  select coalesce(jsonb_agg(jsonb_build_object('label',i->>'label','type',i->>'type','amount',i->'amount',
   'position',n-1,'is_paid',false,'trigger_evento','data_fissa')),'[]') into rate
   from jsonb_array_elements(rate) with ordinality a(i,n);
  esito:=public.create_order_atomic(dati,materiali,null,auth.uid(),rate);nuovo:=(esito->>'id')::uuid;
  update public.order_items ni set natura_riga=coalesce(j.value->>'natura_riga','materiale')
    from jsonb_array_elements(materiali) j where ni.order_id=nuovo and ni.position=(j.value->>'position')::integer;
  update public.orders set created_by=auth.uid(),
   client_name=case when p_mantieni_cliente then q->>'client_name' end,
   client_email=case when p_mantieni_cliente then q->>'client_email' end,
   client_phone=case when p_mantieni_cliente then q->>'client_phone' end,
   client_company=case when p_mantieni_cliente then q->>'client_company' end,
   client_address=case when p_mantieni_cliente then q->>'client_address' end,
   indirizzo_lavori=case when p_mantieni_cliente then q->>'indirizzo_lavori' end,
   work_address=case when p_mantieni_cliente then q->>'work_address' end where id=nuovo;
  for r in select value from jsonb_array_elements(fasi) loop
   insert into public.order_work_phases(company_id,order_id,name,notes,position,status,percentuale,importo_venduto)
    values(azienda,nuovo,r->>'name',r->>'notes',pos,'da_iniziare',0,(r->>'importo_venduto')::numeric) returning id into nuova_fase;
   update public.order_items set phase_id=nuova_fase where order_id=nuovo and position in
    (select (i->>'position')::integer from jsonb_array_elements(materiali) i where i->>'source_phase_id'=r->>'source_id');
   update public.order_work_phases set legacy_order_item_id=(select ni.id from public.order_items ni where ni.order_id=nuovo and ni.phase_id=nuova_fase and ni.natura_riga='lavorazione' limit 1) where id=nuova_fase;
   idx:=0;
   for s in select value from jsonb_array_elements(coalesce(r->'sottofasi','[]')) loop
    insert into public.order_work_subphases(phase_id,name,position,peso,fatta)
     values(nuova_fase,s->>'name',idx,coalesce((s->>'peso')::integer,1),false);idx:=idx+1;
   end loop;pos:=pos+1;
  end loop;
 else
  perform pg_advisory_xact_lock(hashtext('rst_copia_'||azienda::text));
  select count(*)+1 into numero from public.rst_progetti where company_id=azienda;
  codice:='RST-'||extract(year from current_date)::text||'-'||lpad(numero::text,3,'0');
  while exists(select 1 from public.rst_progetti where company_id=azienda and code=codice) loop
   numero:=numero+1;codice:='RST-'||extract(year from current_date)::text||'-'||lpad(numero::text,3,'0');
  end loop;
  nuovo:=gen_random_uuid();
  dati:=q||jsonb_build_object('id',nuovo,'code',codice,'stato','bozza','ordine_id',null,
   'created_by',auth.uid(),'updated_by',auth.uid(),'created_at',now(),'updated_at',now(),
   'deleted_at',null,'opportunita_id',null,'origine_quote_id',null,'origine_quote_revision',null,
   'origine_quote_impronta',null,'origine_modello_impronta',null,'fasi_previste',fasi);
  if not p_mantieni_cliente then
   dati:=dati||jsonb_build_object('cliente_id',null,'cliente_nome',null,'cliente_cognome',null,'cliente_email',null,'cliente_telefono',null,
    'cantiere_indirizzo',null,'cantiere_citta',null,'cantiere_cap',null,'cantiere_provincia',null,
    'immobile_tipo',null,'immobile_superficie_mq',null,'immobile_anno',null,'immobile_piani',null);
  end if;
  insert into public.rst_progetti select (jsonb_populate_record(null::public.rst_progetti,dati)).*;
  for r in select value from jsonb_array_elements(voci) loop
   insert into public.rst_computo_voci select (jsonb_populate_record(null::public.rst_computo_voci,
    r||jsonb_build_object('id',gen_random_uuid(),'progetto_id',nuovo,'company_id',azienda,'created_at',now()))).*;
  end loop;
 end if;
 insert into private.work_copy_requests(request_id,user_id,company_id,source_type,source_id,target_id)
  values(p_request_id,auth.uid(),azienda,p_tipo,p_source_id,nuovo);
 return riepilogo||jsonb_build_object('id',nuovo,'gia_creata',false);
end$$;
revoke all on function public.duplica_lavoro_atomic(text,uuid,boolean,boolean,text,uuid) from public,anon;
grant execute on function public.duplica_lavoro_atomic(text,uuid,boolean,boolean,text,uuid) to authenticated;


create function public.solo_materiali_acquistabili() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.order_item_id is not null and exists(select 1 from public.order_items where id=new.order_item_id and natura_riga<>'materiale') then
   raise exception 'Questa riga è una lavorazione o una descrizione, non un materiale da acquistare.';
 end if;return new;
end $$;
revoke all on function public.solo_materiali_acquistabili() from public,anon,authenticated;
create trigger solo_materiali_acquistabili before insert or update of order_item_id on public.purchase_order_items for each row execute function public.solo_materiali_acquistabili();

create function public.proteggi_riga_lavorazione() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.natura_riga<>'materiale' and (new.status is distinct from 'da_ordinare' or new.supplier_id is not null or new.stock_item_id is not null
 or coalesce(new.purchase_price,0)<>0 or new.is_paid or new.deposit_paid or new.balance_paid
 or coalesce(new.quantity_received,0)>0 or coalesce(new.quantity_reserved,0)>0
 or new.receipt_id is not null or new.shipment_id is not null or new.installation_id is not null) then
 raise exception 'Una lavorazione o descrizione non può ricevere acquisti, pagamenti o movimenti di magazzino.';
 end if;return new;
end $$;
revoke all on function public.proteggi_riga_lavorazione() from public,anon,authenticated;
create trigger proteggi_riga_lavorazione before insert or update on public.order_items for each row execute function public.proteggi_riga_lavorazione();
commit;
