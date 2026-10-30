-- Rientro in magazzino e contratti: correzioni dalla revisione del 29-30/10/2026.
--
-- Rientro (materiale_rientro_magazzino)
--  1. Scrive DA SÉ il carico e alza la giacenza. Prima passava da
--     magazzino_movimento_riga, che con una quantità negativa «stacca» i
--     prelievi dalla riga e, se li coprono, si ferma: niente carico, giacenza
--     ferma, «già rientrati» fermo, e lo stesso avanzo rientrava più volte.
--  2. Non rientra più di quanto avanza: comprato − posato (rapportini
--     approvati, stessa unità, stesso prodotto) − già rientrato. Prima il
--     limite era comprato − rientrato: 10 comprati e 8 posati, «ne rientrano
--     10» azzerava il costo e metteva in magazzino 8 sacchi che sono in opera.
--  3. Le righe «a corpo» non rientrano (limite 1 = tutto il costo).
--  4. Una riga presa dal magazzino torna nella SUA scheda e nel suo magazzino.
-- Contratti
--  5. preventivo_firmato_su_carta: «non nel futuro» col giorno di Roma (prima
--     il giorno UTC: firmare oggi tra mezzanotte e le 2 era rifiutato), e
--     p_solo_verifica per controllare prima di caricare la scansione, che poi
--     non si cancella più.
--  6. crea_commessa_preventivo_atomic: la famiglia del preventivo parte dal
--     più alto raggiungibile anche se un anello della catena manca, e non gira
--     in tondo. Il resto è la versione in produzione (voci delle lavorazioni).
--  7. fire_quote_automation: il contratto importato non è un «preventivo
--     creato» da seguire (era 20281029280000 in sospeso, mai applicata).
set local lock_timeout = '3s';
set local statement_timeout = '60s';

-- L'unità come la confronta il rientro: «sacchi» = «sacco», vuota = pezzi (come consumiMateriali.ts).
create or replace function public.unita_confrontabile(p text)
returns text language sql immutable set search_path = public
as $$
  select case k
    when '' then 'pz' when 'pz.' then 'pz' when 'pezzi' then 'pz' when 'pezzo' then 'pz' when 'cad' then 'pz' when 'cad.' then 'pz' when 'n' then 'pz' when 'nr' then 'pz'
    when 'sacchi' then 'sacco' when 'confezioni' then 'confezione' when 'rotoli' then 'rotolo' when 'secchi' then 'secchio'
    when 'bancali' then 'bancale' when 'm²' then 'mq' when 'm2' then 'mq' when 'm³' then 'mc' when 'm3' then 'mc'
    when 'litri' then 'l' when 'litro' then 'l' when 'corpo' then 'a corpo' when 'ac' then 'a corpo' when 'a.c.' then 'a corpo'
    else k end
  from (select lower(btrim(coalesce(p, ''))) k) x
$$;
revoke all on function public.unita_confrontabile(text) from public, anon;
grant execute on function public.unita_confrontabile(text) to authenticated;

-- 1-4 ──────────────────────────────────────────────────────────────────────
create or replace function public.materiale_rientro_magazzino(p_riga uuid, p_quantita numeric, p_magazzino uuid default null, p_gia_rientrati numeric default null)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare
  r public.order_items;
  o public.orders;
  ws public.warehouse_stock;
  v_magazzino uuid;
  v_scheda uuid;
  v_coperta numeric;
  v_valore numeric;
  v_rientrati numeric;
  v_posati numeric;
  v_comprato numeric;
  v_avanzano numeric;
  v_unita text;
