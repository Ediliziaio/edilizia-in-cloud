set local lock_timeout = '3s';
set local statement_timeout = '60s';
-- Pianificazione distinta dalle assegnazioni fisiche e dai costi contabilizzati.
create table if not exists public.mezzi_piani_cantiere (
 id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
 order_id uuid not null references public.orders(id) on delete cascade,
 mezzo_id uuid not null references public.mezzi(id) on delete cascade,
 fase_ids uuid[] not null default '{}', dal date not null, al date,
 quantita numeric not null default 1 check(quantita > 0), note text,
 annullato boolean not null default false, updated_at timestamptz not null default now(),
 check(al is null or al >= dal)
);
create index if not exists mezzi_piani_order_idx on public.mezzi_piani_cantiere(company_id,order_id);
create index if not exists mezzi_piani_mezzo_idx on public.mezzi_piani_cantiere(mezzo_id,dal);
-- I costi sono separati: chi legge l'organizzazione non riceve gli importi.
create table if not exists public.mezzi_piani_costi (
 piano_id uuid primary key references public.mezzi_piani_cantiere(id) on delete cascade,
 company_id uuid not null references public.companies(id) on delete cascade,
 tariffa numeric not null check(tariffa >= 0), base text not null check(base in ('totale','giorno','settimana','mese')),
 extra numeric not null default 0 check(extra >= 0), fornitore text
);
alter table public.mezzi_piani_cantiere enable row level security;
alter table public.mezzi_piani_costi enable row level security;
revoke all on public.mezzi_piani_cantiere,public.mezzi_piani_costi from public,anon,authenticated;
grant select on public.mezzi_piani_cantiere,public.mezzi_piani_costi to authenticated;
grant all on public.mezzi_piani_cantiere,public.mezzi_piani_costi to service_role;
drop policy if exists lettura on public.mezzi_piani_cantiere;
create policy lettura on public.mezzi_piani_cantiere for select to authenticated using (
 not public.utente_bloccato() and public.has_permission_for_company((select auth.uid()),'can_view_mezzi',company_id)
 and exists(select 1 from public.orders o where o.id=order_id and o.company_id=mezzi_piani_cantiere.company_id and o.deleted_at is null)
);
drop policy if exists lettura on public.mezzi_piani_costi;
create policy lettura on public.mezzi_piani_costi for select to authenticated using (
 not public.utente_bloccato() and public.has_permission_for_company((select auth.uid()),'can_view_costs',company_id)
 and exists(select 1 from public.mezzi_piani_cantiere p where p.id=piano_id and p.company_id=mezzi_piani_costi.company_id)
);
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
 v_costi := public.has_permission_for_company(auth.uid(),'can_view_costs',v_company);
 if p_dati ? 'costo' and not v_costi then raise exception 'Non puoi modificare i costi' using errcode='42501'; end if;
 insert into public.mezzi_piani_cantiere(id,company_id,order_id,mezzo_id,fase_ids,dal,al,quantita,note,annullato)
 values(v_id,v_company,v_order,v_mezzo,v_fasi,v_dal,v_al,v_quantita,nullif(p_dati->>'note',''),v_annullato)
 on conflict(id) do update set fase_ids=excluded.fase_ids,dal=excluded.dal,al=excluded.al,quantita=excluded.quantita,note=excluded.note,annullato=excluded.annullato,updated_at=now();
 if p_dati ? 'costo' then
  if p_dati->'costo'='null'::jsonb then delete from public.mezzi_piani_costi where piano_id=v_id;
  else
   insert into public.mezzi_piani_costi(piano_id,company_id,tariffa,base,extra,fornitore)
   values(v_id,v_company,(p_dati->'costo'->>'tariffa')::numeric,p_dati->'costo'->>'base',coalesce((p_dati->'costo'->>'extra')::numeric,0),nullif(p_dati->'costo'->>'fornitore',''))
   on conflict(piano_id) do update set tariffa=excluded.tariffa,base=excluded.base,extra=excluded.extra,fornitore=excluded.fornitore;
  end if;
 end if;
 return v_id;
end $$;
revoke all on function public.salva_piano_mezzo(jsonb) from public,anon;
grant execute on function public.salva_piano_mezzo(jsonb) to authenticated,service_role;
