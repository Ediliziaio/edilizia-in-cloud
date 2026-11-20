import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const pg = new PGlite();
const proposta = 'supabase/migrations/20290422195000_fasi_metriche_email_sblocco.sql';
const company='aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa', order='bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb';
const user='dddddddd-dddd-4ddd-dddd-dddddddddddd', other='eeeeeeee-eeee-4eee-eeee-eeeeeeeeeeee';
const ids=['11111111-1111-4111-a111-111111111111','22222222-2222-4222-a222-222222222222','33333333-3333-4333-a333-333333333333'];
const email='55555555-5555-4555-a555-555555555555';
function funzione(sql:string,name:string) {
  const start=sql.toLowerCase().indexOf(`create or replace function public.${name}(`);
  if(start<0) throw new Error(name);
  const rest=sql.slice(start); const match=rest.match(/\bas\s+(\$[a-z_]*\$)/i);
  if(!match) throw new Error(name);
  const end=rest.indexOf(match[1],match.index!+match[0].length);
  return rest.slice(0,end+match[1].length)+';';
}
beforeAll(async()=>{
  await pg.exec(`create schema auth; create schema net; create role anon; create role authenticated; create role service_role;
    create table ctx(company uuid,uid uuid,edit boolean,view_orders boolean,visible boolean,blocked boolean,external_user boolean,admin boolean,staff boolean);
    insert into ctx values('${company}','${user}',true,true,true,false,false,true,false);
    create function auth.uid() returns uuid language sql stable as $$select uid from ctx$$;
    create function utente_bloccato() returns boolean language sql stable as $$select blocked from ctx$$;
    create function utente_e_cliente_esterno() returns boolean language sql stable as $$select external_user from ctx$$;
    create function user_can_access_company(uuid) returns boolean language sql stable as $$select $1=company from ctx$$;
    create function assert_company_access(uuid) returns void language plpgsql as $$begin if not user_can_access_company($1) then raise exception 'Azienda estranea' using errcode='42501'; end if; end$$;
    create function has_permission_for_company(uuid,text,uuid) returns boolean language sql stable as $$select $3=company and case $2 when 'can_edit_orders' then edit else view_orders end from ctx$$;
    create function check_staff_visibility(uuid,uuid) returns boolean language sql stable as $$select visible from ctx$$;
    create function is_super_admin(uuid) returns boolean language sql stable as $$select admin from ctx$$;
    create function is_platform_staff(uuid) returns boolean language sql stable as $$select staff from ctx$$;
    create table orders(id uuid primary key,company_id uuid,assigned_to uuid,deleted_at timestamptz);
    create table order_work_phases(id uuid primary key,company_id uuid,order_id uuid references orders(id),name text,position integer);
    create table system_health_metrics(metric_type text,function_name text,status_code integer,latency_ms integer,recorded_at timestamptz default now());
    create table subscription_plans(id uuid primary key,monthly_free_ai_eur numeric);
    create table companies(id uuid primary key,payment_method text,status text,subscription_plan_id uuid);
    create table ai_credits(company_id uuid primary key,balance_eur numeric default 0,free_balance_eur numeric default 0,free_period_start date,calls_blocked boolean default false,free_granted_eur numeric,updated_at timestamptz);
    create table ai_credit_transactions(company_id uuid,tipo text,crediti numeric,saldo_prima numeric,saldo_dopo numeric,descrizione text,metadata jsonb);
    create table platform_settings(key text primary key,value text);
    create table ai_pricing_markup(task_kind text,model_pattern text,enabled boolean,markup_multiplier numeric);
    create table email_inbox(id uuid primary key,company_id uuid,categoria text,ai_category text,is_trashed boolean,received_at timestamptz default now());
    create table email_opportunita_bozza(email_id uuid);
    create table email_opportunita_tentativi(email_id uuid primary key references email_inbox(id),tentativi integer default 0,errori_consecutivi integer default 0,ultimo_esito text,ultimo_errore text,prossimo_tentativo timestamptz,updated_at timestamptz default now());
    create table net.requests(id bigserial primary key,body jsonb,headers jsonb,timeout_ms integer);
    create function net.http_post(url text,headers jsonb,body jsonb,timeout_milliseconds integer) returns bigint language plpgsql as $$declare v_id bigint; begin insert into net.requests(body,headers,timeout_ms) values(body,headers,timeout_milliseconds) returning id into v_id; return v_id; end$$;`);
  const billing=await readFile('supabase/migrations/20280130000000_ai_crediti_omaggio_mensili.sql','utf8');
  await pg.exec(funzione(billing,'ensure_monthly_free_ai_credits'));
  await pg.exec(funzione(billing,'check_ai_credits_available'));
  const sql=await readFile(proposta,'utf8'); await pg.exec(sql); await pg.exec(sql);
},30000);
afterAll(()=>pg.close());
beforeEach(async()=>{
  await pg.exec(`drop trigger if exists fail_reorder on order_work_phases;
    truncate order_work_phases,orders,system_health_metrics,companies,subscription_plans,ai_credits,ai_credit_transactions,platform_settings,ai_pricing_markup,email_opportunita_tentativi,email_opportunita_bozza,email_inbox,net.requests;
    update ctx set company='${company}',uid='${user}',edit=true,view_orders=true,visible=true,blocked=false,external_user=false,admin=true,staff=false;
    insert into orders values('${order}','${company}',null,null),('${other}','${other}',null,null);
    insert into order_work_phases values('${ids[0]}','${company}','${order}','A',0),('${ids[1]}','${company}','${order}','B',1),('${ids[2]}','${company}','${order}','C',2);
    insert into companies values('${company}','stripe','active','${other}');
    insert into subscription_plans values('${other}',0);
    insert into ai_credits(company_id,balance_eur,free_balance_eur,free_period_start) values('${company}',1,0,date_trunc('month',now())::date);
    insert into email_inbox(id,company_id,categoria) values('${email}','${company}','preventivo');`);
});
async function reorder(next= [ids[2],ids[0],ids[1]], expected:unknown=ids) {
  return pg.query('select riordina_fasi_commessa($1,$2::uuid[],$3::uuid[]) as n',[order,next,expected]);
}
async function positions() { return (await pg.query('select id,position from order_work_phases where order_id=$1 order by id',[order])).rows; }
async function dispatch(){ return (await pg.query<{n:{dispatched:number}}>("select silvio_email_dispatch_opportunita('cron-di-prova',10) as n")).rows[0].n.dispatched; }
async function ready(){return(await pg.query<{ok:boolean}>('select email_opportunita_puo_elaborare($1) as ok',[company])).rows[0].ok;}

