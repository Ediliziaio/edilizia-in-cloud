-- Prepared locally only. Runs after the existing invoice/receipt and fiscal-period guards.
-- Gross settles the invoice; only net cash reaches prima nota. No F24 or invoice VAT mutation.
set local lock_timeout='3s';
create schema if not exists private;
alter table public.movimenti_cassa_native add column if not exists importo_netto_banca numeric(15,2);

create table public.ritenute_bonifici (
 id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id),
 documento_id uuid not null references public.documenti_fiscali(id),
 movimento_id uuid unique references public.movimenti_cassa_native(id) on delete set null,
 richiesta_id uuid not null, numero_fattura text not null,
 lordo numeric(15,2) not null check(lordo>0 and lordo<=1000000000),
 ritenuta numeric(15,2) not null check(ritenuta>0), commissioni numeric(15,2) not null check(commissioni>=0),
 netto numeric(15,2) not null check(netto>0),
 aliquota_prevista numeric not null, ritenuta_prevista numeric(15,2) not null,
 data_accredito date not null, banca text not null check(length(banca) between 2 and 160),
 riferimento text not null check(length(riferimento) between 5 and 200),
 stato text not null default 'verificata' check(stato in('verificata','certificata','stornata')),
 certificazione text, motivo_storno text, revisione integer not null default 1,
 attore uuid not null, creato_il timestamptz not null default now(),
 check(lordo=netto+ritenuta+commissioni), unique(company_id,richiesta_id)
);
create unique index ritenute_bonifici_contabile_attiva on public.ritenute_bonifici(company_id,lower(banca),upper(riferimento)) where stato<>'stornata';
create index ritenute_bonifici_periodo on public.ritenute_bonifici(company_id,data_accredito desc,id);
create index ritenute_bonifici_documento on public.ritenute_bonifici(documento_id);
alter table public.ritenute_bonifici enable row level security;
create policy ritenute_bonifici_lettura on public.ritenute_bonifici for select to authenticated using (
 not public.utente_bloccato() and not public.utente_e_cliente_esterno() and (
 public.e_amministratore_di(company_id) or public.has_role((select auth.uid()),'super_admin'::public.app_role)
 or public.user_can_read_accountant_company(company_id)));
revoke all on public.ritenute_bonifici from public,anon,authenticated;
grant select on public.ritenute_bonifici to authenticated;

create function private.bonifico_periodo_aperto(p_company uuid,p_data date) returns void
language plpgsql security invoker set search_path='' as $$
begin
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('fiscal-month:'||p_company||':'||date_trunc('month',p_data)::date,0));
 if exists(select 1 from public.fiscalita_periodi where company_id=p_company and mese=date_trunc('month',p_data)::date and stato='chiuso') then
  raise exception 'Periodo fiscale chiuso: serve riapertura autorizzata';
 end if;
end $$;
revoke all on function private.bonifico_periodo_aperto(uuid,date) from public,anon,authenticated;