begin
  select * into r from public.order_items where id = p_riga for update;
  if r.id is null then raise exception 'Articolo non trovato.' using errcode = 'P0002'; end if;
  select * into o from public.orders where id = r.order_id;
  if auth.uid() is null
     or not coalesce(public.has_permission_for_company(auth.uid(), 'can_edit_orders', o.company_id), false)
     or not public.can_see_order(o.id, o.assigned_to, o.destination_warehouse_id) then
    raise exception 'Non puoi modificare i materiali di questa commessa.' using errcode = '42501';
  end if;
  v_unita := public.unita_confrontabile(r.unita_misura);
  if v_unita = 'a corpo' then
    raise exception '«%» è a corpo: non ha pezzi da far rientrare. Carica in magazzino quello che avanza come articolo a sé.', r.name
      using errcode = '22023';
  end if;
  if coalesce(p_quantita, 0) <= 0 or p_quantita <> trunc(p_quantita) then
    raise exception 'Il magazzino conta pezzi interi: indica quanti ne rientrano.' using errcode = '22023';
  end if;

  select c.coperta, c.valore_oda into v_coperta, v_valore
    from public.oda_copertura_righe(o.id) c where c.order_item_id = r.id;
  if r.stock_item_id is null and coalesce(v_coperta, 0) <= 0 then
    raise exception '«%» non passa da un ordine d''acquisto né dal magazzino: il suo costo sta nelle fatture della commessa, correggilo lì.', r.name
      using errcode = '22023';
  end if;

  select coalesce(sum(m.quantity), 0) into v_rientrati
    from public.warehouse_movements m
   where m.order_item_id = r.id and m.order_id = o.id and m.movement_type = 'carico' and m.rientro_commessa
     and coalesce(m.notes, '') not like 'Divisione tra le fasi:%';
  -- Chi ha deciso guardava «già rientrati N»: se nel frattempo è cambiato, lo stesso avanzo non rientra due volte.
  if p_gia_rientrati is not null and p_gia_rientrati <> v_rientrati then
    raise exception 'Nel frattempo di «%» ne sono già rientrati %: ricarica la pagina e ricontrolla.', r.name, v_rientrati
      using errcode = '40001';
  end if;

  -- Il posato: rapportini approvati della commessa, stessa riga, stesso prodotto, stessa unità.
  select coalesce(sum((e->>'quantita')::numeric), 0) into v_posati
    from public.campo_rapportini cr
    cross join lateral jsonb_array_elements(case when jsonb_typeof(cr.materiali_usati) = 'array' then cr.materiali_usati else '[]'::jsonb end) e
   where cr.order_id = o.id and cr.stato = 'approvato'
     and e->>'order_item_id' = r.id::text
     and coalesce(e->>'quantita', '') ~ '^[0-9]+([.][0-9]+)?$'
     and (coalesce(e->>'stock_item_id', '') = '' or e->>'stock_item_id' = coalesce(r.stock_item_id::text, ''))
     and (coalesce(btrim(e->>'unita'), '') = '' or public.unita_confrontabile(e->>'unita') = v_unita);

  v_comprato := greatest(coalesce(v_coperta, 0), coalesce(r.quantity, 0));
  v_avanzano := v_comprato - v_posati - v_rientrati;
  if p_quantita > v_avanzano then
    raise exception 'Di «%» ne avanzano %: comprati %, posati % (rapportini approvati), già rientrati %.',
      r.name, greatest(v_avanzano, 0), v_comprato, v_posati, v_rientrati using errcode = '22023';
  end if;

  if r.stock_item_id is not null then
    -- Presa dal magazzino: torna nella sua scheda, nel suo magazzino.
    v_scheda := r.stock_item_id;
  else
    select w.id into v_magazzino from public.warehouses w
     where w.company_id = o.company_id and coalesce(w.is_active, true)
       and (w.id = p_magazzino or (p_magazzino is null and w.linked_order_id is null))
     order by (w.id = p_magazzino) desc nulls last, w.is_default desc nulls last, w.position nulls last, w.created_at
     limit 1;
    if v_magazzino is null then
      raise exception 'Nessun magazzino dell''azienda dove far rientrare la merce: creane uno in Magazzino.' using errcode = '22023';
    end if;
    select s.id into v_scheda from public.warehouse_stock s
     where s.company_id = o.company_id and s.warehouse_id = v_magazzino
       and lower(btrim(s.name)) = lower(btrim(r.name))
     order by s.created_at limit 1;
    if v_scheda is null then
      insert into public.warehouse_stock (company_id, warehouse_id, name, description, quantity, unit_cost, vat_rate, supplier_id)
      values (o.company_id, v_magazzino, r.name, 'Rientrato dalla commessa ' || coalesce(o.order_code, ''), 0,
              case when coalesce(v_coperta, 0) > 0 then round(v_valore / v_coperta, 4) else r.purchase_price end, r.vat_rate, r.supplier_id)
      returning id into v_scheda;
    end if;
  end if;

  select * into ws from public.warehouse_stock where id = v_scheda and company_id = o.company_id for update;
  if ws.id is null then
    raise exception 'La scheda di magazzino di «%» non c''è più: rientro non registrato.', r.name using errcode = 'P0002';
  end if;
  -- Il carico lo scriviamo noi: niente «stacca prelievi», la merce torna davvero in magazzino.
  update public.warehouse_stock set quantity = coalesce(quantity, 0) + p_quantita, updated_at = now() where id = ws.id;
  insert into public.warehouse_movements
    (stock_item_id, order_item_id, movement_type, quantity, notes, performed_by, order_id, company_id, warehouse_id, unit_cost, rientro_commessa)
  values (ws.id, r.id, 'carico', p_quantita,
          'Rientro dal cantiere: ' || p_quantita || ' ' || coalesce(nullif(r.unita_misura, ''), 'pz') || ' non posati',
          auth.uid(), o.id, o.company_id, ws.warehouse_id, ws.unit_cost, true);

  return jsonb_build_object('stock_item_id', ws.id, 'warehouse_id', ws.warehouse_id, 'quantita', p_quantita,
                            'rientrati', v_rientrati + p_quantita, 'posati', v_posati, 'avanzano', v_avanzano - p_quantita);
