set local lock_timeout = '3s';
set local statement_timeout = '60s';
alter table public.email_outbox add column if not exists procurement_context jsonb;
alter table public.supplier_rfq_suppliers add column if not exists trasporto_tipo text not null default 'da_confermare' check (trasporto_tipo in ('da_confermare','incluso','extra','ritiro'));
alter table public.supplier_rfq_suppliers add column if not exists costo_trasporto numeric check (costo_trasporto is null or costo_trasporto >= 0);
alter table public.supplier_rfq_suppliers add column if not exists disponibilita_note text;
-- permesso procurement_document_events: eredita la visibilità dell'ordine
-- d'acquisto o della RdO a cui appartiene. La policy di lettura passa da un
-- exists su purchase_orders / supplier_rfqs, che gira con le RLS di chi legge:
-- lì valgono azienda e permesso d'area (aziende_area con can_view_orders e
-- simili). Solo i trigger scrivono. (Commento aggiunto il 07/11/2026: la
-- migrazione era già applicata, il database non cambia.)
create table if not exists public.procurement_document_events (
 id uuid primary key default gen_random_uuid(),
 company_id uuid not null references public.companies(id) on delete cascade,
 purchase_order_id uuid references public.purchase_orders(id) on delete cascade,
 rfq_id uuid references public.supplier_rfqs(id) on delete cascade,
 outbox_id uuid unique references public.email_outbox(id) on delete set null,
 kind text not null check(kind in ('revision','email')),
 entity text not null,
 operation text not null,
 actor_id uuid,
 actor_label text,
 payload jsonb not null,
 created_at timestamptz not null default now(),
 check(num_nonnulls(purchase_order_id,rfq_id)=1)
);
create index if not exists procurement_events_po_date on public.procurement_document_events(purchase_order_id,created_at desc) where purchase_order_id is not null;
create index if not exists procurement_events_rfq_date on public.procurement_document_events(rfq_id,created_at desc) where rfq_id is not null;
alter table public.procurement_document_events enable row level security;
revoke all on public.procurement_document_events from public,anon,authenticated;
grant select on public.procurement_document_events to authenticated;
grant all on public.procurement_document_events to service_role;
drop policy if exists procurement_events_read on public.procurement_document_events;
create policy procurement_events_read on public.procurement_document_events for select to authenticated using (
 not (select public.utente_bloccato()) and not (select public.utente_e_cliente_esterno()) and not (select public.e_solo_campo()) and (
 (purchase_order_id is not null and exists(select 1 from public.purchase_orders p where p.id=purchase_order_id and p.company_id=procurement_document_events.company_id)) or
 (rfq_id is not null and exists(select 1 from public.supplier_rfqs r where r.id=rfq_id and r.company_id=procurement_document_events.company_id))
 ));
-- Solo i trigger scrivono: gli utenti non possono inventare o riscrivere lo storico.
create or replace function public.procurement_revision_capture() returns trigger language plpgsql security definer set search_path=public as $$
declare rowdata jsonb; previous jsonb; currentdata jsonb; po uuid; rfq uuid; tenant uuid; title text; actor text;
begin
 rowdata:=case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end;
 previous:=case when tg_op='INSERT' then null else to_jsonb(old)-array['updated_at','created_at'] end;
 currentdata:=case when tg_op='DELETE' then null else to_jsonb(new)-array['updated_at','created_at'] end;
 if tg_op='UPDATE' and previous is not distinct from currentdata then return null;end if;
 case tg_table_name
 when 'purchase_orders' then po:=(rowdata->>'id')::uuid;title:='Ordine';
 when 'purchase_order_items' then po:=(rowdata->>'purchase_order_id')::uuid;title:='Articolo ordine';
 when 'supplier_rfqs' then rfq:=(rowdata->>'id')::uuid;title:='Richiesta di offerta';
 when 'supplier_rfq_items' then rfq:=(rowdata->>'rfq_id')::uuid;title:='Voce richiesta';
 when 'supplier_rfq_suppliers' then rfq:=(rowdata->>'rfq_id')::uuid;title:='Offerta fornitore';
 when 'supplier_rfq_quotes' then select rs.rfq_id into rfq from public.supplier_rfq_suppliers rs where rs.id=(rowdata->>'rfq_supplier_id')::uuid;title:='Prezzo offerto';
 end case;
 if po is not null then select company_id into tenant from public.purchase_orders where id=po;
 elsif rfq is not null then select company_id into tenant from public.supplier_rfqs where id=rfq;end if;
 -- Nessun evento orfano durante la cancellazione in cascata del documento.
 if tenant is null then return null;end if;
 select coalesce(nullif(trim(concat_ws(' ',p.first_name,p.last_name)),''),p.email) into actor from public.profiles p where p.id=auth.uid();
 insert into public.procurement_document_events(company_id,purchase_order_id,rfq_id,kind,entity,operation,actor_id,actor_label,payload)
 values(tenant,po,rfq,'revision',title,tg_op,auth.uid(),actor,jsonb_build_object('before',previous,'after',currentdata));
 return null;
