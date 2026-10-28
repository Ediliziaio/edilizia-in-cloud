set local lock_timeout='3s';
set local statement_timeout='60s';

-- Prima Nota rimane il registro monetario. Nessuna nuova tabella di cassa.
alter table public.prima_nota_entries add column if not exists payment_request_id uuid;
alter table public.prima_nota_entries add column if not exists payment_payload jsonb;
alter table public.prima_nota_entries add column if not exists reversal_of uuid references public.prima_nota_entries(id);
alter table public.prima_nota_entries add column if not exists sal_sub_id uuid references public.sal_subappaltatori(id);
create unique index if not exists pn_payment_request_unique on public.prima_nota_entries(company_id,payment_request_id) where payment_request_id is not null;
create unique index if not exists pn_reversal_unique on public.prima_nota_entries(reversal_of) where reversal_of is not null;
alter table public.sal_subappaltatori add column if not exists pagato_registrato numeric(14,2);
create table if not exists public.sal_sub_pagamenti (
 company_id uuid not null references public.companies(id),
 sal_id uuid not null references public.sal_subappaltatori(id),
 prima_nota_id uuid not null references public.prima_nota_entries(id),
 importo numeric(14,2) not null check(importo>0),
 request_id uuid not null,
 payload jsonb not null,
 unique(company_id,request_id),
 created_at timestamptz not null default now(),
 primary key(sal_id,prima_nota_id)
);
alter table public.sal_sub_pagamenti enable row level security;
revoke all on public.sal_sub_pagamenti from anon,authenticated;
grant select,insert on public.sal_sub_pagamenti to authenticated;
drop policy if exists sal_quote_read on public.sal_sub_pagamenti;
create policy sal_quote_read on public.sal_sub_pagamenti for select to authenticated using (
 public.has_permission_for_company(auth.uid(),'can_view_costs',company_id)
 and public.has_permission_for_company(auth.uid(),'can_view_subappaltatori_amministrazione',company_id));
-- Scritture solamente dalle funzioni definite sotto (SECURITY DEFINER con controlli espliciti).
revoke insert on public.sal_sub_pagamenti from authenticated;

create or replace function public.spesa_pagamento_autorizza(p_company uuid)
returns void language plpgsql security invoker set search_path='' as $$
begin
 if auth.uid() is null or public.utente_bloccato() or public.utente_sola_lettura(p_company)
 or not public.user_can_access_company(p_company)
 or not (coalesce(public.has_permission_for_company(auth.uid(),'can_view_costs',p_company),false)
         or public.user_can_write_accountant_company(p_company)) then
  raise exception 'Pagamento non autorizzato per questa azienda' using errcode='42501';
 end if;
end $$;

create or replace function public.spesa_pagamento_totale(p_costo uuid)
returns numeric language plpgsql stable security invoker set search_path='' as $$
declare azienda uuid; valore numeric;
begin
 select company_id into azienda from public.company_costs where id=p_costo;
 perform public.spesa_pagamento_autorizza(azienda);
 select round(coalesce((select sum(case when f.tipo_documento in ('TD04','TD08') then -abs(f.totale_documento) else f.totale_documento end)
 from public.fatture_ricevute f where f.company_cost_id=c.id and f.company_id=c.company_id
 and coalesce(f.stato,'') not in ('annullata','scartata','rifiutata')),
 c.amount*(1+coalesce(c.vat_rate,0)/100)),2) into valore from public.company_costs c where c.id=p_costo;
 return valore;
end $$;