end $$;
revoke all on function public.materiale_rientro_magazzino(uuid, numeric, uuid, numeric) from public, anon;
grant execute on function public.materiale_rientro_magazzino(uuid, numeric, uuid, numeric) to authenticated;

-- 5 ────────────────────────────────────────────────────────────────────────
drop function if exists public.preventivo_firmato_su_carta(uuid, text, text, text, date, text);
create or replace function public.preventivo_firmato_su_carta(
  p_quote uuid, p_path text, p_nome text, p_mime text, p_firmato_il date, p_firmatario text, p_solo_verifica boolean default false)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare q public.quotes;
begin
  if auth.uid() is null then raise exception 'Sessione scaduta. Accedi di nuovo.' using errcode = '42501'; end if;
  select * into q from public.quotes where id = p_quote for update;
  if q.id is null or q.deleted_at is not null then raise exception 'Preventivo non trovato.' using errcode = 'P0002'; end if;
  perform public.assert_company_access(q.company_id);
  if public.has_permission_for_company(auth.uid(), 'can_edit_preventivi', q.company_id) is not true then
    raise exception 'Non hai il permesso di modificare i preventivi.' using errcode = '42501';
  end if;
  if coalesce(q.source, '') like 'modulo:%' then
    raise exception 'Questo preventivo si firma dal suo preventivatore.' using errcode = '22023';
  end if;
  if q.status in ('accettata', 'convertita') then
    raise exception 'Il preventivo è già firmato: è già il contratto.' using errcode = '22023';
  end if;
  if q.status not in ('bozza', 'inviata', 'scaduta') then
    raise exception 'Un preventivo «%» non si firma: riaprilo o fanne una revisione.', q.status using errcode = '22023';
  end if;
  if p_firmato_il is null or p_firmato_il > (now() at time zone 'Europe/Rome')::date then
    raise exception 'Indica il giorno della firma (non nel futuro).' using errcode = '22023';
  end if;
  if nullif(btrim(coalesce(p_firmatario, '')), '') is null then
    raise exception 'Indica chi ha firmato.' using errcode = '22023';
  end if;
  -- Prima di caricare la scansione (che poi non si cancella): tutto il resto è a posto?
  if p_solo_verifica then return jsonb_build_object('quote_id', q.id, 'verificato', true); end if;
  if p_path is null or p_path not like q.company_id || '/contratti-carta/' || q.id || '/%' or p_path like '%..%'
     or not exists (select 1 from storage.objects s where s.bucket_id = 'quote-pdfs' and s.name = p_path) then
    raise exception 'Carica prima la scansione del contratto firmato.' using errcode = '22023';
  end if;

  update public.quotes
     set status = 'accettata',
         signed_at = (p_firmato_il + time '12:00') at time zone 'Europe/Rome',
         signed_by_name = btrim(p_firmatario),
         firma_modo = 'carta',
         contratto_firmato = jsonb_build_object('bucket', 'quote-pdfs', 'path', p_path,
                               'name', coalesce(nullif(btrim(p_nome), ''), 'contratto firmato'), 'mime', p_mime),
         updated_at = now()
   where id = q.id;
  return jsonb_build_object('quote_id', q.id, 'status', 'accettata');
end $$;
revoke all on function public.preventivo_firmato_su_carta(uuid, text, text, text, date, text, boolean) from public, anon;
grant execute on function public.preventivo_firmato_su_carta(uuid, text, text, text, date, text, boolean) to authenticated;