end;$$;
revoke all on function public.procurement_revision_capture() from public,anon,authenticated;
drop trigger if exists procurement_revision_capture on public.purchase_orders;
create trigger procurement_revision_capture after insert or update or delete on public.purchase_orders for each row execute function public.procurement_revision_capture();
drop trigger if exists procurement_revision_capture on public.purchase_order_items;
create trigger procurement_revision_capture after insert or update or delete on public.purchase_order_items for each row execute function public.procurement_revision_capture();
drop trigger if exists procurement_revision_capture on public.supplier_rfqs;
create trigger procurement_revision_capture after insert or update or delete on public.supplier_rfqs for each row execute function public.procurement_revision_capture();
drop trigger if exists procurement_revision_capture on public.supplier_rfq_items;
create trigger procurement_revision_capture after insert or update or delete on public.supplier_rfq_items for each row execute function public.procurement_revision_capture();
drop trigger if exists procurement_revision_capture on public.supplier_rfq_suppliers;
create trigger procurement_revision_capture after insert or update or delete on public.supplier_rfq_suppliers for each row execute function public.procurement_revision_capture();
drop trigger if exists procurement_revision_capture on public.supplier_rfq_quotes;
create trigger procurement_revision_capture after insert or update or delete on public.supplier_rfq_quotes for each row execute function public.procurement_revision_capture();

create or replace function public.procurement_email_validate() returns trigger language plpgsql set search_path=public as $$
declare ctx jsonb; doc_id uuid;
begin
 ctx:=new.procurement_context;
 if ctx is null then return new;end if;
 doc_id:=(ctx->>'id')::uuid;
 if ctx->>'tipo'='oda' then
 if not exists(select 1 from public.purchase_orders p where p.id=doc_id and p.company_id=new.company_id) then raise exception 'Ordine non accessibile';end if;
 elsif ctx->>'tipo'='rdo' then
 if not exists(select 1 from public.supplier_rfqs r where r.id=doc_id and r.company_id=new.company_id) then raise exception 'Richiesta non accessibile';end if;
 else raise exception 'Tipo documento non valido';end if;
 if jsonb_typeof(ctx->'documento') is distinct from 'object' then raise exception 'Versione documento mancante';end if;
 return new;
