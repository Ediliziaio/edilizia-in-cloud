-- SOLO database locale vuoto: crea fixture, nessun collegamento a Supabase.
\set ON_ERROR_STOP on
do $$begin
 if current_database()<>'eic_chat_salute_test' or inet_server_addr() is not null then
   raise exception 'Usare solo eic_chat_salute_test su socket locale';
 end if;
 if not exists(select 1 from pg_roles where rolname='anon') then create role anon; end if;
 if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
 if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role; end if;
end $$;
create schema auth; create schema net;
create function auth.uid() returns uuid language sql as $$select null::uuid$$;
create function public.is_super_admin(uuid) returns boolean language sql as $$select current_setting('test.admin',true)='true'$$;
create function public.is_platform_staff(uuid) returns boolean language sql as $$select false$$;
select set_config('test.admin','true',false);
create table public.email_inbox(id uuid primary key,categoria text,ai_category text,is_trashed boolean,received_at timestamptz);
create table public.email_opportunita_bozza(email_id uuid);
create table public.companies(id uuid primary key,name text);
create table public.v_errori_piattaforma(origine text,id text,avvenuto_il timestamptz,componente text,messaggio text,codice integer,azienda_id uuid,gravita text,dettaglio jsonb);
create table net.chiamate(id bigserial primary key,body jsonb);
create function net.http_post(url text,headers jsonb,body jsonb,timeout_milliseconds integer) returns bigint language sql as $$
 insert into net.chiamate(body) values(body) returning id;
$$;
begin;
\ir ../../../docs/sql-proposte/20290421153000_chat_salute_retry.sql
commit;

insert into public.email_inbox values
 ('00000000-0000-0000-0000-000000000001','preventivo',null,false,now()),
 ('00000000-0000-0000-0000-000000000002','fattura',null,false,now()),
 ('00000000-0000-0000-0000-000000000003','opportunita',null,false,now());
insert into public.email_opportunita_bozza values('00000000-0000-0000-0000-000000000003');

do $$declare r jsonb; t public.email_opportunita_tentativi; begin
 r:=public.silvio_email_dispatch_opportunita('test',10);
 if r->>'dispatched'<>'1' then raise exception 'Prima presa in carico: %',r; end if;
 r:=public.silvio_email_dispatch_opportunita('test',10);
 if r->>'dispatched'<>'0' then raise exception 'Lease non rispettata'; end if;
 if (select count(*) from net.chiamate)<>1 then raise exception 'Doppio invio'; end if;
 perform public.email_opportunita_segna_tentativo('00000000-0000-0000-0000-000000000001','credito','Crediti esauriti');
 select * into t from public.email_opportunita_tentativi limit 1;
 if t.tentativi<>1 or t.ultimo_esito<>'credito' or t.prossimo_tentativo<now()+interval '59 minutes' then
   raise exception 'Rinvio credito errato: %',t;
 end if;
 r:=public.silvio_email_dispatch_opportunita('test',10);
 if r->>'dispatched'<>'0' then raise exception 'Retry anticipato'; end if;
 update public.email_opportunita_tentativi set prossimo_tentativo=now()-interval '1 second';
 r:=public.silvio_email_dispatch_opportunita('test',10);
 if r->>'dispatched'<>'1' then raise exception 'Lavoro non ripreso'; end if;
 perform public.email_opportunita_segna_tentativo('00000000-0000-0000-0000-000000000001','errore','Provider non disponibile');
 select * into t from public.email_opportunita_tentativi limit 1;
 if t.tentativi<>2 or t.errori_consecutivi<>1 or t.prossimo_tentativo<now()+interval '59 minutes' then raise exception 'Backoff tecnico errato'; end if;
 update public.email_opportunita_tentativi set prossimo_tentativo=now()-interval '1 second',tentativi=6,errori_consecutivi=6,ultimo_esito='errore';
 r:=public.silvio_email_dispatch_opportunita('test',10);
 if r->>'dispatched'<>'0' then raise exception 'Tetto fallimenti ignorato'; end if;
 perform public.email_opportunita_segna_tentativo('00000000-0000-0000-0000-000000000001','credito','Ricarica in attesa');
 update public.email_opportunita_tentativi set prossimo_tentativo=now()-interval '1 second';
 r:=public.silvio_email_dispatch_opportunita('test',10);
 if r->>'dispatched'<>'1' then raise exception 'Credito impedisce ripresa definitiva'; end if;
 if has_table_privilege('authenticated','public.email_opportunita_tentativi','select') then raise exception 'Tentativi esposti'; end if;
 if has_function_privilege('anon','public.email_opportunita_segna_tentativo(uuid,text,text)','execute') then raise exception 'RPC di lavoro esposta'; end if;
end $$;

insert into public.v_errori_piattaforma
 select 'cron',n::text,now(),'chiamata pianificata','{"error":"insufficient_credits"}',402,null,'avviso',null from generate_series(1,1000) n;
insert into public.v_errori_piattaforma values
 ('edge','guasto',now()-interval '4 hours','server','Guasto tecnico',503,null,'grave',null),
 ('edge','402-provider',now()-interval '5 hours','provider','Credito provider',402,null,'avviso',null),
 ('edge','vecchio',now()-interval '49 hours','server','Guasto vecchio',500,null,'grave',null);
do $$declare r record; begin
 select * into r from public.admin_errori_raggruppati(48,null,1);
 if r.messaggio<>'Guasto tecnico' or r.categoria<>'errore_tecnico' then raise exception 'Guasto nascosto dai 402: %',r; end if;
 select * into r from public.admin_errori_raggruppati(48,null,100) where categoria='azione_richiesta';
 if r.numero_eventi<>1000 then raise exception 'Occorrenze perse: %',r; end if;
 if exists(select 1 from public.admin_errori_raggruppati(48,null,100) where messaggio='Guasto vecchio') then raise exception 'Finestra temporale ignorata'; end if;
 if not exists(select 1 from public.admin_errori_raggruppati(48,null,100) where messaggio='Credito provider' and categoria='errore_tecnico') then raise exception '402 ignoto nascosto'; end if;
 if has_function_privilege('anon','public.admin_errori_raggruppati(integer,text,integer)','execute') then raise exception 'Salute esposta ad anon'; end if;
 perform set_config('test.admin','false',false);
 begin
   perform public.admin_errori_raggruppati(48,null,100);
   raise exception 'Salute accessibile senza autorizzazione';
 exception when insufficient_privilege then null; end;
end $$;
select 'PASS: lease, backoff, ripresa, limiti, raggruppamento prima del limite, autorizzazioni' as esito;
