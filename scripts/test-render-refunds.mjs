// PostgreSQL locale (WASM): nessun accesso alla produzione.
import { PGlite } from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const db=new PGlite();
try {
 await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
 CREATE TABLE render_credits(company_id uuid primary key,balance int,total_used int,updated_at timestamptz);
 CREATE TABLE render_credit_purchases(id uuid primary key,company_id uuid,credits_remaining int);
 CREATE TABLE render_credit_ledger(id uuid primary key default gen_random_uuid(),company_id uuid,delta int,balance_after int,reason text,session_id uuid,user_id uuid,revenue_eur numeric,purchase_id uuid,metadata jsonb,created_at timestamptz default clock_timestamp());
 CREATE FUNCTION user_can_access_company(uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT current_setting('test.authorized',true) IS DISTINCT FROM 'no' $$;
 INSERT INTO render_credits VALUES ('11111111-1111-4111-8111-111111111111',7,3,now());`);
 const sql=readFileSync('supabase/migrations/20281213100000_render_refund_importi_reali.sql','utf8');await db.exec(sql);await db.exec(sql);
 const company='11111111-1111-4111-8111-111111111111',session='22222222-2222-4222-8222-222222222222';
 const call=async(name='refund_render_credit_all',sid=session)=> (await db.query(`select ${name}($1::uuid,$2::uuid) as r`,[company,sid])).rows[0].r;
 const balance=async()=> (await db.query('select balance,total_used from render_credits')).rows[0];
 await db.query(`insert into render_credit_ledger(company_id,delta,reason,session_id,metadata) values ($1,0,'consume',$2,'{"unlimited":true}')`,[company,session]);
 assert.equal((await call()).refunded,0);assert.deepEqual(await balance(),{balance:7,total_used:3});
 assert.equal((await call()).status,'no_outstanding_consume');
 assert.equal((await db.query("select count(*)::int n from render_credit_ledger where reason='refund' and delta=0")).rows[0].n,1);
 await db.query(`insert into render_credit_ledger(company_id,delta,reason,session_id,revenue_eur) values ($1,-1,'consume',$2,0.4)`,[company,session]);
 assert.equal((await call('refund_render_credit_v1')).refunded,1);assert.deepEqual(await balance(),{balance:8,total_used:2});
 assert.equal((await call('refund_render_credit_v1')).status,'already_refunded');
 // Un nuovo ciclo sulla stessa sessione deve avere un rimborso nuovo, esattamente una volta.
 await db.query(`insert into render_credit_ledger(company_id,delta,reason,session_id) values ($1,-1,'consume',$2)`,[company,session]);
 const replies=await Promise.all([call(),call()]);assert.equal(replies.reduce((n,r)=>n+r.refunded,0),1);
 assert.deepEqual(await balance(),{balance:9,total_used:1});
 // Compatibilità con un rimborso storico che non indicava il consume nel metadata.
 const old='33333333-3333-4333-8333-333333333333';
 await db.query(`insert into render_credit_ledger(company_id,delta,reason,session_id) values ($1,-1,'consume',$2),($1,1,'refund',$2),($1,-1,'consume',$2)`,[company,old]);
 assert.equal((await call('refund_render_credit_all',old)).refunded,1);assert.equal((await call('refund_render_credit_all',old)).refunded,0);
 await db.exec("set test.authorized='no'");await assert.rejects(call('refund_render_credit_v1'),/accesso negato/);
 await db.exec(readFileSync('supabase/migrations/20281214110000_render_rimborsi_solo_server.sql','utf8'));
 await db.exec('SET ROLE authenticated');await assert.rejects(call(),/permission denied/);await assert.rejects(call('refund_render_credit_v1'),/permission denied/);await db.exec('RESET ROLE');
 await db.exec("set test.authorized='yes';SET ROLE service_role");assert.equal((await call('refund_render_credit_v1')).status,'already_refunded');await db.exec('RESET ROLE');
 console.log('Refund SQL: illimitati delta zero, consumo reale, nuovo ciclo, idempotenza, chiamate ripetute, storico legacy e permessi superati.');
}finally{await db.close()}
