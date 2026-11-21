set local lock_timeout = '3s';
set local statement_timeout = '60s';

create table if not exists private.distinte_pagamenti_fornitori (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  richiesta uuid not null,
  fino_al date not null,
  stato text not null default 'bozza' check (stato in ('bozza','approvata','annullata')),
  creata_da uuid references auth.users(id) on delete set null,
  creata_il timestamptz not null default now(),
  approvata_da uuid references auth.users(id) on delete set null,
  approvata_il timestamptz,
  annullata_da uuid references auth.users(id) on delete set null,
  annullata_il timestamptz,
  unique (company_id,richiesta)
);
create index if not exists distinte_pagamenti_azienda
on private.distinte_pagamenti_fornitori(company_id,creata_il desc,id);
alter table private.distinte_pagamenti_fornitori enable row level security;

create table if not exists private.distinte_pagamenti_righe (
  distinta_id uuid not null references private.distinte_pagamenti_fornitori(id) on delete cascade,
  tipo text not null check (tipo in ('ricevuta','rata_fornitore','scadenza')),
  fonte_id uuid not null,
  fatture uuid[] not null default '{}',
  fornitore text not null,
  documento text not null,
  riferimenti text not null,
  scadenza date not null,
  metodo text,
  importo numeric(15,2) not null check(importo>0),
  primary key (distinta_id,tipo,fonte_id)
);
create index if not exists distinte_pagamenti_fonte on private.distinte_pagamenti_righe(tipo,fonte_id,distinta_id);
alter table private.distinte_pagamenti_righe enable row level security;
revoke all on private.distinte_pagamenti_fornitori,private.distinte_pagamenti_righe from public,anon,authenticated,service_role;

-- Le scadenze reali prevalgono sulle rate e sulle proiezioni del costo.
-- Una riga per debito, con il residuo usato dalla riconciliazione di banca.
create or replace function private.distinta_pagamenti_partite(p_company uuid,p_fino date)
returns table(tipo text,fonte_id uuid,fatture uuid[],fornitore text,documento text,
  riferimenti text,scadenza date,metodo text,residuo numeric)