end;$$;
revoke all on function public.procurement_email_validate() from public,anon,authenticated;
drop trigger if exists procurement_email_validate on public.email_outbox;
create trigger procurement_email_validate before insert or update of procurement_context,company_id on public.email_outbox for each row execute function public.procurement_email_validate();
create or replace function public.procurement_email_capture() returns trigger language plpgsql security definer set search_path=public as $$
declare ctx jsonb; po uuid; rfq uuid; actor text;
begin
 ctx:=new.procurement_context;
 if ctx is null or new.status='draft' then return null;end if;
 if ctx->>'tipo'='oda' then po:=(ctx->>'id')::uuid;else rfq:=(ctx->>'id')::uuid;end if;
 -- Controllo tenant indipendente dall'utente che esegue il successivo invio server.
 if po is not null and not exists(select 1 from public.purchase_orders where id=po and company_id=new.company_id) then return null;end if;
 if rfq is not null and not exists(select 1 from public.supplier_rfqs where id=rfq and company_id=new.company_id) then return null;end if;
 select coalesce(nullif(trim(concat_ws(' ',p.first_name,p.last_name)),''),p.email) into actor from public.profiles p where p.id=new.user_id;
 insert into public.procurement_document_events(company_id,purchase_order_id,rfq_id,outbox_id,kind,entity,operation,actor_id,actor_label,payload)
 values(new.company_id,po,rfq,new.id,'email','Email fornitore',new.status,new.user_id,actor,
 jsonb_build_object('context',ctx,'to',new.to_emails,'subject',new.subject,'body',new.body_text,'attachments',new.attachments,'status',new.status,'sent_at',new.sent_at,'error',new.last_error))
 on conflict(outbox_id) do update set operation=excluded.operation,payload=excluded.payload
 where procurement_document_events.operation <> 'sent';
 return null;
end;$$;
revoke all on function public.procurement_email_capture() from public,anon,authenticated;
drop trigger if exists procurement_email_capture on public.email_outbox;
create trigger procurement_email_capture after insert or update on public.email_outbox for each row execute function public.procurement_email_capture();

create or replace function public.rdo_aggiudica(p_rfq_supplier_id uuid, p_motivazione text default null::text)
 returns jsonb
 language plpgsql
 set search_path to 'public'
as $function$
declare
  v_fornitore record;
  v_rfq record;
  v_po_id uuid;
  v_oda text;
  v_righe int;
  v_netto numeric;
  v_trasporto numeric;
