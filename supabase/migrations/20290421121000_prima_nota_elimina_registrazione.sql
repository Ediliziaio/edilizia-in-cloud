set local lock_timeout='3s';
set local statement_timeout='60s';

-- La riga sparisce dal registro monetario; la copia di audit impedisce anche
-- che una vecchia richiesta di pagamento ritentata la ricrei dopo il delete.
create table if not exists public.prima_nota_cancellazioni (
  entry_id uuid primary key,
  company_id uuid not null references public.companies(id) on delete cascade,
  payment_request_id uuid,
  snapshot jsonb not null,
  esito jsonb not null,
  deleted_by uuid not null,
  deleted_at timestamptz not null default now()
);
create unique index if not exists prima_nota_cancellazioni_richiesta
  on public.prima_nota_cancellazioni(company_id,payment_request_id) where payment_request_id is not null;
create index if not exists prima_nota_cancellazioni_azienda on public.prima_nota_cancellazioni(company_id,deleted_at);
alter table public.prima_nota_cancellazioni enable row level security;
revoke all on public.prima_nota_cancellazioni from public,anon,authenticated;
grant select,insert on public.prima_nota_cancellazioni to authenticated;
grant all on public.prima_nota_cancellazioni to service_role;
drop policy if exists prima_nota_cancellazioni_admin on public.prima_nota_cancellazioni;
create policy prima_nota_cancellazioni_admin on public.prima_nota_cancellazioni to authenticated
using (not public.utente_bloccato() and public.user_can_access_company(company_id) and not public.utente_sola_lettura(company_id)
  and (public.e_amministratore_di(company_id) or public.has_role(auth.uid(),'super_admin')
       or public.user_can_write_accountant_company(company_id)))
with check (deleted_by=auth.uid() and not public.utente_bloccato() and public.user_can_access_company(company_id)
  and not public.utente_sola_lettura(company_id)
  and (public.e_amministratore_di(company_id) or public.has_role(auth.uid(),'super_admin')
       or public.user_can_write_accountant_company(company_id)));

create or replace function private.prima_nota_richiesta_non_cancellata()
returns trigger language plpgsql security definer set search_path='' as $function$
begin
  if new.payment_request_id is not null and exists(select 1 from public.prima_nota_cancellazioni c
      where c.company_id=new.company_id and c.payment_request_id=new.payment_request_id) then
    raise exception 'Questa richiesta di pagamento è stata eliminata. Avvia una nuova registrazione.' using errcode='P0001';
  end if;
  return new;
end;
$function$;
revoke all on function private.prima_nota_richiesta_non_cancellata() from public,anon,authenticated;
drop trigger if exists prima_nota_richiesta_non_cancellata on public.prima_nota_entries;
create trigger prima_nota_richiesta_non_cancellata before insert on public.prima_nota_entries
for each row execute function private.prima_nota_richiesta_non_cancellata();

create or replace function public.prima_nota_cancellabile(p public.prima_nota_entries)
returns text language sql immutable set search_path='' as $function$
  select case
    when p.bank_transaction_id is not null then 'Il movimento è collegato alla banca: scollega prima il pagamento da Tesoreria.'
    when p.documento_fiscale_id is not null or p.movimento_id is not null then 'Elimina l’incasso dal dettaglio della fattura, per aggiornare anche il documento.'
    when p.unita_movimento_id is not null then 'Elimina o annulla l’incasso dalla scheda dell’unità.'
    when p.sal_sub_id is not null then 'Il pagamento è collegato a un SAL: gestiscilo dal SAL di origine.'
    when p.cost_id is not null and (not p.is_auto or p.auto_source in ('company_cost_payment','storno_pagamento')) then null
    when p.is_auto then 'La registrazione proviene da un altro documento: correggila dalla sua origine.'
    else null
  end;
$function$;
revoke all on function public.prima_nota_cancellabile(public.prima_nota_entries) from public,anon;
grant execute on function public.prima_nota_cancellabile(public.prima_nota_entries) to authenticated,service_role;