create or replace function public.spesa_pagamento_sincronizza(p_costo uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare c public.company_costs; totale numeric; pagato numeric; residuo numeric; quota numeric; s record; ultima date;
begin
 select * into c from public.company_costs where id=p_costo for update;
 perform public.spesa_pagamento_autorizza(c.company_id);
 totale:=public.spesa_pagamento_totale(c.id);
 select coalesce(sum(case when p.direction='uscita' then p.amount else -p.amount end),0),max(p.entry_date)
 into pagato,ultima from public.prima_nota_entries p where p.company_id=c.company_id and
 (p.cost_id=c.id or exists(select 1 from public.scadenze d where d.id=p.scadenza_id and d.cost_id=c.id and d.company_id=c.company_id));
 if c.is_paid and pagato=0 and not exists(select 1 from public.prima_nota_entries where cost_id=c.id and reversal_of is not null) then raise exception 'Pagamento storico da riconciliare'; end if;
 if totale is null or totale<=0 or pagato<0 or pagato>totale+0.01 then raise exception 'Importi da riconciliare prima di registrare pagamenti'; end if;
 -- Non cambia il costo imponibile: il pagamento modifica soltanto la cassa.
 update public.company_costs set is_paid=(pagato>=totale),paid_date=case when pagato>=totale then ultima else null end where id=c.id;
 residuo:=pagato;
 for s in select * from public.scadenze where cost_id=c.id and company_id=c.company_id and direction='uscita' and status<>'annullata' order by due_date,id for update loop
  quota:=least(s.amount,greatest(0,residuo)); residuo:=residuo-quota;
  update public.scadenze set paid_amount=quota,status=case when quota>=amount then 'pagata' when quota>0 then 'parziale' else 'da_pagare' end,
   paid_date=case when quota>0 then ultima else null end where id=s.id;
 end loop;
 return jsonb_build_object('totale',totale,'pagato',pagato,'residuo',greatest(0,totale-pagato));
end $$;

create or replace function public.registra_pagamento_costo(
 p_costo uuid,p_richiesta uuid,p_importo numeric default null,p_data date default current_date,
 p_metodo text default 'bonifico',p_riferimento text default null,p_banca uuid default null,p_esistente uuid default null
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare c public.company_costs; pn public.prima_nota_entries; tx public.bank_transactions;
 totale numeric; pagato numeric; importo numeric; payload jsonb; risultato jsonb; idpn uuid; altra numeric;
begin
 select * into c from public.company_costs where id=p_costo;
 if c.id is null then raise exception 'Costo non disponibile'; end if;
 perform public.spesa_pagamento_autorizza(c.company_id);
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(c.company_id::text,2810));
 select * into c from public.company_costs where id=p_costo for update;
 if p_richiesta is null or p_data is null or p_data>current_date or length(coalesce(p_riferimento,''))>500
 or p_importo::text in ('NaN','Infinity','-Infinity') or (p_importo is not null and (p_importo<=0 or p_importo<>round(p_importo,2))) then raise exception 'Dati pagamento non validi'; end if;
 payload:=jsonb_build_object('costo',p_costo,'importo',p_importo,'data',p_data,'metodo',p_metodo,'riferimento',p_riferimento,'banca',p_banca,'esistente',p_esistente);
 select * into pn from public.prima_nota_entries where company_id=c.company_id and payment_request_id=p_richiesta;
 if pn.id is not null then
  if pn.payment_payload is distinct from payload then raise exception 'Richiesta già usata con dati diversi'; end if;
  return public.spesa_pagamento_sincronizza(c.id)||jsonb_build_object('prima_nota_id',pn.id,'gia_registrato',true);
 end if;
 totale:=public.spesa_pagamento_totale(c.id);
 select coalesce(sum(case when p.direction='uscita' then p.amount else -p.amount end),0) into pagato
 from public.prima_nota_entries p where p.company_id=c.company_id and (p.cost_id=c.id or exists(select 1 from public.scadenze d where d.id=p.scadenza_id and d.cost_id=c.id and d.company_id=c.company_id));
 select coalesce(sum(paid_amount),0) into altra from public.scadenze where cost_id=c.id and company_id=c.company_id and direction='uscita' and status<>'annullata';
 if (c.is_paid and pagato=0) or altra>pagato+0.01 then raise exception 'Pagamento storico da riconciliare: nessuna nuova uscita creata'; end if;
 if p_esistente is not null then
  select * into pn from public.prima_nota_entries where id=p_esistente and company_id=c.company_id and direction='uscita' for update;
  if pn.id is null or pn.cost_id is distinct from c.id or exists(select 1 from public.prima_nota_entries where reversal_of=pn.id) then raise exception 'Pagamento esistente non valido per questo costo'; end if;
  if p_banca is null then raise exception 'Scegli il movimento bancario da collegare'; end if;
  idpn:=pn.id; importo:=pn.amount;
 else
  if p_banca is not null and pagato>0 then raise exception 'Sono già presenti pagamenti: collega quello esistente o registra separatamente il nuovo acconto'; end if;
  importo:=coalesce(p_importo,totale-pagato);
  if importo is null or importo<=0 or pagato+importo>totale then
   if p_importo is null and pagato>=totale and p_banca is null then return jsonb_build_object('gia_registrato',true,'pagato',pagato,'residuo',0); end if;
   raise exception 'Importo superiore al residuo o documento già pagato';
  end if;
 end if;
 if p_banca is not null then
  select * into tx from public.bank_transactions where id=p_banca and company_id=c.company_id for update;
  if tx.id is null or tx.transaction_type<>'debit' or coalesce(tx.currency,'EUR')<>'EUR' or abs(tx.amount)<>importo then raise exception 'Movimento non compatibile: importo o azienda diversi'; end if;
  if (pn.bank_transaction_id is not null and pn.bank_transaction_id<>tx.id)
   or exists(select 1 from public.prima_nota_entries where bank_transaction_id=tx.id and id is distinct from idpn)
   or exists(select 1 from public.bank_reconciliations where transaction_id=tx.id and unmatched_at is null)
   or tx.linked_invoice_id is not null or tx.linked_installment_id is not null or tx.linked_scadenza_id is not null
   or (tx.reconciliation_status='reconciled' and (tx.linked_cost_id is distinct from c.id or idpn is null))
   or (tx.linked_cost_id is not null and tx.linked_cost_id<>c.id) then raise exception 'Movimento bancario già abbinato'; end if;
 end if;
 if idpn is null then
  insert into public.prima_nota_entries(company_id,direction,category,description,amount,entry_date,payment_method,reference_number,cost_id,order_id,supplier_id,is_auto,auto_source,created_by,payment_request_id,payment_payload,bank_transaction_id)
  values(c.company_id,'uscita','fornitore','Pagamento: '||c.name,importo,p_data,p_metodo,p_riferimento,c.id,c.order_id,c.supplier_id,true,'company_cost_payment',auth.uid(),p_richiesta,payload,p_banca) returning id into idpn;
 elsif p_banca is not null then
  update public.prima_nota_entries set bank_transaction_id=p_banca where id=idpn;
 end if;
 if p_banca is not null then
  update public.bank_transactions set linked_cost_id=c.id,reconciliation_status='reconciled',reconciled_at=now() where id=p_banca;
 end if;
 risultato:=public.spesa_pagamento_sincronizza(c.id);
 return risultato||jsonb_build_object('prima_nota_id',idpn,'gia_registrato',p_esistente is not null);
end $$;

create or replace function public.storna_pagamenti_costo(p_costo uuid,p_data date default current_date)
returns void language plpgsql security invoker set search_path='' as $$
declare c public.company_costs; p record;
begin
 select * into c from public.company_costs where id=p_costo;
 perform public.spesa_pagamento_autorizza(c.company_id);
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(c.company_id::text,2810));
 perform 1 from public.company_costs where id=p_costo for update;
 if p_data is null or p_data>current_date then raise exception 'Data storno non valida'; end if;
 if exists(select 1 from public.prima_nota_entries where cost_id=p_costo and (bank_transaction_id is not null or sal_sub_id is not null))
 or exists(select 1 from public.sal_sub_pagamenti q join public.prima_nota_entries p on p.id=q.prima_nota_id where p.cost_id=p_costo)
 then raise exception 'Pagamento collegato a banca o SAL: riconcilia i collegamenti prima dello storno'; end if;
 if c.is_paid and not exists(select 1 from public.prima_nota_entries where cost_id=p_costo) then raise exception 'Pagamento storico da verificare'; end if;
 for p in select * from public.prima_nota_entries x where x.cost_id=p_costo and x.company_id=c.company_id and x.direction='uscita'
 and not exists(select 1 from public.prima_nota_entries r where r.reversal_of=x.id) for update loop
  insert into public.prima_nota_entries(company_id,direction,category,description,amount,entry_date,cost_id,order_id,is_auto,auto_source,created_by,reversal_of)
  values(c.company_id,'entrata','storno','Storno pagamento: '||c.name,p.amount,p_data,c.id,c.order_id,true,'storno_pagamento',auth.uid(),p.id);
 end loop;
 perform public.spesa_pagamento_sincronizza(c.id);