language sql stable set search_path='' as $$
  with s as materialized (
    select s.*
    from public.scadenze s
    left join public.company_costs c on c.id=s.cost_id and c.company_id=p_company
    where s.company_id=p_company and s.direction='uscita' and s.status in ('da_pagare','parziale')
      and not coalesce(s.is_previsionale,false) and c.annullato_il is null
  ), saldi_collegati as materialized (
    select f.id,f.company_cost_id,f.cedente_ragione_sociale,f.numero_fattura,f.piano_pagamento,f.fornitore_id,
      v.residuo,v.rate_totali
    from private.fatture_ricevute_calcola_saldi(p_company,null,null) v
    join public.fatture_ricevute f on f.id=v.id and f.company_id=p_company
    where (v.residuo is null or v.residuo>0) and f.stato not in ('rifiutata','scartata','annullata','eliminata')
      and not public.e_nota_credito_ricevuta(f.tipo_documento) and not public.e_autofattura_ricevuta(f.tipo_documento)
  ), fatture as materialized (
    select * from saldi_collegati where residuo>0
  ), riferite as materialized (
    select f.company_cost_id,array_agg(f.id order by f.id) ids,count(*) n,
      string_agg('Fattura n. '||f.numero_fattura,' · ' order by f.numero_fattura) numeri,
      min(f.cedente_ragione_sociale) nome,sum(f.residuo) residuo,bool_or(f.residuo is null) incerta
    from saldi_collegati f where f.company_cost_id is not null
    group by f.company_cost_id
  ), partite as (
    select 'scadenza' tipo,s.id fonte_id,coalesce(f.ids,'{}') fatture,
      coalesce(f.nome,p.name) fornitore,s.description documento,coalesce(f.numeri,s.description) riferimenti,
      s.due_date scadenza,s.payment_method metodo,
      least(s.amount-coalesce(s.paid_amount,0),f.residuo) residuo
    from s left join public.company_costs c on c.id=s.cost_id and c.company_id=p_company
    left join riferite f on f.company_cost_id=s.cost_id
    left join public.suppliers p on p.id=coalesce(s.supplier_id,c.supplier_id) and p.company_id=p_company
    where (f.n is not null or p.id is not null) and not coalesce(c.is_paid,false) and not coalesce(f.incerta,false)
    union all
    select 'rata_fornitore',r.id,case when f.id is null then coalesce(x.ids,'{}') else array[f.id] end,
      coalesce(f.cedente_ragione_sociale,x.nome,p.name),coalesce('Fattura '||f.numero_fattura,c.name)||' · rata '||r.numero,
      coalesce('Fattura n. '||f.numero_fattura,x.numeri,c.name)||' · rata '||r.numero,
      r.scadenza,r.metodo,least(private.fornitore_residuo_rata(r),coalesce(f.residuo,x.residuo))
    from public.rate_fornitori r
    join public.company_costs c on c.id=r.company_cost_id and c.company_id=p_company
    left join fatture f on f.id=r.fattura_ricevuta_id
    left join riferite x on x.company_cost_id=c.id and f.id is null
    left join public.suppliers p on p.id=coalesce(f.fornitore_id,c.supplier_id) and p.company_id=p_company
    where r.company_id=p_company and r.stato not in ('pagata','stornata','da_bloccare','richiamata')
      and c.annullato_il is null and not coalesce(c.is_paid,false)
      and (r.fattura_ricevuta_id is null or f.id is not null) and not coalesce(x.incerta,false)
      and not exists(select 1 from s where s.cost_id=c.id)
    union all
    select 'ricevuta',f.id,array[f.id],f.cedente_ragione_sociale,
      'Fattura '||f.numero_fattura,'Fattura n. '||f.numero_fattura,
      coalesce(nullif(c.due_date,date '9999-12-31'),p.scadenza),coalesce(c.payment_method,p.metodo),f.residuo
    from fatture f
    left join public.company_costs c on c.id=f.company_cost_id and c.company_id=p_company
    left join lateral (
      select min(public.acquisti_data_italiana(coalesce(x->>'scadenza',x->>'data_scadenza'))) scadenza,min(x->>'metodo') metodo
      from jsonb_array_elements(case when jsonb_typeof(f.piano_pagamento)='array' then f.piano_pagamento else '[]'::jsonb end) x
      where nullif(x->>'pagata_il','') is null
    ) p on true
    where f.rate_totali=0 and not exists(select 1 from s where s.cost_id=f.company_cost_id)
      and not exists(select 1 from public.rate_fornitori r where r.company_id=p_company
        and r.company_cost_id=f.company_cost_id and r.stato<>'stornata')
  )
  select p.tipo,p.fonte_id,p.fatture,coalesce(nullif(p.fornitore,''),'Fornitore da verificare'),
    p.documento,p.riferimenti,p.scadenza,p.metodo,round(p.residuo,2)
  from partite p where p.scadenza<=p_fino and p.scadenza<date '9999-12-31' and round(p.residuo,2)>0
$$;

create or replace function private.distinta_pagamenti_in_banca(p_company uuid,p_tipo text,p_fonte uuid,p_dal timestamptz)
returns numeric language sql stable set search_path='' as $$
  select coalesce(sum(b.matched_amount),0) from public.bank_reconciliations b
  join public.bank_transactions t on t.id=b.transaction_id and t.company_id=p_company and t.transaction_type='debit'
  where p_dal is not null and b.company_id=p_company and b.unmatched_at is null and b.matched_at>=p_dal
    and t.booking_date>=(p_dal at time zone 'Europe/Rome')::date
    and coalesce(b.payment_source->>'tipo','') not in ('prova','prova_ricevuta','prova_fattura')
    and case p_tipo
      when 'ricevuta' then b.fattura_ricevuta_id=p_fonte and b.rata_fornitore_id is null
      when 'rata_fornitore' then b.rata_fornitore_id=p_fonte
      when 'scadenza' then b.scadenza_id=p_fonte
      else false end
$$;

create or replace function private.distinta_pagamenti_riservata(p_company uuid,p_tipo text,p_fonte uuid,p_escludi uuid default null)
returns boolean language sql stable set search_path='' as $$
  select exists(select 1 from private.distinte_pagamenti_righe r
    join private.distinte_pagamenti_fornitori d on d.id=r.distinta_id
    where d.company_id=p_company and r.tipo=p_tipo and r.fonte_id=p_fonte
      and d.id is distinct from p_escludi and d.stato in ('bozza','approvata')
      and (d.stato='bozza' or private.distinta_pagamenti_in_banca(p_company,r.tipo,r.fonte_id,d.approvata_il)<r.importo))
