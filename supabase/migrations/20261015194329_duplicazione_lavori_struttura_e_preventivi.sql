-- Anteprima locale: duplicazione consapevole, senza consuntivi e senza legami al vecchio cantiere.
alter table public.rst_progetti add column if not exists fasi_previste jsonb not null default '[]';
create schema if not exists private;
create table if not exists private.work_copy_requests (
 request_id uuid primary key,user_id uuid not null,company_id uuid not null,
 source_type text not null,source_id uuid not null,target_id uuid not null,created_at timestamptz not null default now()
);
alter table private.work_copy_requests enable row level security;
revoke all on private.work_copy_requests from public,anon,authenticated;
-- Registro interno: nessun accesso diretto dal client, solo RPC autorizzata.
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
   or public.can_see_order(p_source_id,(q->>'assigned_to')::uuid,null) is not true then
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
    and public.can_see_order(o.id,o.assigned_to,null);
  end if;
 end if;
 if ordine_origine is not null then
  select coalesce(jsonb_agg(jsonb_build_object('source_id',case when p_tipo='commessa' then f.id else null end,'name',f.name,'notes',f.notes,'sottofasi',
   coalesce((select jsonb_agg(jsonb_build_object('name',s.name,'peso',s.peso) order by s.position,s.id)
    from public.order_work_subphases s where s.phase_id=f.id),'[]')) order by f.position,f.id),'[]') into fasi
   from public.order_work_phases f where f.order_id=ordine_origine;
 elsif p_tipo='rst' then
  fasi:=coalesce(q->'fasi_previste','[]');
 end if;
 impronta:=md5(jsonb_build_array(q,materiali,rate,voci,fasi,p_mantieni_cliente)::text);
 riepilogo:=jsonb_build_object('tipo',p_tipo,'source_id',p_source_id,
  'titolo',coalesce(q->>'description',q->>'note',q->>'code','Documento'),
  'numero',coalesce(q->>'order_code',q->>'code'),'materiali',jsonb_array_length(materiali),
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
   'assigned_to',case when public.solo_assegnati_attivo() then auth.uid() else null end,
   'customer_id',case when p_mantieni_cliente then q->'customer_id' else null end);
  select coalesce(jsonb_agg(jsonb_build_object('name',i->>'name','description',i->>'description','quantity',(i->>'quantity')::integer,
   'unit_price',i->'unit_price','discount_percent',i->'discount_percent','vat_rate',i->'vat_rate',
   'source_phase_id',i->'phase_id','product_code',i->>'product_code','family_id',i->'family_id','axis_selections',i->'axis_selections',
   'misure_preventivo',i->'misure_preventivo','status','da_ordinare','position',n-1)),'[]') into materiali
   from jsonb_array_elements(materiali) with ordinality a(i,n);
  select coalesce(jsonb_agg(jsonb_build_object('label',i->>'label','type',i->>'type','amount',i->'amount',
   'position',n-1,'is_paid',false,'trigger_evento','data_fissa')),'[]') into rate
   from jsonb_array_elements(rate) with ordinality a(i,n);
  esito:=public.create_order_atomic(dati,materiali,null,auth.uid(),rate);nuovo:=(esito->>'id')::uuid;
  update public.orders set created_by=auth.uid(),
   client_name=case when p_mantieni_cliente then q->>'client_name' end,
   client_email=case when p_mantieni_cliente then q->>'client_email' end,
   client_phone=case when p_mantieni_cliente then q->>'client_phone' end,
   client_company=case when p_mantieni_cliente then q->>'client_company' end,
   client_address=case when p_mantieni_cliente then q->>'client_address' end,
   indirizzo_lavori=case when p_mantieni_cliente then q->>'indirizzo_lavori' end,
   work_address=case when p_mantieni_cliente then q->>'work_address' end where id=nuovo;
  for r in select value from jsonb_array_elements(fasi) loop
   insert into public.order_work_phases(company_id,order_id,name,notes,position,status,percentuale)
    values(azienda,nuovo,r->>'name',r->>'notes',pos,'da_iniziare',0) returning id into nuova_fase;
   update public.order_items set phase_id=nuova_fase where order_id=nuovo and position in
    (select (i->>'position')::integer from jsonb_array_elements(materiali) i where i->>'source_phase_id'=r->>'source_id');
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