create function public.registra_bonifico_parlante(p_company uuid,p_documento uuid,p_lordo numeric,p_ritenuta numeric,p_commissioni numeric,p_netto numeric,p_data date,p_banca text,p_riferimento text,p_richiesta uuid,p_confermato boolean)
returns uuid language plpgsql security definer set search_path='' as $$
declare r public.ritenute_bonifici; d public.documenti_fiscali; v_mov uuid; v_id uuid; v_aliquota numeric; v_prev numeric; v_count integer;
begin
 perform public.fiscalita_verifica_scrittura(p_company);
 if p_data is null or p_data<'2015-01-01' or p_data>(now() at time zone 'Europe/Rome')::date then raise exception 'Data accredito non supportata'; end if;
 if p_confermato is distinct from true or p_richiesta is null then raise exception 'Conferma contabile e identificativo richiesta obbligatori'; end if;
 if p_lordo is null or p_ritenuta is null or p_commissioni is null or p_netto is null
 or p_lordo::text in('NaN','Infinity','-Infinity') or p_ritenuta::text in('NaN','Infinity','-Infinity') or p_commissioni::text in('NaN','Infinity','-Infinity') or p_netto::text in('NaN','Infinity','-Infinity')
 or p_lordo<=0 or p_lordo>1000000000 or p_ritenuta<=0 or p_commissioni<0 or p_netto<=0
 or p_lordo<>round(p_lordo,2) or p_ritenuta<>round(p_ritenuta,2) or p_commissioni<>round(p_commissioni,2) or p_netto<>round(p_netto,2)
 or p_lordo<>p_ritenuta+p_commissioni+p_netto then raise exception 'Importi non validi: lordo = netto + ritenuta + commissioni'; end if;
 if length(btrim(coalesce(p_banca,''))) not between 2 and 160 or length(btrim(coalesce(p_riferimento,''))) not between 5 and 200 then raise exception 'Banca e TRN/CRO obbligatori'; end if;
 -- Same lock namespace/order as period closure, followed by the invoice lock.
 perform private.bonifico_periodo_aperto(p_company,p_data);
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('bonifico:'||p_company||':'||p_richiesta,0));
 select * into r from public.ritenute_bonifici where company_id=p_company and richiesta_id=p_richiesta;
 if found then
  if (r.documento_id,r.lordo,r.ritenuta,r.commissioni,r.netto,r.data_accredito,r.banca,r.riferimento)
   is distinct from (p_documento,p_lordo,p_ritenuta,p_commissioni,p_netto,p_data,btrim(p_banca),btrim(p_riferimento)) or r.stato='stornata' then raise exception 'Richiesta già usata con dati diversi o stornata'; end if;
  return r.id;
 end if;
 select * into d from public.documenti_fiscali where company_id=p_company and id=p_documento for update;
 if d.id is null or d.deleted_at is not null or d.tipo not in('fattura','fattura_pa') or d.stato in('bozza','annullata','stornata','in_invio') then raise exception 'Fattura non incassabile'; end if;
 if exists(select 1 from public.ritenute_bonifici where company_id=p_company and lower(banca)=lower(btrim(p_banca)) and upper(riferimento)=upper(btrim(p_riferimento)) and stato<>'stornata') then raise exception 'Contabile già registrata: nessun doppio incasso'; end if;
 v_aliquota:=case when p_data<'2024-03-01' then 8 else 11 end;
 v_prev:=round(p_lordo/1.22*v_aliquota/100,2);
 v_mov:=public.registra_incasso_atomico(p_company,p_documento,p_lordo,'bonifico',p_data,btrim(p_riferimento),'Bonifico parlante: lordo cliente distinto dal netto bancario.');
 insert into public.ritenute_bonifici(company_id,documento_id,movimento_id,richiesta_id,numero_fattura,lordo,ritenuta,commissioni,netto,aliquota_prevista,ritenuta_prevista,data_accredito,banca,riferimento,attore)
 values(p_company,p_documento,v_mov,p_richiesta,coalesce(d.numero,''),p_lordo,p_ritenuta,p_commissioni,p_netto,v_aliquota,v_prev,p_data,btrim(p_banca),btrim(p_riferimento),auth.uid()) returning id into v_id;
 update public.movimenti_cassa_native set importo_netto_banca=p_netto where id=v_mov and company_id=p_company;
 update public.prima_nota_entries set amount=p_netto,notes=concat_ws(E'\n',notes,'Ritenuta subita EUR '||p_ritenuta||'; commissioni EUR '||p_commissioni||'; lordo saldato EUR '||p_lordo)
 where movimento_id=v_mov and company_id=p_company;
 get diagnostics v_count = row_count;
 if v_count<>1 then raise exception 'Prima nota non univoca: operazione annullata'; end if;
 insert into public.fiscalita_storico(company_id,tabella,record_id,azione,dopo,attore)
 select p_company,'ritenute_bonifici',v_id::text,'INSERT',to_jsonb(b),auth.uid() from public.ritenute_bonifici b where id=v_id;
 return v_id;
end $$;
revoke all on function public.registra_bonifico_parlante(uuid,uuid,numeric,numeric,numeric,numeric,date,text,text,uuid,boolean) from public,anon;
grant execute on function public.registra_bonifico_parlante(uuid,uuid,numeric,numeric,numeric,numeric,date,text,text,uuid,boolean) to authenticated;