create or replace function public.prima_nota_elimina_registrazione(p_id uuid,p_versione timestamptz)
returns jsonb language plpgsql security invoker set search_path='' as $function$
declare
  p public.prima_nota_entries; c public.company_costs; r public.prima_nota_entries;
  ids uuid[]; esito jsonb; motivo text; prima numeric; dopo numeric; totale numeric;
  rate_n integer; rate_chiuse numeric; n integer;
begin
  select * into p from public.prima_nota_entries where id=p_id;
  if not found then
    select x.esito into esito from public.prima_nota_cancellazioni x where x.entry_id=p_id;
    if found then return esito||jsonb_build_object('gia_eliminata',true); end if;
    raise exception 'Registrazione non trovata o non visibile.' using errcode='P0002';
  end if;
  if auth.uid() is null or public.utente_bloccato() or not public.user_can_access_company(p.company_id)
     or public.utente_sola_lettura(p.company_id) or not (
       public.e_amministratore_di(p.company_id) or public.has_role(auth.uid(),'super_admin')
       or public.user_can_write_accountant_company(p.company_id)) then
    raise exception 'Non hai il permesso di eliminare questa registrazione.' using errcode='42501';
  end if;
  -- Stesso ordine dei lock di registra_pagamento_costo: azienda, costo, movimenti.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p.company_id::text,2810));
  if p.cost_id is not null then
    select * into c from public.company_costs where id=p.cost_id and company_id=p.company_id for update;
    if not found then raise exception 'Il costo di origine non è visibile.' using errcode='42501'; end if;
    perform public.spesa_pagamento_autorizza(p.company_id);
    perform 1 from public.prima_nota_entries where cost_id=c.id and company_id=c.company_id order by id for update;
  end if;
  select * into p from public.prima_nota_entries where id=p_id for update;
  if not found then
    select x.esito into esito from public.prima_nota_cancellazioni x where x.entry_id=p_id;
    if found then return esito||jsonb_build_object('gia_eliminata',true); end if;
    raise exception 'La registrazione è stata eliminata. Ricarica la pagina.' using errcode='P0002';
  end if;
  if p_versione is null or p.updated_at is distinct from p_versione then
    raise exception 'La registrazione è cambiata. Ricaricala prima di eliminarla.' using errcode='PT409';
  end if;
  motivo:=public.prima_nota_cancellabile(p);
  if motivo is not null then raise exception '%',motivo using errcode='P0001'; end if;
  ids:=array[p.id];
  if exists(select 1 from public.sal_sub_pagamenti s where s.prima_nota_id=p.id)
    or exists(select 1 from public.bank_reconciliations b where b.prima_nota_id=p.id and b.unmatched_at is null)
    or exists(select 1 from public.unita_movimenti u where u.prima_nota_id=p.id or u.storno_prima_nota_id=p.id) then
    raise exception 'Il pagamento ha un collegamento a banca, SAL o unità: gestisci prima il collegamento di origine.' using errcode='P0001';
  end if;
  if p.cost_id is null then
    -- Mantiene il percorso delle registrazioni manuali e degli incassi importati.
    esito:=jsonb_build_object('eliminata',true,'eliminati_ids',ids,'invoice_id',p.invoice_id);
    insert into public.prima_nota_cancellazioni(entry_id,company_id,payment_request_id,snapshot,esito,deleted_by)
      values(p.id,p.company_id,p.payment_request_id,to_jsonb(p),esito,auth.uid());
    return public.prima_nota_elimina(p.id)||esito;
  end if;
  -- Un originale e la propria contropartita sono un solo pagamento annullato.
  for r in select * from public.prima_nota_entries where reversal_of=p.id for update loop
    if (r.company_id,r.cost_id,r.amount) is distinct from (p.company_id,p.cost_id,p.amount)
       or r.direction=p.direction or r.auto_source is distinct from 'storno_pagamento'
       or public.prima_nota_cancellabile(r) is not null then
      raise exception 'La contropartita della registrazione deve essere verificata prima dell’eliminazione.' using errcode='P0001';
    end if;
    ids:=array_append(ids,r.id);
  end loop;
  if exists(select 1 from public.sal_sub_pagamenti s where s.prima_nota_id=any(ids))
    or exists(select 1 from public.bank_reconciliations b where b.prima_nota_id=any(ids) and b.unmatched_at is null)
    or exists(select 1 from public.unita_movimenti u where u.prima_nota_id=any(ids) or u.storno_prima_nota_id=any(ids)) then
    raise exception 'Il pagamento ha un collegamento a banca, SAL o unità: gestisci prima il collegamento di origine.' using errcode='P0001';
  end if;
  select coalesce(sum(case when x.direction='uscita' then x.amount else -x.amount end),0),
         coalesce(sum(case when x.direction='uscita' then x.amount else -x.amount end) filter(where not(x.id=any(ids))),0)
    into prima,dopo from public.prima_nota_entries x where x.company_id=c.company_id
      and (x.cost_id=c.id or exists(select 1 from public.scadenze s where s.id=x.scadenza_id and s.cost_id=c.id and s.company_id=c.company_id));
  if prima is distinct from dopo then
    if c.annullato_il is not null then
      raise exception 'Il costo è annullato: elimina il pagamento originale insieme al relativo storno.' using errcode='P0001';
    end if;
    totale:=public.spesa_pagamento_totale(c.id);
    if totale is null or totale<=0 or dopo<0 or dopo>totale+0.01 then
      raise exception 'L’eliminazione lascerebbe importi incoerenti sul costo: verifica le registrazioni collegate.' using errcode='P0001';
    end if;
    if c.is_paid and prima<totale-0.01 then
      raise exception 'Il costo risulta pagato anche con importi storici: verifica il documento prima di eliminarne i pagamenti.' using errcode='P0001';
    end if;
    perform 1 from public.rate_fornitori where company_cost_id=c.id and company_id=c.company_id order by id for update;
    select count(*),coalesce(sum(importo) filter(where stato='pagata'),0) into rate_n,rate_chiuse
      from public.rate_fornitori where company_cost_id=c.id and company_id=c.company_id and stato<>'stornata';
    if rate_n>1 and dopo<rate_chiuse-0.01 then
      raise exception 'Il pagamento copre più rate: riapri la rata corretta dal documento prima di eliminare la registrazione.' using errcode='P0001';
    end if;
  end if;
  esito:=jsonb_build_object('eliminata',true,'eliminati_ids',ids,'cost_id',c.id,'residuo',case when totale is not null then greatest(0,totale-dopo) end);
  insert into public.prima_nota_cancellazioni(entry_id,company_id,payment_request_id,snapshot,esito,deleted_by)
    select x.id,x.company_id,x.payment_request_id,to_jsonb(x),esito,auth.uid() from public.prima_nota_entries x where x.id=any(ids);
  delete from public.prima_nota_entries where id=any(ids) and reversal_of is not null;
  get diagnostics n=row_count;
  delete from public.prima_nota_entries where id=any(ids) and reversal_of is null;
  get diagnostics rate_n=row_count;
  if n+rate_n<>cardinality(ids) then
    raise exception 'Non hai il permesso di eliminare tutte le righe del pagamento.' using errcode='42501';
  end if;
  if prima is distinct from dopo then
    -- Il pagamento cancellato era documentato: il suo azzeramento non è un
    -- «pagato storico senza prima nota» da proteggere con il vecchio flag.
    if dopo=0 and c.is_paid then update public.company_costs set is_paid=false,paid_date=null where id=c.id; end if;
    perform public.spesa_pagamento_sincronizza(c.id);
    if (select count(*) from public.rate_fornitori where company_cost_id=c.id and stato<>'stornata')=1 then
      update public.rate_fornitori set stato='da_pagare',pagata_il=null
        where company_cost_id=c.id and company_id=c.company_id and stato='pagata' and importo>dopo+0.01;
    end if;
  end if;
  return esito;
end;
$function$;
revoke all on function public.prima_nota_elimina_registrazione(uuid,timestamptz) from public,anon;
grant execute on function public.prima_nota_elimina_registrazione(uuid,timestamptz) to authenticated;