describe('Riordino atomico delle fasi',()=>{
  it('salva tutte le posizioni e accetta il retry di una risposta persa',async()=>{
    await reorder(); expect((await positions()).map(r=>r.position)).toEqual([1,2,0]);
    expect((await reorder()).rows[0]).toEqual({n:0});
  });
  it('un trigger che rifiuta una fase annulla anche le altre scritture',async()=>{
    const before=await positions();
    await pg.exec(`create or replace function fail_phase() returns trigger language plpgsql as $$begin if new.name='B' then raise exception 'Errore simulato' using errcode='23514'; end if; return new; end$$;
      create trigger fail_reorder before update on order_work_phases for each row execute function fail_phase();`);
    await expect(reorder()).rejects.toMatchObject({code:'23514'});expect(await positions()).toEqual(before);
  });
  it('rifiuta un ordine superato senza sovrascriverlo',async()=>{
    await reorder(); const before=await positions();
    await expect(reorder([ids[1],ids[0],ids[2]])).rejects.toMatchObject({code:'PT409'});
    expect(await positions()).toEqual(before);
  });
  it('rifiuta fasi mancanti o estranee e duplicati',async()=>{
    await expect(reorder([ids[0],ids[1]])).rejects.toMatchObject({code:'PT409'});
    await expect(reorder([ids[0],ids[1],other])).rejects.toMatchObject({code:'PT409'});
    await expect(reorder([ids[0],ids[0],ids[2]])).rejects.toMatchObject({code:'22023'});
    await expect(reorder(undefined,null)).rejects.toMatchObject({code:'22023'});
  });
  it.each(['edit=false','view_orders=false','visible=false','blocked=true','external_user=true','uid=null',`company='${other}'`])('impedisce il riordino con %s',async setting=>{
    await pg.exec(`update ctx set ${setting}`);await expect(reorder()).rejects.toMatchObject({code:'42501'});
    expect((await positions()).map(r=>r.position)).toEqual([0,1,2]);
  });
  it('non modifica una commessa eliminata',async()=>{await pg.exec('update orders set deleted_at=now()');await expect(reorder()).rejects.toMatchObject({code:'42501'});});
});