create function public.aggiorna_ritenuta_bonifico(p_company uuid,p_id uuid,p_revisione integer,p_azione text,p_riferimento text)
returns void language plpgsql security definer set search_path='' as $$
declare r public.ritenute_bonifici; d public.documenti_fiscali; v_date date; v_documento uuid; v_pagato numeric; v_totale numeric; v_stato text;
begin
 perform public.fiscalita_verifica_scrittura(p_company);
 select data_accredito,documento_id into v_date,v_documento from public.ritenute_bonifici where company_id=p_company and id=p_id;
 if v_date is null then raise exception 'Ritenuta non disponibile'; end if;
 perform private.bonifico_periodo_aperto(p_company,v_date);
 if p_azione='storna' then
  select * into d from public.documenti_fiscali where id=v_documento and company_id=p_company for update;
  if d.id is null then raise exception 'Fattura non disponibile'; end if;
 end if;
 select * into r from public.ritenute_bonifici where company_id=p_company and id=p_id for update;
 if r.revisione is distinct from p_revisione or r.stato='stornata' then raise exception 'Registrazione cambiata: aggiorna prima di confermare'; end if;
 if length(btrim(coalesce(p_riferimento,''))) not between 5 and 2000 then raise exception 'Motivo o riferimento documentale obbligatorio'; end if;
 if p_azione='certifica' and r.stato='verificata' then
  update public.ritenute_bonifici set stato='certificata',certificazione=btrim(p_riferimento),revisione=revisione+1 where id=p_id;
 elsif p_azione='storna' then
  update public.ritenute_bonifici set stato='stornata',motivo_storno=btrim(p_riferimento),revisione=revisione+1 where id=p_id;
  perform public.storna_incasso_atomico(p_company,r.movimento_id);
  -- The legacy DELETE trigger recalculates paid amount before the old RPC subtracts again.
  -- Anchor this path to the locked pre-reversal snapshot, preserving other receipts.
  v_pagato:=greatest(0,coalesce(d.importo_pagato,0)-r.lordo);
  v_totale:=coalesce(d.totale_da_pagare,0)-public.documento_stornato_totale(d.id);
  v_stato:=case when v_totale<=0 and v_pagato=0 then 'stornata'
    when v_pagato>=v_totale then 'pagata' when v_pagato>0 then 'parzialmente_pagata'
    else public.stato_documento_da_sdi(d.sdi_stato,d.sdi_id_trasmissione) end;
  update public.documenti_fiscali set importo_pagato=v_pagato,stato=v_stato,
    pagato_at=case when v_stato='pagata' then d.pagato_at else null end,updated_at=now()
    where id=d.id and company_id=p_company;
 else raise exception 'Transizione non consentita'; end if;
 insert into public.fiscalita_storico(company_id,tabella,record_id,azione,prima,dopo,attore)
 select p_company,'ritenute_bonifici',p_id::text,p_azione,to_jsonb(r),to_jsonb(b),auth.uid() from public.ritenute_bonifici b where id=p_id;
end $$;
revoke all on function public.aggiorna_ritenuta_bonifico(uuid,uuid,integer,text,text) from public,anon;
grant execute on function public.aggiorna_ritenuta_bonifico(uuid,uuid,integer,text,text) to authenticated;

-- Existing deletion paths must not erase tax evidence or bypass the documented reversal.
create function private.proteggi_incasso_parlante() returns trigger language plpgsql security definer set search_path='' as $$
declare r public.ritenute_bonifici;
begin
 if tg_op='INSERT' then
  if new.importo_netto_banca is not null then raise exception 'Usa la registrazione atomica del bonifico parlante'; end if;
  return new;
 end if;
 select * into r from public.ritenute_bonifici where movimento_id=old.id;
 if tg_op='DELETE' then
  if r.id is not null and r.stato<>'stornata' then raise exception 'Usa lo storno documentato dal registro ritenute bancarie'; end if;
  return old;
 end if;
 if r.id is not null then
  if (new.company_id,new.documento_id,new.importo,new.data_movimento,new.importo_netto_banca) is distinct from (r.company_id,r.documento_id,r.lordo,r.data_accredito,r.netto) then raise exception 'Incasso parlante immutabile: usa storno e nuova registrazione'; end if;
 elsif new.importo_netto_banca is not null then raise exception 'Netto bancario senza ritenuta documentata'; end if;
 return new;
end $$;
revoke all on function private.proteggi_incasso_parlante() from public,anon,authenticated;
create trigger proteggi_incasso_parlante before insert or update or delete on public.movimenti_cassa_native for each row execute function private.proteggi_incasso_parlante();