-- 6 ────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.crea_commessa_preventivo_atomic(p_quote_id uuid, p_order_data jsonb, p_items jsonb DEFAULT '[]'::jsonb, p_installments jsonb DEFAULT '[]'::jsonb, p_salesperson jsonb DEFAULT NULL::jsonb, p_quote_version integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  q public.quotes%rowtype;
  v_result jsonb;
  v_order uuid;
  v_net numeric;
  v_vat numeric;
  v_position integer := 0;
  r record;
  v_famiglia record;
  v_fase uuid;
begin
  if auth.uid() is null then raise exception 'Sessione scaduta. Accedi di nuovo.' using errcode='42501'; end if;
  -- Serializza le due strade e i doppi clic sullo stesso preventivo.
  select * into q from public.quotes where id=p_quote_id for update;
  if not found then raise exception 'Preventivo non trovato.'; end if;
  perform public.assert_company_access(q.company_id);
  if public.has_permission_for_company(auth.uid(), 'can_edit_orders', q.company_id) is not true then
    raise exception 'Non hai il permesso di creare commesse.' using errcode='42501';
  end if;
  if q.deleted_at is not null or q.status <> 'accettata' or coalesce(q.source,'') like 'modulo:%' then
    raise exception 'Il preventivo deve essere accettato e appartenere al preventivatore.';
  end if;
  if p_quote_version is not null and q.version is distinct from p_quote_version then
    raise exception 'Il preventivo è cambiato. Riaprilo e controlla le voci prima di continuare.';
  end if;
  if exists(select 1 from public.orders where quote_id=q.id) then
    raise exception 'Esiste già una commessa associata a questo preventivo.' using errcode='23505';
  end if;
  -- Una revisione (o la madre) di un preventivo che è già una commessa: un contratto, una commessa.
  -- Le modifiche dopo la firma sono una variante di quella commessa, non un cantiere nuovo.
  -- La famiglia parte dal preventivo più alto raggiungibile (anche se un anello manca) e non gira in tondo.
  with recursive su(id, parent_quote_id, livello, percorso) as (
    select id, parent_quote_id, 0, array[id] from public.quotes where id = q.id
    union all
    select p.id, p.parent_quote_id, su.livello + 1, su.percorso || p.id
      from public.quotes p join su on p.id = su.parent_quote_id
     where not p.id = any(su.percorso)
  ), radice as (
    select id from su order by livello desc limit 1
  ), giu(id, percorso) as (
    select id, array[id] from radice
    union all
    select c.id, giu.percorso || c.id from public.quotes c join giu on c.parent_quote_id = giu.id
     where not c.id = any(giu.percorso)
  )
  select o.order_code, oq.quote_number into v_famiglia
    from public.orders o join public.quotes oq on oq.id = o.quote_id
   where o.quote_id in (select id from giu) and o.quote_id <> q.id and o.deleted_at is null
   limit 1;
  if v_famiglia.order_code is not null or v_famiglia.quote_number is not null then
    raise exception 'Il preventivo % è già la commessa %: le modifiche di questa revisione vanno registrate come variante di quella commessa.',
      v_famiglia.quote_number, v_famiglia.order_code using errcode='23505';
  end if;
  if (p_order_data->>'company_id')::uuid is distinct from q.company_id then
    raise exception 'Azienda non valida.' using errcode='42501';
  end if;
  if exists(select 1 from public.quote_items where quote_id=q.id
    and not coalesce(is_optional,false) and coalesce(quantity,1) <> 0
    and case when nullif(item_category,'') is null then coalesce(item_type,'') not in ('product','service')
      else item_category not in ('prodotto','posa','trasporto','smaltimento','nolo','tiro_piano','pratica','nota','sconto','subtotale') end) then
    raise exception 'Ci sono voci da classificare: rivedi il preventivo.';
  end if;
  v_net := case when q.subtotal > 0 then round(q.subtotal-coalesce(q.discount_amount,0),2) else round(coalesce(q.total,0),2) end;
  v_vat := case when q.subtotal > 0 and v_net > 0 then round(coalesce(q.vat_amount,0)/v_net*100,2) else 0 end;
  -- Importo contrattuale e aliquota provengono dal preventivo, mai dalla somma dei soli materiali.
  v_result := public.create_order_atomic(
    p_order_data || jsonb_build_object('total_amount',v_net,'vat_rate',v_vat),
    p_items, p_salesperson, auth.uid(), p_installments);
  v_order := (v_result->>'id')::uuid;
  update public.orders set quote_id=q.id, quote_number=q.quote_number,
    client_name=q.client_name,client_email=q.client_email,client_phone=q.client_phone,
    client_company=q.client_company,client_address=q.client_address,
    indirizzo_lavori=q.indirizzo_lavori,tipo_lavoro=q.tipo_lavoro,opportunity_id=q.opportunity_id,
    created_by=auth.uid()
    where id=v_order and company_id=q.company_id;
  -- Le lavorazioni non entrano in order_items: nessun acquisto o costo automatico.
  for r in select * from public.quote_items where quote_id=q.id
    and not coalesce(is_optional,false) and coalesce(quantity,1) <> 0
    and (item_category in ('posa','trasporto','smaltimento','nolo','tiro_piano','pratica')
      or (nullif(item_category,'') is null and item_type='service'))
    order by sort_order,id
  loop
    insert into public.order_work_phases(company_id,order_id,name,position,notes,importo_venduto)
    values(q.company_id,v_order,r.name,v_position,
      concat_ws(E'\n',nullif(r.description,''),'Dal preventivo '||coalesce(q.quote_number,''),
        coalesce(r.quantity,1)::text||' '||coalesce(r.unit_of_measure,'')),
      case when coalesce(q.prezzo_manuale,0)=0 and coalesce(q.discount_amount,0)=0
        and coalesce(r.line_total,0)>=0 then r.line_total else null end)
    returning id into v_fase;
    -- La voce resta in chiaro: quantità, tariffa e costo interno sono il costo previsto della fase.
    insert into public.order_work_phase_voci(company_id,order_id,phase_id,position,descrizione,unita,quantita,
      costo_manodopera,importo,tariffa_id,origine,origine_id,origine_codice)
    values(q.company_id,v_order,v_fase,0,r.name,nullif(r.unit_of_measure,''),abs(coalesce(r.quantity,1)),
      greatest(coalesce(r.prezzo_acquisto,0),0),r.line_total,r.tariffa_id,'preventivo',r.id,q.quote_number)
    on conflict do nothing;
    v_position := v_position+1;
  end loop;
  update public.quotes set status='convertita',updated_at=now() where id=q.id;
  return v_result || jsonb_build_object('order_id',v_order,'lavorazioni',v_position);
end;
$function$;

-- 7 ────────────────────────────────────────────────────────────────────────
create or replace function public.fire_quote_automation()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  _accepted boolean := false;
  _rejected boolean := false;
  _new_status text := lower(coalesce(NEW.status, ''));
  _old_status text := lower(coalesce(OLD.status, ''));
begin
  if NEW.company_id is null then return NEW; end if;
  if TG_OP = 'INSERT' then
    -- Il contratto importato non è un preventivo da seguire: è già firmato e già commessa.
    if coalesce(NEW.source, '') = 'contratto_importato' then return NEW; end if;
    insert into public.automation_trigger_events (company_id, trigger_event, entity_id, entity_type, payload)
    values (NEW.company_id, 'quote_created', NEW.id::text, 'quote',
      jsonb_build_object('preventivo_id', NEW.id, 'quote_number', NEW.quote_number, 'total', NEW.total,
        'client_name', NEW.client_name, 'client_email', NEW.client_email, 'contact_id', NEW.contact_id,
        'expires_at', NEW.expires_at, 'status', NEW.status));
  elsif TG_OP = 'UPDATE' then
    _accepted := (OLD.signed_at is null and NEW.signed_at is not null)
      or (_new_status is distinct from _old_status and _new_status in ('accettato', 'accettata','accepted','firmato', 'firmata','approvato','approved','vinto','won'));
    _rejected := (OLD.refused_at is null and NEW.refused_at is not null)
      or (_new_status is distinct from _old_status and _new_status in ('rifiutato', 'rifiutata','rejected','declined','perso','lost'));
    if _accepted then
      insert into public.automation_trigger_events (company_id, trigger_event, entity_id, entity_type, payload)
      values (NEW.company_id, 'quote_accepted', NEW.id::text, 'quote',
        jsonb_build_object('preventivo_id', NEW.id, 'quote_number', NEW.quote_number, 'total', NEW.total,
          'client_name', NEW.client_name, 'client_email', NEW.client_email, 'contact_id', NEW.contact_id, 'status', NEW.status));
    elsif _rejected then
      insert into public.automation_trigger_events (company_id, trigger_event, entity_id, entity_type, payload)
      values (NEW.company_id, 'quote_rejected', NEW.id::text, 'quote',
        jsonb_build_object('preventivo_id', NEW.id, 'quote_number', NEW.quote_number, 'client_name', NEW.client_name,
          'client_email', NEW.client_email, 'contact_id', NEW.contact_id, 'status', NEW.status, 'refused_reason', NEW.refused_reason));
    end if;
  end if;
  return NEW;
exception when others then
  raise log 'fire_quote_automation error: %', SQLERRM;
  return NEW;
end;
$function$;