describe('Metriche complete e autorizzate',()=>{
  it('conta oltre 500 righe prima del limite e conserva le latenze zero',async()=>{
    await pg.exec(`insert into system_health_metrics select 'edge_function_call','rapida',200,100,now() from generate_series(1,600);
      insert into system_health_metrics values('edge_function_call','lenta',500,2000,now()),('edge_function_call','credito',402,500,now()),('edge_function_call','zero',200,0,now()),('edge_function_call','nulla',200,null,now()),('edge_function_call','vecchia',500,1000,now()-interval '25 hours'),('altro','esclusa',500,1000,now());`);
    const r=(await pg.query<{m:Record<string,unknown>}>('select admin_metriche_funzioni_24h() as m')).rows[0].m;
    expect(r).toMatchObject({totalCalls:604,totalErrors:2,totalPaymentBlocks:1,avgLatency:104});
  });
  it('limita solo le funzioni visualizzate, non il totale',async()=>{
    await pg.exec("insert into system_health_metrics select 'edge_function_call','f'||n,200,n,now() from generate_series(1,20) n");
    const m=(await pg.query<{m:{totalCalls:number;byFunction:unknown[]}}>('select admin_metriche_funzioni_24h() as m')).rows[0].m;
    expect(m.totalCalls).toBe(20);expect(m.byFunction).toHaveLength(15);
  });
  it('restituisce uno zero reale e vieta utenti aziendali',async()=>{
    expect((await pg.query<{m:{totalCalls:number}}>('select admin_metriche_funzioni_24h() as m')).rows[0].m.totalCalls).toBe(0);
    await pg.exec('update ctx set admin=false');await expect(pg.query('select admin_metriche_funzioni_24h()')).rejects.toMatchObject({code:'42501'});
    await pg.exec('update ctx set staff=true');await expect(pg.query('select admin_metriche_funzioni_24h()')).resolves.toBeDefined();
  });
  it('senza identità non restituisce le metriche',async()=>{
    await pg.exec('update ctx set uid=null');await expect(pg.query('select admin_metriche_funzioni_24h()')).rejects.toMatchObject({code:'42501'});
  });
});