$$;

create or replace function private.distinta_pagamenti_problemi(p_fatture uuid[])
returns jsonb language sql stable set search_path='' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id',f.id,'numero',v.esito->>'numero') order by f.id)
    filter(where coalesce((v.esito->>'bloccata')::boolean,true)),'[]')
  from unnest(p_fatture) f(id)
  cross join lateral (select private.pagamento_fornitore_controllo(f.id) esito offset 0) v
$$;

create or replace function public.distinta_pagamenti_proposte(p_company uuid,p_fino date,p_offset integer default 0)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  if not private.operazioni_puo_approvare(p_company) then raise exception 'Non puoi preparare la distinta' using errcode='42501'; end if;
  if p_fino is null or p_offset is null or p_offset<0 then raise exception 'Indica la scadenza della distinta' using errcode='22023'; end if;
  return (
    with pagina as materialized (
      select p.* from private.distinta_pagamenti_partite(p_company,p_fino) p
      where not private.distinta_pagamenti_riservata(p_company,p.tipo,p.fonte_id)
      order by p.scadenza,p.fornitore,p.tipo,p.fonte_id limit 51 offset p_offset
    )
    select jsonb_build_object('altre',(select count(*)>50 from pagina),
      'righe',coalesce(jsonb_agg(to_jsonb(p)||jsonb_build_object('verifiche',private.distinta_pagamenti_problemi(p.fatture))
          order by p.scadenza,p.fornitore,p.tipo,p.fonte_id),'[]'))
    from (select * from pagina order by scadenza,fornitore,tipo,fonte_id limit 50) p
  );
end
$$;

