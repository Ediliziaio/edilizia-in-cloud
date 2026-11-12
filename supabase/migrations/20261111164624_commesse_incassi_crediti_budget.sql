-- Recovered from the production migration journal, already applied there.
-- The registered version predates the native general-project schema in Git.
-- Fresh databases defer the original SQL until 20290313155500; production does not rerun it.
create schema if not exists private;
create table if not exists private.recovered_dependency_patches(id text primary key);
alter table private.recovered_dependency_patches enable row level security;
revoke all on private.recovered_dependency_patches from public,anon,authenticated,service_role;

DO $defer_commesse_0$ BEGIN
IF to_regclass('public.unita_movimenti') IS NOT NULL AND to_regclass('public.generale_piano_voci') IS NOT NULL THEN
-- Applied after native general-project migrations. Historical receipts are not backfilled.

-- Run after the native general-project schema. No historical cash is inferred.
alter table public.unita_movimenti
  add column if not exists importo_cassa numeric(15,2),
  add column if not exists prima_nota_id uuid references public.prima_nota_entries(id) on delete set null,
  add column if not exists richiesta_id uuid,
  add column if not exists richiesta_payload jsonb,
  add column if not exists stornato_at timestamptz,
  add column if not exists stornato_da uuid,
  add column if not exists storno_prima_nota_id uuid references public.prima_nota_entries(id) on delete set null;
alter table public.prima_nota_entries
  add column if not exists unita_movimento_id uuid references public.unita_movimenti(id) on delete set null;
create unique index if not exists unita_movimenti_richiesta_unica on public.unita_movimenti(company_id,richiesta_id) where richiesta_id is not null;
create unique index if not exists prima_nota_unita_movimento_unico on public.prima_nota_entries(unita_movimento_id) where unita_movimento_id is not null;
create index if not exists unita_movimenti_prima_nota_idx on public.unita_movimenti(prima_nota_id) where prima_nota_id is not null;
create index if not exists unita_movimenti_storno_prima_nota_idx on public.unita_movimenti(storno_prima_nota_id) where storno_prima_nota_id is not null;
create unique index if not exists movimenti_cassa_unita_origine_unica on public.movimenti_cassa_native(company_id,riferimento) where riferimento like 'EIC:UNITA:%';

create or replace function public.generale_unita_puo_incassare(p_order uuid)
returns void language plpgsql security definer set search_path='' as $$
declare c uuid := public.get_order_company_id(p_order);
begin
  if auth.uid() is null or c is null or public.utente_bloccato()
     or public.user_can_access_company(c) is not true
     or public.has_permission_for_company(auth.uid(),'can_edit_orders',c) is not true
     or public.has_permission_for_company(auth.uid(),'can_view_order_amounts',c) is not true
     or not (public.puo_incassare_fatture(c) or public.has_permission_for_company(auth.uid(),'can_view_prima_nota',c)) then
    raise exception 'Non hai il permesso di registrare incassi e prima nota su questa unità.' using errcode='42501';
  end if;
end $$;
revoke all on function public.generale_unita_puo_incassare(uuid) from public,anon,authenticated;

create or replace function public.generale_unita_movimento_guardia()
returns trigger language plpgsql security definer set search_path='' as $$
declare u public.unita_immobiliari; o public.orders; p numeric; gia numeric;
begin
  if tg_op='DELETE' then
    if public.azienda_ancora_esiste(old.company_id) and old.prima_nota_id is not null then
      raise exception 'Un incasso contabilizzato si conserva: usa lo storno.' using errcode='22023';
    end if;
    return old;
  end if;
  if tg_op='UPDATE' then
    if not public.azienda_ancora_esiste(old.company_id) then return new; end if;
    select * into u from public.unita_immobiliari where id=old.unita_id;
    perform public.generale_unita_puo_incassare(u.order_id);
    if (new.id,new.unita_id,new.company_id,new.tipo,new.importo,new.data,new.richiesta_id,new.richiesta_payload)
       is distinct from (old.id,old.unita_id,old.company_id,old.tipo,old.importo,old.data,old.richiesta_id,old.richiesta_payload) then
      raise exception 'Un incasso registrato non si riscrive: stornalo e registra quello corretto.' using errcode='22023';
    end if;
    if old.prima_nota_id is not null and new.importo_cassa is distinct from old.importo_cassa then
      raise exception 'L''incasso è già in prima nota: stornalo prima di cambiare importo.' using errcode='22023';
    end if;
    if old.prima_nota_id is not null and new.prima_nota_id is distinct from old.prima_nota_id then
      raise exception 'Il collegamento alla prima nota non si rimuove.' using errcode='22023';
    end if;
    if new.prima_nota_id is not null and not exists(select 1 from public.prima_nota_entries pn where pn.id=new.prima_nota_id and pn.unita_movimento_id=new.id) then
      raise exception 'Prima nota non collegata a questo incasso.' using errcode='22023';
    end if;
    if old.stornato_at is not null and (new.stornato_at,new.stornato_da,new.storno_prima_nota_id) is distinct from (old.stornato_at,old.stornato_da,old.storno_prima_nota_id) then
      raise exception 'Lo storno è definitivo: registra un nuovo incasso.' using errcode='22023';
    end if;
    if new.stornato_at is not null and old.prima_nota_id is not null and not exists(
      select 1 from public.prima_nota_entries r where r.id=new.storno_prima_nota_id and r.reversal_of=old.prima_nota_id and r.amount=old.importo_cassa) then
      raise exception 'Manca la contropartita dello storno in prima nota.' using errcode='22023';
    end if;
    return new;
  end if;
  select * into u from public.unita_immobiliari where id=new.unita_id for update;
  if not found or new.company_id is distinct from u.company_id then
    raise exception 'Unità o azienda non valida.' using errcode='42501';
  end if;
  perform public.generale_unita_puo_incassare(u.order_id);
  select * into o from public.orders where id=u.order_id and deleted_at is null;
  if not found or u.divisa_il is not null or u.stato_vendita='libera' then
    raise exception 'Prima prenota un''unità attiva, poi registra il pagamento.' using errcode='22023';
  end if;
  if new.tipo='saldo' and u.stato_vendita<>'rogitata' then raise exception 'Il saldo si registra al rogito.' using errcode='22023'; end if;
  if new.importo is null or new.importo<=0 or new.importo::text in ('NaN','Infinity','-Infinity') then
    raise exception 'Scrivi un importo positivo e finito.' using errcode='22023';
  end if;
  new.importo:=round(new.importo,2);
  if new.data is null or new.data>(now() at time zone 'Europe/Rome')::date then
    raise exception 'Indica una data effettiva, non futura, per l''incasso.' using errcode='22023';
  end if;
  p:=coalesce(u.prezzo_rogito,u.prezzo_trattato,u.prezzo_listino,nullif(o.total_amount,0));
  if p is not null then
    p:=p+coalesce((select sum(v.impatto_economico) from public.ordini_variazione v where v.order_id=u.order_id and v.status='approvato'),0);
    select coalesce(sum(importo),0) into gia from public.unita_movimenti where unita_id=u.id and stornato_at is null;
    if round(gia+new.importo,2)>round(p,2) then raise exception 'Il pagamento supera il residuo dell''unità.' using errcode='22023'; end if;
  end if;
  new.importo_cassa:=coalesce(new.importo_cassa,case when new.tipo='permuta' then 0 else round(new.importo*(1+coalesce(o.vat_rate,22)/100),2) end);
  if new.importo_cassa::text in ('NaN','Infinity','-Infinity')
     or (new.tipo='permuta' and new.importo_cassa<>0)
     or (new.tipo<>'permuta' and new.importo_cassa<=0) then
    raise exception 'Conferma l''importo effettivo di cassa; la permuta non genera incasso.' using errcode='22023';
  end if;
  return new;
end $$;
revoke all on function public.generale_unita_movimento_guardia() from public,anon,authenticated;
create trigger a_unita_movimento_guardia before insert or update or delete on public.unita_movimenti for each row execute function public.generale_unita_movimento_guardia();

