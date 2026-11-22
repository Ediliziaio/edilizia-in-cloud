-- Preparazione compatibile: attivare il filtro solo dopo il deploy dell'edge.
set local lock_timeout = '3s';
set local statement_timeout = '60s';

create schema if not exists private;
create table if not exists private.email_ai_coda_config (
  id boolean primary key default true check (id),
  filtro_attivo boolean not null default false
);
insert into private.email_ai_coda_config(id) values(true) on conflict do nothing;
alter table private.email_ai_coda_config enable row level security;
revoke all on private.email_ai_coda_config from public, anon, authenticated;

create table if not exists public.email_ai_coda_blocchi (
  company_id uuid primary key references public.companies(id) on delete cascade,
  servizio text not null default 'email_allegati' check(servizio='email_allegati'),
  motivo text not null check(motivo in ('pagamento','credito_azienda','provider','verifica')),
  messaggio text not null,
  bloccata_il timestamptz not null default clock_timestamp(),
  verificata_il timestamptz not null default clock_timestamp()
);
alter table public.email_ai_coda_blocchi enable row level security;
revoke all on public.email_ai_coda_blocchi from public, anon, authenticated;
grant select on public.email_ai_coda_blocchi to authenticated;
drop policy if exists email_ai_blocchi_propria_azienda on public.email_ai_coda_blocchi;
create policy email_ai_blocchi_propria_azienda on public.email_ai_coda_blocchi
  for select to authenticated using(public.user_can_access_company(company_id));

-- Una bozza modificabile non deve diventare un riferimento a file di un'altra
-- azienda. Mantiene la condivisione delle bozze lecite e il formato storico user/….
drop policy if exists email_attachments_bozza_read on storage.objects;
create policy email_attachments_bozza_read on storage.objects for select to authenticated using (
  bucket_id='email-attachments' and exists (
    select 1 from public.email_documento_estratto d where d.pdf_storage_bucket='email-attachments'
      and d.pdf_storage_path=objects.name
      and (split_part(objects.name,'/',1)=d.company_id::text or exists (
        select 1 from public.email_inbox e where e.id=d.email_id and e.company_id=d.company_id
          and split_part(objects.name,'/',1)=e.user_id::text
      ))
  )
);

