// Synthetic SQL integration test. No Supabase, provider or real tenant is contacted.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
const { PGlite } = await import(pathToFileURL(process.argv[2]).href);
const db = new PGlite();
const company = "11111111-1111-4111-8111-111111111111", number = "22222222-2222-4222-8222-222222222222";
const owner = "33333333-3333-4333-8333-333333333333", other = "44444444-4444-4444-8444-444444444444";
const first = "55555555-5555-4555-8555-555555555555", second = "66666666-6666-4666-8666-666666666666";
let passed = 0;
const check = async (name, fn) => { await fn(); passed++; console.log(`PASS ${name}`); };
const rpc = async (query, params = []) => (await db.query(query, params)).rows[0].result;
try {
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql as $$select null::uuid$$;
    create function public.puo_gestire_whatsapp(uuid) returns boolean language sql as $$select false$$;
    create table companies(id uuid primary key); create table ai_whatsapp_numbers(id uuid primary key);
    create table whatsapp_messages(id uuid primary key,company_id uuid,wa_number_id uuid,from_phone text,direction text,processing_status text,created_at timestamptz,metadata jsonb default '{}');
    create table whatsapp_credits(company_id uuid primary key,balance_eur numeric,sends_blocked boolean);
    create table company_credit_pool(company_id uuid primary key);
    create table whatsapp_credits_log(company_id uuid,type text,amount_eur numeric,balance_before numeric,balance_after numeric,description text,metadata jsonb);
    create function consume_credits(c uuid,t text,a numeric,d text,m jsonb) returns jsonb language plpgsql set search_path=public as $$
      declare b numeric; begin select balance_eur into b from whatsapp_credits where company_id=c for update;
      if b<a then return jsonb_build_object('success',false); end if;
      update whatsapp_credits set balance_eur=b-a where company_id=c;
      insert into whatsapp_credits_log values(c,'deduct',-a,b,b-a,d,m);
      return jsonb_build_object('success',true,'balance_after',b-a); end$$;
    create function pool_ricarica(c uuid,t text,a numeric,d text,m jsonb) returns jsonb language plpgsql set search_path=public as $$
      begin update whatsapp_credits set balance_eur=balance_eur+a where company_id=c;
      return jsonb_build_object('balance_after',(select balance_eur from whatsapp_credits where company_id=c)); end$$;
    insert into companies values('${company}'); insert into ai_whatsapp_numbers values('${number}');
    insert into company_credit_pool values('${company}');
    insert into whatsapp_credits values('${company}',10,false);
    insert into whatsapp_messages(id,company_id,wa_number_id,from_phone,direction,processing_status,created_at) values('${first}','${company}','${number}','test','inbound','received','2026-10-07T10:00:00Z'),
      ('${second}','${company}','${number}','test','inbound','received','2026-10-07T10:00:01Z');`);
  await db.exec(await readFile(new URL("../supabase/migrations/20261007183910_whatsapp_durable_operations.sql", import.meta.url), "utf8"));
  let id;
  const claim = (key, hash = 'a'.repeat(64), who = owner) => rpc("select whatsapp_operation_claim($1,$2,'send',$3,$4,'{}') as result", [company,key,hash,who]);
  await check("one owner; duplicate and changed payload cannot resend", async () => {
    const a = await claim('one'); id = a.id; assert.equal(a.state,'claimed');
    assert.equal((await claim('one','a'.repeat(64),other)).state,'running');
    assert.equal((await claim('one','b'.repeat(64))).state,'conflict');
  });
  await check("credit debited once, wrong owner cannot debit", async () => {
    await assert.rejects(rpc("select whatsapp_operation_charge($1,$2,1) as result",[id,other]),/operation_unavailable/);
    await rpc("select whatsapp_operation_charge($1,$2,1) as result",[id,owner]);
    await rpc("select whatsapp_operation_charge($1,$2,1) as result",[id,owner]);
    assert.equal(Number((await db.query('select balance_eur from whatsapp_credits')).rows[0].balance_eur),9);
  });
  await check("definite rejection refunds once in the same transaction", async () => {
    const args=[id,owner];
    assert.equal(await rpc("select whatsapp_operation_finish($1,$2,'rejected','{}',null) as result",args),true);
    assert.equal(await rpc("select whatsapp_operation_finish($1,$2,'rejected','{}',null) as result",args),false);
    assert.equal(Number((await db.query('select balance_eur from whatsapp_credits')).rows[0].balance_eur),10);
    assert.equal((await db.query("select * from whatsapp_credits_log where type='refund'")).rows.length,1);
  });
  await check("unknown outcome is not refunded or restarted", async () => {
    id=(await claim('unknown')).id;
    await rpc("select whatsapp_operation_charge($1,$2,1) as result",[id,owner]);
    await rpc("select whatsapp_operation_finish($1,$2,'unknown','{}',null) as result",[id,owner]);
    assert.equal((await claim('unknown')).state,'unknown');
    assert.equal(Number((await db.query('select balance_eur from whatsapp_credits')).rows[0].balance_eur),9);
  });
  await check("accepted send has a real provider ID and replays its receipt", async () => {
    id=(await claim('accepted')).id;
    await assert.rejects(rpc("select whatsapp_operation_finish($1,$2,'completed','{}',null) as result",[id,owner]),/provider_id_required/);
    await rpc("select whatsapp_operation_finish($1,$2,'completed',$3,'wamid.test') as result",[id,owner,{success:true,meta_message_id:'wamid.test'}]);
    assert.deepEqual((await claim('accepted')).result,{success:true,meta_message_id:'wamid.test'});
  });
  const conversation = msg => rpc("select whatsapp_conversation_claim($1,$2,'test',$3) as result",[company,number,msg]);
  await check("conversation oldest-first and serial across messages", async () => {
    assert.equal(await conversation(second),false); assert.equal(await conversation(first),true);
    await db.query("update whatsapp_messages set processing_status='processing' where id=$1",[first]);
    assert.equal(await conversation(second),false);
    await db.query("update whatsapp_messages set processing_status='processed' where id=$1",[first]);
    await rpc("select whatsapp_conversation_release($1) as result",[first]);
    assert.equal(await conversation(second),true);
  });
  await check("browser cannot alter operations or call service-only RPCs", async () => {
    for (const role of ['anon','authenticated']) {
      assert.equal((await db.query(`select has_table_privilege('${role}','whatsapp_operations','UPDATE') as ok`)).rows[0].ok,false);
      assert.equal((await db.query(`select has_function_privilege('${role}','whatsapp_operation_charge(uuid,uuid,numeric)','EXECUTE') as ok`)).rows[0].ok,false);
    }
  });
  await check("manual review keeps the failed outcome and cannot finish a live worker", async () => {
    await db.exec(`insert into auth.users values('${owner}');
      create or replace function auth.uid() returns uuid language sql as $$select '${owner}'::uuid$$;
      create or replace function public.puo_gestire_whatsapp(uuid) returns boolean language sql as $$select true$$;`);
    await db.query("update whatsapp_messages set processing_status='failed' where id=$1",[first]);
    assert.equal(await rpc("select whatsapp_message_review($1,$2) as result",[company,first]),true);
    const reviewed=(await db.query("select processing_status,metadata from whatsapp_messages where id=$1",[first])).rows[0];
    assert.equal(reviewed.processing_status,'failed'); assert.equal(reviewed.metadata.manually_reviewed_by,owner);
    assert.equal(await rpc("select whatsapp_message_review($1,$2) as result",[company,second]),false);
    assert.equal(await rpc("select whatsapp_message_review($1,$2) as result",[other,first]),false);
  });
  console.log(`${passed} isolated SQL checks passed; not a multi-connection load test.`);
} finally { await db.close(); }