describe('Email in attesa dello sblocco',()=>{
  it('credito insufficiente: i giri ripetuti non accodano chiamate né cambiano il rinvio',async()=>{
    await pg.exec(`update ai_credits set balance_eur=0; insert into email_opportunita_tentativi(email_id,tentativi,ultimo_esito,prossimo_tentativo) values('${email}',1,'credito',now()+interval '1 hour');`);
    const before=(await pg.query('select * from email_opportunita_tentativi')).rows;
    expect(await dispatch()).toBe(0);expect(await dispatch()).toBe(0);
    expect((await pg.query('select * from email_opportunita_tentativi')).rows).toEqual(before);
    expect((await pg.query('select * from net.requests')).rows).toHaveLength(0);
  });
  it('riprende alla ricarica anche se il vecchio rinvio non è scaduto; lease senza doppioni',async()=>{
    await pg.exec(`update ai_credits set balance_eur=0; insert into email_opportunita_tentativi(email_id,ultimo_esito,prossimo_tentativo) values('${email}','credito',now()+interval '1 hour');`);
    expect(await dispatch()).toBe(0);await pg.exec('update ai_credits set balance_eur=1');
    expect(await dispatch()).toBe(1);expect(await dispatch()).toBe(0);
    expect((await pg.query<{timeout_ms:number}>('select * from net.requests')).rows[0].timeout_ms).toBe(15000);
  });
  it('nessun metodo di pagamento: nessuna chiamata; ripresa dopo la registrazione',async()=>{
    await pg.exec("update companies set payment_method='none'");expect(await dispatch()).toBe(0);
    await pg.exec("update companies set payment_method='stripe'");expect(await dispatch()).toBe(1);
  });
  it.each(['suspended','expired','cancelled'])('rispetta lo stato abbonamento %s',async status=>{
    await pg.query('update companies set status=$1',[status]);expect(await dispatch()).toBe(0);
  });
  it('gli esenti mantengono la policy pagamento e il blocco AI resta distinto',async()=>{
    await pg.exec("update companies set payment_method='comped',status='suspended'");expect(await ready()).toBe(true);
    await pg.exec('update ai_credits set calls_blocked=true');expect(await dispatch()).toBe(0);
  });
  it('non aggira attese tecniche o stop dopo sei errori',async()=>{
    await pg.exec(`insert into email_opportunita_tentativi(email_id,ultimo_esito,errori_consecutivi,prossimo_tentativo) values('${email}','errore',2,now()+interval '1 hour');`);
    expect(await dispatch()).toBe(0);await pg.exec("update email_opportunita_tentativi set prossimo_tentativo=now()-interval '1 hour',errori_consecutivi=6");expect(await dispatch()).toBe(0);
  });
  it('non estrae email cestinate o con una bozza già creata',async()=>{
    await pg.exec('update email_inbox set is_trashed=true');expect(await dispatch()).toBe(0);
    await pg.exec(`update email_inbox set is_trashed=false;insert into email_opportunita_bozza values('${email}')`);expect(await dispatch()).toBe(0);
  });
  it.each([0,0.049,0.05,1])('prefiltro in parità con il controllo autorevole, saldo %s',async balance=>{
    await pg.query('update ai_credits set balance_eur=$1',[balance]);const pre=await ready();
    const actual=(await pg.query<{o_ok:boolean}>('select * from check_ai_credits_available($1,0.009,$2)',[company,'email_opportunita'])).rows[0].o_ok;
    expect(pre).toBe(actual);
  });
  it('considera ricarico task e omaggio del mese nuovo senza scriverlo dal dispatcher',async()=>{
    await pg.exec("update ai_credits set balance_eur=0.1; insert into ai_pricing_markup values('email_opportunita',null,true,20)");expect(await ready()).toBe(false);
    await pg.exec("update ai_credits set balance_eur=0,free_balance_eur=99,free_period_start=date_trunc('month',now())::date-interval '1 month';update subscription_plans set monthly_free_ai_eur=1");
    expect(await ready()).toBe(true);
    expect((await pg.query<{n:number}>('select count(*)::int as n from ai_credit_transactions')).rows[0].n).toBe(0);
    const actual=(await pg.query<{o_ok:boolean}>('select * from check_ai_credits_available($1,0.009,$2)',[company,'email_opportunita'])).rows[0].o_ok;
    expect(actual).toBe(true);
  });
});

it('ACL: riordino e metriche autenticati; helper e dispatcher solo interni',async()=>{
  const r=(await pg.query<{riordino_anon:boolean;metriche_anon:boolean;helper_auth:boolean;dispatch_auth:boolean}>(`select
    has_function_privilege('anon','riordina_fasi_commessa(uuid,uuid[],uuid[])','execute') riordino_anon,
    has_function_privilege('anon','admin_metriche_funzioni_24h()','execute') metriche_anon,
    has_function_privilege('authenticated','email_opportunita_puo_elaborare(uuid)','execute') helper_auth,
    has_function_privilege('authenticated','silvio_email_dispatch_opportunita(text,integer)','execute') dispatch_auth`)).rows[0];
  expect(r).toEqual({riordino_anon:false,metriche_anon:false,helper_auth:false,dispatch_auth:false});
});
