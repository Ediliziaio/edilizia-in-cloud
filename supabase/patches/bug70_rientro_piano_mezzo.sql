-- Distribuita in produzione il 2026-11-06: migrazione 20261106075753.
-- Baseline per replay/test: non riapplicare su funzioni già aggiornate.
-- BUG-70: rientro atomico. Nessuna riconciliazione automatica dello storico.
begin;
do $preflight$
begin
  if (select md5(trim(both E'\n' from pg_get_functiondef('public.salva_piano_mezzo(jsonb)'::regprocedure)))) is distinct from '559d28c2f7d3254342cbf59741c4b63f' then
    raise exception 'BUG-70: salva_piano_mezzo è cambiata; riesaminare prima di applicare';
  end if;
end $preflight$;
alter table public.mezzi_piani_cantiere add column if not exists rientrato_il timestamptz;
comment on column public.mezzi_piani_cantiere.rientrato_il is 'Chiusura effettiva della prenotazione; non annulla periodo o costi.';

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
 select 1 from public.mezzi_piani_cantiere p where p.mezzo_id=v_mezzo and p.id<>v_id and not p.annullato and p.rientrato_il is null
 and daterange(p.dal,p.al,'[]') && daterange(v_dal,v_al,'[]')) then
 raise exception 'Risorsa già pianificata in questo periodo: modifica le date o l’assegnazione esistente'; end if;
 if not v_annullato and v_m.gestione='quantita' and v_quantita>coalesce(v_m.quantita_totale,0) then raise exception 'Quantità superiore al totale del parco'; end if;
 -- Verifica il picco di quantità nelle date d'inizio di tutti i periodi sovrapposti.
 if not v_annullato and v_m.gestione='quantita' and exists (
 select 1 from (
 select v_dal as giorno union select p.dal from public.mezzi_piani_cantiere p
 where p.mezzo_id=v_mezzo and p.id<>v_id and not p.annullato and p.rientrato_il is null and p.dal>=v_dal and (v_al is null or p.dal<=v_al)
 ) d where v_quantita + coalesce((select sum(p.quantita) from public.mezzi_piani_cantiere p
 where p.mezzo_id=v_mezzo and p.id<>v_id and not p.annullato and p.rientrato_il is null and p.dal<=d.giorno and (p.al is null or p.al>=d.giorno)),0)>coalesce(v_m.quantita_totale,0)
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
end $function$;

create or replace function public.rientra_piano_mezzo(p_piano uuid, p_allocazione uuid default null)
returns void language plpgsql security definer set search_path = '' as $fn$
declare p public.mezzi_piani_cantiere%rowtype; m public.mezzi%rowtype; a public.mezzi_allocazioni%rowtype;
  oggi date := (now() at time zone 'Europe/Rome')::date;
begin
  if auth.uid() is null or coalesce(public.utente_bloccato(),true) then raise exception 'Accesso negato' using errcode='42501'; end if;
  -- Stesso ordine di lock di salva_piano_mezzo: prenotazione, risorsa, riga.
  perform pg_advisory_xact_lock(hashtextextended(p_piano::text,0));
  select * into p from public.mezzi_piani_cantiere where id=p_piano;
  if p.id is null or public.has_permission_for_company(auth.uid(),'can_view_mezzi',p.company_id) is not true
    or public.has_permission_for_company(auth.uid(),'can_edit_mezzi',p.company_id) is not true
    or public.has_permission_for_company(auth.uid(),'can_view_orders',p.company_id) is not true
    or public._order_visible_under_rls(p.order_id,true) is not true or coalesce(public.utente_sola_lettura(p.company_id),true) then
    raise exception 'Non puoi registrare il rientro di questa risorsa' using errcode='42501';
  end if;
  select * into m from public.mezzi where id=p.mezzo_id and company_id=p.company_id and deleted_at is null for update;
  if m.id is null then raise exception 'Risorsa non disponibile'; end if;
  select * into p from public.mezzi_piani_cantiere where id=p_piano for update;
  if p.rientrato_il is not null then return; end if;
  if p.annullato or p.dal > oggi then raise exception 'Questa prenotazione non è iniziata o è annullata'; end if;
  if coalesce(m.gestione,'singola')='quantita' then
    select * into a from public.mezzi_allocazioni where id=p_allocazione for update;
    if a.id is null or a.company_id<>p.company_id or a.order_id is distinct from p.order_id
      or a.mezzo_id<>p.mezzo_id or a.quantita<>p.quantita or (a.al is not null and a.al<=oggi) then
      raise exception 'Il montaggio non corrisponde alla prenotazione: verifica quantità e cantiere';
    end if;
    if (select count(*) from public.mezzi_piani_cantiere x where x.mezzo_id=p.mezzo_id and x.order_id=p.order_id
      and not x.annullato and x.rientrato_il is null and x.dal<=oggi and (x.al is null or x.al>=oggi))<>1 then
      raise exception 'Più prenotazioni aperte per questa risorsa: verifica quale montaggio rientra';
    end if;
    perform public.mezzi_rientro(a.id,a.quantita,oggi);
  else
    if p_allocazione is not null or m.assegnato_order_id is distinct from p.order_id then
      raise exception 'La risorsa non risulta su questa commessa';
    end if;
    update public.mezzi set assegnato_order_id=null where id=m.id and company_id=p.company_id;
  end if;
  update public.mezzi_piani_cantiere set al=oggi,rientrato_il=now(),updated_at=now() where id=p.id;
end $fn$;
revoke all on function public.rientra_piano_mezzo(uuid,uuid) from public, anon;
grant execute on function public.rientra_piano_mezzo(uuid,uuid) to authenticated,service_role;
commit;
