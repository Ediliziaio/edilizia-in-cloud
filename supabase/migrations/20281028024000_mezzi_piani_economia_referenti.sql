set local lock_timeout='3s';set local statement_timeout='60s';
alter table public.mezzi_piani_cantiere add column if not exists responsabile_hr_id uuid references public.hr_profili(id) on delete set null;
alter table public.mezzi_piani_costi add column if not exists supplier_id uuid references public.suppliers(id) on delete set null;
create index if not exists mezzi_piani_responsabile_idx on public.mezzi_piani_cantiere(responsabile_hr_id);
create index if not exists mezzi_piani_supplier_idx on public.mezzi_piani_costi(supplier_id);
create or replace function public.salva_piano_mezzo(p_dati jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare
 v_id uuid := coalesce((p_dati->>'id')::uuid,gen_random_uuid()); v_company uuid;
 v_order uuid := (p_dati->>'order_id')::uuid; v_mezzo uuid := (p_dati->>'mezzo_id')::uuid;
 v_dal date := (p_dati->>'dal')::date; v_al date := nullif(p_dati->>'al','')::date;
 v_fasi uuid[]; v_quantita numeric := (p_dati->>'quantita')::numeric; v_m public.mezzi%rowtype;
 v_annullato boolean := coalesce((p_dati->>'annullato')::boolean,false); v_costi boolean;
begin
 select company_id into v_company from public.orders where id=v_order and deleted_at is null;
 if auth.uid() is null or v_company is null or public.utente_bloccato()
 or not public.has_permission_for_company(auth.uid(),'can_view_mezzi',v_company)
 or not public.has_permission_for_company(auth.uid(),'can_edit_mezzi',v_company)
 or not public.has_permission_for_company(auth.uid(),'can_view_orders',v_company)
 or not public._order_visible_under_rls(v_order,true) or public.utente_sola_lettura(v_company) then
 raise exception 'Non puoi modificare i mezzi di questa commessa' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended(v_id::text,0));
 -- Serializza prenotazioni concorrenti della stessa risorsa.
 select * into v_m from public.mezzi where id=v_mezzo and company_id=v_company and deleted_at is null for update;
 if not found then raise exception 'Mezzo non disponibile per questa azienda'; end if;
 if exists(select 1 from public.mezzi_piani_cantiere where id=v_id and (company_id<>v_company or order_id<>v_order or mezzo_id<>v_mezzo)) then
 raise exception 'Assegnazione non modificabile'; end if;
 select coalesce(array_agg(distinct x::uuid),'{}') into v_fasi from jsonb_array_elements_text(coalesce(p_dati->'fase_ids','[]')) x;
 if exists(select 1 from unnest(v_fasi) f where not exists(select 1 from public.order_work_phases p where p.id=f and p.order_id=v_order and p.company_id=v_company)) then
 raise exception 'Le fasi devono appartenere a questa commessa'; end if;
 if v_dal is null or v_quantita is null or v_quantita<=0 or (v_al is not null and v_al<v_dal) then raise exception 'Controlla periodo e quantità'; end if;
 if not v_annullato and v_m.stato='fuori_servizio' then raise exception 'La risorsa è fuori servizio'; end if;
 if not v_annullato and coalesce(v_m.gestione,'singola')='singola' and v_quantita<>1 then raise exception 'Per una risorsa singola la quantità deve essere 1'; end if;
 if not v_annullato and coalesce(v_m.gestione,'singola')='singola' and exists(
 select 1 from public.mezzi_piani_cantiere p where p.mezzo_id=v_mezzo and p.id<>v_id and not p.annullato
 and daterange(p.dal,p.al,'[]') && daterange(v_dal,v_al,'[]')) then
 raise exception 'Risorsa già pianificata in questo periodo: modifica le date o l’assegnazione esistente'; end if;
 if not v_annullato and v_m.gestione='quantita' and v_quantita>coalesce(v_m.quantita_totale,0) then raise exception 'Quantità superiore al totale del parco'; end if;
 -- Verifica il picco di quantità nelle date d'inizio di tutti i periodi sovrapposti.
 if not v_annullato and v_m.gestione='quantita' and exists (
 select 1 from (
 select v_dal as giorno union select p.dal from public.mezzi_piani_cantiere p
 where p.mezzo_id=v_mezzo and p.id<>v_id and not p.annullato and p.dal>=v_dal and (v_al is null or p.dal<=v_al)
 ) d where v_quantita + coalesce((select sum(p.quantita) from public.mezzi_piani_cantiere p
 where p.mezzo_id=v_mezzo and p.id<>v_id and not p.annullato and p.dal<=d.giorno and (p.al is null or p.al>=d.giorno)),0)>coalesce(v_m.quantita_totale,0)
 ) then raise exception 'Quantità già pianificata nel periodo: supera il totale del parco'; end if;
 if nullif(p_dati->>'responsabile_hr_id','') is not null and not exists(select 1 from public.hr_profili h where h.id=(p_dati->>'responsabile_hr_id')::uuid and h.company_id=v_company and h.attivo) then raise exception 'Responsabile non disponibile per questa azienda'; end if;
 if nullif(p_dati->'costo'->>'supplier_id','') is not null and not exists(select 1 from public.suppliers x where x.id=(p_dati->'costo'->>'supplier_id')::uuid and x.company_id=v_company and x.is_active) then raise exception 'Fornitore non disponibile per questa azienda'; end if;
 v_costi := public.has_permission_for_company(auth.uid(),'can_view_costs',v_company);
 if p_dati ? 'costo' and not v_costi then raise exception 'Non puoi modificare i costi' using errcode='42501'; end if;
 insert into public.mezzi_piani_cantiere(id,company_id,order_id,mezzo_id,fase_ids,dal,al,quantita,note,annullato,responsabile_hr_id)
 values(v_id,v_company,v_order,v_mezzo,v_fasi,v_dal,v_al,v_quantita,nullif(p_dati->>'note',''),v_annullato,nullif(p_dati->>'responsabile_hr_id','')::uuid)
 on conflict(id) do update set fase_ids=excluded.fase_ids,dal=excluded.dal,al=excluded.al,quantita=excluded.quantita,note=excluded.note,annullato=excluded.annullato,responsabile_hr_id=case when p_dati ? 'responsabile_hr_id' then excluded.responsabile_hr_id else mezzi_piani_cantiere.responsabile_hr_id end,updated_at=now();
 if p_dati ? 'costo' then
  if p_dati->'costo'='null'::jsonb then delete from public.mezzi_piani_costi where piano_id=v_id;
  else
   insert into public.mezzi_piani_costi(piano_id,company_id,tariffa,base,extra,fornitore,supplier_id)
   values(v_id,v_company,(p_dati->'costo'->>'tariffa')::numeric,p_dati->'costo'->>'base',coalesce((p_dati->'costo'->>'extra')::numeric,0),nullif(p_dati->'costo'->>'fornitore',''),nullif(p_dati->'costo'->>'supplier_id','')::uuid)
   on conflict(piano_id) do update set tariffa=excluded.tariffa,base=excluded.base,extra=excluded.extra,fornitore=excluded.fornitore,supplier_id=case when p_dati->'costo' ? 'supplier_id' then excluded.supplier_id else mezzi_piani_costi.supplier_id end;
  end if;
 end if;
 return v_id;