create or replace function public.generale_unita_scrivi_prima_nota(p_movimento uuid,p_esistente uuid default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare m public.unita_movimenti; u public.unita_immobiliari; pn public.prima_nota_entries; risultato uuid;
begin
  select * into m from public.unita_movimenti where id=p_movimento for update;
  select * into u from public.unita_immobiliari where id=m.unita_id;
  if m.id is null or m.stornato_at is not null then raise exception 'Pagamento assente o stornato.' using errcode='22023'; end if;
  if m.tipo='permuta' then return null; end if;
  if m.prima_nota_id is not null then
    if p_esistente is not null and p_esistente<>m.prima_nota_id then raise exception 'L''incasso è già collegato a un''altra prima nota.' using errcode='22023'; end if;
    return m.prima_nota_id;
  end if;
  if m.importo_cassa is null or m.importo_cassa<=0 then raise exception 'Conferma l''importo effettivo entrato in cassa.' using errcode='22023'; end if;
  if p_esistente is not null then
    select * into pn from public.prima_nota_entries where id=p_esistente for update;
    if pn.id is null or pn.company_id<>m.company_id or pn.order_id is distinct from u.order_id
       or pn.direction<>'entrata' or pn.entry_date<>m.data or pn.amount<>m.importo_cassa
       or pn.cost_id is not null or pn.reversal_of is not null or pn.unita_movimento_id is not null
       or exists(select 1 from public.prima_nota_entries r where r.reversal_of=pn.id) then
      raise exception 'La prima nota scelta non corrisponde a unità, data e importo, oppure è già usata o stornata.' using errcode='22023';
    end if;
    update public.prima_nota_entries set unita_movimento_id=m.id where id=pn.id;
    risultato:=pn.id;
  else
    insert into public.prima_nota_entries(company_id,direction,category,description,amount,entry_date,payment_method,
       order_id,is_auto,auto_source,created_by,unita_movimento_id,payment_request_id,payment_payload,reference_number)
    values(m.company_id,'entrata','incasso','Incasso unità '||u.sigla||' — '||m.tipo,m.importo_cassa,m.data,'bonifico',
       u.order_id,true,'unita_movimento',auth.uid(),m.id,m.richiesta_id,
       jsonb_build_object('unita_movimento_id',m.id,'netto_prezzo',m.importo,'incasso_effettivo',m.importo_cassa),
       'EIC:UNITA:'||m.id::text) returning id into risultato;
  end if;
  update public.unita_movimenti set prima_nota_id=risultato where id=m.id;
  return risultato;
end $$;
revoke all on function public.generale_unita_scrivi_prima_nota(uuid,uuid) from public,anon,authenticated;
create or replace function public.generale_unita_movimento_contabilizza_trigger()
returns trigger language plpgsql security definer set search_path='' as $$
begin perform public.generale_unita_scrivi_prima_nota(new.id); return new; end $$;
revoke all on function public.generale_unita_movimento_contabilizza_trigger() from public,anon,authenticated;
create trigger z_unita_movimento_prima_nota after insert on public.unita_movimenti for each row execute function public.generale_unita_movimento_contabilizza_trigger();

create or replace function public.generale_unita_incasso_registra(p_order_id uuid,p_richiesta uuid,p_tipo text,p_importo numeric,
  p_importo_cassa numeric,p_data date,p_descrizione text default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare u public.unita_immobiliari; m public.unita_movimenti; payload jsonb;
begin
  perform public.generale_unita_puo_incassare(p_order_id);
  if p_richiesta is null then raise exception 'Manca il riferimento univoco del salvataggio.' using errcode='22023'; end if;
  if p_importo_cassa is null then raise exception 'Conferma l''importo effettivo entrato in cassa.' using errcode='22023'; end if;
  u:=public.generale_unita_assicura(p_order_id);
  select * into u from public.unita_immobiliari where id=u.id for update;
  payload:=jsonb_build_object('ordine',p_order_id,'tipo',p_tipo,'netto',round(p_importo,2),'cassa',round(p_importo_cassa,2),'data',p_data,'nota',nullif(btrim(p_descrizione),''));
  select * into m from public.unita_movimenti where company_id=u.company_id and richiesta_id=p_richiesta;
  if found then
    if m.richiesta_payload is distinct from payload then raise exception 'La stessa richiesta contiene dati diversi.' using errcode='22023'; end if;
    if m.stornato_at is not null then raise exception 'Questo incasso è già stornato. Per un nuovo pagamento usa una nuova richiesta.' using errcode='22023'; end if;
    return m.id;
  end if;
  insert into public.unita_movimenti(unita_id,company_id,tipo,importo,importo_cassa,data,descrizione,created_by,richiesta_id,richiesta_payload)
  values(u.id,u.company_id,p_tipo,round(p_importo,2),round(p_importo_cassa,2),p_data,nullif(btrim(p_descrizione),''),auth.uid(),p_richiesta,payload) returning id into m.id;
  return m.id;
end $$;
revoke all on function public.generale_unita_incasso_registra(uuid,uuid,text,numeric,numeric,date,text) from public,anon;
grant execute on function public.generale_unita_incasso_registra(uuid,uuid,text,numeric,numeric,date,text) to authenticated;

-- Existing callers retain their signature. The INSERT trigger posts the same receipt.
create or replace function public.generale_unita_movimento_aggiungi(p_order_id uuid,p_tipo text,p_importo numeric,p_data date default null,p_descrizione text default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare c numeric; iva numeric;
begin
  perform public.generale_unita_puo_incassare(p_order_id);
  select coalesce(vat_rate,22) into iva from public.orders where id=p_order_id;
  c:=case when p_tipo='permuta' then 0 else round(p_importo*(1+iva/100),2) end;
  return public.generale_unita_incasso_registra(p_order_id,gen_random_uuid(),p_tipo,p_importo,c,coalesce(p_data,(now() at time zone 'Europe/Rome')::date),p_descrizione);
end $$;

create or replace function public.generale_unita_incasso_contabilizza(p_movimento_id uuid,p_importo_cassa numeric,p_prima_nota_id uuid default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare m public.unita_movimenti; u public.unita_immobiliari;
begin
  select * into m from public.unita_movimenti where id=p_movimento_id;
  select * into u from public.unita_immobiliari where id=m.unita_id;
  perform public.generale_unita_puo_incassare(u.order_id);
  perform 1 from public.unita_immobiliari where id=u.id for update;
  select * into m from public.unita_movimenti where id=p_movimento_id for update;
  if m.stornato_at is not null then raise exception 'Pagamento già stornato.' using errcode='22023'; end if;
  if m.prima_nota_id is not null then
    if m.importo_cassa is distinct from p_importo_cassa then raise exception 'Incasso già registrato con un importo diverso.' using errcode='22023'; end if;
  else
    if p_importo_cassa is null or p_importo_cassa<=0 or p_importo_cassa::text in ('NaN','Infinity','-Infinity') then raise exception 'Importo effettivo non valido.' using errcode='22023'; end if;
    update public.unita_movimenti set importo_cassa=round(p_importo_cassa,2) where id=m.id;
  end if;
  return public.generale_unita_scrivi_prima_nota(m.id,p_prima_nota_id);
end $$;
revoke all on function public.generale_unita_incasso_contabilizza(uuid,numeric,uuid) from public,anon;
grant execute on function public.generale_unita_incasso_contabilizza(uuid,numeric,uuid) to authenticated;

-- Soft reversal retains source, original cash entry and a unique contra-entry.
create or replace function public.generale_unita_movimento_elimina(p_movimento_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare m public.unita_movimenti; u public.unita_immobiliari; pn public.prima_nota_entries; rev uuid;
begin
  select * into m from public.unita_movimenti where id=p_movimento_id;
  select * into u from public.unita_immobiliari where id=m.unita_id;
  perform public.generale_unita_puo_incassare(u.order_id);
  perform 1 from public.documenti_fiscali where id=(select documento_fiscale_id from public.prima_nota_entries where id=m.prima_nota_id) for update;
  perform 1 from public.unita_immobiliari where id=u.id for update;
  select * into m from public.unita_movimenti where id=p_movimento_id for update;
  if m.stornato_at is not null then return; end if;
  select * into pn from public.prima_nota_entries where id=m.prima_nota_id for update;
  if pn.id is not null then
    insert into public.prima_nota_entries(company_id,direction,category,description,amount,entry_date,
      order_id,is_auto,auto_source,created_by,reversal_of,reference_number)
    values(m.company_id,'uscita','storno_incasso','Storno incasso unità '||u.sigla,pn.amount,
      (now() at time zone 'Europe/Rome')::date,u.order_id,true,'unita_storno',auth.uid(),pn.id,'EIC:UNITA:'||m.id::text)
    on conflict(reversal_of) where reversal_of is not null do nothing returning id into rev;
    if rev is null then select id into rev from public.prima_nota_entries where reversal_of=pn.id; end if;
  end if;
  update public.unita_movimenti set stornato_at=now(),stornato_da=auth.uid(),storno_prima_nota_id=rev where id=m.id;
  if pn.movimento_id is not null then
    -- Mark the origin reversed before native cash callbacks run; they must not repost it.
    update public.prima_nota_entries set movimento_id=null where id=pn.id;
    perform public.storna_incasso_atomico(m.company_id,pn.movimento_id);
  end if;
end $$;

create or replace function public.generale_unita_prima_nota_guardia()
returns trigger language plpgsql security definer set search_path='' as $$
declare m public.unita_movimenti; oid uuid;
begin
  if tg_op='DELETE' then
    if old.unita_movimento_id is not null and public.azienda_ancora_esiste(old.company_id) then raise exception 'Storna questo incasso dalla scheda dell''unità.' using errcode='22023'; end if;
    return old;
  end if;
  if tg_op='UPDATE' and not public.azienda_ancora_esiste(old.company_id) then return new; end if;
  if tg_op='UPDATE' and old.unita_movimento_id is not null and
    (new.unita_movimento_id,new.company_id,new.order_id,new.amount,new.direction,new.entry_date,new.reversal_of)
      is distinct from (old.unita_movimento_id,old.company_id,old.order_id,old.amount,old.direction,old.entry_date,old.reversal_of) then
    raise exception 'Importo e origine dell''incasso unità sono protetti: usa lo storno.' using errcode='22023';
  end if;
  if new.unita_movimento_id is not null then
    select * into m from public.unita_movimenti where id=new.unita_movimento_id;
    select order_id into oid from public.unita_immobiliari where id=m.unita_id;
    if m.id is null or new.company_id is distinct from m.company_id or new.order_id is distinct from oid
       or new.direction<>'entrata' or new.amount is distinct from m.importo_cassa or new.entry_date<>m.data
       or new.reversal_of is not null then raise exception 'La prima nota non corrisponde al pagamento dell''unità.' using errcode='22023'; end if;
  end if;
  return new;
end $$;
revoke all on function public.generale_unita_prima_nota_guardia() from public,anon,authenticated;
create trigger a_prima_nota_unita_guardia before insert or update or delete on public.prima_nota_entries for each row execute function public.generale_unita_prima_nota_guardia();

-- Reuse the existing cash entry at fiscal issue time; drafts never create a second receipt.
create or replace function public.generale_unita_incasso_collega_documento(p_documento uuid)
returns void language plpgsql security definer set search_path='' as $$
declare d public.documenti_fiscali; m public.unita_movimenti; pn public.prima_nota_entries; nuovo uuid;
begin
  select * into d from public.documenti_fiscali where id=p_documento for update;
  if d.id is null or d.deleted_at is not null or d.stato in ('bozza','annullata','stornata','rifiutata','in_invio') then return; end if;
  select um.* into m from public.generale_fatture gf join public.unita_movimenti um on um.id=gf.movimento_id
    where gf.documento_id=d.id and um.stornato_at is null and um.company_id=d.company_id for update of um;
  if m.id is null or m.prima_nota_id is null then return; end if;
  select * into pn from public.prima_nota_entries where id=m.prima_nota_id for update;
  if pn.id is null or exists(select 1 from public.prima_nota_entries r where r.reversal_of=pn.id) then return; end if;
  if pn.movimento_id is not null then
    if pn.documento_fiscale_id<>d.id then raise exception 'Incasso già collegato a un altro documento.' using errcode='22023'; end if;
    return;
  end if;
  -- Native cash updates the document before the outer insert has returned its ID.
  select mc.id into nuovo from public.movimenti_cassa_native mc
    where mc.company_id=m.company_id and mc.documento_id=d.id and mc.riferimento='EIC:UNITA:'||m.id::text;
  if nuovo is not null then
    update public.prima_nota_entries set documento_fiscale_id=d.id,movimento_id=nuovo,is_auto=true where id=pn.id;
    return;
  end if;
  if pn.documento_fiscale_id is not null and pn.documento_fiscale_id<>d.id then raise exception 'Incasso già collegato a un altro documento.' using errcode='22023'; end if;
  if pn.amount>round(d.totale_da_pagare-public.documento_stornato_totale(d.id)-coalesce(d.importo_pagato,0),2) then
    raise exception 'L''incasso già registrato supera il residuo della fattura: verifica gli importi della bozza.' using errcode='22023';
  end if;
  update public.prima_nota_entries set documento_fiscale_id=d.id,is_auto=true where id=pn.id;
  perform public.scadenze_documento_incassa(d.company_id,d.id,pn.amount,pn.entry_date,pn.id);
  insert into public.movimenti_cassa_native(company_id,documento_id,importo,tipo,metodo,data_movimento,riferimento,note)
    values(d.company_id,d.id,pn.amount,'incasso',coalesce(pn.payment_method,'bonifico'),pn.entry_date,'EIC:UNITA:'||m.id::text,'Incasso già registrato sull''unità, prima nota '||pn.id::text) returning id into nuovo;
  update public.prima_nota_entries set movimento_id=nuovo where id=pn.id;
end $$;
revoke all on function public.generale_unita_incasso_collega_documento(uuid) from public,anon,authenticated;
create or replace function public.generale_unita_fattura_emessa_trigger()
returns trigger language plpgsql security definer set search_path='' as $$
begin perform public.generale_unita_incasso_collega_documento(new.id); return new; end $$;
revoke all on function public.generale_unita_fattura_emessa_trigger() from public,anon,authenticated;
create trigger zz_generale_unita_fattura_incasso after update of stato on public.documenti_fiscali
  for each row when (new.stato is distinct from old.stato and new.stato not in ('bozza','annullata','stornata','rifiutata','in_invio')) execute function public.generale_unita_fattura_emessa_trigger();

CREATE OR REPLACE FUNCTION public.generale_unita_elenco(p_generale_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_azienda uuid := public.get_order_company_id(p_generale_id);
  v_modello text;
  v_importi boolean;
  v_costi boolean;
  v_margini boolean;
  v_vede_costi boolean;
  v_costi_comuni numeric;
  v_figlie jsonb;
begin
  if auth.uid() is null or v_azienda is null
     or not public.has_permission_for_company(auth.uid(), 'can_view_orders', v_azienda) then
    raise exception 'Non hai il permesso di vedere questa commessa.' using errcode = '42501';
  end if;
  select g.modello into v_modello
    from public.commesse_generali g
    join public.orders o on o.id = g.order_id
   where g.order_id = p_generale_id and o.deleted_at is null;
  if not found then
    raise exception 'Commessa generale non trovata.' using errcode = 'P0002';
  end if;
  v_importi := public.has_permission_for_company(auth.uid(), 'can_view_order_amounts', v_azienda);
  v_costi := public.has_permission_for_company(auth.uid(), 'can_view_costs', v_azienda);
  v_margini := public.has_permission_for_company(auth.uid(), 'can_view_margins', v_azienda);
  v_vede_costi := v_costi or (v_margini and v_importi);

  if v_vede_costi then
    select coalesce(m.consuntivo, 0) into v_costi_comuni from public.v_ordine_marginalita m where m.id = p_generale_id;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'order_id', o.id, 'aliquota_iva', o.vat_rate, 'codice', o.order_code, 'nome', o.description,
           'importo', case when v_importi then coalesce(o.total_amount, 0) end,
           'costo', case when v_vede_costi then (select coalesce(m.consuntivo, 0) from public.v_ordine_marginalita m where m.id = o.id) end,
           'unita', case when u.id is null then null else jsonb_build_object(
             'id', u.id, 'sigla', u.sigla, 'edificio', u.edificio, 'piano', u.piano, 'tipologia', u.tipologia,
             'mq_commerciali', u.mq_commerciali, 'millesimi', u.millesimi,
             'prezzo_listino', case when v_importi then u.prezzo_listino end,
             'prezzo_trattato', case when v_importi then u.prezzo_trattato end,
             'prezzo_rogito', case when v_importi then u.prezzo_rogito end,
             'provvigione_agenzia', case when v_importi then u.provvigione_agenzia end,
             'stato', u.stato_vendita,
             'data_prenotazione', u.data_prenotazione, 'data_compromesso', u.data_compromesso,
             'rogito_previsto', u.rogito_previsto, 'data_rogito', u.data_rogito,
             'acquirente_id', u.acquirente_id,
             'acquirente', coalesce(nullif(btrim(p.business_name), ''), nullif(btrim(concat_ws(' ', p.first_name, p.last_name)), ''), p.email),
             'agenzia', u.agenzia, 'note', u.note,
             'origine_id', u.origine_id, 'divisa_il', u.divisa_il,
             'movimenti', (
               select coalesce(jsonb_agg(jsonb_build_object(
                        'id', mv.id, 'tipo', mv.tipo,
                        'importo', case when v_importi then mv.importo end,
                        'data', mv.data, 'descrizione', mv.descrizione,
                        'importo_cassa', case when v_importi then mv.importo_cassa end,
                        'prima_nota_id', case when v_importi then mv.prima_nota_id end
                      ) order by mv.data, mv.created_at), '[]'::jsonb)
                 from public.unita_movimenti mv
                where mv.unita_id = u.id and mv.stornato_at is null)
           ) end
         ) order by o.order_code nulls last, o.description), '[]'::jsonb)
    into v_figlie
    from public.orders o
    left join public.unita_immobiliari u on u.order_id = o.id
    left join public.profiles p on p.id = u.acquirente_id
   where o.commessa_generale_id = p_generale_id and o.deleted_at is null;

  return jsonb_build_object(
    'modello', v_modello,
    'costi_comuni', v_costi_comuni,
    'figlie', v_figlie,
    'permessi', jsonb_build_object(
      'importi', v_importi, 'costi', v_costi, 'margini', v_margini,
      'modifica', public.has_permission_for_company(auth.uid(), 'can_edit_orders', v_azienda))
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.generale_unita_stato(p_order_id uuid, p_stato text, p_dati jsonb DEFAULT '{}'::jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_azienda uuid := public.get_order_company_id(p_order_id);
  v_importi boolean;
  v_u public.unita_immobiliari;
  d jsonb := coalesce(p_dati, '{}'::jsonb);
  v_acquirente uuid;
  v_data date;
  v_prezzo numeric;
  v_caparra numeric;
  v_saldo numeric;
  richiesta uuid;
  richiesta_dati jsonb;
  precedente public.unita_movimenti;
begin
  if auth.uid() is null or v_azienda is null
     or not public.has_permission_for_company(auth.uid(), 'can_edit_orders', v_azienda) then
    raise exception 'Non hai il permesso di modificare questa unità.' using errcode = '42501';
  end if;
  if p_stato is null or p_stato not in ('libera', 'prenotata', 'compromesso', 'rogitata') then
    raise exception 'Stato di vendita non valido.' using errcode = '22023';
  end if;
  v_u := public.generale_unita_assicura(p_order_id);
  select * into v_u from public.unita_immobiliari where id=v_u.id for update;
  richiesta:=coalesce(nullif(d->>'richiesta_id','')::uuid,gen_random_uuid());
  richiesta_dati:=jsonb_build_object('ordine',p_order_id,'stato',p_stato,'dati',d-'richiesta_id');
  select * into precedente from public.unita_movimenti where company_id=v_u.company_id and richiesta_id=richiesta;
  if found then
    if precedente.richiesta_payload is distinct from richiesta_dati then raise exception 'La stessa richiesta contiene dati diversi.' using errcode='22023'; end if;
    if precedente.stornato_at is not null then raise exception 'Pagamento già stornato: usa una nuova richiesta.' using errcode='22023'; end if;
    return;
  end if;
  if v_u.divisa_il is not null then
    raise exception 'Questa unità è stata divisa: si vendono le parti.' using errcode = '22023';
  end if;
  v_importi := public.has_permission_for_company(auth.uid(), 'can_view_order_amounts', v_azienda);
  v_caparra := public.generale_unita_numero(d, 'caparra', 'La caparra');
  v_saldo := public.generale_unita_numero(d, 'saldo', 'Il saldo');
  if (coalesce(v_caparra, 0) > 0 or coalesce(v_saldo, 0) > 0) and not v_importi then
    raise exception 'Non hai il permesso di registrare pagamenti.' using errcode = '42501';
  end if;

  v_acquirente := case when d ? 'acquirente_id' then nullif(d ->> 'acquirente_id', '')::uuid else v_u.acquirente_id end;
  if v_acquirente is not null and v_acquirente is distinct from v_u.acquirente_id and not exists (
    select 1 from public.profiles p where p.id = v_acquirente and p.company_id = v_azienda and p.deleted_at is null
  ) then
    raise exception 'Acquirente non trovato tra i clienti.' using errcode = 'P0002';
  end if;

  if p_stato = 'libera' then
    if exists (select 1 from public.unita_movimenti m where m.unita_id = v_u.id and m.stornato_at is null) then
      raise exception 'Su % ci sono pagamenti registrati: toglili prima di rimetterla in vendita.', v_u.sigla using errcode = '22023';
    end if;
    update public.unita_immobiliari
       set stato_vendita = 'libera', acquirente_id = null,
           data_prenotazione = null, data_compromesso = null, rogito_previsto = null, data_rogito = null,
           prezzo_trattato = null, prezzo_rogito = null, updated_at = now()
     where id = v_u.id;
  else
    if v_acquirente is null then
      raise exception 'Scegli l''acquirente.' using errcode = '22023';
    end if;
    if p_stato <> 'rogitata' and exists (
      select 1 from public.unita_movimenti m where m.unita_id = v_u.id and m.stornato_at is null and m.tipo = 'saldo'
    ) then
      raise exception 'Su % è registrato il saldo del rogito: toglilo prima di tornare indietro.', v_u.sigla using errcode = '22023';
    end if;
    v_data := nullif(d ->> 'data', '')::date;

    if p_stato = 'prenotata' then
      v_prezzo := case when v_importi and d ? 'prezzo' then public.generale_unita_numero(d, 'prezzo', 'Il prezzo') else v_u.prezzo_trattato end;
      update public.unita_immobiliari
         set stato_vendita = 'prenotata', acquirente_id = v_acquirente,
             data_prenotazione = coalesce(v_data, data_prenotazione, current_date),
             prezzo_trattato = v_prezzo,
             data_compromesso = null, rogito_previsto = null, data_rogito = null, prezzo_rogito = null,
             updated_at = now()
       where id = v_u.id
       returning data_prenotazione into v_data;
    elsif p_stato = 'compromesso' then
      v_prezzo := case when v_importi and d ? 'prezzo' then public.generale_unita_numero(d, 'prezzo', 'Il prezzo')
                       else coalesce(v_u.prezzo_trattato, v_u.prezzo_listino) end;
      if v_prezzo is null then
        raise exception 'Scrivi il prezzo pattuito nel compromesso.' using errcode = '22023';
      end if;
      update public.unita_immobiliari
         set stato_vendita = 'compromesso', acquirente_id = v_acquirente,
             data_compromesso = coalesce(v_data, data_compromesso, current_date),
             rogito_previsto = case when d ? 'rogito_previsto' then nullif(d ->> 'rogito_previsto', '')::date else rogito_previsto end,
             prezzo_trattato = v_prezzo,
             data_rogito = null, prezzo_rogito = null,
             updated_at = now()
       where id = v_u.id
       returning data_compromesso into v_data;
    else
      v_prezzo := case when v_importi and d ? 'prezzo' then public.generale_unita_numero(d, 'prezzo', 'Il prezzo')
                       else coalesce(v_u.prezzo_rogito, v_u.prezzo_trattato, v_u.prezzo_listino) end;
      if v_prezzo is null then
        raise exception 'Scrivi il prezzo dell''atto.' using errcode = '22023';
      end if;
      update public.unita_immobiliari
         set stato_vendita = 'rogitata', acquirente_id = v_acquirente,
             data_rogito = coalesce(v_data, data_rogito, current_date),
             prezzo_rogito = v_prezzo,
             prezzo_trattato = coalesce(prezzo_trattato, v_prezzo),
             updated_at = now()
       where id = v_u.id
       returning data_rogito into v_data;
    end if;

    -- L'acquirente è il cliente della commessa dell'unità: nome, rubrica e fatture lo trovano lì.
    if v_acquirente is not null then
      update public.orders o
         set customer_id = v_acquirente,
             client_name = coalesce(nullif(btrim(p.business_name), ''), nullif(btrim(concat_ws(' ', p.first_name, p.last_name)), ''), o.client_name),
             updated_at = now()
        from public.profiles p
       where o.id = v_u.order_id and p.id = v_acquirente and o.customer_id is distinct from v_acquirente;
    end if;

    if coalesce(v_caparra, 0) > 0 then
      if p_stato = 'rogitata' then
        raise exception 'Al rogito si registra il saldo, non la caparra.' using errcode = '22023';
      end if;
      insert into public.unita_movimenti (unita_id, company_id, tipo, importo, importo_cassa, data, created_by, richiesta_id, richiesta_payload)
      values (v_u.id, v_u.company_id, 'caparra', v_caparra, public.generale_unita_numero(d, 'caparra_cassa', 'L’importo effettivo'), v_data, auth.uid(), richiesta, richiesta_dati);
    end if;
    if coalesce(v_saldo, 0) > 0 then
      if p_stato <> 'rogitata' then
        raise exception 'Il saldo si registra al rogito.' using errcode = '22023';
      end if;
      insert into public.unita_movimenti (unita_id, company_id, tipo, importo, importo_cassa, data, created_by, richiesta_id, richiesta_payload)
      values (v_u.id, v_u.company_id, 'saldo', v_saldo, public.generale_unita_numero(d, 'saldo_cassa', 'L’importo effettivo'), v_data, auth.uid(), richiesta, richiesta_dati);
    end if;
  end if;

  perform public.generale_unita_allinea(v_u.id, null);
end;
$function$;

CREATE OR REPLACE FUNCTION public.generale_unita_dividi(p_order_id uuid, p_parti jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_azienda uuid := public.get_order_company_id(p_order_id);
  v_generale uuid;
  v_importi boolean;
  v_u public.unita_immobiliari;
  v_parte jsonb;
  v_sigla text;
  v_listino numeric;
  v_tipologia text;
  v_id uuid;
  v_ids uuid[] := '{}';
  v_sigle text[] := '{}';
  v_doppia text;
  v_somma numeric;
begin
  if auth.uid() is null or v_azienda is null
     or not public.has_permission_for_company(auth.uid(), 'can_edit_orders', v_azienda) then
    raise exception 'Non hai il permesso di modificare questa unità.' using errcode = '42501';
  end if;
  v_u := public.generale_unita_assicura(p_order_id);
  select commessa_generale_id into v_generale from public.orders where id = p_order_id;
  if v_u.divisa_il is not null then
    raise exception '% è già stata divisa.', v_u.sigla using errcode = '22023';
  end if;
  if v_u.stato_vendita <> 'libera' then
    raise exception 'Si divide solo un''unità libera.' using errcode = '22023';
  end if;
  if exists (select 1 from public.unita_movimenti m where m.unita_id = v_u.id and m.stornato_at is null) then
    raise exception 'Su % ci sono pagamenti registrati: non si può dividere.', v_u.sigla using errcode = '22023';
  end if;
  if p_parti is null or jsonb_typeof(p_parti) <> 'array' or jsonb_array_length(p_parti) < 2 then
    raise exception 'Dividi in almeno due parti.' using errcode = '22023';
  end if;
  if jsonb_array_length(p_parti) > 10 then
    raise exception 'Al massimo 10 parti.' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_array_elements(p_parti) r where nullif(btrim(coalesce(r ->> 'sigla', '')), '') is null) then
    raise exception 'Ogni parte ha bisogno di una sigla (es. A1a).' using errcode = '22023';
  end if;
  select min(btrim(r ->> 'sigla')) into v_doppia
    from jsonb_array_elements(p_parti) r
   group by lower(btrim(r ->> 'sigla'))
  having count(*) > 1
   limit 1;
  if v_doppia is not null then
    raise exception 'Due parti hanno la stessa sigla: %.', v_doppia using errcode = '22023';
  end if;
  select btrim(r ->> 'sigla') into v_doppia
    from jsonb_array_elements(p_parti) r
   where not public.generale_unita_sigla_libera(v_generale, r ->> 'sigla', null)
   limit 1;
  if v_doppia is not null then
    raise exception 'C''è già un''unità %.', v_doppia using errcode = '22023';
  end if;
  if v_u.mq_commerciali is not null then
    select sum(coalesce(public.generale_unita_numero(r, 'mq_commerciali', 'I m² commerciali'), 0)) into v_somma
      from jsonb_array_elements(p_parti) r;
    if abs(v_somma - v_u.mq_commerciali) > 0.01 then
      raise exception 'I m² delle parti (%) non tornano con quelli di % (%).', v_somma, v_u.sigla, v_u.mq_commerciali using errcode = '22023';
    end if;
  end if;
  if v_u.millesimi is not null then
    select sum(coalesce(public.generale_unita_numero(r, 'millesimi', 'I millesimi'), 0)) into v_somma
      from jsonb_array_elements(p_parti) r;
    if abs(v_somma - v_u.millesimi) > 0.01 then
      raise exception 'I millesimi delle parti (%) non tornano con quelli di % (%).', v_somma, v_u.sigla, v_u.millesimi using errcode = '22023';
    end if;
  end if;
  v_importi := public.has_permission_for_company(auth.uid(), 'can_view_order_amounts', v_azienda);

  for v_parte in select value from jsonb_array_elements(p_parti) loop
    v_sigla := btrim(v_parte ->> 'sigla');
    v_tipologia := coalesce(nullif(btrim(coalesce(v_parte ->> 'tipologia', '')), ''), v_u.tipologia);
    v_listino := case when v_importi then public.generale_unita_numero(v_parte, 'prezzo_listino', 'Il prezzo di listino') end;
    v_id := public.generale_unita_nuova_commessa(v_azienda, public.generale_unita_descrizione(v_sigla, v_tipologia), v_listino);
    insert into public.unita_immobiliari (
      order_id, company_id, sigla, edificio, piano, tipologia, mq_commerciali, millesimi, prezzo_listino,
      agenzia, origine_id, created_by)
    values (
      v_id, v_azienda, v_sigla, v_u.edificio, v_u.piano, v_tipologia,
      public.generale_unita_numero(v_parte, 'mq_commerciali', 'I m² commerciali'),
      public.generale_unita_numero(v_parte, 'millesimi', 'I millesimi'),
      v_listino, v_u.agenzia, v_u.id, auth.uid());
    v_ids := v_ids || v_id;
    v_sigle := v_sigle || v_sigla;
  end loop;

  perform public.commessa_generale_collega(v_generale, v_ids);
  update public.orders o
     set customer_id = p.customer_id, client_name = p.client_name
    from public.orders p
   where p.id = p_order_id and p.customer_id is not null and o.id = any (v_ids);

  update public.unita_immobiliari set divisa_il = now(), updated_at = now() where id = v_u.id;
  -- La commessa di partenza resta (costi, documenti, storia) e dice in cosa è stata divisa.
  update public.orders
     set description = left(coalesce(nullif(btrim(description), ''), v_u.sigla), 400)
                       || ' (divisa in ' || array_to_string(v_sigle, ', ') || ')',
         updated_at = now()
   where id = p_order_id;
  perform public.generale_unita_allinea(v_u.id, null);
  return coalesce(array_length(v_ids, 1), 0);
end;
$function$;

CREATE OR REPLACE FUNCTION public.commessa_generale_riepilogo(p_generale_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_azienda uuid := public.get_order_company_id(p_generale_id);
  v_importi boolean;
  v_costi boolean;
  v_margini boolean;
  v_generale jsonb;
  v_figlie jsonb;
  v_fatture_generale jsonb;
begin
  if auth.uid() is null or v_azienda is null
     or not public.has_permission_for_company(auth.uid(), 'can_view_orders', v_azienda) then
    raise exception 'Non hai il permesso di vedere questa commessa.' using errcode = '42501';
  end if;
  v_importi := public.has_permission_for_company(auth.uid(), 'can_view_order_amounts', v_azienda);
  v_costi := public.has_permission_for_company(auth.uid(), 'can_view_costs', v_azienda);
  v_margini := public.has_permission_for_company(auth.uid(), 'can_view_margins', v_azienda);

  select jsonb_build_object(
           'id', o.id, 'codice', o.order_code, 'nome', o.description, 'cliente', o.client_name,
           'cliente_id', o.customer_id, 'modello', g.modello, 'creata_il', o.created_at,
           'valore', case when v_importi then g.valore_riferimento end)
    into v_generale
    from public.orders o
    join public.commesse_generali g on g.order_id = o.id
   where o.id = p_generale_id and o.deleted_at is null;
  if v_generale is null then
    raise exception 'Commessa generale non trovata.' using errcode = 'P0002';
  end if;

  with figlie as (
    select o.id, o.order_code, o.description, o.status, o.work_address, o.work_start_date, o.work_end_date,
           coalesce(o.total_amount, 0) as importo,
           coalesce(o.percentuale_avanzamento, 0) as avanzamento,
           s.name as stato_nome, s.color as stato_colore,
           u.divisa_il is not null as divisa,
           coalesce((select sum(um.importo) from public.unita_movimenti um
                      where um.stornato_at is null and um.unita_id = u.id and um.tipo in ('caparra', 'acconto')), 0) as acconti,
           coalesce((select sum(um.importo) from public.unita_movimenti um
                      where um.stornato_at is null and um.unita_id = u.id and um.tipo in ('caparra', 'acconto', 'saldo')), 0) as incassi_unita,
           u.stato_vendita,
           -- Come il pannello dell'unità: prezzo con le varianti approvate, meno pagamenti e permute.
           case when u.stato_vendita in ('compromesso', 'rogitata') and u.divisa_il is null then greatest(0,
             coalesce(o.total_amount, 0)
             + coalesce((select sum(v.impatto_economico) from public.ordini_variazione v where v.order_id = o.id and v.status = 'approvato'), 0)
             - coalesce((select sum(um.importo) from public.unita_movimenti um where um.stornato_at is null and um.unita_id = u.id), 0)) end as residuo_unita,
           -- Come il SAL: una commessa «a misura» vale le sue misure di questo contratto, voce per voce.
           exists (select 1 from public.generale_computo k where k.figlia_id = o.id and k.generale_id = p_generale_id)
             or exists (select 1 from public.generale_misure gm where gm.figlia_id = o.id and gm.generale_id = p_generale_id) as a_misura,
           coalesce((select sum(q.valore) from (
              select sum(gm.quantita) * ep.prezzo
                     * case when ep.soggetto_ribasso then 1 - coalesce(gc.ribasso_pct, 0) / 100 else 1 end as valore
                from public.generale_misure gm
                join public.generale_elenco_prezzi ep on ep.id = gm.voce_id
                left join public.generale_contratti gc on gc.generale_id = gm.generale_id
               where gm.figlia_id = o.id and gm.generale_id = p_generale_id
               group by ep.id, ep.prezzo, ep.soggetto_ribasso, gc.ribasso_pct
              having sum(gm.quantita) > 0) q), 0) as misurato
      from public.orders o
      left join public.unita_immobiliari u on u.order_id = o.id
      left join public.order_statuses s on s.id = o.current_status_id
     where o.commessa_generale_id = p_generale_id and o.deleted_at is null
  ),
  fatture as (
    select x.order_id, sum(x.fatturato) as fatturato, sum(x.incassato) as incassato
      from public.generale_fatture_nette(v_azienda, array(select id from figlie)) x
     group by x.order_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', f.id, 'codice', f.order_code, 'nome', f.description,
           'stato', f.status, 'stato_nome', f.stato_nome, 'stato_colore', f.stato_colore,
           'indirizzo', f.work_address, 'inizio', f.work_start_date, 'fine', f.work_end_date,
           'avanzamento', case when f.a_misura and f.importo > 0 then least(100, round(f.misurato / f.importo * 100, 1)) else f.avanzamento end,
           'divisa', f.divisa,
           'acconti', case when v_importi then f.acconti end,
           'importo', case when v_importi then f.importo end,
           'eseguito', case when v_importi then case when f.a_misura then round(f.misurato, 2) else round(f.importo * f.avanzamento / 100, 2) end end,
           'stato_vendita', f.stato_vendita,
           'residuo_unita', case when v_importi then f.residuo_unita end,
           'fatturato', case when v_importi then coalesce(ft.fatturato, 0) end,
           'incassato', case when v_importi then greatest(coalesce(ft.incassato, 0), f.incassi_unita) end,
           'costo', case when v_costi then m.consuntivo end,
           'margine', case when v_margini then m.margine end
         ) order by f.order_code nulls last, f.description), '[]'::jsonb)
    into v_figlie
    from figlie f
    left join fatture ft on ft.order_id = f.id
    left join public.v_ordine_marginalita m on m.id = f.id;

  -- Fatture registrate sulla generale stessa (es. SAL di contratto fatturato sul contratto).
  select case when v_importi then jsonb_build_object(
           'fatturato', coalesce(sum(x.fatturato), 0),
           'incassato', coalesce(sum(x.incassato), 0)) end
    into v_fatture_generale
    from public.generale_fatture_nette(v_azienda, array[p_generale_id]) x;

  return jsonb_build_object(
    'generale', v_generale,
    'figlie', v_figlie,
    'fatture_generale', v_fatture_generale,
    'permessi', jsonb_build_object('importi', v_importi, 'costi', v_costi, 'margini', v_margini)
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.generale_piano_incassi(p_generale_id uuid)
 RETURNS TABLE(fattura_id uuid, data date, importo numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with s as materialized (
    select o.id, o.company_id
      from public.orders o
     where o.deleted_at is null
       and (o.id = p_generale_id or o.commessa_generale_id = p_generale_id)
  ),
  f as materialized (
    select i.id, i.status, i.issue_date, i.due_date, i.payment_date,
           coalesce(i.total, 0) as totale, coalesce(i.paid_amount, 0) as pagato,
           case when coalesce(i.total, 0) > 0
                then coalesce(i.subtotal, i.total - coalesce(i.tax_amount, 0)) / i.total else 1 end as quota_netta
      from public.invoices i
      join s on s.id = i.order_id and s.company_id = i.company_id
     where i.deleted_at is null
       and i.document_type in ('invoice', 'fattura', 'fattura_accompagnatoria', 'parcella')
       and i.status not in ('cancelled', 'canceled', 'annullata', 'credited')
  ),
  p as (
    select ip.invoice_id, ip.payment_date, sum(coalesce(ip.amount, 0)) as importo
      from public.invoice_payments ip
      join f on f.id = ip.invoice_id
     group by ip.invoice_id, ip.payment_date
  )
  select p.invoice_id, p.payment_date, round(p.importo * f.quota_netta, 2)
    from p join f on f.id = p.invoice_id
   where round(p.importo * f.quota_netta, 2) <> 0
  union all
  select f.id, coalesce(f.payment_date, f.due_date, f.issue_date),
         round((case when f.status in ('paid', 'pagata') then f.totale - public.nc_collegate_importo(f.id)
                     else least(f.pagato, f.totale) end) * f.quota_netta, 2)
    from f
   where not exists (select 1 from p where p.invoice_id = f.id)
     and (f.status in ('paid', 'pagata') or f.pagato > 0)
  union all
  -- Caparre, acconti e saldi delle unità (modulo Unità), dove la commessa dell'unità non ha
  -- fatture: con le fatture contano i loro pagamenti, e l'incasso non si conta due volte.
  select um.id, um.data, um.importo
    from public.unita_movimenti um
    join public.unita_immobiliari u on u.id = um.unita_id and u.company_id = um.company_id
    join s on s.id = u.order_id and s.company_id = u.company_id
   where um.stornato_at is null and um.tipo in ('caparra', 'acconto', 'saldo')
     and not exists (select 1 from f join public.invoices i3 on i3.id = f.id where i3.order_id = u.order_id);
$function$;

CREATE OR REPLACE FUNCTION public.generale_fattura_origine(p_origine text, p_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  s record;
  m record;
begin
  if p_origine = 'sal' then
    select r.id, r.company_id, r.order_id, r.numero_sal, r.stato, r.data_emissione,
           gs.generale_id, gs.periodo_dal, gs.periodo_al, gs.lordo, gs.ritenuta_pct, gs.ritenuta,
           gs.recupero_pct, gs.recupero_anticipazione, gs.netto, gs.riferimento_contratto,
           gs.cig, gs.cup, gs.split_payment, gs.reverse_charge,
           o.customer_id, o.order_code, o.description
      into s
      from public.sal_records r
      join public.generale_sal gs on gs.sal_id = r.id
      join public.orders o on o.id = gs.generale_id
     where r.id = p_id;
    if not found then
      raise exception 'Questo SAL non è un SAL di contratto della commessa generale.' using errcode = '22023';
    end if;
    if s.stato not in ('emesso', 'approvato', 'firmato') then
      raise exception 'Si fattura un SAL emesso: prima emetti il SAL n. %.', s.numero_sal using errcode = '22023';
    end if;
    return jsonb_build_object(
      'company_id', s.company_id, 'generale_id', s.generale_id, 'ordine_id', s.generale_id,
      'cliente_profilo', s.customer_id,
      'sal', jsonb_build_object(
        'id', s.id, 'numero', s.numero_sal, 'stato', s.stato, 'data', s.data_emissione,
        'dal', s.periodo_dal, 'al', s.periodo_al, 'lordo', s.lordo,
        'ritenuta_pct', s.ritenuta_pct, 'ritenuta', s.ritenuta,
        'recupero_pct', s.recupero_pct, 'recupero', s.recupero_anticipazione, 'netto', s.netto,
        'riferimento_contratto', s.riferimento_contratto, 'cig', s.cig, 'cup', s.cup,
        'split_payment', s.split_payment, 'reverse_charge', s.reverse_charge,
        'generale_codice', s.order_code, 'generale_nome', s.description));
  elsif p_origine = 'movimento' then
    select mv.id, mv.company_id, mv.tipo, mv.importo, mv.data, mv.descrizione,
           u.id as unita_id, u.order_id, u.sigla, u.edificio, u.piano, u.tipologia, u.mq_commerciali,
           u.acquirente_id, u.stato_vendita,
           o.customer_id, o.commessa_generale_id, o.order_code,
           g.order_code as generale_codice, g.description as generale_nome,
           coalesce(g.work_address, g.indirizzo_lavori) as indirizzo
      into m
      from public.unita_movimenti mv
      join public.unita_immobiliari u on u.id = mv.unita_id
      join public.orders o on o.id = u.order_id
      left join public.orders g on g.id = o.commessa_generale_id
     where mv.id = p_id and mv.stornato_at is null;
    if not found or m.commessa_generale_id is null then
      raise exception 'Questo pagamento non è di un''unità di una commessa generale.' using errcode = '22023';
    end if;
    if m.tipo not in ('caparra', 'acconto', 'saldo') then
      raise exception 'La permuta non è un incasso: non si fattura da qui.' using errcode = '22023';
    end if;
    return jsonb_build_object(
      'company_id', m.company_id, 'generale_id', m.commessa_generale_id, 'ordine_id', m.order_id,
      'cliente_profilo', coalesce(m.acquirente_id, m.customer_id),
      'movimento', jsonb_build_object(
        'id', m.id, 'tipo', m.tipo, 'importo', m.importo, 'data', m.data, 'descrizione', m.descrizione,
        'unita_sigla', m.sigla, 'edificio', m.edificio, 'piano', m.piano, 'tipologia', m.tipologia,
        'mq', m.mq_commerciali, 'stato_vendita', m.stato_vendita,
        'generale_codice', m.generale_codice, 'generale_nome', m.generale_nome, 'indirizzo', m.indirizzo));
  end if;
  raise exception 'Origine della fattura sconosciuta: %.', p_origine using errcode = '22023';
end;
$function$;

-- Only issued fiscal documents are receivables. Estimates and draft SALs are not.
create or replace function public.commessa_documenti_credito(p_company uuid)
returns table(order_id uuid,documento_id uuid,invoice_id uuid,numero text,da_pagare_originale numeric,
  credito_lordo numeric,pagato_lordo numeric,pagato_il date,scadenza date)
language sql stable security definer set search_path='' as $$
  with native as (
    select d.*,greatest(0,d.totale_da_pagare-public.documento_stornato_totale(d.id)) credito
    from public.documenti_fiscali d
    where d.company_id=p_company and d.deleted_at is null and d.tipo in ('fattura','fattura_pa')
      and d.stato not in ('bozza','annullata','stornata','rifiutata','in_invio')
  ), links as (
    select f.fattura_id,f.ordine_id,
      least(1,greatest(0,f.importo_associato/nullif(d.totale_da_pagare,0))) quota
      from public.fattura_ordine f join native d on d.id=f.fattura_id where f.company_id=p_company
    union all
    select d.id,d.ordine_id,1::numeric from native d where d.ordine_id is not null
      and not exists(select 1 from public.fattura_ordine f where f.fattura_id=d.id and f.company_id=p_company)
  )
  select l.ordine_id,d.id,null::uuid,d.numero,round(d.totale_da_pagare*l.quota,2),round(d.credito*l.quota,2),
    round(least(d.credito,greatest(0,coalesce(d.importo_pagato,0)))*l.quota,2),
    coalesce((select max(m.data_movimento) from public.movimenti_cassa_native m where m.documento_id=d.id and m.tipo='incasso'),d.pagato_at::date),d.data_scadenza
    from native d join links l on l.fattura_id=d.id join public.orders o on o.id=l.ordine_id
    where o.company_id=p_company and o.deleted_at is null
  union all
  select i.order_id,null::uuid,i.id,i.invoice_number,greatest(0,i.total-public.nc_collegate_importo(i.id)),
    greatest(0,i.total-public.nc_collegate_importo(i.id)),
    case when i.status in ('paid','pagata') then greatest(0,i.total-public.nc_collegate_importo(i.id))
      else least(greatest(0,i.total-public.nc_collegate_importo(i.id)),greatest(0,coalesce(i.paid_amount,0))) end,i.payment_date,i.due_date
    from public.invoices i join public.orders o on o.id=i.order_id
    where i.company_id=p_company and o.company_id=p_company and o.deleted_at is null and i.deleted_at is null
      and i.document_type in ('invoice','fattura','fattura_accompagnatoria','parcella')
      and i.status not in ('draft','bozza','cancelled','canceled','annullata','credited');
$$;
revoke all on function public.commessa_documenti_credito(uuid) from public,anon,authenticated;

create or replace function public.commesse_importi_finanziari(p_company_id uuid,p_ids uuid[])
returns table(id uuid,order_type text,valorizzazione text,crediti_misura jsonb,incasso_unita_lordo numeric,coperto_unita_netto numeric,permuta_unita_netto numeric)
language plpgsql stable security definer set search_path='' as $$
declare importi boolean;
begin
  if auth.uid() is null or public.utente_bloccato() or public.user_can_access_company(p_company_id) is not true
    or public.has_permission_for_company(auth.uid(),'can_view_orders',p_company_id) is not true then
    raise exception 'Non hai il permesso di vedere queste commesse.' using errcode='42501';
  end if;
  if cardinality(p_ids)>200 then raise exception 'Richiedi al massimo 200 commesse per volta.' using errcode='22023'; end if;
  importi:=public.has_permission_for_company(auth.uid(),'can_view_order_amounts',p_company_id);
  return query
  with doc as materialized (
    select d.* from public.commessa_documenti_credito(p_company_id) d where d.order_id=any(p_ids) and importi
  ), crediti as (
    select d.order_id,sum(d.credito_lordo) fatturato,sum(d.pagato_lordo) incassato,
      sum(greatest(0,d.credito_lordo-d.pagato_lordo)) residuo,
      sum(case when d.scadenza<(now() at time zone 'Europe/Rome')::date then greatest(0,d.credito_lordo-d.pagato_lordo) else 0 end) scaduto,
      jsonb_agg(jsonb_build_object('id',coalesce(d.documento_id,d.invoice_id),'nativo',d.documento_id is not null,'numero',d.numero,
        'totale',d.credito_lordo,'incassato',d.pagato_lordo,'residuo',greatest(0,d.credito_lordo-d.pagato_lordo),'scadenza',d.scadenza) order by d.scadenza nulls last) documenti
      from doc d group by d.order_id
  ), unita as (
    select u.order_id,
      coalesce(sum(case when m.tipo<>'permuta' and m.prima_nota_id is not null then m.importo_cassa else 0 end),0) cassa,
      coalesce(sum(case when m.tipo<>'permuta' then m.importo else 0 end),0) coperto,
      coalesce(sum(case when m.tipo='permuta' then m.importo else 0 end),0) permuta
      from public.unita_immobiliari u left join public.unita_movimenti m on m.unita_id=u.id and m.stornato_at is null
      where u.company_id=p_company_id and u.order_id=any(p_ids) and importi group by u.order_id
  )
  select o.id,o.order_type::text,o.valorizzazione::text,
    case when importi and o.order_type='appaltatore_lavoro' and o.valorizzazione='a_misura' then
      jsonb_build_object('fatturato',coalesce(c.fatturato,0),'incassato',coalesce(c.incassato,0),'residuo',coalesce(c.residuo,0),
        'scaduto',coalesce(c.scaduto,0),'documenti',coalesce(c.documenti,'[]'::jsonb)) end,
    case when importi then u.cassa end,case when importi then u.coperto end,case when importi then u.permuta end
    from public.orders o left join crediti c on c.order_id=o.id left join unita u on u.order_id=o.id
    where o.company_id=p_company_id and o.deleted_at is null and o.id=any(p_ids);
end $$;
revoke all on function public.commesse_importi_finanziari(uuid,uuid[]) from public,anon;
grant execute on function public.commesse_importi_finanziari(uuid,uuid[]) to authenticated;

create or replace function public.commessa_crediti_misura(p_order_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare c uuid:=public.get_order_company_id(p_order_id); r jsonb;
begin
  if public.has_permission_for_company(auth.uid(),'can_view_order_amounts',c) is not true then
    raise exception 'Non hai il permesso di vedere gli importi.' using errcode='42501';
  end if;
  select x.crediti_misura into r from public.commesse_importi_finanziari(c,array[p_order_id]) x;
  return r;
end $$;
revoke all on function public.commessa_crediti_misura(uuid) from public,anon;
grant execute on function public.commessa_crediti_misura(uuid) to authenticated;

-- Serialize budget writes with native revision/approval RPCs. Direct table writes obey the same guard.
create or replace function public.generale_budget_voce_blocco()
returns trigger language plpgsql security definer set search_path='' as $$
declare v public.generale_piano_versioni; vid uuid;
begin
  vid:=case when tg_op='DELETE' then old.versione_id else new.versione_id end;
  select * into v from public.generale_piano_versioni where id=vid;
  if not found and tg_op='DELETE' then return old; end if;
  perform pg_advisory_xact_lock(hashtextextended('generale_piano:'||v.generale_id::text,0));
  select * into v from public.generale_piano_versioni where id=vid for update;
  if tg_op='DELETE' then
    if v.stato<>'bozza' then raise exception 'Versione approvata e bloccata: crea una revisione.' using errcode='23514'; end if;
    return old;
  end if;
  if new.importo is null or new.importo<0 or new.importo::text in ('NaN','Infinity','-Infinity')
    or (new.a_finire is not null and (new.a_finire<0 or new.a_finire::text in ('NaN','Infinity','-Infinity'))) then
    raise exception 'Importi del budget non validi: usa valori finiti e non negativi.' using errcode='22023';
  end if;
  return new;
end $$;
revoke all on function public.generale_budget_voce_blocco() from public,anon,authenticated;
create trigger a_generale_budget_voce_blocco before insert or update or delete on public.generale_piano_voci
  for each row execute function public.generale_budget_voce_blocco();

create or replace function public.generale_budget_completo_guardia()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.stato='approvata' and old.stato is distinct from 'approvata' then
    if auth.uid() is null or public.utente_bloccato() or public.user_can_access_company(new.company_id) is not true
      or public.puo_modificare_commessa(new.generale_id) is not true
      or public.has_permission_for_company(auth.uid(),'can_view_margins',new.company_id) is not true then
      raise exception 'Non hai il permesso di approvare il piano economico.' using errcode='42501';
    end if;
    if not pg_try_advisory_xact_lock(hashtextextended('generale_piano:'||new.generale_id::text,0)) then
      raise exception 'Budget in aggiornamento: aggiorna la pagina e riprova.' using errcode='40001';
    end if;
    if not exists(select 1 from public.generale_piano_voci where versione_id=new.id and importo>0)
      or exists(select 1 from public.generale_piano_voci where versione_id=new.id and (
        nullif(btrim(descrizione),'') is null or importo is null or importo<0 or importo::text in ('NaN','Infinity','-Infinity')
        or position('[EIC:DA_STIMARE]' in coalesce(nota,''))>0 or (importo>0 and mese is null)
        or coalesce(nota,'') ~ '[1-9][0-9]* voci da correggere escluse')) then
      raise exception 'Budget incompleto: completa stime, descrizioni e calendario prima di approvare.' using errcode='22023';
    end if;
  end if;
  return new;
end $$;
revoke all on function public.generale_budget_completo_guardia() from public,anon,authenticated;
drop trigger if exists generale_budget_completo_guardia on public.generale_piano_versioni;
create trigger generale_budget_completo_guardia before update of stato on public.generale_piano_versioni
  for each row execute function public.generale_budget_completo_guardia();

CREATE OR REPLACE FUNCTION public.generale_piano_nuova_versione(p_generale_id uuid, p_voci jsonb DEFAULT NULL::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET lock_timeout TO '3s'
AS $function$
declare
  v_azienda uuid := public.get_order_company_id(p_generale_id);
  v_id uuid;
  v_approvata uuid;
  v_numero integer;
begin
  if auth.uid() is null or v_azienda is null
     or not public.puo_modificare_commessa(p_generale_id)
     or not public.has_permission_for_company(auth.uid(), 'can_view_margins', v_azienda) then
    raise exception 'Non hai il permesso di modificare il piano economico.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.commesse_generali g where g.order_id = p_generale_id) then
    raise exception 'Commessa generale non trovata.' using errcode = 'P0002';
  end if;
  if jsonb_typeof(p_voci) = 'array' and jsonb_array_length(p_voci) > 300 then
    raise exception 'Troppe voci in una volta: al massimo 300.' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('generale_piano:' || p_generale_id::text, 0));

  select x.id into v_id from public.generale_piano_versioni x where x.generale_id = p_generale_id and x.stato = 'bozza';
  if v_id is not null then
    return v_id;
  end if;
  select x.id into v_approvata from public.generale_piano_versioni x where x.generale_id = p_generale_id and x.stato = 'approvata';
  select coalesce(max(x.numero), 0) + 1 into v_numero from public.generale_piano_versioni x where x.generale_id = p_generale_id;

  insert into public.generale_piano_versioni (company_id, generale_id, numero, stato, created_by)
  values (v_azienda, p_generale_id, v_numero, 'bozza', auth.uid())
  returning id into v_id;

  if v_approvata is not null then
    insert into public.generale_piano_voci (company_id, versione_id, generale_id, tipo, categoria, descrizione, importo,
                                            mese, durata_mesi, figlia_id, categorie_costo, a_finire, nota, ordine, origine_id)
    select a.company_id, v_id, a.generale_id, a.tipo, a.categoria, a.descrizione, a.importo, a.mese, a.durata_mesi,
           case when exists (select 1 from public.orders o where o.id = a.figlia_id
                                and o.commessa_generale_id = p_generale_id and o.deleted_at is null)
                then a.figlia_id end,
           a.categorie_costo, a.a_finire, a.nota, a.ordine, a.id
      from public.generale_piano_voci a
     where a.versione_id = v_approvata;
  elsif jsonb_typeof(p_voci) = 'array' then
    insert into public.generale_piano_voci (company_id, versione_id, generale_id, tipo, categoria, descrizione, importo,
                                            mese, durata_mesi, ordine, nota)
    select v_azienda, v_id, p_generale_id, x.tipo, x.categoria, coalesce(x.descrizione, ''), coalesce(x.importo, 0),
           x.mese, greatest(1, least(120, coalesce(x.durata_mesi, 1))), coalesce(x.ordine, n.ord::integer),
           case when x.importo is null then concat_ws(' ',nullif(x.nota,''),'[EIC:DA_STIMARE]') else x.nota end
      from jsonb_array_elements(p_voci) with ordinality n(el, ord)
      cross join lateral jsonb_to_record(n.el)
        as x(tipo text, categoria text, descrizione text, importo numeric, mese date, durata_mesi integer, ordine integer, nota text);
  end if;
  return v_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.rate_importi(p_company uuid)
 RETURNS TABLE(installment_id uuid, order_id uuid, type text, importo numeric, is_paid boolean, paid_date date, expected_date date, documento_fiscale_id uuid, invoice_id uuid)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if auth.uid() is not null and not coalesce(public.user_can_access_company(p_company), false) then
    raise exception 'Accesso non autorizzato a questa azienda.' using errcode = '42501';
  end if;
  return query
  with o as (
    select o.id, coalesce(o.total_amount, 0) tot, coalesce(o.vat_rate, 22) iva,
           case when o.payment_type = 'financing' and o.financing_cost_mode is null then coalesce(o.financing_cost, 0) else 0 end fc,
           case when o.payment_type = 'financing' and o.financing_cost_mode = 'trattenuto' then coalesce(o.financing_cost, 0) else 0 end trattenuta
      from public.orders o
     where o.company_id = p_company and o.deleted_at is null
       and not (o.order_type='appaltatore_lavoro' and o.valorizzazione='a_misura')
  ),
  var as (
    select v.order_id, coalesce(v.impatto_economico, 0) imp,
           coalesce(v.offline_signed_on::date, v.firmato_il::date, v.approval_recorded_at::date,
                    v.richiesto_il::date, v.created_at::date) as il
      from public.ordini_variazione v join o on o.id = v.order_id
     where v.status = 'approvato'
  ),
  src as (
    select i.id, i.order_id, i.type::text as type, i.position, i.amount, i.is_paid, i.paid_date, i.expected_date,
           i.documento_fiscale_id, i.invoice_id
      from public.order_installments i join o on o.id = i.order_id
    union all
    select md5(oo.id::text || ':' || l.tipo || ':' || l.pos)::uuid, oo.id, l.tipo, l.pos, l.importo, l.pagata,
           l.pagata_il, l.attesa_il, null::uuid, null::uuid
      from public.orders oo join o on o.id = oo.id
      cross join lateral (values
        ('deposit', 0, coalesce(oo.deposit_amount, 0), coalesce(oo.deposit_paid, false), oo.deposit_paid_date, oo.deposit_expected_date),
        ('deposit', 1, coalesce(oo.deposit_2_amount, 0), coalesce(oo.deposit_2_paid, false), oo.deposit_2_paid_date, oo.deposit_2_expected_date),
        ('financing', 2, coalesce(oo.financing_amount, 0), coalesce(oo.financing_paid, false), oo.financing_paid_date, oo.financing_expected_date),
        ('balance', 3, coalesce(oo.balance_amount, 0), coalesce(oo.balance_paid, false), oo.balance_paid_date, oo.balance_expected_date)
      ) l(tipo, pos, importo, pagata, pagata_il, attesa_il)
     where not exists (select 1 from public.order_installments x where x.order_id = oo.id)
       and (l.importo > 0 or l.tipo = 'balance')
       and case when coalesce(oo.payment_type, 'standard') = 'standard' then l.tipo <> 'financing'
                else l.pos <> 1 end
       and (coalesce(oo.deposit_amount, 0) + coalesce(oo.deposit_2_amount, 0) + coalesce(oo.financing_amount, 0)
            + coalesce(oo.balance_amount, 0)) > 0
  ),
  r0 as (
    select s.*, row_number() over (partition by s.order_id
                                   order by (s.type = 'balance') desc, s.position desc nulls last, s.id desc) as rn
      from src s
  ),
  r1 as (
    select r0.*, (r0.type = 'balance' and r0.rn = 1) as finale,
           sum(case when r0.type = 'balance' and r0.rn = 1 then 0 else coalesce(r0.amount, 0) end)
             over (partition by r0.order_id) as altre
      from r0
  ),
  r2 as (
    select r1.*, o.fc, o.trattenuta,
           round(round((o.tot + coalesce((select sum(var.imp) from var
                                          where var.order_id = r1.order_id
                                            and (not (r1.finale and coalesce(r1.is_paid, false) and r1.paid_date is not null)
                                                 or var.il <= r1.paid_date)), 0)) * (1 + o.iva / 100), 2)
                 - r1.altre - o.fc, 2) as saldo_grezzo
      from r1 join o on o.id = r1.order_id
  ),
  r3 as (
    select r2.*,
           case when r2.trattenuta > 0 then r2.trattenuta else least(greatest(0, -max(case when r2.finale then r2.saldo_grezzo end) over (partition by r2.order_id)), r2.fc) end as avanzo
      from r2
  )
  select r3.id, r3.order_id, r3.type::text,
         case when r3.finale then greatest(0, r3.saldo_grezzo)
              when r3.type = 'financing' then greatest(0, coalesce(r3.amount, 0) - r3.avanzo)
              else coalesce(r3.amount, 0) end,
         coalesce(r3.is_paid, false), r3.paid_date, r3.expected_date, r3.documento_fiscale_id, r3.invoice_id
    from r3
  union all
  select coalesce(d.documento_id,d.invoice_id),d.order_id,'balance'::text,
         case when d.documento_id is not null then d.da_pagare_originale else d.credito_lordo end,
         d.pagato_lordo>=d.credito_lordo,d.pagato_il,d.scadenza,d.documento_id,d.invoice_id
    from public.commessa_documenti_credito(p_company) d
    join public.orders oo on oo.id=d.order_id
   where oo.order_type='appaltatore_lavoro' and oo.valorizzazione='a_misura';
end $function$;

CREATE OR REPLACE FUNCTION public.rate_incassi(p_company uuid)
 RETURNS TABLE(order_id uuid, installment_id uuid, data date, importo numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with r as (select x.* from public.rate_importi(p_company) x join public.orders o on o.id=x.order_id where not (o.order_type='appaltatore_lavoro' and o.valorizzazione='a_misura')),
  mv as (
    select m.documento_id, m.data_movimento, m.importo
      from public.movimenti_cassa_native m
     where m.company_id = p_company and m.tipo = 'incasso' and m.documento_id is not null
  ),
  tot as (select mv.documento_id, sum(mv.importo) as t, max(mv.data_movimento) as ultima from mv group by mv.documento_id)
  select r.order_id, r.installment_id, coalesce(r.paid_date, r.expected_date), r.importo
    from r where r.is_paid and r.documento_fiscale_id is null
  union all
  select r.order_id, r.installment_id, mv.data_movimento, mv.importo
    from r join mv on mv.documento_id = r.documento_fiscale_id
  union all
  select r.order_id, r.installment_id, coalesce(r.paid_date, t.ultima), r.importo - t.t
    from r join tot t on t.documento_id = r.documento_fiscale_id
   where r.is_paid and r.importo <> t.t and abs(r.importo - t.t) <= 0.011
  union all
  select d.order_id,coalesce(d.documento_id,d.invoice_id),coalesce(d.pagato_il,d.scadenza),d.pagato_lordo
    from public.commessa_documenti_credito(p_company) d join public.orders o on o.id=d.order_id
   where o.order_type='appaltatore_lavoro' and o.valorizzazione='a_misura' and d.pagato_lordo>0
$function$;

CREATE OR REPLACE FUNCTION public.rate_da_incassare(p_company uuid)
 RETURNS TABLE(order_id uuid, installment_id uuid, expected_date date, residuo numeric, finanziamento boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with o as (
    select o.id,
           case when o.order_type='appaltatore_lavoro' and o.valorizzazione='a_misura'
             then coalesce((select sum(c.credito_lordo) from public.commessa_documenti_credito(p_company) c where c.order_id=o.id),0)
             else round((coalesce(o.total_amount, 0)
                  + coalesce((select sum(coalesce(v.impatto_economico, 0)) from public.ordini_variazione v
                               where v.order_id = o.id and v.status = 'approvato'), 0))
                 * (1 + coalesce(o.vat_rate, 22) / 100), 2)
           - case when o.payment_type = 'financing' and o.financing_cost_mode is distinct from 'separato' then coalesce(o.financing_cost, 0) else 0 end end as totale
      from public.orders o
     where o.company_id = p_company and o.deleted_at is null
  ),
  r as (select * from public.rate_importi(p_company)),
  incassato as (select x.order_id, sum(x.importo) as i from public.rate_incassi(p_company) x group by x.order_id),
  righe as (
    select r.order_id, r.installment_id, r.expected_date,
           greatest(0, r.importo - coalesce(d.importo_pagato, 0)
                     - case when d.id is null then 0 else public.documento_stornato_totale(d.id) end) as residuo,
           r.type = 'financing' as finanziamento
      from r left join public.documenti_fiscali d on d.id = r.documento_fiscale_id
     where not r.is_paid and not exists(select 1 from public.orders oo where oo.id=r.order_id and oo.order_type='appaltatore_lavoro' and oo.valorizzazione='a_misura')
    union all
    select c.order_id,coalesce(c.documento_id,c.invoice_id),c.scadenza,greatest(0,c.credito_lordo-c.pagato_lordo),false
      from public.commessa_documenti_credito(p_company) c join public.orders oo on oo.id=c.order_id
     where oo.order_type='appaltatore_lavoro' and oo.valorizzazione='a_misura'
    union all
    -- La parte del totale che nessuna rata copre: piano senza saldo, variante dopo il saldo pagato,
    -- o commessa senza alcun piano (deve tutto il suo totale).
    select s.order_id, null::uuid, null::date, s.scoperto, false
      from (select o.id as order_id, round(o.totale - coalesce(sum(r.importo), 0), 2) as scoperto
              from o left join r on r.order_id = o.id
             group by o.id, o.totale) s
     where s.scoperto > 0
  ),
  ordinate as (
    select righe.*,
           sum(righe.residuo) over (partition by righe.order_id
                                    order by righe.expected_date nulls last, righe.installment_id nulls last
                                    rows unbounded preceding) as cumulato
      from righe
  )
  -- Mai oltre il totale meno l'incassato: l'eccedenza del piano si toglie dalle rate più lontane.
  select ord.order_id, ord.installment_id, ord.expected_date,
         greatest(0, least(ord.residuo, greatest(0, o.totale - coalesce(inc.i, 0)) - (ord.cumulato - ord.residuo))),
         ord.finanziamento
    from ordinate ord
    join o on o.id = ord.order_id
    left join incassato inc on inc.order_id = ord.order_id
$function$;

CREATE OR REPLACE FUNCTION public.commessa_quadro_pagamenti(p_order_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
WITH o AS (
  SELECT id, company_id, coalesce(vat_rate, 22) AS iva FROM public.orders WHERE id = p_order_id AND deleted_at IS NULL
),
oggi AS (SELECT (now() AT TIME ZONE 'Europe/Rome')::date AS d),
rate AS (
  SELECT i.id, i.position, i.label, i.type, i.amount, i.is_paid, i.paid_date, i.expected_date,
         coalesce(inv.invoice_number, df.numero) AS fattura,
         (NOT i.is_paid AND i.expected_date IS NOT NULL AND i.expected_date < (SELECT d FROM oggi)) AS scaduta
    FROM public.order_installments i
    JOIN o ON o.id = i.order_id
    LEFT JOIN public.invoices inv ON inv.id = i.invoice_id AND inv.deleted_at IS NULL
    LEFT JOIN public.documenti_fiscali df ON df.id = i.documento_fiscale_id AND df.deleted_at IS NULL
),
sal_cliente AS (
  SELECT s.id, s.numero_sal, s.data_emissione, s.stato, s.importo_totale, s.maturato_il,
         r.label AS rata, r.is_paid AS incassato,
         round(s.importo_totale - coalesce(p.precedente, 0), 2) AS importo_sal,
         round((s.importo_totale - coalesce(p.precedente, 0)) * (1 + o.iva / 100), 2) AS importo_sal_ivato,
         o.iva AS iva_pct
    FROM public.sal_records s
    JOIN o ON o.id = s.order_id
    LEFT JOIN public.order_installments r ON r.id = s.installment_id
    LEFT JOIN LATERAL (
      SELECT x.importo_totale AS precedente FROM public.sal_records x
       WHERE x.order_id = s.order_id AND x.id <> s.id AND x.numero_sal < s.numero_sal
         AND x.stato IN ('emesso', 'approvato', 'firmato')
       ORDER BY x.numero_sal DESC LIMIT 1
    ) p ON true
),
costi AS (
  SELECT c.*,
         CASE
           WHEN jsonb_typeof(c.allocations) = 'array' AND jsonb_array_length(c.allocations) > 0 THEN
             coalesce((SELECT sum(CASE WHEN (a->>'pct') ~ '^[0-9]+(\.[0-9]+)?$' THEN (a->>'pct')::numeric ELSE 0 END)
                         FROM jsonb_array_elements(c.allocations) a
                        WHERE a->>'order_id' = p_order_id::text), 0) / 100
           ELSE 1
         END AS quota
    FROM public.company_costs c
    JOIN o ON o.company_id = c.company_id
   WHERE c.order_id = p_order_id
      OR (jsonb_typeof(c.allocations) = 'array'
          AND c.allocations @> jsonb_build_array(jsonb_build_object('order_id', p_order_id::text)))
),
costi_calc AS (
  SELECT c.id, c.name, c.due_date, c.is_paid, c.paid_date, c.quota, c.senza_fattura, c.allegato_path,
         c.purchase_order_id, c.order_external_team_id, c.supplier_id,
         s.name AS fornitore, s.tipo AS tipo_fornitore, c.category,
         po.oda_number,
         et.name AS ditta,
         f.numeri AS fatture, f.totale AS totale_fatture,
         round(coalesce(f.totale, c.amount * (1 + coalesce(c.vat_rate, 0) / 100)), 2) AS totale,
         coalesce(pn.pagato, 0) AS pagato_pn,
         (SELECT min(r.scadenza) FROM public.rate_fornitori r
           WHERE r.company_cost_id = c.id AND r.stato = 'da_pagare') AS prossima_rata,
         (SELECT min(d.due_date) FROM public.scadenze d
           WHERE d.cost_id = c.id AND d.direction = 'uscita' AND d.status IN ('da_pagare', 'parziale')) AS prossima_scadenza
    FROM costi c
    LEFT JOIN public.suppliers s ON s.id = c.supplier_id
    LEFT JOIN public.purchase_orders po ON po.id = c.purchase_order_id
    LEFT JOIN public.order_external_teams oet ON oet.id = c.order_external_team_id
    LEFT JOIN public.external_teams et ON et.id = oet.external_team_id
    LEFT JOIN LATERAL (
      SELECT string_agg(coalesce(fr.numero_fattura, 's/n'), ', ' ORDER BY fr.data_fattura) AS numeri,
             sum(CASE WHEN fr.tipo_documento IN ('TD04', 'TD08', 'passive_credit_note') THEN -abs(fr.totale_documento) ELSE fr.totale_documento END) - public.costo_stornato_da_note(c.id) AS totale
        FROM public.fatture_ricevute fr
       WHERE fr.company_cost_id = c.id AND fr.company_id = c.company_id
         AND coalesce(fr.stato, '') NOT IN ('annullata', 'scartata', 'rifiutata')
    ) f ON true
    LEFT JOIN LATERAL (
      SELECT sum(CASE WHEN p.direction = 'uscita' THEN p.amount ELSE -p.amount END) AS pagato
        FROM public.prima_nota_entries p
       WHERE p.company_id = c.company_id
         AND (p.cost_id = c.id OR EXISTS (SELECT 1 FROM public.scadenze d
                                           WHERE d.id = p.scadenza_id AND d.cost_id = c.id))
    ) pn ON true
   WHERE c.quota > 0
     AND NOT EXISTS (SELECT 1 FROM public.fatture_ricevute frs
                      JOIN public.contratti_subappalto ks ON ks.id = frs.contratto_subappalto_id
                     WHERE frs.company_cost_id = c.id AND ks.order_id = p_order_id
                       AND (frs.sal_subappaltatore_id IS NOT NULL
                            OR EXISTS (SELECT 1 FROM public.sal_subappaltatori sx WHERE sx.contratto_id = ks.id)))
),
uscite_costi AS (
  SELECT
    'costo:' || c.id AS chiave,
    CASE
      WHEN c.order_external_team_id IS NOT NULL OR c.tipo_fornitore = 'subappalto' THEN 'subappalti'
      WHEN c.tipo_fornitore = 'professionisti' THEN 'professionisti'
      WHEN c.tipo_fornitore IN ('noli_servizi', 'mezzi') THEN 'noleggi'
      WHEN c.tipo_fornitore IS NULL AND c.purchase_order_id IS NULL AND lower(c.category) = 'subappalti' THEN 'subappalti'
      WHEN c.tipo_fornitore IS NULL AND c.purchase_order_id IS NULL AND lower(c.category) IN ('consulenze_professionali', 'progettazione', 'direzione lavori') THEN 'professionisti'
      WHEN c.tipo_fornitore IS NULL AND c.purchase_order_id IS NULL AND lower(c.category) ~ 'nolegg|noli|nolo' THEN 'noleggi'
      WHEN c.tipo_fornitore = 'materiali' OR c.purchase_order_id IS NOT NULL THEN 'materiali'
      WHEN c.supplier_id IS NOT NULL AND c.tipo_fornitore IS NULL AND NOT c.senza_fattura THEN 'materiali'
      ELSE 'extra'
    END AS categoria,
    coalesce(c.fornitore, c.ditta) AS controparte,
    c.name AS descrizione,
    CASE WHEN c.oda_number IS NOT NULL THEN 'OdA ' || c.oda_number END AS riferimento,
    round(c.totale * c.quota, 2) AS importo,
    c.fatture,
    c.senza_fattura,
    c.allegato_path IS NOT NULL AS ha_ricevuta,
    round(least(c.totale, CASE WHEN c.is_paid AND c.pagato_pn = 0 THEN c.totale ELSE c.pagato_pn END) * c.quota, 2) AS pagato,
    CASE WHEN c.is_paid AND c.pagato_pn = 0 THEN c.paid_date END AS pagato_il,
    coalesce(c.prossima_rata, c.prossima_scadenza, c.due_date) AS scadenza,
    c.quota < 1 AS ripartito,
    round(c.quota * 100, 2) AS quota_pct,
    'costo' AS origine_tipo, c.id AS origine_id
  FROM costi_calc c
),
uscite_oda AS (
  SELECT 'oda:' || po.id AS chiave, 'materiali' AS categoria, s.name AS controparte,
         'Ordine d''acquisto' AS descrizione, 'OdA ' || po.oda_number AS riferimento,
         round(coalesce(po.total, po.subtotal * 1.22, 0), 2) AS importo,
         NULL::text AS fatture, false AS senza_fattura, false AS ha_ricevuta,
         0::numeric AS pagato, NULL::date AS pagato_il,
         po.expected_delivery_date::date AS scadenza,
         false AS ripartito, 100::numeric AS quota_pct,
         'oda' AS origine_tipo, po.id AS origine_id
    FROM public.purchase_orders po
    JOIN o ON o.id = po.order_id AND o.company_id = po.company_id
    LEFT JOIN public.suppliers s ON s.id = po.supplier_id
   WHERE coalesce(po.status, '') NOT IN ('bozza', 'annullato', 'cancelled', 'draft')
     AND NOT EXISTS (SELECT 1 FROM public.company_costs cc WHERE cc.purchase_order_id = po.id)
     AND NOT EXISTS (SELECT 1 FROM public.fatture_ricevute fr WHERE fr.purchase_order_id = po.id)
),
sal_sub AS (
  SELECT ss.*,
         CASE WHEN ss.stato = 'pagato' THEN greatest(coalesce(ss.pagato_registrato, 0), coalesce(ss.importo_netto, 0))
              ELSE coalesce(ss.pagato_registrato, 0) END AS pagato
    FROM public.sal_subappaltatori ss
    JOIN o ON o.id = ss.order_id AND o.company_id = ss.company_id
),
uscite_sub_base AS (
  SELECT 'sub:' || coalesce(k.id::text, 'senza:' || sub.id::text) AS chiave,
         'subappalti' AS categoria,
         sub.ragione_sociale AS controparte,
         coalesce(k.descrizione_lavori, 'SAL senza contratto') AS descrizione,
         CASE WHEN k.numero_contratto IS NOT NULL THEN 'Contratto ' || k.numero_contratto END AS riferimento,
         coalesce(sum(ss.importo_netto), 0) AS importo,
         CASE WHEN count(ss.id) > 0 THEN count(ss.id) || ' SAL' END AS fatture,
         false AS senza_fattura, false AS ha_ricevuta,
         coalesce(sum(ss.pagato), 0) AS pagato,
         NULL::date AS pagato_il,
         min(ss.data_emissione) FILTER (WHERE ss.stato <> 'pagato') AS scadenza,
         false AS ripartito, 100::numeric AS quota_pct,
         'subappalto' AS origine_tipo, coalesce(k.id, sub.id) AS origine_id,
         k.importo_contrattuale + coalesce(k.oneri_sicurezza, 0) AS contratto,
         coalesce(sum(ss.importo_lordo), 0) AS maturato_lordo,
         coalesce(sum(ss.ritenuta_importo), 0) AS ritenute,
         sub.campo_subappaltatore_id AS campo_id
    FROM (SELECT DISTINCT ss.contratto_id, ss.subappaltatore_id FROM sal_sub ss
          UNION
          SELECT k.id, k.subappaltatore_id FROM public.contratti_subappalto k JOIN o ON o.id = k.order_id
           WHERE coalesce(k.stato, '') NOT IN ('annullato', 'bozza')) g
    LEFT JOIN public.contratti_subappalto k ON k.id = g.contratto_id
    LEFT JOIN public.subappaltatori_sicurezza sub ON sub.id = coalesce(k.subappaltatore_id, g.subappaltatore_id)
    LEFT JOIN sal_sub ss ON (ss.contratto_id = g.contratto_id)
                         OR (g.contratto_id IS NULL AND ss.contratto_id IS NULL AND ss.subappaltatore_id = g.subappaltatore_id)
   GROUP BY k.id, sub.id, sub.ragione_sociale, k.descrizione_lavori, k.numero_contratto, k.importo_contrattuale, k.oneri_sicurezza, sub.campo_subappaltatore_id
),
uscite_sub AS (
  SELECT b.*, x.iva_pct, x.reverse_charge
    FROM uscite_sub_base b
    CROSS JOIN LATERAL (
      SELECT CASE WHEN coalesce(d.vat_rate, 0) > 0 THEN d.vat_rate ELSE (SELECT iva FROM o) END AS iva_pct,
             NOT (coalesce(d.vat_rate, 0) > 0) AS reverse_charge
        FROM (SELECT (SELECT et.vat_rate FROM public.external_teams et
                       WHERE et.subappaltatore_id = b.campo_id AND et.company_id = (SELECT company_id FROM o)
                       ORDER BY (coalesce(et.vat_rate, 0) > 0) DESC LIMIT 1) AS vat_rate) d
    ) x
),
uscite_ditte AS (
  SELECT 'ditta:' || oet.id AS chiave, 'subappalti' AS categoria, et.name AS controparte,
         coalesce(nullif(oet.notes, ''), 'Lavoro della ditta') AS descrizione, NULL::text AS riferimento,
         round(coalesce(oet.total_cost, 0), 2) AS importo,
         NULL::text AS fatture, false AS senza_fattura, false AS ha_ricevuta,
         CASE WHEN oet.is_paid THEN round(coalesce(oet.total_cost, 0), 2) ELSE 0 END AS pagato,
         oet.paid_date AS pagato_il, oet.payment_date AS scadenza,
         false AS ripartito, 100::numeric AS quota_pct,
         'ditta' AS origine_tipo, oet.id AS origine_id,
         CASE WHEN coalesce(oet.vat_rate, et.vat_rate, 0) > 0 THEN coalesce(oet.vat_rate, et.vat_rate) ELSE o.iva END AS iva_pct,
         NOT (coalesce(oet.vat_rate, et.vat_rate, 0) > 0) AS reverse_charge,
         CASE WHEN NOT (coalesce(oet.vat_rate, et.vat_rate, 0) > 0) THEN round(coalesce(oet.total_cost, 0) * o.iva / 100, 2) END AS iva_da_versare
    FROM public.order_external_teams oet
    JOIN o ON o.id = oet.order_id
    LEFT JOIN public.external_teams et ON et.id = oet.external_team_id
   WHERE coalesce(oet.total_cost, 0) > 0
     AND NOT EXISTS (SELECT 1 FROM public.company_costs cc WHERE cc.order_external_team_id = oet.id)
     AND NOT EXISTS (SELECT 1 FROM public.contratti_subappalto k
                       JOIN public.subappaltatori_sicurezza ks ON ks.id = k.subappaltatore_id
                      WHERE k.order_id = p_order_id AND coalesce(k.stato, '') NOT IN ('annullato', 'bozza')
                        AND et.subappaltatore_id IS NOT NULL
                        AND (ks.campo_subappaltatore_id = et.subappaltatore_id OR ks.id = et.subappaltatore_id)
                        AND EXISTS (SELECT 1 FROM public.sal_subappaltatori sx WHERE sx.contratto_id = k.id))
),
uscite AS (
  SELECT chiave, categoria, controparte, descrizione, riferimento, importo, fatture, senza_fattura, ha_ricevuta,
         pagato, pagato_il, scadenza, ripartito, quota_pct, origine_tipo, origine_id,
         NULL::numeric AS contratto, NULL::numeric AS maturato_lordo, NULL::numeric AS ritenute,
         NULL::numeric AS iva_pct, NULL::boolean AS reverse_charge, NULL::numeric AS iva_da_versare
    FROM uscite_costi
  UNION ALL SELECT chiave, categoria, controparte, descrizione, riferimento, importo, fatture, senza_fattura, ha_ricevuta,
         pagato, pagato_il, scadenza, ripartito, quota_pct, origine_tipo, origine_id, NULL, NULL, NULL, NULL, NULL, NULL FROM uscite_oda
  UNION ALL SELECT chiave, categoria, controparte, descrizione, riferimento,
         round(importo * f, 2), fatture, senza_fattura, ha_ricevuta,
         round(pagato * f, 2), pagato_il, scadenza, ripartito, quota_pct, origine_tipo, origine_id,
         round(contratto * f, 2), round(maturato_lordo * f, 2), round(ritenute * f, 2),
         iva_pct, reverse_charge, iva_da_versare FROM (
           SELECT us.*, CASE WHEN us.reverse_charge THEN 1 ELSE 1 + us.iva_pct / 100 END AS f,
                  CASE WHEN us.reverse_charge THEN round(us.maturato_lordo * us.iva_pct / 100, 2) END AS iva_da_versare
             FROM uscite_sub us) x
  UNION ALL SELECT chiave, categoria, controparte, descrizione, riferimento, importo, fatture, senza_fattura, ha_ricevuta,
         pagato, pagato_il, scadenza, ripartito, quota_pct, origine_tipo, origine_id, NULL, NULL, NULL, iva_pct, reverse_charge, iva_da_versare FROM uscite_ditte
),
uscite_stato AS (
  SELECT u.*,
         greatest(u.importo - u.pagato, 0) AS residuo,
         CASE
           WHEN u.origine_tipo = 'oda' THEN 'fattura_da_arrivare'
           WHEN u.importo > 0 AND u.pagato >= u.importo - 0.01 THEN 'pagato'
           WHEN u.scadenza IS NOT NULL AND u.scadenza < (SELECT d FROM oggi) AND u.origine_tipo <> 'subappalto' THEN 'scaduto'
           WHEN u.pagato > 0 THEN 'parziale'
           WHEN u.importo = 0 THEN 'da_maturare'
           ELSE 'da_pagare'
         END AS stato
    FROM uscite u
)
SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM o) THEN NULL ELSE jsonb_build_object(
  'oggi', (SELECT d FROM oggi),
  'crediti_misura', case when exists(select 1 from public.orders oo where oo.id=p_order_id and oo.order_type='appaltatore_lavoro' and oo.valorizzazione='a_misura')
    then public.commessa_crediti_misura(p_order_id) end,
  'rate', coalesce((SELECT jsonb_agg(to_jsonb(r) ORDER BY r.position NULLS LAST, r.expected_date) FROM rate r), '[]'::jsonb),
  'sal_cliente', coalesce((SELECT jsonb_agg(to_jsonb(s) ORDER BY s.numero_sal) FROM sal_cliente s), '[]'::jsonb),
  'uscite', coalesce((SELECT jsonb_agg(to_jsonb(u) ORDER BY
                        CASE u.stato WHEN 'scaduto' THEN 0 WHEN 'da_pagare' THEN 1 WHEN 'parziale' THEN 1
                                     WHEN 'fattura_da_arrivare' THEN 2 WHEN 'da_maturare' THEN 3 ELSE 4 END,
                        u.scadenza NULLS LAST, u.controparte) FROM uscite_stato u), '[]'::jsonb),
  'mezzi_stimati', (SELECT jsonb_build_object('costo', m.costo_mezzi_stimato, 'mezzi', m.mezzi_usati, 'giorni', m.giorni_mezzo)
                      FROM public.v_ordine_costi_mezzi_stimati m WHERE m.order_id = p_order_id LIMIT 1)
) END
$function$;

-- The source marker is immutable provenance at the row level, including across copied revisions.
create unique index if not exists generale_piano_fonte_unica
on public.generale_piano_voci (versione_id, (substring(nota from '\[EIC-BP:[a-f0-9]{64}:[^]]+:[0-9]+\]')))
where nota like '%[EIC-BP:%';

create or replace function public.fattura_riga_ordine_azienda_guardia()
returns trigger language plpgsql security invoker set search_path = public as $$
begin
  if jsonb_typeof(new.righe) = 'array' and exists (
    select 1 from jsonb_array_elements(new.righe) r
    where nullif(r->>'purchase_order_item_id', '') is not null and not exists (
      select 1 from public.purchase_order_items i where i.id::text = r->>'purchase_order_item_id' and i.company_id = new.company_id)) then
    raise exception 'La riga di ordine non appartiene alla società della fattura.' using errcode = '22023';
  end if;
  return new;
end;
$$;
revoke all on function public.fattura_riga_ordine_azienda_guardia() from public;
drop trigger if exists fattura_riga_ordine_azienda_guardia on public.fatture_ricevute;
create trigger fattura_riga_ordine_azienda_guardia before insert or update of righe, company_id on public.fatture_ricevute
for each row execute function public.fattura_riga_ordine_azienda_guardia();

ELSE INSERT INTO private.recovered_dependency_patches(id) VALUES ('20261111164624_commesse_incassi_crediti_budget.sql') ON CONFLICT DO NOTHING;
END IF; END $defer_commesse_0$;