end $$;

-- Le quote SAL classificano una Prima Nota già esistente: non sono una seconda uscita.
create or replace function public.registra_pagamento_sal_sub(
 p_sal uuid,p_richiesta uuid,p_importo numeric,p_data date,p_metodo text default 'bonifico',
 p_riferimento text default null,p_costo uuid default null,p_esistente uuid default null
) returns jsonb language plpgsql security definer set search_path='' as $$
declare s public.sal_subappaltatori; pn public.prima_nota_entries; pagato numeric; usato numeric; costo uuid; num integer; idpn uuid; r jsonb; v_payload jsonb;
begin
 select * into s from public.sal_subappaltatori where id=p_sal;
 if s.id is null then raise exception 'SAL non disponibile'; end if;
 perform public.spesa_pagamento_autorizza(s.company_id);
 if not coalesce(public.has_permission_for_company(auth.uid(),'can_edit_orders',s.company_id),false)
 or not coalesce(public.has_permission_for_company(auth.uid(),'can_view_subappaltatori_amministrazione',s.company_id),false) then raise exception 'Gestione SAL non autorizzata' using errcode='42501'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(s.company_id::text,2810));
 select * into s from public.sal_subappaltatori where id=p_sal for update;
 if p_richiesta is null or p_importo is null or p_importo<=0 or p_importo>9999999999.99 or p_importo<>round(p_importo,2)
 or p_data is null or p_data>current_date or length(coalesce(p_riferimento,''))>500 then raise exception 'Dati pagamento non validi'; end if;
 v_payload:=jsonb_build_object('sal',p_sal,'importo',p_importo,'data',p_data,'metodo',p_metodo,'riferimento',p_riferimento,'costo',p_costo,'esistente',p_esistente);
 select p.* into pn from public.sal_sub_pagamenti q join public.prima_nota_entries p on p.id=q.prima_nota_id where q.company_id=s.company_id and q.request_id=p_richiesta;
 if pn.id is not null then
  if not exists(select 1 from public.sal_sub_pagamenti where company_id=s.company_id and request_id=p_richiesta and sal_id=s.id and payload=v_payload) then raise exception 'Richiesta già usata con dati diversi'; end if;
  return jsonb_build_object('prima_nota_id',pn.id,'gia_registrato',true);
 end if;
 if s.stato not in ('verificato','pagato') then raise exception 'Approva il SAL prima di registrare il pagamento'; end if;
 if s.stato='pagato' and s.pagato_registrato is null then raise exception 'Pagamento SAL storico da riconciliare'; end if;
 select coalesce(sum(q.importo),0) into pagato from public.sal_sub_pagamenti q where q.sal_id=s.id;
 if pagato+p_importo>s.importo_netto then raise exception 'Importo superiore al residuo SAL'; end if;
 select count(distinct f.company_cost_id),min(f.company_cost_id::text)::uuid into num,costo from public.fatture_ricevute f
 where f.company_id=s.company_id and f.contratto_subappalto_id=s.contratto_id and coalesce(f.stato,'') not in ('annullata','scartata','rifiutata');
 if p_costo is not null then
  if not exists(select 1 from public.fatture_ricevute where company_id=s.company_id and contratto_subappalto_id=s.contratto_id and company_cost_id=p_costo) then raise exception 'Fattura non appartenente al contratto'; end if;
  costo:=p_costo;
 elsif num>1 and p_esistente is null then raise exception 'Più fatture presenti: seleziona il costo della fattura da pagare'; end if;
 if p_esistente is not null then
  select * into pn from public.prima_nota_entries where id=p_esistente and company_id=s.company_id and direction='uscita' for update;
  if pn.id is null or exists(select 1 from public.prima_nota_entries where reversal_of=pn.id)
   or not (exists(select 1 from public.fatture_ricevute where company_id=s.company_id and contratto_subappalto_id=s.contratto_id and company_cost_id=pn.cost_id)
    or exists(select 1 from public.sal_subappaltatori a where a.id=pn.sal_sub_id and a.contratto_id=s.contratto_id and a.company_id=s.company_id)) then raise exception 'Pagamento non appartenente al contratto'; end if;
  select coalesce(sum(importo),0) into usato from public.sal_sub_pagamenti where prima_nota_id=pn.id;
  if usato+p_importo>pn.amount then raise exception 'Pagamento già interamente attribuito'; end if;
  idpn:=pn.id;
 elsif costo is not null then
  r:=public.registra_pagamento_costo(costo,p_richiesta,p_importo,p_data,p_metodo,p_riferimento);
  idpn:=(r->>'prima_nota_id')::uuid;
  if idpn is null then raise exception 'Fattura già pagata: collega il pagamento esistente'; end if;
 else
  if exists(select 1 from public.fatture_ricevute where company_id=s.company_id and contratto_subappalto_id=s.contratto_id) then raise exception 'Contabilizza o riconcilia le fatture del contratto prima del pagamento'; end if;
  insert into public.prima_nota_entries(company_id,direction,category,description,amount,entry_date,payment_method,reference_number,order_id,sal_sub_id,is_auto,auto_source,created_by,payment_request_id,payment_payload)
  values(s.company_id,'uscita','subappalto','Pagamento SAL n. '||s.numero_sal,p_importo,p_data,p_metodo,p_riferimento,s.order_id,s.id,true,'sal_sub_payment',auth.uid(),p_richiesta,v_payload) returning id into idpn;
 end if;
 insert into public.sal_sub_pagamenti(company_id,sal_id,prima_nota_id,importo,request_id,payload) values(s.company_id,s.id,idpn,p_importo,p_richiesta,v_payload);
 update public.sal_subappaltatori set pagato_registrato=pagato+p_importo,stato=case when pagato+p_importo>=importo_netto then 'pagato' else 'verificato' end,
 data_pagamento=p_data,payment_method=p_metodo,payment_reference=p_riferimento where id=s.id;
 return jsonb_build_object('prima_nota_id',idpn,'pagato',pagato+p_importo,'residuo',s.importo_netto-pagato-p_importo);