end $$;
revoke all on function public.salva_piano_mezzo(jsonb) from public,anon;
grant execute on function public.salva_piano_mezzo(jsonb) to authenticated,service_role;
-- Contesto operativo minimo: nomi e incarico corrente, nessun dato personale HR.
create or replace function public.mezzi_piano_persone(p_order_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare c uuid; r jsonb;
begin
 select company_id into c from public.orders where id=p_order_id and deleted_at is null;
 if auth.uid() is null or c is null or public.utente_bloccato() or not public.has_permission_for_company(auth.uid(),'can_view_mezzi',c) or not public.has_permission_for_company(auth.uid(),'can_view_orders',c) or not public._order_visible_under_rls(p_order_id,true) then raise exception 'Commessa non accessibile' using errcode='42501'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',h.id,'nome',concat_ws(' ',h.nome,h.cognome),'in_cantiere',exists(select 1 from public.order_campo_assignments a where a.order_id=p_order_id and a.user_id=h.user_id) or exists(select 1 from public.order_employees e where e.order_id=p_order_id and e.employee_id=h.employee_id),'capocantiere',exists(select 1 from public.order_campo_assignments a where a.order_id=p_order_id and a.user_id=h.user_id and a.is_capocantiere and (a.data_inizio is null or a.data_inizio<=current_date) and (a.data_fine_prevista is null or a.data_fine_prevista>=current_date))) order by h.cognome,h.nome,h.id),'[]') into r from public.hr_profili h where h.company_id=c and h.attivo;
 return r;
end $$;
revoke all on function public.mezzi_piano_persone(uuid) from public,anon;
grant execute on function public.mezzi_piano_persone(uuid) to authenticated,service_role;
create table if not exists public.mezzi_piani_spese (
 id uuid primary key default gen_random_uuid(),company_id uuid not null references public.companies(id) on delete cascade,
 piano_id uuid not null references public.mezzi_piani_cantiere(id) on delete cascade,
 costo_id uuid references public.company_costs(id) on delete cascade,
 oda_id uuid references public.purchase_orders(id) on delete cascade,
 importo numeric not null check(importo<>0),check(num_nonnulls(costo_id,oda_id)=1),
 unique(piano_id,costo_id),unique(piano_id,oda_id)
);
create index if not exists mezzi_piani_spese_costo_idx on public.mezzi_piani_spese(costo_id);
create index if not exists mezzi_piani_spese_oda_idx on public.mezzi_piani_spese(oda_id);
create index if not exists mezzi_piani_spese_company_idx on public.mezzi_piani_spese(company_id);
alter table public.mezzi_piani_spese enable row level security;
revoke all on public.mezzi_piani_spese from public,anon,authenticated;
grant select on public.mezzi_piani_spese to authenticated;grant all on public.mezzi_piani_spese to service_role;
drop policy if exists lettura on public.mezzi_piani_spese;
create policy lettura on public.mezzi_piani_spese for select to authenticated using(not public.utente_bloccato() and public.has_permission_for_company((select auth.uid()),'can_view_costs',company_id) and exists(select 1 from public.mezzi_piani_cantiere p where p.id=piano_id and p.company_id=mezzi_piani_spese.company_id));
-- Le stesse fonti del consuntivo canonico: costo diretto oppure OdA.
-- Se un costo è legato a un OdA, compare SOLO nella fonte OdA con la somma dei costi.
create or replace function public.mezzi_piano_fonti(p_order_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare c uuid; fonti jsonb; legami jsonb;
begin
 select company_id into c from public.orders where id=p_order_id and deleted_at is null;
 if auth.uid() is null or c is null or public.utente_bloccato() or not public.has_permission_for_company(auth.uid(),'can_view_mezzi',c) or not public.has_permission_for_company(auth.uid(),'can_view_costs',c) or not public.has_permission_for_company(auth.uid(),'can_view_orders',c) or not public._order_visible_under_rls(p_order_id,true) then raise exception 'Costi non accessibili' using errcode='42501'; end if;
 select coalesce(jsonb_agg(x),'[]') into fonti from (
 select cc.id,'costo' as tipo,cc.name as nome,
 case when jsonb_typeof(cc.allocations)='array' and jsonb_array_length(cc.allocations)>0 then cc.amount * coalesce((select sum(case when (a->>'pct') ~ '^[0-9]+(\\.[0-9]+)?$' then (a->>'pct')::numeric else 0 end) from jsonb_array_elements(cc.allocations) a where lower(a->>'order_id')=p_order_id::text),0)/100 else cc.amount end as importo,
 cc.supplier_id,cc.due_date as data
 from public.company_costs cc where cc.company_id=c and cc.purchase_order_id is null and cc.order_external_team_id is null
 and (case when jsonb_typeof(cc.allocations)='array' and jsonb_array_length(cc.allocations)>0 then exists(select 1 from jsonb_array_elements(cc.allocations) a where lower(a->>'order_id')=p_order_id::text) else cc.order_id=p_order_id end)
 union all
 select po.id,'oda',po.oda_number,coalesce((select sum(cc.amount) from public.company_costs cc where cc.purchase_order_id=po.id and cc.company_id=c),po.subtotal),po.supplier_id,po.issue_date
 from public.purchase_orders po where po.company_id=c and po.order_id=p_order_id and po.status in ('inviato','confermato','parziale','ricevuto')
 ) x;
 select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'piano_id',s.piano_id,'fonte_id',coalesce(s.costo_id,s.oda_id),'tipo',case when s.costo_id is null then 'oda' else 'costo' end,'importo',s.importo)),'[]') into legami from public.mezzi_piani_spese s join public.mezzi_piani_cantiere p on p.id=s.piano_id where s.company_id=c and p.order_id=p_order_id;
 return jsonb_build_object('fonti',fonti,'legami',legami);
