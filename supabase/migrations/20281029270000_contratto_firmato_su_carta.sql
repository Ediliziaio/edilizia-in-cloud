-- Il preventivo firmato è il contratto, anche quando la firma è su carta (29/10/2026).
--
-- Prima un preventivo classico diventava contratto solo con la firma digitale
-- (o l'accettazione dal link): chi firmava su carta non aveva un modo per
-- dirlo, e 14 preventivi accettati su 18 non avevano il documento firmato.
-- «Carica contratto (AI)» creava la commessa senza nessun contratto dietro.
--
-- 1. quotes.firma_modo (digitale, online, carta, importato) e
--    quotes.contratto_firmato ({bucket, path, name, mime}): come è stato
--    firmato e dov'è il documento.
-- 2. preventivo_firmato_su_carta(): l'ufficio carica la scansione, indica data
--    e firmatario; il preventivo diventa «accettata» come con la firma
--    digitale (stessi trigger: automazioni, date delle rate).
-- 3. contratto_importato_collega(): dopo «Carica contratto (AI)» crea il
--    preventivo-contratto «importato» (testata, totali, documento firmato) e
--    lo collega alla commessa. Senza righe: il preventivo ricalcola il totale
--    dalle righe, e quelle della commessa sono solo i materiali.
-- 4. Una commessa per contratto: indice unico su orders.quote_id (oggi nessun
--    doppione) e, in crea_commessa_preventivo_atomic, la revisione di un
--    preventivo che è già una commessa non ne crea una seconda.
-- 5. La scansione di un contratto firmato non si sovrascrive né si cancella.
set local lock_timeout = '3s';
set local statement_timeout = '60s';

-- 1 ────────────────────────────────────────────────────────────────────────
alter table public.quotes add column if not exists firma_modo text;
alter table public.quotes add column if not exists contratto_firmato jsonb;
alter table public.quotes drop constraint if exists quotes_firma_modo_check;
alter table public.quotes add constraint quotes_firma_modo_check
  check (firma_modo is null or firma_modo in ('digitale', 'online', 'carta', 'importato'));

-- 2 ────────────────────────────────────────────────────────────────────────
create or replace function public.preventivo_firmato_su_carta(
  p_quote uuid, p_path text, p_nome text, p_mime text, p_firmato_il date, p_firmatario text)
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
  if p_firmato_il is null or p_firmato_il > current_date then
    raise exception 'Indica il giorno della firma (non nel futuro).' using errcode = '22023';
  end if;
  if nullif(btrim(coalesce(p_firmatario, '')), '') is null then
    raise exception 'Indica chi ha firmato.' using errcode = '22023';
  end if;
  -- Il documento deve stare nella cartella dei contratti di QUESTO preventivo, ed esserci davvero.
  if p_path is null or p_path not like q.company_id || '/contratti-carta/' || q.id || '/%' or p_path like '%..%'
     or not exists (select 1 from storage.objects o where o.bucket_id = 'quote-pdfs' and o.name = p_path) then
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
revoke all on function public.preventivo_firmato_su_carta(uuid, text, text, text, date, text) from public, anon;
grant execute on function public.preventivo_firmato_su_carta(uuid, text, text, text, date, text) to authenticated;

-- 3 ────────────────────────────────────────────────────────────────────────
create or replace function public.contratto_importato_collega(
  p_order uuid, p_path text, p_nome text, p_mime text, p_firmato_il date default null)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare
  o public.orders;
  v_numero text;
  v_quote uuid;
  v_iva numeric;
begin
  if auth.uid() is null then raise exception 'Sessione scaduta. Accedi di nuovo.' using errcode = '42501'; end if;
  select * into o from public.orders where id = p_order for update;
  if o.id is null or o.deleted_at is not null then raise exception 'Commessa non trovata.' using errcode = 'P0002'; end if;
  perform public.assert_company_access(o.company_id);
  if public.has_permission_for_company(auth.uid(), 'can_edit_orders', o.company_id) is not true then
    raise exception 'Non hai il permesso di modificare le commesse.' using errcode = '42501';
  end if;
  if o.quote_id is not null then
    return jsonb_build_object('quote_id', o.quote_id, 'gia_collegato', true);
  end if;
  if p_path is null or p_path not like o.company_id || '/%' or p_path like '%..%'
     or not exists (select 1 from storage.objects s where s.bucket_id = 'order-attachments' and s.name = p_path) then
    raise exception 'Il documento del contratto non è stato trovato.' using errcode = '22023';
  end if;

  v_numero := public.generate_quote_number(o.company_id);
  v_iva := round(coalesce(o.total_amount, 0) * coalesce(o.vat_rate, 0) / 100, 2);
  insert into public.quotes (
    company_id, quote_number, status, client_name, client_email, client_phone, client_company, client_address,
    title, description, subtotal, vat_amount, total, indirizzo_lavori, tipo_lavoro, opportunity_id,
    signed_at, signed_by_name, firma_modo, contratto_firmato, source, created_by)
  values (
    o.company_id, v_numero, 'convertita', o.client_name, o.client_email, o.client_phone, o.client_company, o.client_address,
    'Contratto importato · ' || coalesce(o.order_code, ''), o.description,
    coalesce(o.total_amount, 0), v_iva, coalesce(o.total_amount, 0) + v_iva, o.indirizzo_lavori, o.tipo_lavoro, o.opportunity_id,
    coalesce((p_firmato_il + time '12:00') at time zone 'Europe/Rome', now()), o.client_name, 'importato',
    jsonb_build_object('bucket', 'order-attachments', 'path', p_path,
                       'name', coalesce(nullif(btrim(p_nome), ''), 'contratto firmato'), 'mime', p_mime),
    'contratto_importato', auth.uid())
  returning id into v_quote;

  update public.orders set quote_id = v_quote, quote_number = v_numero where id = o.id;
  -- Le rate «alla firma» prendono la data del contratto, come quando si firma un preventivo.
  perform public.rate_aggiorna_date(o.id);
  return jsonb_build_object('quote_id', v_quote, 'quote_number', v_numero);
end $$;
revoke all on function public.contratto_importato_collega(uuid, text, text, text, date) from public, anon;
grant execute on function public.contratto_importato_collega(uuid, text, text, text, date) to authenticated;

-- 4 ────────────────────────────────────────────────────────────────────────
create unique index if not exists orders_un_contratto_una_commessa
  on public.orders (quote_id) where quote_id is not null;

create or replace function public.crea_commessa_preventivo_atomic(p_quote_id uuid, p_order_data jsonb, p_items jsonb DEFAULT '[]'::jsonb, p_installments jsonb DEFAULT '[]'::jsonb, p_salesperson jsonb DEFAULT NULL::jsonb, p_quote_version integer DEFAULT NULL::integer)
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
  with recursive su as (
    select id, parent_quote_id from public.quotes where id = q.id
    union all
    select p.id, p.parent_quote_id from public.quotes p join su on p.id = su.parent_quote_id
  ), giu as (
    select id from su where parent_quote_id is null
    union all
    select c.id from public.quotes c join giu on c.parent_quote_id = giu.id
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
        and coalesce(r.line_total,0)>=0 then r.line_total else null end);
    v_position := v_position+1;
  end loop;
  update public.quotes set status='convertita',updated_at=now() where id=q.id;
  return v_result || jsonb_build_object('order_id',v_order,'lavorazioni',v_position);
end;
$function$;

-- 5 ────────────────────────────────────────────────────────────────────────
-- Restrittive: si sommano in AND alle policy dell'azienda. Caricare e leggere resta come prima.
drop policy if exists contratti_carta_non_si_modificano on storage.objects;
create policy contratti_carta_non_si_modificano on storage.objects as restrictive for update to authenticated
  using (bucket_id <> 'quote-pdfs' or (storage.foldername(name))[2] is distinct from 'contratti-carta');
drop policy if exists contratti_carta_non_si_cancellano on storage.objects;
create policy contratti_carta_non_si_cancellano on storage.objects as restrictive for delete to authenticated
  using (bucket_id <> 'quote-pdfs' or (storage.foldername(name))[2] is distinct from 'contratti-carta');