end $$;

revoke all on function public.spesa_pagamento_autorizza(uuid),public.spesa_pagamento_totale(uuid),public.spesa_pagamento_sincronizza(uuid),public.registra_pagamento_costo(uuid,uuid,numeric,date,text,text,uuid,uuid),public.storna_pagamenti_costo(uuid,date),public.registra_pagamento_sal_sub(uuid,uuid,numeric,date,text,text,uuid,uuid) from public,anon;
grant execute on function public.spesa_pagamento_autorizza(uuid),public.spesa_pagamento_totale(uuid),public.spesa_pagamento_sincronizza(uuid),public.registra_pagamento_costo(uuid,uuid,numeric,date,text,text,uuid,uuid),public.storna_pagamenti_costo(uuid,date),public.registra_pagamento_sal_sub(uuid,uuid,numeric,date,text,text,uuid,uuid) to authenticated;
CREATE OR REPLACE FUNCTION public.mark_scadenza_paid_con_richiesta(p_scadenza_id uuid, p_amount numeric, p_payment_method text DEFAULT 'bonifico'::text, p_payment_date date DEFAULT CURRENT_DATE, p_notes text DEFAULT NULL::text, p_account_label text DEFAULT 'banca'::text, p_request uuid DEFAULT NULL::uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_scadenza RECORD;
  v_remaining NUMERIC;
  v_new_paid NUMERIC;
  v_new_status TEXT;
  v_pn_id UUID;
  v_direction TEXT;
  v_category TEXT;
  v_payload jsonb;
  v_cost_total numeric;
  v_cost_paid numeric;
  v_previous public.prima_nota_entries;
BEGIN
  SELECT * INTO v_scadenza FROM scadenze WHERE id = p_scadenza_id;
  IF NOT FOUND THEN
    RETURN json_build_object('error', 'Scadenza non trovata');
  END IF;

  -- SICUREZZA (P0): la funzione è SECURITY DEFINER (bypassa RLS). Senza questo
  -- assert un utente di un'altra azienda (o anon con la key pubblica) poteva
  -- marcare pagata una scadenza altrui creando prima nota nella cassa altrui.
  PERFORM public.assert_company_access(v_scadenza.company_id);
  IF auth.uid() IS NOT NULL AND NOT public.puo_gestire_scadenze(v_scadenza.company_id) THEN
    RAISE EXCEPTION 'Non hai il permesso di registrare pagamenti.' USING ERRCODE = '42501';
  END IF;

  if public.utente_sola_lettura(v_scadenza.company_id) or auth.uid() is null then raise exception 'Pagamento non autorizzato' using errcode='42501'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_scadenza.company_id::text,2810));
  select * into v_scadenza from public.scadenze where id=p_scadenza_id for update;
  if p_request is null or p_amount is null or p_amount<=0 or p_amount>9999999999.99 or p_amount<>round(p_amount,2)
  or p_payment_date is null or p_payment_date>current_date then raise exception 'Dati pagamento non validi'; end if;
  v_payload:=jsonb_build_object('scadenza',p_scadenza_id,'importo',p_amount,'data',p_payment_date,'metodo',p_payment_method,'notes',p_notes,'conto',p_account_label);
  select * into v_previous from public.prima_nota_entries where company_id=v_scadenza.company_id and payment_request_id=p_request;
  if v_previous.id is not null then
   if v_previous.payment_payload is distinct from v_payload then raise exception 'Richiesta già usata con dati diversi'; end if;
   return json_build_object('success',true,'gia_registrato',true,'prima_nota_entry_id',v_previous.id);
  end if;
  if v_scadenza.status='annullata' then raise exception 'Scadenza annullata'; end if;
  if v_scadenza.cost_id is not null then
   perform public.spesa_pagamento_autorizza(v_scadenza.company_id);
   perform 1 from public.company_costs where id=v_scadenza.cost_id and company_id=v_scadenza.company_id for update;
   if not found then raise exception 'Costo non appartenente alla scadenza'; end if;
   v_cost_total:=public.spesa_pagamento_totale(v_scadenza.cost_id);
   select coalesce(sum(case when p.direction='uscita' then p.amount else -p.amount end),0) into v_cost_paid from public.prima_nota_entries p
    where p.company_id=v_scadenza.company_id and (p.cost_id=v_scadenza.cost_id or exists(select 1 from public.scadenze d where d.id=p.scadenza_id and d.cost_id=v_scadenza.cost_id));
   if exists(select 1 from public.company_costs where id=v_scadenza.cost_id and is_paid and v_cost_paid=0) then raise exception 'Pagamento storico da riconciliare'; end if;
   if v_cost_total is null or v_cost_paid+p_amount>v_cost_total then raise exception 'Importo superiore al residuo del costo'; end if;
  end if;

  -- La scadenza di una fattura emessa si incassa dalla fattura: così l'incasso entra una volta sola
  -- (movimento, prima nota, rata).
  IF coalesce(v_scadenza.notes, '') LIKE '%[DOC:%' THEN
    RETURN json_build_object('error', 'Questa scadenza è di una fattura: registra l''incasso dalla fattura.');
  END IF;

  v_remaining := v_scadenza.amount - v_scadenza.paid_amount;
  IF p_amount <= 0 OR p_amount > v_remaining THEN
    RETURN json_build_object('error', 'Importo non valido. Residuo: ' || v_remaining);
  END IF;

  v_new_paid := v_scadenza.paid_amount + p_amount;
  IF v_new_paid >= v_scadenza.amount THEN
    v_new_status := 'pagata';
  ELSE
    v_new_status := 'parziale';
  END IF;

  IF v_scadenza.direction = 'entrata' THEN
    v_direction := 'entrata';
    v_category := 'incasso';
  ELSE
    v_direction := 'uscita';
    v_category := CASE v_scadenza.tipo
      WHEN 'pagamento_fornitore' THEN 'fornitore'
      WHEN 'costo_aziendale' THEN 'costo'
      WHEN 'scadenza_fiscale' THEN 'fiscale'
      ELSE 'altro'
    END;
  END IF;

  INSERT INTO prima_nota_entries (
    company_id, direction, category, description, amount, entry_date,
    payment_method, supplier_id, invoice_id, order_id, scadenza_id,
    order_item_id, account_label, is_auto, auto_source, notes, created_by, cost_id, payment_request_id, payment_payload
  ) VALUES (
    v_scadenza.company_id, v_direction, v_category,
    'Pagamento: ' || v_scadenza.description,
    p_amount, p_payment_date, p_payment_method,
    v_scadenza.supplier_id, v_scadenza.invoice_id, v_scadenza.order_id,
    p_scadenza_id, v_scadenza.order_item_id, p_account_label,
    true, 'scadenzario', p_notes,
    (SELECT auth.uid()), v_scadenza.cost_id, p_request, v_payload
  )
  RETURNING id INTO v_pn_id;

  UPDATE scadenze SET
    paid_amount = v_new_paid,
    status = v_new_status,
    paid_date = p_payment_date,
    payment_method = p_payment_method,
    prima_nota_entry_id = v_pn_id,
    updated_at = NOW()
  WHERE id = p_scadenza_id;

  if v_scadenza.cost_id is not null then
   update public.company_costs set is_paid=(v_cost_paid+p_amount>=v_cost_total),paid_date=case when v_cost_paid+p_amount>=v_cost_total then p_payment_date else null end where id=v_scadenza.cost_id and company_id=v_scadenza.company_id;
  end if;
  RETURN json_build_object(
    'success', true,
    'new_status', v_new_status,
    'paid_amount', v_new_paid,
    'prima_nota_entry_id', v_pn_id
  );
END;
$function$;

create or replace function public.mark_scadenza_paid(p_scadenza_id uuid,p_amount numeric,p_payment_method text default 'bonifico',p_payment_date date default current_date,p_notes text default null,p_account_label text default 'banca')
returns json language sql security invoker set search_path='' as $$
 select public.mark_scadenza_paid_con_richiesta(p_scadenza_id,p_amount,p_payment_method,p_payment_date,p_notes,p_account_label,gen_random_uuid())
$$;
revoke all on function public.mark_scadenza_paid_con_richiesta(uuid,numeric,text,date,text,text,uuid) from public,anon;
grant execute on function public.mark_scadenza_paid_con_richiesta(uuid,numeric,text,date,text,text,uuid) to authenticated;