end $$;
revoke all on function public.mezzi_piano_fonti(uuid) from public,anon;
grant execute on function public.mezzi_piano_fonti(uuid) to authenticated,service_role;
create or replace function public.collega_spesa_piano_mezzo(p_piano_id uuid,p_tipo text,p_fonte_id uuid,p_importo numeric) returns void language plpgsql security definer set search_path='' as $$
declare p public.mezzi_piani_cantiere%rowtype; valore numeric; usato numeric; totale numeric; record_count integer;
begin
 select * into p from public.mezzi_piani_cantiere where id=p_piano_id;
 if auth.uid() is null or p.id is null or public.utente_bloccato() or public.utente_sola_lettura(p.company_id) or not public.has_permission_for_company(auth.uid(),'can_edit_mezzi',p.company_id) or not public.has_permission_for_company(auth.uid(),'can_edit_orders',p.company_id) then raise exception 'Modifica non autorizzata' using errcode='42501'; end if;
 -- La lettura ricontrolla anche costi, azienda e visibilità della commessa.
 perform public.mezzi_piano_fonti(p.order_id);
 if p_tipo='costo' then select amount into totale from public.company_costs where id=p_fonte_id and company_id=p.company_id for update;
 elsif p_tipo='oda' then perform 1 from public.purchase_orders where id=p_fonte_id and company_id=p.company_id for update;
 else raise exception 'Tipo di fonte non valido'; end if;
 if not found then raise exception 'Costo non disponibile'; end if;
 if p_importo is null or p_importo=0 then
 delete from public.mezzi_piani_spese where piano_id=p.id and ((p_tipo='costo' and costo_id=p_fonte_id) or (p_tipo='oda' and oda_id=p_fonte_id));return;end if;
 select (f->>'importo')::numeric into valore from jsonb_array_elements(public.mezzi_piano_fonti(p.order_id)->'fonti') f where f->>'id'=p_fonte_id::text and f->>'tipo'=p_tipo;
 if valore is null or valore=0 or sign(p_importo)<>sign(valore) then raise exception 'Costo non attribuito a questa commessa o importo non valido'; end if;
 if p_importo<>round(p_importo,2) then raise exception 'Indica importi con al massimo due decimali'; end if;
 select coalesce(sum(s.importo),0) into usato from public.mezzi_piani_spese s join public.mezzi_piani_cantiere m on m.id=s.piano_id where m.order_id=p.order_id and s.piano_id<>p.id and ((p_tipo='costo' and s.costo_id=p_fonte_id) or (p_tipo='oda' and s.oda_id=p_fonte_id));
 if abs(usato+p_importo)>abs(valore) then raise exception 'La somma delle quote supera il costo già registrato'; end if;
 if p_tipo='costo' then
 select coalesce(sum(importo),0) into usato from public.mezzi_piani_spese where piano_id<>p.id and costo_id=p_fonte_id;
 if abs(usato+p_importo)>abs(totale) then raise exception 'Le quote complessive superano il costo aziendale'; end if;
 end if;
 -- Un collegamento solo per piano/fonte; sostituzione atomica.
 delete from public.mezzi_piani_spese where piano_id=p.id and ((p_tipo='costo' and costo_id=p_fonte_id) or (p_tipo='oda' and oda_id=p_fonte_id));
 insert into public.mezzi_piani_spese(company_id,piano_id,costo_id,oda_id,importo) values(p.company_id,p.id,case when p_tipo='costo' then p_fonte_id end,case when p_tipo='oda' then p_fonte_id end,p_importo);
end $$;
revoke all on function public.collega_spesa_piano_mezzo(uuid,text,uuid,numeric) from public,anon;
grant execute on function public.collega_spesa_piano_mezzo(uuid,text,uuid,numeric) to authenticated,service_role;