begin
  select rs.* into v_fornitore
    from public.supplier_rfq_suppliers rs
   where rs.id = p_rfq_supplier_id;
  if not found then
    raise exception 'Fornitore non trovato nella richiesta' using errcode = '42704';
  end if;
  select r.* into v_rfq
    from public.supplier_rfqs r
   where r.id = v_fornitore.rfq_id
   for update;
  if not found then
    raise exception 'Richiesta non trovata' using errcode = '42704';
  end if;
  if v_rfq.status = 'aggiudicata' then
    raise exception 'Richiesta già aggiudicata: l''ordine c''è già' using errcode = 'P0001';
  end if;
  if v_rfq.status = 'annullata' then
    raise exception 'Richiesta annullata: non si può aggiudicare' using errcode = 'P0001';
  end if;
  if v_fornitore.status <> 'risposta' then
    raise exception 'Questo fornitore non ha ancora un''offerta registrata' using errcode = 'P0001';
  end if;
  if coalesce(v_fornitore.totale_offerto, 0) <= 0 and not exists (
       select 1 from public.supplier_rfq_quotes q
         join public.supplier_rfq_items i on i.id = q.rfq_item_id
        where q.rfq_supplier_id = v_fornitore.id and i.rfq_id = v_rfq.id
          and q.disponibile and q.prezzo_unitario is not null) then
    raise exception 'Nessun prezzo in questa offerta: scrivi i prezzi delle voci o il totale offerto prima di scegliere' using errcode = 'P0001';
  end if;
  if v_fornitore.trasporto_tipo='extra' and v_fornitore.costo_trasporto is null then
    raise exception 'Indica il costo del trasporto extra prima di scegliere';
  end if;
  if v_fornitore.validita_offerta is not null and v_fornitore.validita_offerta < current_date then
    raise exception 'Offerta scaduta: chiedi conferma al fornitore e aggiorna la validità';
  end if;
  v_trasporto:=case when v_fornitore.trasporto_tipo='extra' then coalesce(v_fornitore.costo_trasporto,0) else 0 end;
  select sum(round(i.quantita*q.prezzo_unitario*(1-coalesce(q.sconto_percentuale,0)/100),2)) into v_netto
    from public.supplier_rfq_items i join public.supplier_rfq_quotes q on q.rfq_item_id=i.id
    where i.rfq_id=v_rfq.id and q.rfq_supplier_id=v_fornitore.id and q.disponibile and q.prezzo_unitario is not null;
  if v_netto is not null and v_fornitore.totale_offerto is not null and abs(v_fornitore.totale_offerto-v_netto-v_trasporto)>0.02 then
    raise exception 'Il totale documento non coincide con le voci e il trasporto: correggi gli importi prima di scegliere';
  end if;
  if v_netto is null and v_fornitore.totale_offerto < v_trasporto then
    raise exception 'Il totale documento deve comprendere anche il trasporto';
  end if;
  insert into public.purchase_orders (
    company_id, supplier_id, order_id, expected_delivery_date, payment_terms, origine, notes, created_by
  ) values (
    v_rfq.company_id,
    v_fornitore.supplier_id,
    v_rfq.order_id,
    v_rfq.data_fabbisogno,
    v_fornitore.condizioni_pagamento,
    case v_fornitore.inviata_via
      when 'telefono' then 'telefono'
      when 'whatsapp' then 'telefono'
      when 'di_persona' then 'negozio'
      else 'email'
    end,
    concat_ws(E'\n','Da richiesta d''offerta ' || v_rfq.rfq_number || ' — ' || v_rfq.titolo,
      case when v_fornitore.giorni_consegna is not null then 'Consegna: ' || v_fornitore.giorni_consegna || ' giorni' end,
      case v_fornitore.trasporto_tipo when 'incluso' then 'Trasporto incluso' when 'ritiro' then 'Ritiro a cura dell’impresa' when 'extra' then 'Trasporto extra: ' || v_trasporto || ' EUR, IVA esclusa' else 'Trasporto da confermare' end,
      nullif(v_fornitore.disponibilita_note,'')),
    auth.uid()
  )
  returning id, oda_number into v_po_id, v_oda;
  insert into public.purchase_order_items (
    purchase_order_id, company_id, description, quantity, unit_of_measure,
    unit_price, discount_percent, vat_rate, sku, order_item_id
  )
  select v_po_id, v_rfq.company_id, i.descrizione, i.quantita, coalesce(i.unita_misura, 'pz'),
         q.prezzo_unitario, coalesce(q.sconto_percentuale, 0),
         coalesce(q.aliquota_iva, 22), i.sku,
         (select oi.id from public.order_items oi
            join public.orders o on o.id = oi.order_id
           where oi.supplier_rfq_item_id = i.id and o.company_id = v_rfq.company_id
           limit 1)
    from public.supplier_rfq_items i
    join public.supplier_rfq_quotes q
      on q.rfq_item_id = i.id and q.rfq_supplier_id = v_fornitore.id
   where i.rfq_id = v_rfq.id
     and q.disponibile
     and q.prezzo_unitario is not null
   order by i.posizione;
  get diagnostics v_righe = row_count;
  if v_righe = 0 and coalesce(v_fornitore.totale_offerto, 0) > 0 then
    insert into public.purchase_order_items (
      purchase_order_id, company_id, description, quantity, unit_of_measure, unit_price, discount_percent, vat_rate
    ) values (
      v_po_id, v_rfq.company_id, 'Fornitura a corpo — ' || v_rfq.titolo, 1, 'corpo', v_fornitore.totale_offerto-v_trasporto, 0, 22
    );
    v_righe := 1;
  end if;
  if v_trasporto>0 then
    insert into public.purchase_order_items(purchase_order_id,company_id,description,quantity,unit_of_measure,unit_price,discount_percent,vat_rate)
    values(v_po_id,v_rfq.company_id,'Trasporto fornitura',1,'corpo',v_trasporto,0,22);
    v_righe:=v_righe+1;
  end if;
  update public.supplier_rfqs
     set status = 'aggiudicata',
         supplier_id_aggiudicato = v_fornitore.supplier_id,
         purchase_order_id = v_po_id,
         aggiudicata_at = now(),
         motivazione_scelta = nullif(btrim(coalesce(p_motivazione, '')), '')
   where id = v_rfq.id;
  return jsonb_build_object('purchase_order_id', v_po_id, 'oda_number', v_oda, 'righe', v_righe);
end;
$function$;

revoke all on function public.rdo_aggiudica(uuid,text) from public,anon;
grant execute on function public.rdo_aggiudica(uuid,text) to authenticated,service_role;
