// PostgreSQL locale, senza rete, credenziali o chiamate AI: contratti di coda.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const db=new PGlite();
const company='e1000000-0000-4000-a000-000000000001';
const other='e1000000-0000-4000-a000-000000000002';
const token='e2000000-0000-4000-a000-000000000001';
const next='e2000000-0000-4000-a000-000000000002';
const email='e3000000-0000-4000-a000-000000000001';
const value=async(sql,args=[]) => (await db.query(sql,args)).rows[0]?.v;
const claim=(id=email,t=token,force=false)=>value('select public.email_ai_prendi_lavoro($1,1,$2,$3) v',[id,t,force]);
const save=(t=token,patch={})=>value('select public.email_ai_salva_bozza($1,$2,$3) v',[email,t,JSON.stringify({tipo:'fattura',stato:'da_confermare',campi:{totale:{valore:10,conf:1}},dati_incerti:[],...patch})]);
try {
  await db.exec(`
    create role anon;create role authenticated;create role service_role bypassrls;
    create schema net;
    create table companies(id uuid primary key,payment_method text,status text);
    create table ai_credits(company_id uuid primary key,balance_eur numeric,free_balance_eur numeric default 0,calls_blocked boolean default false);
    create table ai_allarmi(provider text,motivo text,chiuso_il timestamptz);
    create table email_inbox(id uuid primary key,company_id uuid,attachments jsonb,categoria text,ai_category text,is_trashed boolean default false,received_at timestamptz default now(),user_id uuid);
    create table email_estrazione_tentativi(email_id uuid primary key,tentativi integer default 0,ultimo_esito text,ultimo_errore text,prossimo_tentativo timestamptz default now(),updated_at timestamptz default now());
    create table email_documento_estratto(id uuid primary key default gen_random_uuid(),company_id uuid,email_id uuid,tipo text not null,confidenza_tipo numeric,campi jsonb,dati_incerti text[],note text,stato text,fornitore_match_id uuid,fornitore_match_tipo text,dedup_fattura_id uuid,iban_estratto text,iban_alert boolean,pdf_storage_bucket text,pdf_storage_path text,created_by uuid,created_at timestamptz default now());
    create table fixture_checks(company_id uuid);
    create function user_can_access_company(p uuid) returns boolean language sql stable as $$select p=nullif(current_setting('fixture.company',true),'')::uuid$$;
    create function check_ai_credits_available(p_company_id uuid,p_est_cost_usd numeric,p_task_kind text,p_model_hint text)
      returns table(o_ok boolean,o_reason text,o_balance_eur numeric,o_est_cost_eur numeric) language plpgsql as $$begin
        if current_setting('request.jwt.claims',true)::jsonb->>'role'<>'service_role' then raise exception 'Missing trusted context';end if;
        insert into fixture_checks values(p_company_id);
        return query select not calls_blocked and balance_eur+free_balance_eur>=0.1,'ok'::text,balance_eur,0.1::numeric from ai_credits where company_id=p_company_id;
      end$$;
    create table fixture_http(body jsonb,timeout integer);
    create function net.http_post(url text,body jsonb,headers jsonb,timeout_milliseconds integer) returns bigint language plpgsql as $$begin
      insert into fixture_http values(body,timeout_milliseconds);return 1;end$$;
    create schema storage;create table storage.objects(bucket_id text,name text);
    alter table storage.objects enable row level security;grant usage on schema storage to authenticated;
    grant select on storage.objects,email_documento_estratto,email_inbox to authenticated;
    alter table email_documento_estratto enable row level security;
    create policy fixture_docs on email_documento_estratto for select to authenticated using(user_can_access_company(company_id));
  `);
  // Migrazione candidata resta fuori dalla cartella finché i controlli falliscono.
  const path=process.env.EMAIL_QUEUE_MIGRATION || 'supabase/migrations/20290506150000_email_ai_coda_per_azienda.sql';
  const sql=readFileSync(path,'utf8');
  await db.exec(sql);await db.exec(sql);
  const correction=readFileSync('supabase/migrations/20290506152000_email_ai_conflitto_senza_retry.sql','utf8');
  // Stesso percorso dell'ambiente preparato prima del deploy, poi replay nuovo.
  const saveDef=await value("select pg_get_functiondef('public.email_ai_salva_bozza(uuid,uuid,jsonb)'::regprocedure) v");
  await db.exec(saveDef.replace("'PT409'","'40001'"));
  await db.exec(correction);await db.exec(correction);
  assert.equal(await value('select filtro_attivo v from private.email_ai_coda_config'),false);
  await db.query("insert into companies values($1,'none','active'),($2,'stripe','active')",[company,other]);
  await db.query('insert into ai_credits(company_id,balance_eur) values($1,0),($2,10)',[company,other]);
  const attachments=JSON.stringify([{filename:'fattura.xml',storage_path:company+'/xml'},{filename:'fattura.pdf',storage_path:company+'/pdf'}]);
  await db.query('insert into email_inbox(id,company_id,attachments,categoria) values($1,$2,$3,\'fattura\')',[email,company,attachments]);
  await db.query("insert into email_inbox select gen_random_uuid(),$1,$2,'fattura',null,false,now(),null from generate_series(1,99)",[company,attachments]);
  await db.exec('update private.email_ai_coda_config set filtro_attivo=true');
  assert.equal((await value("select silvio_email_dispatch_fatture('fixture',15) v")).dispatched,0);
  assert.equal(await value('select count(*)::int v from fixture_http'),0);
  assert.equal(await value('select count(*)::int v from email_ai_coda_blocchi'),1);
  // Evento carta: il blocco pagamento si invalida, ma il credito resta obbligatorio.
  await db.query("update companies set payment_method='stripe' where id=$1",[company]);
  assert.equal(await value('select count(*)::int v from email_ai_coda_blocchi'),0);
  assert.equal((await value("select silvio_email_dispatch_fatture('fixture',15) v")).dispatched,0);
  assert.equal(await value('select count(*)::int v from fixture_checks'),1);
  assert.equal(await value('select count(*)::int v from fixture_http'),0);
  await db.query('update ai_credits set balance_eur=10 where company_id=$1',[company]);
  assert.equal(await value('select count(*)::int v from email_ai_coda_blocchi'),0);
  const oldClaims='{"role":"originale","sub":"non-mutare"}';
  await db.query("select set_config('request.jwt.claims',$1,false)",[oldClaims]);
  assert.equal((await value("select silvio_email_dispatch_fatture('fixture',5) v")).dispatched,5);
  assert.equal(await value("select current_setting('request.jwt.claims') v"),oldClaims);
  assert.equal(await value("select count(*)::int v from fixture_http where body->>'attachment_index'='1' and timeout=15000"),5);
  assert.equal((await value("select silvio_email_dispatch_fatture('fixture',5) v")).dispatched,5);
  assert.equal(await value("select count(distinct body->>'email_id')::int v from fixture_http"),10);
  await db.query('update email_inbox set attachments=$1 where id=$2',[JSON.stringify([{},{storage_path:other+'/privato.pdf'}]),email]);
  assert.equal((await claim()).motivo,'allegato_non_accessibile');
  await db.query('update email_inbox set attachments=$1 where id=$2',[attachments,email]);
  // Solo una presa; il token superato non salva e non rilascia il successore.
  const claims=await Promise.all([claim(),claim(email,next)]);
  assert.equal(claims.filter(x=>x.presa).length,1);
  await db.exec("update private.email_ai_lavori set scade_il=clock_timestamp()-interval '1 second'");
  assert.equal((await claim(email,next)).presa,true);
  await assert.rejects(save(token),{code:'PT409',message:'Presa in carico scaduta: la bozza non è stata modificata'});
  assert.equal(await value("select email_ai_registra_fallimento($1,$2,'vision_error','worker superato') v",[email,token]),false);
  await db.query('select email_ai_rilascia_lavoro($1,$2)',[email,token]);
  assert.equal(await value('select token v from private.email_ai_lavori where email_id=$1',[email]),next);
  assert.equal(await value("select email_ai_registra_fallimento($1,$2,'vision_error','temporaneo') v",[email,next]),true);
  assert.equal(await value('select tentativi v from email_estrazione_tentativi where email_id=$1',[email]),1);
  const draft=await save(next);
  assert.equal(draft.company_id,company);assert.equal(draft.pdf_storage_path,company+'/pdf');
  assert.equal(draft.stato,'da_confermare');
  assert.equal((await claim()).motivo,'gia_pronto');
  // La rilettura manuale resta disponibile sulle bozze, mai sui confermati.
  assert.equal((await claim(email,token,true)).presa,true);
  await assert.rejects(save(token,{tipo:null}),/null value/);
  assert.equal(await value('select id v from email_documento_estratto where email_id=$1',[email]),draft.id);
  await save(token);
  await db.query("update email_documento_estratto set stato='confermato' where email_id=$1",[email]);
  assert.equal((await claim(email,next,true)).motivo,'gia_pronto');
  // Guasto provider: nessuna chiamata; ripresa soltanto dopo chiusura allarme.
  await db.exec("insert into ai_allarmi values('openrouter','credito_esaurito',null);truncate fixture_http");
  assert.equal((await value("select silvio_email_dispatch_fatture('fixture',5) v")).dispatched,0);
  await db.exec('update ai_allarmi set chiuso_il=now()');
  await db.exec("update email_estrazione_tentativi set prossimo_tentativo=now()-interval '1 second'");
  assert.equal((await value("select silvio_email_dispatch_fatture('fixture',5) v")).dispatched,5);
  // Una bozza della propria azienda che punta al file altrui non apre Storage.
  await db.query("insert into email_documento_estratto(company_id,email_id,tipo,stato,pdf_storage_bucket,pdf_storage_path) values($1,$2,'fattura','da_confermare','email-attachments',$3)",[company,email,other+'/privato.pdf']);
  await db.query("insert into storage.objects values('email-attachments',$1),('email-attachments',$2)",[company+'/pdf',other+'/privato.pdf']);
  // Nessun RPC operativo o tabella privata esposti agli utenti.
  await db.exec('set role authenticated');
  await assert.rejects(claim(),/permission denied/);
  await assert.rejects(save(),/permission denied/);
  await assert.rejects(db.query('select * from private.email_ai_lavori'),/permission denied/);
  await db.query("select set_config('fixture.company',$1,false)",[other]);
  assert.equal(await value('select count(*)::int v from email_ai_coda_blocchi'),0);
  await db.query("select set_config('fixture.company',$1,false)",[company]);
  assert.deepEqual((await db.query('select name from storage.objects')).rows.map(x=>x.name),[company+'/pdf']);
  await db.exec('reset role;set role anon');
  await assert.rejects(db.query('select * from email_ai_coda_blocchi'),/permission denied/);
  console.log('PostgreSQL locale: blocco azienda, sblocco, niente HTTP inutili, indice PDF, claim esclusivo, fencing, bozza atomica e isolamento verificati.');
} catch(e) {
  console.error('Prova coda fallita:',{message:e.message,code:e.code,where:e.where});
  process.exitCode=1;
} finally {await db.close();}