create or replace function public.distinta_pagamenti_crea(p_company uuid,p_fino date,p_richiesta uuid,p_scelte jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare distinta uuid; n integer;
begin
  if not private.operazioni_puo_approvare(p_company) then raise exception 'Non puoi preparare la distinta' using errcode='42501'; end if;
  if p_fino is null or p_richiesta is null or jsonb_typeof(p_scelte) is distinct from 'array'
    or jsonb_array_length(p_scelte) not between 1 and 50 then
    raise exception 'Scegli fino a 50 partite da pagare' using errcode='22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_company::text,2810));
  select d.id into distinta from private.distinte_pagamenti_fornitori d where d.company_id=p_company and d.richiesta=p_richiesta;
  if found then return distinta; end if;

  insert into private.distinte_pagamenti_fornitori(company_id,richiesta,fino_al,creata_da)
  values(p_company,p_richiesta,p_fino,auth.uid()) returning id into distinta;

  insert into private.distinte_pagamenti_righe(distinta_id,tipo,fonte_id,fatture,fornitore,documento,riferimenti,scadenza,metodo,importo)
  select distinta,p.tipo,p.fonte_id,p.fatture,p.fornitore,p.documento,p.riferimenti,p.scadenza,p.metodo,x.importo
  from private.distinta_pagamenti_partite(p_company,p_fino) p
  join jsonb_to_recordset(p_scelte) x(tipo text,fonte_id uuid,importo numeric) on x.tipo=p.tipo and x.fonte_id=p.fonte_id
  where x.importo>0 and x.importo=round(x.importo,2) and x.importo<=p.residuo
    and not private.distinta_pagamenti_riservata(p_company,p.tipo,p.fonte_id,distinta);
  get diagnostics n=row_count;
  if n<>jsonb_array_length(p_scelte) then
    raise exception 'Le partite o i residui sono cambiati. Aggiorna la proposta.' using errcode='PT409';
  end if;
  return distinta;
end
$$;

create or replace function public.distinta_pagamenti_elenco(p_company uuid,p_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  if not private.operazioni_puo_approvare(p_company) then raise exception 'Non puoi consultare le distinte' using errcode='42501'; end if;
  return (
    select coalesce(jsonb_agg(to_jsonb(e) order by e.creata_il desc,e.id),'[]') from (
      select d.id,d.fino_al,d.stato,d.creata_il,d.approvata_il,d.annullata_il,
        coalesce(sum(r.importo),0) totale,
        coalesce(sum(least(r.importo,private.distinta_pagamenti_in_banca(p_company,r.tipo,r.fonte_id,d.approvata_il))),0) in_banca,
        count(r.fonte_id) partite,
        case when p_id is not null then coalesce(jsonb_agg(to_jsonb(r)-'distinta_id'||jsonb_build_object(
          'verifiche',case when d.stato='bozza' then private.distinta_pagamenti_problemi(r.fatture) else '[]'::jsonb end,
          'in_banca',least(r.importo,private.distinta_pagamenti_in_banca(p_company,r.tipo,r.fonte_id,d.approvata_il)))
          order by r.scadenza,r.fornitore,r.fonte_id),'[]') end righe
      from (select * from private.distinte_pagamenti_fornitori d where d.company_id=p_company
        and (p_id is null or p_id=d.id) order by d.creata_il desc,d.id limit 40) d
      join private.distinte_pagamenti_righe r on r.distinta_id=d.id
      group by d.id,d.fino_al,d.stato,d.creata_il,d.approvata_il,d.annullata_il
    ) e
  );
end
$$;

create or replace function public.distinta_pagamenti_approva(p_company uuid,p_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare d private.distinte_pagamenti_fornitori%rowtype; esito jsonb; n integer;
begin
  if not private.operazioni_puo_approvare(p_company) then raise exception 'Non puoi approvare la distinta' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_company::text,2810));
  select * into d from private.distinte_pagamenti_fornitori where id=p_id and company_id=p_company for update;
  if not found or d.stato='annullata' then raise exception 'Distinta non disponibile' using errcode='P0002'; end if;
  if d.stato='approvata' then return; end if;

  select count(*) into n from private.distinte_pagamenti_righe r
  left join private.distinta_pagamenti_partite(p_company,d.fino_al) p
    on p.tipo=r.tipo and p.fonte_id=r.fonte_id and p.fatture=r.fatture and p.scadenza=r.scadenza
    and p.metodo is not distinct from r.metodo and p.residuo>=r.importo
  where r.distinta_id=d.id and (p.fonte_id is null or private.distinta_pagamenti_riservata(p_company,r.tipo,r.fonte_id,d.id));
  if n>0 then raise exception 'Residui o scadenze cambiati. Ricrea la distinta con i dati aggiornati.' using errcode='PT409'; end if;

  select private.distinta_pagamenti_problemi(array_agg(distinct f.id)) into esito
  from private.distinte_pagamenti_righe r cross join lateral unnest(r.fatture) f(id) where r.distinta_id=d.id;
  if jsonb_array_length(esito)>0 then
    raise exception 'Completa le verifiche delle fatture prima di approvare la distinta.' using errcode='PT409';
  end if;

  -- Il residuo di una fattura può essere condiviso da più rate o scadenze.
  if exists (select 1 from (
      select r.fatture[1] fattura_id,sum(greatest(0,r.importo-
        private.distinta_pagamenti_in_banca(p_company,r.tipo,r.fonte_id,x.approvata_il))) importo
      from private.distinte_pagamenti_righe r
      join private.distinte_pagamenti_fornitori x on x.id=r.distinta_id and x.company_id=p_company
      where (r.distinta_id=d.id or x.stato='approvata') and cardinality(r.fatture)=1
        and exists(select 1 from private.distinte_pagamenti_righe nuova
          where nuova.distinta_id=d.id and r.fatture[1]=any(nuova.fatture))
      group by r.fatture[1]
    ) q
    cross join lateral private.fatture_ricevute_calcola_saldi(p_company,null,q.fattura_id) v
    where q.importo>v.residuo)
  then raise exception 'Le rate selezionate superano il residuo della fattura.' using errcode='PT409'; end if;

  update private.distinte_pagamenti_fornitori set stato='approvata',approvata_il=now(),approvata_da=auth.uid()
  where id=d.id and company_id=p_company;
end
$$;

-- Scaricare di nuovo una distinta produce il residuo da preparare, con i
-- controlli ripetuti sui documenti e gli importi correnti.
create or replace function public.distinta_pagamenti_esporta(p_company uuid,p_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare d private.distinte_pagamenti_fornitori%rowtype; risultato jsonb; scadute integer;
begin
  if not private.operazioni_puo_approvare(p_company) then raise exception 'Non puoi esportare la distinta' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_company::text,2810));
  select * into d from private.distinte_pagamenti_fornitori where id=p_id and company_id=p_company for share;
  if not found or d.stato<>'approvata' then raise exception 'Approva la distinta prima di esportarla.' using errcode='PT409'; end if;
  with righe as materialized (
    select r.*,greatest(0,r.importo-
      private.distinta_pagamenti_in_banca(p_company,r.tipo,r.fonte_id,d.approvata_il)) resto
    from private.distinte_pagamenti_righe r where r.distinta_id=d.id
  ), attuali as materialized (
    select r.fornitore,r.documento,r.riferimenti,r.scadenza,r.metodo,r.resto,p.residuo,
      p.fonte_id,p.fatture,
      case when p.fonte_id is not null then r.fatture is not distinct from p.fatture
        and r.scadenza=p.scadenza and r.metodo is not distinct from p.metodo
        and r.riferimenti=p.riferimenti and r.fornitore=p.fornitore
        and jsonb_array_length(private.distinta_pagamenti_problemi(p.fatture))=0 else false end coerente
    from righe r left join private.distinta_pagamenti_partite(p_company,d.fino_al) p on p.tipo=r.tipo and p.fonte_id=r.fonte_id
    where r.resto>0
  )
  select coalesce(jsonb_agg(jsonb_build_object('fornitore',r.fornitore,'documento',r.documento,'riferimenti',r.riferimenti,
    'scadenza',r.scadenza,'metodo',r.metodo,'importo',least(r.resto,r.residuo))
    order by r.scadenza,r.fornitore,r.fonte_id) filter(where r.coerente),'[]'),
    count(*) filter(where not r.coerente)
  into risultato,scadute from attuali r;
  if scadute>0 then raise exception 'Le condizioni di pagamento sono cambiate. Controlla le partite rimaste nella distinta.' using errcode='PT409'; end if;
  return risultato;