create table if not exists private.email_ai_lavori (
  email_id uuid primary key references public.email_inbox(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  token uuid not null,
  allegato_path text not null,
  scade_il timestamptz not null
);
alter table private.email_ai_lavori enable row level security;
revoke all on private.email_ai_lavori from public, anon, authenticated;

-- Usa lo stesso controllo credito delle chiamate reali (incluso rinnovo mensile).
-- Il helper è privato e non eseguibile da utenti: il claim service è temporaneo,
-- restaurato anche in caso di errore, mai lasciato alla chiamata esterna.
create or replace function private.email_ai_stato_azienda(p_company uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  c record; v_motivo text; v_msg text; v_credito record;
  v_claims text := current_setting('request.jwt.claims',true);
begin
  select lower(coalesce(payment_method,'none')) metodo, lower(coalesce(status,'')) stato
    into c from public.companies where id=p_company;
  if not found then return jsonb_build_object('pronta',false,'motivo','azienda_non_trovata'); end if;
  if p_company not in ('778a2c76-1253-49f2-a5e8-283363ac3e29'::uuid,'d2000000-0000-4000-a000-000000000002'::uuid)
     and c.metodo not in ('comped','complimentary','comp','manual_free','gift','gifted','gratis','omaggio')
     and (c.metodo not in ('stripe','bank_transfer','sepa_debit','other')
          or c.stato in ('suspended','cancelled','canceled','expired')) then
    v_motivo := 'pagamento';
    v_msg := case when c.stato in ('suspended','cancelled','canceled','expired')
      then 'Estrazione automatica in attesa: rinnova l’abbonamento per riprendere.'
      else 'Estrazione automatica in attesa: registra un metodo di pagamento in Impostazioni → Fatturazione.' end;
  elsif exists(select 1 from public.ai_allarmi where provider='openrouter' and chiuso_il is null
    and motivo in ('credito_esaurito','chiave_non_valida','limite_chiave')) then
    v_motivo := 'provider';
    v_msg := 'Estrazione automatica in attesa del ripristino del servizio AI. I documenti restano in coda.';
  else
    begin
      perform set_config('request.jwt.claims', (coalesce(nullif(v_claims,''),'{}')::jsonb || '{"role":"service_role"}'::jsonb)::text, true);
      select * into v_credito from public.check_ai_credits_available(p_company,0.036,'email_estrai_allegato',null);
      perform set_config('request.jwt.claims',coalesce(v_claims,''),true);
      if not coalesce(v_credito.o_ok,false) then
        v_motivo := 'credito_azienda';
        v_msg := 'Estrazione automatica in attesa: verifica i crediti AI. Riprende dopo la ricarica o lo sblocco.';
      end if;
    exception when others then
      perform set_config('request.jwt.claims',coalesce(v_claims,''),true);
      v_motivo := 'verifica';
      v_msg := 'Non riesco a verificare il credito AI. I documenti restano in coda, senza avviare nuove letture.';
    end;
  end if;
  if v_motivo is not null then
    insert into public.email_ai_coda_blocchi(company_id,motivo,messaggio)
      values(p_company,v_motivo,v_msg)
      on conflict(company_id) do update set motivo=excluded.motivo,messaggio=excluded.messaggio,
        verificata_il=clock_timestamp(),
        bloccata_il=case when email_ai_coda_blocchi.motivo=excluded.motivo then email_ai_coda_blocchi.bloccata_il else clock_timestamp() end;
    return jsonb_build_object('pronta',false,'motivo',v_motivo,'messaggio',v_msg);
  end if;
  delete from public.email_ai_coda_blocchi where company_id=p_company;
  return jsonb_build_object('pronta',true);
end $$;
revoke all on function private.email_ai_stato_azienda(uuid) from public,anon,authenticated;

create or replace function public.email_ai_prendi_lavoro(p_email uuid,p_indice integer,p_token uuid,p_rileggi boolean default false)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_company uuid; v_owner uuid; v_path text; v_existing uuid; v_stato jsonb; v_presa uuid;
begin
  if p_token is null or p_indice is null or p_indice<0 then raise exception 'Lavoro non valido'; end if;
  select company_id,user_id,attachments->p_indice->>'storage_path' into v_company,v_owner,v_path from public.email_inbox where id=p_email;
  if v_company is null or v_path is null then return jsonb_build_object('presa',false,'motivo','allegato_non_trovato'); end if;
  if split_part(v_path,'/',1) not in (v_company::text,coalesce(v_owner::text,''))
    or v_path like '%\\%' or v_path ~ '(^|/)\.{1,2}(/|$)' or v_path ~* '%(2e|2f|5c)' or v_path like '%//%'
    then return jsonb_build_object('presa',false,'motivo','allegato_non_accessibile'); end if;
  select id into v_existing from public.email_documento_estratto
    where company_id=v_company and email_id=p_email and pdf_storage_path=v_path and stato<>'scartato'
    order by created_at desc limit 1;
  if v_existing is not null and (not coalesce(p_rileggi,false) or exists(select 1 from public.email_documento_estratto where id=v_existing and stato not in ('da_confermare','duplicato'))) then
    return jsonb_build_object('presa',false,'motivo','gia_pronto','bozza_id',v_existing);
  end if;
  v_stato := private.email_ai_stato_azienda(v_company);
  if not coalesce((v_stato->>'pronta')::boolean,false) then return v_stato || '{"presa":false}'::jsonb; end if;
  insert into private.email_ai_lavori(email_id,company_id,token,allegato_path,scade_il)
    values(p_email,v_company,p_token,v_path,clock_timestamp()+interval '5 minutes')
    on conflict(email_id) do update set token=excluded.token,allegato_path=excluded.allegato_path,scade_il=excluded.scade_il
      where email_ai_lavori.scade_il<clock_timestamp()
    returning token into v_presa;
  return jsonb_build_object('presa',v_presa is not null,'motivo',case when v_presa is null then 'in_corso' else 'pronto' end);
end $$;
revoke all on function public.email_ai_prendi_lavoro(uuid,integer,uuid,boolean) from public,anon,authenticated;
grant execute on function public.email_ai_prendi_lavoro(uuid,integer,uuid,boolean) to service_role;

create or replace function public.email_ai_rilascia_lavoro(p_email uuid,p_token uuid)
returns void language sql security definer set search_path=public,pg_temp as $$
  delete from private.email_ai_lavori where email_id=p_email and token=p_token;
$$;
revoke all on function public.email_ai_rilascia_lavoro(uuid,uuid) from public,anon,authenticated;
grant execute on function public.email_ai_rilascia_lavoro(uuid,uuid) to service_role;

create or replace function public.email_ai_registra_fallimento(p_email uuid,p_token uuid,p_esito text,p_errore text)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare l private.email_ai_lavori%rowtype; t public.email_estrazione_tentativi%rowtype; v_tentativi integer; v_minuti integer;
begin
  if p_esito not in ('credito','vision_error','troncato','parse_failed') then raise exception 'Esito non valido'; end if;
  select * into l from private.email_ai_lavori where email_id=p_email for update;
  if not found or l.token<>p_token or l.scade_il<=clock_timestamp() then return false; end if;
  select * into t from public.email_estrazione_tentativi where email_id=p_email;
  v_tentativi:=case when p_esito='credito' then 0 else case when t.ultimo_esito='credito' then 0 else coalesce(t.tentativi,0) end+1 end;
  v_minuti:=case when p_esito='credito' then 60 else least(1440,30*power(2,least(v_tentativi,10))::integer) end;
  insert into public.email_estrazione_tentativi(email_id,tentativi,ultimo_esito,ultimo_errore,prossimo_tentativo,updated_at)
    values(p_email,v_tentativi,p_esito,left(p_errore,300),clock_timestamp()+make_interval(mins=>v_minuti),clock_timestamp())
    on conflict(email_id) do update set tentativi=excluded.tentativi,ultimo_esito=excluded.ultimo_esito,
      ultimo_errore=excluded.ultimo_errore,prossimo_tentativo=excluded.prossimo_tentativo,updated_at=excluded.updated_at;
  return true;
end $$;
revoke all on function public.email_ai_registra_fallimento(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.email_ai_registra_fallimento(uuid,uuid,text,text) to service_role;

create or replace function public.email_ai_salva_bozza(p_email uuid,p_token uuid,p_dati jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare l private.email_ai_lavori%rowtype; d public.email_documento_estratto%rowtype;
begin
  select * into l from private.email_ai_lavori where email_id=p_email for update;
  if not found or l.token<>p_token or l.scade_il<=clock_timestamp() then
    raise exception 'Presa in carico scaduta: la bozza non è stata modificata' using errcode='40001';
  end if;
  if p_dati->>'stato' not in ('da_confermare','duplicato') or p_dati->>'stato' is null then raise exception 'Stato bozza non valido'; end if;
  if exists(select 1 from public.email_documento_estratto where email_id=p_email and pdf_storage_path=l.allegato_path and stato not in ('da_confermare','duplicato','scartato')) then
    raise exception 'Il documento è già stato confermato: non viene sostituito';
  end if;
  delete from public.email_documento_estratto where email_id=p_email and pdf_storage_path=l.allegato_path and stato in ('da_confermare','duplicato');
  insert into public.email_documento_estratto(company_id,email_id,tipo,confidenza_tipo,campi,dati_incerti,note,stato,
    fornitore_match_id,fornitore_match_tipo,dedup_fattura_id,iban_estratto,iban_alert,pdf_storage_bucket,pdf_storage_path,created_by)
  values(l.company_id,p_email,p_dati->>'tipo',(p_dati->>'confidenza_tipo')::numeric,p_dati->'campi',
    array(select jsonb_array_elements_text(p_dati->'dati_incerti')),p_dati->>'note',p_dati->>'stato',
    (p_dati->>'fornitore_match_id')::uuid,p_dati->>'fornitore_match_tipo',(p_dati->>'dedup_fattura_id')::uuid,
    p_dati->>'iban_estratto',coalesce((p_dati->>'iban_alert')::boolean,false),'email-attachments',l.allegato_path,(p_dati->>'created_by')::uuid)
    returning * into d;
  delete from public.email_estrazione_tentativi where email_id=p_email;
  delete from private.email_ai_lavori where email_id=p_email and token=p_token;
  return to_jsonb(d);
end $$;
revoke all on function public.email_ai_salva_bozza(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.email_ai_salva_bozza(uuid,uuid,jsonb) to service_role;

-- Un evento di sblocco invalida l'attesa; il dispatcher rifà SEMPRE le guardie
-- prima di inviare il lavoro, quindi una semplice modifica non autorizza spesa.
create or replace function private.email_ai_sveglia_azienda()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare v_company uuid;
begin
  if tg_table_name='companies' then v_company:=new.id; else v_company:=new.company_id; end if;
  delete from public.email_ai_coda_blocchi where company_id=v_company
    and motivo in ('pagamento','credito_azienda','verifica');
  return new;
end $$;
revoke all on function private.email_ai_sveglia_azienda() from public,anon,authenticated;
drop trigger if exists email_ai_pagamento_sbloccato on public.companies;
create trigger email_ai_pagamento_sbloccato after update of payment_method,status on public.companies
  for each row when(old.payment_method is distinct from new.payment_method or old.status is distinct from new.status)
  execute function private.email_ai_sveglia_azienda();
drop trigger if exists email_ai_credito_sbloccato on public.ai_credits;
create trigger email_ai_credito_sbloccato after insert or update of balance_eur,free_balance_eur,calls_blocked on public.ai_credits
  for each row execute function private.email_ai_sveglia_azienda();

-- Il filtro nuovo si attiva soltanto dopo che la funzione rapida con claim è online.
create or replace function public.silvio_email_dispatch_fatture(p_cron_secret text,p_limit integer default 5)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare rec record; az record; v_n integer:=0; v_sospese integer:=0; v_stato jsonb; v_limit integer:=greatest(1,least(coalesce(p_limit,5),15));
begin
  if not coalesce((select filtro_attivo from private.email_ai_coda_config where id),false) then
    for rec in
      select e.id from public.email_inbox e
      where (e.categoria::text in ('fattura','fornitore') or e.ai_category in ('fattura','fornitore'))
        and not coalesce(e.is_trashed,false) and jsonb_typeof(e.attachments)='array' and jsonb_array_length(e.attachments)>0
        and exists(select 1 from jsonb_array_elements(case when jsonb_typeof(e.attachments)='array' then e.attachments else '[]'::jsonb end) a where lower(coalesce(a->>'filename','')) like '%.pdf' or lower(coalesce(a->>'mime','')) like '%pdf%')
        and not exists(select 1 from public.email_documento_estratto d where d.email_id=e.id)
        and not exists(select 1 from public.email_estrazione_tentativi t where t.email_id=e.id and(t.prossimo_tentativo>now() or(coalesce(t.ultimo_esito,'')<>'credito' and t.tentativi>=6)))
      order by e.received_at desc limit v_limit
    loop
      perform net.http_post(url:='https://rsbrguhkodgnqfomrevo.supabase.co/functions/v1/email-ai-estrai-allegato',headers:=jsonb_build_object('Content-Type','application/json','x-cron-secret',p_cron_secret),body:=jsonb_build_object('email_id',rec.id,'attachment_index',0),timeout_milliseconds:=120000);
      v_n:=v_n+1;
    end loop;
    return jsonb_build_object('dispatched',v_n);
  end if;
  -- Due giri sovrapposti non scelgono lo stesso lotto.
  if not pg_try_advisory_xact_lock(hashtextextended('email-ai-dispatch-fatture',0)) then return jsonb_build_object('dispatched',0,'in_corso',true); end if;
  for az in
    select e.company_id,max(e.received_at) ultima
    from public.email_inbox e
    where (e.categoria::text in ('fattura','fornitore') or e.ai_category in ('fattura','fornitore'))
      and not coalesce(e.is_trashed,false) and jsonb_typeof(e.attachments)='array'
      and exists(select 1 from jsonb_array_elements(case when jsonb_typeof(e.attachments)='array' then e.attachments else '[]'::jsonb end) a where (lower(coalesce(a->>'filename','')) like '%.pdf' or lower(coalesce(a->>'mime',a->>'mime_type','')) like '%pdf%') and nullif(a->>'storage_path','') is not null)
      and not exists(select 1 from public.email_documento_estratto d where d.email_id=e.id)
      and not exists(select 1 from public.email_estrazione_tentativi t where t.email_id=e.id and coalesce(t.ultimo_esito,'')<>'credito' and(t.prossimo_tentativo>now() or t.tentativi>=6))
      and not exists(select 1 from private.email_ai_lavori l where l.email_id=e.id and l.scade_il>clock_timestamp())
    group by e.company_id order by coalesce((select b.verificata_il from public.email_ai_coda_blocchi b where b.company_id=e.company_id),'epoch'::timestamptz),ultima desc limit 100
  loop
    v_stato:=private.email_ai_stato_azienda(az.company_id);
    if not coalesce((v_stato->>'pronta')::boolean,false) then v_sospese:=v_sospese+1; continue; end if;
    for rec in
      select e.id,(a.ord-1)::integer indice from public.email_inbox e
      cross join lateral (select item,ord from jsonb_array_elements(case when jsonb_typeof(e.attachments)='array' then e.attachments else '[]'::jsonb end) with ordinality t(item,ord)
        where (lower(coalesce(item->>'filename','')) like '%.pdf' or lower(coalesce(item->>'mime',item->>'mime_type','')) like '%pdf%')
          and nullif(item->>'storage_path','') is not null order by ord limit 1) a
      where e.company_id=az.company_id and (e.categoria::text in ('fattura','fornitore') or e.ai_category in ('fattura','fornitore'))
        and not coalesce(e.is_trashed,false)
        and not exists(select 1 from public.email_documento_estratto d where d.email_id=e.id)
        and not exists(select 1 from public.email_estrazione_tentativi t where t.email_id=e.id and coalesce(t.ultimo_esito,'')<>'credito' and(t.prossimo_tentativo>now() or t.tentativi>=6))
        and not exists(select 1 from private.email_ai_lavori l where l.email_id=e.id and l.scade_il>clock_timestamp())
      order by e.received_at desc limit v_limit-v_n
    loop
      -- Prenota il passaggio HTTP: la funzione prende poi il token di lavoro.
      insert into public.email_estrazione_tentativi(email_id,ultimo_esito,prossimo_tentativo)
        values(rec.id,'inviato',clock_timestamp()+interval '5 minutes')
        on conflict(email_id) do update set tentativi=case when email_estrazione_tentativi.ultimo_esito='credito' then 0 else email_estrazione_tentativi.tentativi end,
          ultimo_esito='inviato',prossimo_tentativo=excluded.prossimo_tentativo;
      perform net.http_post(url:='https://rsbrguhkodgnqfomrevo.supabase.co/functions/v1/email-ai-estrai-allegato',headers:=jsonb_build_object('Content-Type','application/json','x-cron-secret',p_cron_secret),body:=jsonb_build_object('email_id',rec.id,'attachment_index',rec.indice),timeout_milliseconds:=15000);
      v_n:=v_n+1;
    end loop;
    exit when v_n>=v_limit;
  end loop;
  return jsonb_build_object('dispatched',v_n,'aziende_in_attesa',v_sospese);
end $$;
revoke all on function public.silvio_email_dispatch_fatture(text,integer) from public,anon,authenticated;
grant execute on function public.silvio_email_dispatch_fatture(text,integer) to service_role;
