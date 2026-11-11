import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const AG = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const BG = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const PN = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

test("Fish SQL: real PostgreSQL transactions, tenant isolation, event order and exactly-once billing", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
      CREATE SCHEMA auth;
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      CREATE FUNCTION public.get_my_company_id() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.company_id',true),'')::uuid $$;
      CREATE TABLE companies(id uuid PRIMARY KEY);
      CREATE TABLE profiles(id uuid PRIMARY KEY,company_id uuid,first_name text,last_name text,business_name text,phone text,marketing_contact_id uuid);
      CREATE TABLE human_call_logs(id uuid PRIMARY KEY,company_id uuid,direction text,from_number text,to_number text,contact_id uuid,started_at timestamptz);
      CREATE TABLE user_roles(user_id uuid,role text);
      GRANT SELECT ON user_roles TO authenticated;
      CREATE TABLE ai_agents_v2(id uuid PRIMARY KEY,company_id uuid,nome text,stato text,tools_config jsonb,chiamate_totali int DEFAULT 0,chiamate_completate int DEFAULT 0,minuti_totali numeric DEFAULT 0,costo_totale_crediti numeric DEFAULT 0);
      CREATE TABLE ai_phone_numbers_v2(id uuid PRIMARY KEY,company_id uuid,agent_id uuid,numero text,attivo boolean);
      CREATE TABLE marketing_contacts(id uuid PRIMARY KEY,company_id uuid,phone text,first_name text,last_name text);
      CREATE TABLE ai_agent_conversations(id uuid PRIMARY KEY,company_id uuid,agent_v2_id uuid,contact_id uuid,status text,duration_seconds int,messages_count int,call_direction text,metadata jsonb,transcript jsonb,summary text);
      CREATE TABLE ai_conversations_v2(id uuid PRIMARY KEY,company_id uuid,agent_id uuid,contact_id uuid,canale text,direzione text,stato text,durata_secondi int,numero_chiamante text,numero_chiamato text,iniziata_il timestamptz,terminata_il timestamptz,trascrizione_json jsonb,riassunto text,costo_crediti numeric,creato_il timestamptz DEFAULT now());
      CREATE TABLE balances(company_id uuid PRIMARY KEY,amount numeric);
      CREATE TABLE ai_credit_usage(company_id uuid,conversation_id uuid UNIQUE REFERENCES ai_agent_conversations(id),agent_v2_id uuid,duration_sec int,duration_min numeric,llm_model text,tts_model text,cost_real_per_min numeric,cost_billed_per_min numeric,cost_real_total numeric,cost_billed_total numeric,margin_total numeric,balance_before numeric,balance_after numeric,call_direction text);
      CREATE FUNCTION deduct_ai_credits(c uuid,n numeric) RETURNS jsonb LANGUAGE plpgsql AS $$ DECLARE before numeric; BEGIN SELECT amount INTO before FROM balances WHERE company_id=c FOR UPDATE; UPDATE balances SET amount=amount-n WHERE company_id=c; RETURN jsonb_build_object('balance_before',before,'balance_after',before-n); END $$;
      CREATE FUNCTION increment_agent_stats(a uuid,c int,done int,m numeric,ch int,cost numeric) RETURNS void LANGUAGE sql AS $$ UPDATE ai_agents_v2 SET chiamate_totali=chiamate_totali+c,chiamate_completate=chiamate_completate+done,minuti_totali=minuti_totali+m,costo_totale_crediti=costo_totale_crediti+cost WHERE id=a $$;
    `);
    await db.exec(await readFile(new URL("../../supabase/migrations/20261110093241_fish_audio_centralino.sql", import.meta.url), "utf8"));
    await db.exec(await readFile(new URL("../../supabase/migrations/20261110103308_fish_voice_web_preview.sql", import.meta.url), "utf8"));
    await db.exec(await readFile(new URL("../../supabase/migrations/20261110104641_centralino_call_parties.sql", import.meta.url), "utf8"));
    await db.exec(await readFile(new URL("../../supabase/migrations/20261110104900_centralino_party_lookup_indexes.sql", import.meta.url), "utf8"));
    await db.exec(await readFile(new URL("../../supabase/migrations/20261110155749_fish_company_onboarding.sql", import.meta.url), "utf8"));
    await db.exec(`INSERT INTO companies VALUES('${A}'),('${B}');
      INSERT INTO ai_agents_v2(id,company_id,nome,stato,tools_config) VALUES('${AG}','${A}','A','attivo','{"voice_provider":"fish_audio"}'),('${BG}','${B}','B','attivo','{"voice_provider":"fish_audio"}');
      INSERT INTO ai_phone_numbers_v2 VALUES('${PN}','${A}','${AG}','+390000000001',true);
      INSERT INTO balances VALUES('${A}',10),('${B}',10);
      INSERT INTO ai_fish_agents(agent_id,company_id,fish_agent_id,voice_id,published,enabled,real_per_min_eur,billed_per_min_eur) VALUES('${AG}','${A}','fish-A','voice',true,true,0.06,0.12),('${BG}','${B}','fish-B','voice',true,true,0.06,0.12);
      INSERT INTO ai_fish_numbers(phone_id,company_id,agent_id,fish_phone_id,supports_outbound) VALUES('${PN}','${A}','${AG}','fish-number',true);`);
    await db.query("INSERT INTO ai_fish_connection_requests(company_id,agent_id,requested_by,number_mode) VALUES($1,$2,$2,'new')",[A,AG]);
    await db.query("INSERT INTO ai_fish_connection_requests(company_id,agent_id,requested_by,number_mode) VALUES($1,$2,$2,'new')",[B,BG]);
    await assert.rejects(db.query("INSERT INTO ai_fish_connection_requests(company_id,agent_id,requested_by,number_mode) VALUES($1,$2,$2,'new')",[A,AG]),/duplicate key/);
    await assert.rejects(db.query("INSERT INTO ai_fish_connection_requests(company_id,agent_id,requested_by,number_mode) VALUES($1,$2,$2,'new')",[A,BG]),/foreign key/);
    await db.query("INSERT INTO user_roles VALUES($1,'company_admin')",[AG]);
    const prepare = async (to = "+390000000002") => (await db.query("SELECT fish_prepare_outbound($1,$2,$3,$4,$5) result", [A, AG, PN, to, "attempt-key-1"])).rows[0].result;
    const CUSTOMER="dddddddd-dddd-4ddd-8ddd-dddddddddddd";
    await db.query("INSERT INTO profiles(id,company_id,phone,first_name) VALUES($1,$2,$3,'Cliente Demo')",[CUSTOMER,A,"+390000000002"]);
    await db.query("INSERT INTO user_roles VALUES($1,'customer')",[CUSTOMER]);
    const first = await prepare(); const retry = await prepare();
    assert.equal(first.id, retry.id);
    await assert.rejects(prepare("+390000000003"), /dati diversi/);
    await assert.rejects(db.exec(`INSERT INTO ai_fish_agents(agent_id,company_id,fish_agent_id,voice_id) VALUES('${BG}','${A}','stolen','v')`));
    const event = async (id, snapshot, agent = "fish-A", session = "session-A") => (await db.query("SELECT fish_record_event($1,$2,$3,$4::jsonb) result", [agent, session, id, JSON.stringify(snapshot)])).rows[0].result;
    const final = { attempt_id: first.id, terminal: true, state: "completata", direction: "outbound", duration: 60, caller: "+390000000001", called: "+390000000002" };
    // Analysis arrives before the delayed end event.
    await event("analysis-1", { ...final, transcript: [{ role: "agent", message: "Fatto" }], summary: "Appuntamento confermato", analysis_at: "2026-11-10T08:00:00Z" });
    await event("ended-1", final);
    const repeated = await event("ended-1", final);
    assert.equal(repeated.duplicate, true);
    await event("old-analysis", { ...final, transcript: [], summary: "vecchio", analysis_at: "2026-11-10T07:00:00Z" });
    await event("late-start", { terminal: false, state: "in_corso", direction: "outbound", duration: null });
    const mirror = (await db.query("SELECT * FROM ai_conversations_v2 WHERE id=$1", [first.id])).rows[0];
    assert.equal(mirror.stato, "completata"); assert.equal(mirror.riassunto, "Appuntamento confermato");
    assert.equal(mirror.voice_provider, "fish_audio"); assert.equal(Number(mirror.costo_crediti), 0.12);
    assert.equal(mirror.customer_id,CUSTOMER);
    assert.equal((await db.query("SELECT customer_id FROM ai_agent_conversations WHERE id=$1",[first.id])).rows[0].customer_id,CUSTOMER);
    await assert.rejects(db.query("SELECT centralino_associate_call($1,'ai',$2,NULL,$3)",[B,first.id,CUSTOMER]),/Cliente non valido/);
    const duplicate="eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
    await db.query("INSERT INTO profiles(id,company_id,phone) VALUES($1,$2,$3)",[duplicate,A,"+390000000002"]);
    await db.query("INSERT INTO user_roles VALUES($1,'customer')",[duplicate]);
    await db.query("INSERT INTO human_call_logs(id,company_id,direction,from_number,started_at) VALUES($1,$2,'inbound',$3,now())",[PN,A,"+390000000002"]);
    assert.equal((await db.query("SELECT customer_id FROM human_call_logs WHERE id=$1",[PN])).rows[0].customer_id,null);
    assert.equal((await db.query("SELECT count(*)::int n FROM ai_credit_usage")).rows[0].n, 1);
    assert.equal(Number((await db.query("SELECT amount FROM balances WHERE company_id=$1", [A])).rows[0].amount), 9.88);
    assert.equal((await db.query("SELECT chiamate_totali FROM ai_agents_v2 WHERE id=$1", [AG])).rows[0].chiamate_totali, 1);
    await assert.rejects(event("cross-tenant", final, "fish-B"), /altra azienda/);
    await event("no-answer", { terminal: true, state: "no_risposta", direction: "outbound", duration: 0 }, "fish-A", "unanswered");
    assert.equal(Number((await db.query("SELECT amount FROM balances WHERE company_id=$1", [A])).rows[0].amount), 9.88);
    await db.exec(`SET ROLE authenticated; SET request.jwt.claim.company_id='${A}'; SET request.jwt.claim.sub='${AG}';`);
    assert.equal((await db.query("SELECT count(*)::int n FROM ai_fish_agents")).rows[0].n, 1);
    assert.equal((await db.query("SELECT count(*)::int n FROM ai_fish_connection_requests")).rows[0].n,1);
    await assert.rejects(db.exec("UPDATE ai_fish_connection_requests SET status='ready'"),/permission denied/);
    await assert.rejects(db.query("INSERT INTO ai_fish_connection_requests(company_id,agent_id,requested_by,number_mode) VALUES($1,$2,$2,'new')",[A,AG]),/permission denied/);

    await assert.rejects(db.exec("UPDATE ai_fish_agents SET billed_per_min_eur=0"), /permission denied/);
    await assert.rejects(db.query("SELECT centralino_associate_call($1,'ai',$2,NULL,$3)",[A,first.id,CUSTOMER]),/permission denied/);
    await assert.rejects(db.exec(`SELECT fish_select_provider('${A}','${AG}',true)`), /permission denied/);
    await db.exec("RESET ROLE");
    // Malformed duration must roll back the event ledger, so a corrected retry can be delivered.
    await assert.rejects(event("bad-duration", { ...final, duration: -1 }, "fish-A", "malformed"));
    assert.equal((await db.query("SELECT count(*)::int n FROM ai_fish_events WHERE event_id='bad-duration'")).rows[0].n, 0);
  } finally { await db.close(); }
});