end
$$;

create or replace function public.distinta_pagamenti_annulla(p_company uuid,p_id uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
  if not private.operazioni_puo_approvare(p_company) then raise exception 'Non puoi annullare la distinta' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_company::text,2810));
  -- Una distinta già approvata può essere stata consegnata alla banca.
  update private.distinte_pagamenti_fornitori set stato='annullata',annullata_il=now(),annullata_da=auth.uid()
  where id=p_id and company_id=p_company and stato in ('bozza','approvata')
    and not exists (select 1 from private.distinte_pagamenti_righe r where r.distinta_id=p_id
      and private.distinta_pagamenti_in_banca(p_company,r.tipo,r.fonte_id,approvata_il)>0);
  if not found then raise exception 'La distinta è chiusa o ha partite già riconciliate in banca.' using errcode='PT409'; end if;
end
$$;

revoke all on function private.distinta_pagamenti_partite(uuid,date),private.distinta_pagamenti_in_banca(uuid,text,uuid,timestamptz),
  private.distinta_pagamenti_riservata(uuid,text,uuid,uuid),private.distinta_pagamenti_problemi(uuid[])
from public,anon,authenticated,service_role;
revoke all on function public.distinta_pagamenti_proposte(uuid,date,integer),
  public.distinta_pagamenti_crea(uuid,date,uuid,jsonb),public.distinta_pagamenti_elenco(uuid,uuid),
  public.distinta_pagamenti_approva(uuid,uuid),public.distinta_pagamenti_annulla(uuid,uuid),public.distinta_pagamenti_esporta(uuid,uuid)
from public,anon,service_role;
grant execute on function public.distinta_pagamenti_proposte(uuid,date,integer),
  public.distinta_pagamenti_crea(uuid,date,uuid,jsonb),public.distinta_pagamenti_elenco(uuid,uuid),
  public.distinta_pagamenti_approva(uuid,uuid),public.distinta_pagamenti_annulla(uuid,uuid),public.distinta_pagamenti_esporta(uuid,uuid) to authenticated;
notify pgrst,'reload schema';