-- Le fasi pianificate nella copia del preventivo passano alla nuova commessa.
create or replace function public.converti_modulo_commessa_atomic(
  p_modulo text, p_progetto_id uuid, p_raggruppa_capitoli boolean default false,
  p_anteprima boolean default true, p_impronta text default null
) returns jsonb language plpgsql security definer set search_path = public
as $$
declare
  q jsonb; r jsonb; materiali jsonb := '[]'; fasi jsonb := '[]';
  componenti jsonb := '[]'; servizi jsonb := '[]'; ore jsonb := '[]'; voci jsonb := '[]';
  azienda uuid; profilo uuid; ordine uuid; fase_id uuid; sotto jsonb; sotto_pos integer; stato uuid; esito jsonb;
  aliquota numeric; netto numeric; quantita numeric; prezzo numeric; costo numeric;
  nome text; note text; descrizione text; indirizzo text; codice text; impronta text;
  posizione integer := 0; esclusi integer := 0;
begin
  if auth.uid() is null or public.utente_bloccato() or public.utente_e_cliente_esterno() then
    raise exception 'Sessione non autorizzata.' using errcode='42501';
  end if;
  if p_modulo='fv' then
    select to_jsonb(p) into q from public.fv_progetti p where id=p_progetto_id for update;
  elsif p_modulo='rst' then
    select to_jsonb(p) into q from public.rst_progetti p where id=p_progetto_id for update;
  else raise exception 'Modulo non valido.'; end if;
  if q is null then raise exception 'Preventivo non trovato.'; end if;
  azienda := (q->>'company_id')::uuid;
  perform public.assert_company_access(azienda);
  -- Stessa visibilità delle tabelle di origine, anche per «solo assegnati».
  if azienda is distinct from public.get_effective_company_id()
     or public.check_staff_visibility(auth.uid(), (q->>'created_by')::uuid) is not true
     or public.has_permission_for_company(auth.uid(),'can_edit_orders',azienda) is not true then
    raise exception 'Non hai il permesso di convertire questo preventivo.' using errcode='42501';
  end if;
  -- Non basta che una vecchia riga di accesso esista ancora.
  if azienda is distinct from public.get_user_company_id(auth.uid())
     and not public.has_role(auth.uid(),'super_admin'::public.app_role)
     and not exists(select 1 from public.multi_company_access m where m.user_id=auth.uid()
       and m.company_id=azienda and m.status = 'active' and (m.expires_at is null or m.expires_at>now())) then
    raise exception 'Accesso azienda scaduto o revocato.' using errcode='42501';
  end if;
  if nullif(q->>'ordine_id','') is not null then
    raise exception 'Questo preventivo è già diventato una commessa.' using errcode='23505';
  end if;
  if coalesce((q->>'annullato')::boolean,false) or nullif(q->>'deleted_at','') is not null then
    raise exception 'Il preventivo è stato eliminato o annullato.';
  end if;
  aliquota := coalesce((q->>case when p_modulo='fv' then 'iva_aliquota' else 'iva_pct' end)::numeric,
    case when p_modulo='fv' then 10 else 22 end);
  if aliquota<0 then aliquota := case when p_modulo='fv' then 10 else 22 end; end if;
  if aliquota>0 and aliquota<=1 then aliquota := round(aliquota*100,2); end if;
  if p_modulo='fv' then
    netto := case when coalesce((q->>'prezzo_vendita_manuale')::numeric,0)>0
      then round((q->>'prezzo_vendita_manuale')::numeric,2)
      else round(coalesce((q->>'prezzo_vendita_iva_inclusa')::numeric,0)/(1+aliquota/100),2) end;
    select coalesce(jsonb_agg(to_jsonb(c) order by ordinamento,id),'[]') into componenti
      from (select * from public.fv_componenti_progetto where progetto_id=p_progetto_id for share) c;
    select coalesce(jsonb_agg(to_jsonb(s) order by ordinamento,id),'[]') into servizi
      from (select * from public.fv_servizi_progetto where progetto_id=p_progetto_id for share) s;
    select coalesce(jsonb_agg(to_jsonb(m) order by ordinamento,id),'[]') into ore
      from (select * from public.fv_manodopera_progetto where progetto_id=p_progetto_id for share) m;
    for r in select value from jsonb_array_elements(componenti) loop
      quantita := coalesce((r->>'quantita')::numeric,0);
      if quantita<=0 then esclusi:=esclusi+1; continue; end if;
      nome := coalesce(nullif(trim(concat_ws(' ',r->>'marca',r->>'modello')),''),nullif(r->>'descrizione',''),'Componente');
      prezzo := coalesce((r->>'prezzo_unitario_vendita')::numeric,(r->>'prezzo_unitario_netto')::numeric,0);
      costo := coalesce((r->>'prezzo_unitario_netto')::numeric,0);
      note := nullif(concat_ws(' · ',nullif(r->>'descrizione',''),nullif(r->>'categoria','')),'');
      if quantita<>trunc(quantita) then
        note:=concat(quantita,' unità × ',prezzo,' €',case when note is not null then ' · '||note else '' end);
      end if;
      materiali:=materiali||jsonb_build_array(jsonb_build_object('name',left(nome,120),'description',note,
        'quantity',(case when quantita=trunc(quantita) then quantita else 1 end)::integer,
        'unit_price',round(case when quantita=trunc(quantita) then prezzo else prezzo*quantita end,2),
        'purchase_price',round(case when quantita=trunc(quantita) then costo else costo*quantita end,2),
        'status','da_ordinare','position',jsonb_array_length(materiali),'vat_rate',aliquota));
    end loop;
    for r in select value from jsonb_array_elements(servizi) loop
      quantita:=coalesce((r->>'quantita')::numeric,1);
      if quantita<=0 then esclusi:=esclusi+1; continue; end if;
      fasi:=fasi||jsonb_build_array(jsonb_build_object('name',coalesce(nullif(r->>'descrizione',''),nullif(r->>'tipo',''),'Servizio'),
        'notes',concat_ws(E'\n',nullif(r->>'tipo',''),quantita||' unità')));
    end loop;
    for r in select value from jsonb_array_elements(ore) loop
      quantita:=coalesce((r->>'ore')::numeric,0);
      if quantita<=0 then esclusi:=esclusi+1; continue; end if;
      fasi:=fasi||jsonb_build_array(jsonb_build_object('name',coalesce(nullif(r->>'descrizione',''),'Manodopera'),
        'notes',quantita||' h · Manodopera prevista; le ore effettive si registrano in cantiere.'));
    end loop;
    descrizione:=coalesce(nullif(trim(q->>'titolo'),''),'Impianto fotovoltaico '||coalesce(q->>'numero',''));
    codice:=q->>'numero';
    indirizzo:=concat_ws(', ',nullif(q->>'indirizzo',''),nullif(trim(concat_ws(' ',q->>'cap',q->>'comune')),''),nullif(q->>'provincia',''));
  else
    netto:=case when coalesce((q->>'totale_imponibile')::numeric,0)>0 then round((q->>'totale_imponibile')::numeric,2)
      else round(coalesce((q->>'totale')::numeric,0)/(1+aliquota/100),2) end;
    select coalesce(jsonb_agg(to_jsonb(v) order by v.ordine,v.id),'[]') into voci
      from (select * from public.rst_computo_voci where progetto_id=p_progetto_id for share) v;
    for r in select value from jsonb_array_elements(voci) loop
      quantita:=coalesce((r->>'quantita')::numeric,0);
      if quantita<=0 then esclusi:=esclusi+1; continue; end if;
      -- Il costo materiali di un computo è una stima della lavorazione:
      -- non identifica un articolo reale da ordinare né un costo consuntivo.
      fasi:=fasi||jsonb_build_array(jsonb_build_object('name',coalesce(nullif(r->>'descrizione',''),'Lavorazione'),
        'capitolo',coalesce(nullif(trim(r->>'capitolo_nome'),''),'Generale'),
        'notes',concat_ws(E'\n',nullif(r->>'capitolo_nome',''),quantita||' '||coalesce(r->>'unita_misura',''))));
    end loop;
    if p_raggruppa_capitoli then
      select coalesce(jsonb_agg(jsonb_build_object('name',capitolo,'notes',dettaglio) order by prima),'[]') into fasi
      from (select value->>'capitolo' capitolo,min(n) prima,
        string_agg((value->>'name')||E'\n'||(value->>'notes'),E'\n\n' order by n) dettaglio
        from jsonb_array_elements(fasi) with ordinality a(value,n) group by value->>'capitolo') gruppi;
    end if;
    if jsonb_typeof(q->'fasi_previste')='array' and jsonb_array_length(q->'fasi_previste')>0 then
      fasi:=q->'fasi_previste';
    end if;
    descrizione:=coalesce(nullif(left(split_part(trim(q->>'note'),E'\n',1),120),''),'Ristrutturazione '||coalesce(q->>'code',''));
    codice:=q->>'code';
    indirizzo:=concat_ws(', ',nullif(q->>'cantiere_indirizzo',''),nullif(trim(concat_ws(' ',q->>'cantiere_cap',q->>'cantiere_citta')),''),nullif(q->>'cantiere_provincia',''));
  end if;
  if netto<=0 then raise exception 'Il preventivo non ha un prezzo di vendita: completalo prima di creare la commessa.'; end if;
  impronta:=md5(jsonb_build_array(q,componenti,servizi,ore,voci,p_raggruppa_capitoli)::text);
  esito:=jsonb_build_object('materiali',materiali,'fasi',fasi,'imponibile',netto,'aliquota',aliquota,
    'totale',round(netto*(1+aliquota/100),2),'impronta',impronta,'esclusi',esclusi,'descrizione',descrizione);
  if p_anteprima then return esito; end if;
  if p_impronta is distinct from impronta then
    raise exception 'Il preventivo è cambiato: rivedi il riepilogo prima di creare la commessa.' using errcode='40001';
  end if;
  select id into stato from public.order_statuses where company_id=azienda
    order by is_default desc nulls last,position asc nulls last,created_at asc limit 1;
  if stato is null then raise exception 'Imposta almeno uno stato commessa per questa azienda.'; end if;
  select customer_profile_id into profilo from public.marketing_contacts
    where id=(q->>'cliente_id')::uuid and company_id=azienda;
  esito:=esito||public.create_order_atomic(jsonb_build_object('company_id',azienda,'customer_id',profilo,
    'order_code',public.prossimo_numero_commessa(azienda),'description',descrizione,'total_amount',netto,
    'deposit_amount',0,'balance_amount',netto,'payment_type','standard','current_status_id',stato,
    'assigned_to',case when public.solo_assegnati_attivo() then auth.uid() else null end,
    'vat_rate',aliquota,'internal_notes',concat('Da preventivo ',p_modulo,' ',codice)),materiali,null,auth.uid(),'[]');
  ordine:=(esito->>'id')::uuid;
  update public.orders set created_by=auth.uid(),
    client_name=nullif(trim(concat_ws(' ',q->>'cliente_nome',q->>'cliente_cognome')),''),
    client_email=nullif(q->>'cliente_email',''),client_phone=nullif(q->>'cliente_telefono',''),
    indirizzo_lavori=nullif(indirizzo,''),work_address=nullif(indirizzo,''),
    fv_progetto_id=case when p_modulo='fv' then p_progetto_id else null end,
    rst_progetto_id=case when p_modulo='rst' then p_progetto_id else null end
    where id=ordine and company_id=azienda;
  for r in select value from jsonb_array_elements(fasi) loop
    insert into public.order_work_phases(company_id,order_id,name,position,notes)
      values(azienda,ordine,r->>'name',posizione,concat_ws(E'\n',r->>'notes','Dal preventivo '||coalesce(codice,''))) returning id into fase_id;
    sotto_pos:=0;
    for sotto in select value from jsonb_array_elements(coalesce(r->'sottofasi','[]')) loop
      insert into public.order_work_subphases(phase_id,name,position,peso,fatta)
        values(fase_id,sotto->>'name',sotto_pos,coalesce((sotto->>'peso')::integer,1),false);
      sotto_pos:=sotto_pos+1;
    end loop;
    posizione:=posizione+1;
  end loop;
  if p_modulo='fv' then update public.fv_progetti set ordine_id=ordine where id=p_progetto_id;
  else update public.rst_progetti set ordine_id=ordine where id=p_progetto_id; end if;
  return esito;
end;
$$;
revoke all on function public.converti_modulo_commessa_atomic(text,uuid,boolean,boolean,text) from public,anon;
grant execute on function public.converti_modulo_commessa_atomic(text,uuid,boolean,boolean,text) to authenticated;
