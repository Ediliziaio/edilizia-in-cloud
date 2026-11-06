CREATE OR REPLACE FUNCTION public.salva_piano_mezzo(p_dati jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
end $function$
