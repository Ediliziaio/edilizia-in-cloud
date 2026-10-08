/** Isolated PostgreSQL/PLpgSQL regression test, no network/credentials/app DB.
 * Run: node scripts/check-silvio-context-local.mjs /absolute/path/to/pglite/dist/index.js
 * PGlite is an optional temporary test dependency, not an application dependency.
 * Vector distance is stubbed: this tests ACL/cursors/SQL, NOT semantic ranking.
 */
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';

if (!process.argv[2]) throw new Error('Pass the local PGlite module path. No remote database is supported.');
const { PGlite } = await import(pathToFileURL(process.argv[2]).href);
const db = new PGlite();
let checks = 0;
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const [companyA, companyB, admin, staff, other, channelA, channelB] = [1, 2, 3, 4, 5, 6, 7].map(id);
const query = async (sql, args = []) => (await db.query(sql, args)).rows;
const check = (value, expected, name) => { assert.deepEqual(value, expected, name); checks++; console.log(`PASS ${name}`); };
try {
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA auth;
    CREATE TABLE auth.users(id uuid PRIMARY KEY);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS
      $$ SELECT nullif(current_setting('test.actor', true), '')::uuid $$;
    CREATE FUNCTION public.ai_is_service_role() RETURNS boolean LANGUAGE sql AS
      $$ SELECT coalesce(current_setting('test.service', true), '') = 'true' $$;
    CREATE DOMAIN vector AS real[];
    CREATE FUNCTION distance(vector, vector) RETURNS double precision LANGUAGE sql IMMUTABLE AS $$ SELECT 0.1::double precision $$;
    CREATE OPERATOR <=> (LEFTARG = vector, RIGHTARG = vector, FUNCTION = distance);
    CREATE TABLE companies(id uuid PRIMARY KEY);
    CREATE TABLE profiles(id uuid PRIMARY KEY, company_id uuid, is_blocked boolean DEFAULT false);
    CREATE TABLE user_roles(user_id uuid, role text);
    CREATE TABLE multi_company_access(user_id uuid, company_id uuid, access_role text, status text, expires_at timestamptz);
    CREATE FUNCTION public.is_silvio_superadmin() RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path=public AS
      $$ SELECT EXISTS(SELECT 1 FROM user_roles WHERE user_id=auth.uid() AND role='super_admin') $$;
    CREATE TABLE ai_brain_documents(id uuid PRIMARY KEY, scope text, source_type text, source_id uuid, title text,
      category text, content text, metadata jsonb, company_id uuid, embedding vector, deleted_at timestamptz,
      valid_until timestamptz, last_verified_at timestamptz, chunk_id text, visibility_roles text[], source_path text, content_hash text,
      kb_section text, persona_keys text[]);
    CREATE TABLE silvio_admin_personas(persona_key text PRIMARY KEY);
    CREATE TABLE silvio_persona_memory(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      persona_key text REFERENCES silvio_admin_personas(persona_key), memory_type text, content text, source text,
      confidence numeric, enabled boolean DEFAULT true, hits_count int DEFAULT 0, expires_at timestamptz,
      created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now(), created_by uuid);
    CREATE TABLE ai_brain_facts(company_id uuid, fact_key text, fact_value jsonb, confidence numeric,
      source text, source_user_id uuid, hit_count int, last_used_at timestamptz, updated_at timestamptz, enabled boolean);
    CREATE TABLE ai_brain_chat_summaries(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid, user_id uuid,
      channel_id uuid, period_start date, period_end date, summary text, topics text[], key_facts jsonb,
      messages_count int, embedding vector, created_at timestamptz DEFAULT now());
    CREATE TABLE internal_chat_channels(id uuid PRIMARY KEY, company_id uuid, name text, is_dm boolean);
    CREATE TABLE internal_chat_members(user_id uuid, company_id uuid, channel_id uuid);
    CREATE TABLE internal_chat_messages(id uuid PRIMARY KEY, channel_id uuid, company_id uuid,
      message_type text, created_at timestamptz, content text);
    CREATE TABLE ai_persona_memory(id uuid PRIMARY KEY, company_id uuid, persona_key text, memory_type text,
      content text, hits_count int, source text, enabled boolean, user_id uuid, expires_at timestamptz,
      confidence numeric, created_at timestamptz DEFAULT now());
    CREATE FUNCTION match_brain(uuid, vector, int, numeric, text[], boolean, text[]) RETURNS int LANGUAGE sql AS $$ SELECT 1 $$;
  `);
  await db.exec(readFileSync(new URL('../supabase/migrations/20261007104833_silvio_context_isolation_and_memory.sql', import.meta.url), 'utf8'));
  await db.exec(readFileSync(new URL('../supabase/migrations/20261007113614_silvio_admin_private_learning.sql', import.meta.url), 'utf8'));
  console.log('PASS migration applies on isolated PostgreSQL'); checks++;
  await db.exec(`
    INSERT INTO companies VALUES ('${companyA}'), ('${companyB}');
    INSERT INTO auth.users VALUES ('${admin}'), ('${staff}'), ('${other}');
    INSERT INTO profiles(id, company_id) VALUES ('${admin}', '${companyA}'), ('${staff}', '${companyA}'), ('${other}', '${companyB}');
    INSERT INTO user_roles VALUES ('${admin}', 'company_admin'), ('${staff}', 'company_staff'), ('${other}', 'company_admin');
    INSERT INTO multi_company_access VALUES ('${admin}', '${companyB}', 'company_staff', 'active', NULL);
    INSERT INTO internal_chat_channels VALUES ('${channelA}', '${companyA}', 'silvio-ai', true), ('${channelB}', '${companyB}', 'silvio-ai', true);
    INSERT INTO internal_chat_members VALUES ('${admin}', '${companyA}', '${channelA}'), ('${other}', '${companyB}', '${channelB}');
    SET test.service = 'true';
  `);
  for (const [n, scope, company, type, metadata, expires, deleted] of [
    [10, 'universal', null, 'note', {}, null, null],
    [11, 'universal', null, 'note', {}, '2000-01-01', null],
    [12, 'universal', null, 'note', {}, null, '2000-01-01'],
    [13, 'company', companyA, 'order', {}, null, null],
    [14, 'company', companyB, 'order', {}, null, null],
    [15, 'company', companyA, 'chat_summary', { user_id: staff }, null, null],
    [16, 'company', companyA, 'chat_summary', { user_id: admin }, null, null],
  ]) await db.query(`INSERT INTO ai_brain_documents(id, scope, company_id, source_type, metadata, valid_until, deleted_at, embedding, content, title)
    VALUES ($1,$2,$3,$4,$5,$6,$7,ARRAY[1]::vector,'test','test')`, [id(n), scope, company, type, JSON.stringify(metadata), expires, deleted]);
  const search = async (company, actor) => (await query('SELECT id FROM silvio_match_brain($1, $2, ARRAY[1]::vector)', [company, actor])).map(r => r.id).sort();
  check(await search(companyA, admin), [10, 13, 16].map(id), 'admin sees only own company, own summaries, live sources');
  check(await search(companyA, staff), [id(10)], 'restricted staff has no unstructured company bypass');
  check(await search(companyB, admin), [id(10)], 'admin in A is only staff in B');
  const evaluateUniversal = actor => query("SELECT id FROM silvio_match_brain(NULL,$1,ARRAY[1]::vector,6,0.3,NULL,'universal')", [actor]);
  await assert.rejects(evaluateUniversal(admin), /evaluation access denied/); checks++;
  await db.exec(`INSERT INTO user_roles VALUES ('${admin}', 'super_admin')`);
  check((await evaluateUniversal(admin)).map(r => r.id), [id(10)], 'platform evaluation sees only live universal sources');
  await db.exec(`DELETE FROM user_roles WHERE user_id='${admin}' AND role='super_admin'`);
  await db.exec(`UPDATE profiles SET is_blocked=true WHERE id='${staff}'`);
  await assert.rejects(search(companyA, staff), /Actor unavailable/); checks++;
  await db.exec(`UPDATE profiles SET is_blocked=false WHERE id='${staff}'`);
  const actorRoles = async (company, actor) => (await query('SELECT silvio_context_actor_roles($1,$2) AS roles', [company, actor]))[0].roles;
  check(await actorRoles(companyB, admin), ['company_staff'], 'background actor uses the target-company role, not home-company admin');
  await db.exec(`UPDATE multi_company_access SET status='revoked' WHERE user_id='${admin}' AND company_id='${companyB}'`);
  await assert.rejects(actorRoles(companyB, admin), /Company access denied/); checks++;
  await db.exec(`UPDATE multi_company_access SET status='active',expires_at='2000-01-01' WHERE user_id='${admin}' AND company_id='${companyB}'`);
  await assert.rejects(actorRoles(companyB, admin), /Company access denied/); checks++;
  await db.exec(`UPDATE multi_company_access SET expires_at=NULL WHERE user_id='${admin}' AND company_id='${companyB}';
    INSERT INTO user_roles VALUES ('${staff}','super_admin'); UPDATE profiles SET is_blocked=true WHERE id='${staff}'`);
  await assert.rejects(actorRoles(companyA, staff), /Actor unavailable/); checks++;
  await db.exec(`DELETE FROM user_roles WHERE user_id='${staff}' AND role='super_admin'; UPDATE profiles SET is_blocked=false WHERE id='${staff}'`);
  await assert.rejects(actorRoles(companyA, id(999)), /Actor unavailable/); checks++;
  check((await query("SELECT has_function_privilege('authenticated','silvio_context_actor_roles(uuid,uuid)','EXECUTE') AS ok"))[0].ok,
    false, 'only the verified service entrypoint can resolve an arbitrary business actor');
  await db.exec(`SET test.service='false'; SET test.actor='${admin}'`);
  await assert.rejects(query('SELECT silvio_get_memory_context($1,$2)', [companyA, staff]), /Actor mismatch/); checks++;
  await db.exec(`SET test.service='true'`);
  await db.exec(`INSERT INTO ai_brain_chat_summaries(company_id,user_id,period_end,summary) VALUES
    ('${companyA}','${admin}','2026-10-07','own'), ('${companyB}','${admin}','2026-10-07','other tenant'),
    ('${companyA}','${staff}','2026-10-07','other user')`);
  const memory = (await query('SELECT silvio_get_memory_context($1,$2) AS memory', [companyA, admin]))[0].memory;
  check(memory.recent_summaries.map(s => s.summary), ['own'], 'memory bound to company and actor');
  await db.exec(`INSERT INTO internal_chat_messages
    SELECT ('00000000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid, '${channelA}', '${companyA}', 'text', '2026-10-07'::timestamptz, 'test'
    FROM generate_series(100,115) n`);
  const claim = async () => (await query('SELECT silvio_claim_memory_batch($1,$2,$3) AS c', [companyA, admin, channelA]))[0].c;
  const first = await claim(); assert.ok(first.lease_id); checks++;
  check(await claim(), null, 'second worker cannot claim an active lease');
  await assert.rejects(query('SELECT silvio_claim_memory_batch($1,$2,$3)', [companyA, admin, channelB]), /channel access denied/); checks++;
  await db.query(`UPDATE silvio_memory_checkpoints SET lease_id=NULL, lease_until=NULL,
    processed_through='2026-10-07', processed_message_id=$1 WHERE channel_id=$2`, [id(107), channelA]);
  const second = await claim(); assert.ok(second.lease_id); checks++;
  check(second.processed_message_id, id(107), 'cursor preserves same-timestamp remainder after message 8');
  await db.exec(`UPDATE silvio_memory_checkpoints SET lease_id=NULL, lease_until=NULL, processed_message_id='${id(115)}'`);
  check(await claim(), null, 'no extraction when all 16 messages are processed');
  check((await query('SELECT * FROM silvio_users_needing_memory_extract()')).length, 0, 'cron and chat use same cursor');
  await db.exec(`UPDATE silvio_memory_checkpoints SET processed_offset=12000`);
  check((await query('SELECT * FROM silvio_users_needing_memory_extract()')).length, 1, 'cron picks up partial message even below message threshold');
  const partial = await claim();
  check(partial.processed_offset, 12000, 'claim preserves partial character cursor without new messages');
  check(await claim(), null, 'partial-message extraction also has an exclusive lease');
  await db.exec(`UPDATE silvio_memory_checkpoints SET processed_offset=0,lease_id=NULL,lease_until=NULL`);
  const save = key => query(`SELECT silvio_record_memory_batch($1,$2,$3,$4,'2026-10-07','2026-10-07','summary',ARRAY['topic'],'[]',8,NULL) AS id`, [companyA, admin, channelA, key]);
  const saved = (await save('batch1'))[0].id;
  check((await save('batch1'))[0].id, saved, 'retry uses same summary ID');
  assert.notEqual((await save('batch2'))[0].id, saved); checks++;
  check((await query('SELECT count(*)::int AS n FROM ai_brain_chat_summaries WHERE batch_key IS NOT NULL'))[0].n, 2, 'same-day batches do not overwrite each other');
  check((await query(`SELECT has_function_privilege('authenticated','public.silvio_match_brain(uuid,uuid,vector,integer,numeric,text[],text,text[])','execute') AS allowed`))[0].allowed, false, 'scoped RPC is service-only');
  await db.exec(`INSERT INTO ai_brain_documents(id,scope,company_id,source_type,content,content_hash,source_path)
    VALUES ('${id(200)}','silvio_admin',NULL,'admin_feedback','private','hash','feedback:1')`);
  await assert.rejects(db.exec(`INSERT INTO ai_brain_documents(id,scope,company_id) VALUES ('${id(201)}','silvio_admin','${companyA}')`), /check constraint/); checks++;
  await assert.rejects(db.exec(`INSERT INTO ai_brain_documents(id,scope,source_type,content_hash,source_path)
    VALUES ('${id(202)}','silvio_admin','admin_feedback','hash','feedback:1')`), /unique constraint/); checks++;
  // Simulate a permissive legacy policy: restrictive guard must still win.
  await db.exec(`GRANT SELECT ON ai_brain_documents TO authenticated;
    CREATE POLICY fixture_legacy_read ON ai_brain_documents FOR SELECT TO authenticated USING (true);
    SET test.actor='${staff}'; SET ROLE authenticated`);
  check((await query("SELECT id FROM ai_brain_documents WHERE scope='silvio_admin'")).length, 0, 'RLS hides administrative examples from staff even with broad legacy policy');
  await db.exec(`RESET ROLE; INSERT INTO user_roles VALUES ('${admin}','super_admin'); SET test.actor='${admin}'; SET ROLE authenticated`);
  check((await query("SELECT id FROM ai_brain_documents WHERE scope='silvio_admin'")).length, 1, 'RLS allows verified platform admin to read administrative examples');
  await db.exec('RESET ROLE');
  await db.exec(readFileSync(new URL('../supabase/migrations/20261007124806_silvio_reviewed_learning.sql', import.meta.url), 'utf8'));
  await db.exec(`INSERT INTO silvio_admin_personas VALUES ('test_persona');
    INSERT INTO ai_brain_documents(id,scope,kb_section,persona_keys,content,metadata)
    VALUES ('${id(300)}','silvio_admin','gold_standard',ARRAY['test_persona'],'Original example',
      '{"hits_count":"not an integer", "promoted_to_memory":"broken"}');`);
  const promote = async () => (await query('SELECT silvio_self_improvement_promote() AS n'))[0].n;
  const recall = async () => (await query("SELECT * FROM get_persona_memory('test_persona')")).map(m => m.content);
  const version = async (doc = id(300)) => (await query('SELECT silvio_learning_version(d) AS v FROM ai_brain_documents d WHERE id=$1', [doc]))[0].v;
  const review = (v, decision = 'approved', text = 'Verificare sempre la fonte prima di riportare un costo.', doc = id(300)) => query(
    'SELECT silvio_review_learning($1,$2,$3,$4) AS result', [doc,v,decision,text]);
  check(await promote(), 0, 'unreviewed feedback never promotes, even with malformed metadata');
  const v = await version();
  await db.exec(`SET test.actor='${staff}'`);
  await assert.rejects(review(v), /Permesso negato/); checks++;
  await assert.rejects(query('SELECT silvio_learning_candidates()'), /Permesso negato/); checks++;
  await db.exec(`SET test.actor='${admin}'; UPDATE profiles SET is_blocked=true WHERE id='${admin}'`);
  await assert.rejects(review(v), /Permesso negato/); checks++;
  await db.exec(`UPDATE profiles SET is_blocked=false WHERE id='${admin}'`);
  await assert.rejects(review('stale-version'), /Esempio modificato/); checks++;
  await assert.rejects(review(v, 'approved', 'too short'), /20 a 500/); checks++;
  await assert.rejects(review(v, 'approved', null), /20 a 500/); checks++;
  check((await review(v))[0].result, {ok:true,promoted:1}, 'manual review atomically creates only distilled memory');
  check(await recall(), ['Verificare sempre la fonte prima di riportare un costo.'], 'recall returns approved rule, not raw example');
  check(await promote(), 0, 'repeated promotion is idempotent');
  check((await review(v))[0].result.promoted, 0, 'review retry is idempotent');
  await db.exec(`UPDATE silvio_persona_memory SET enabled=false WHERE learning_document_id='${id(300)}'`);
  check(await promote(), 0, 'background worker does not re-enable manually disabled memory');
  check(await recall(), [], 'disabled rule is not injected');
  await review(v, 'rejected');
  check((await review(v))[0].result.promoted, 1, 'explicit reapproval restores a revoked rule');
  await db.exec(`UPDATE ai_brain_documents SET content='Changed without updating stored hash' WHERE id='${id(300)}'`);
  check(await recall(), [], 'source edits immediately invalidate approval even without hash maintenance');
  check((await query('SELECT silvio_learning_candidates() AS list'))[0].list.length, 1, 'changed source returns to review queue');
  await assert.rejects(review(v), /Esempio modificato/); checks++;
  await review(await version());
  await db.exec(`UPDATE ai_brain_documents SET valid_until='2000-01-01' WHERE id='${id(300)}'`);
  check(await recall(), [], 'expired source stops influencing the persona');
  await assert.rejects(review(await version()), /non disponibile/); checks++;
  await db.exec(`UPDATE ai_brain_documents SET valid_until=NULL,deleted_at=now() WHERE id='${id(300)}'`);
  check(await recall(), [], 'soft-deleted source stops influencing the persona');
  await db.exec(`UPDATE ai_brain_documents SET deleted_at=NULL WHERE id='${id(300)}'`);
  await review(await version(), 'rejected');
  check(await recall(), [], 'revocation immediately excludes memory');
  check(await promote(), 0, 'rejected example cannot be promoted');
  await db.exec(`INSERT INTO silvio_persona_memory(persona_key,memory_type,content,source) VALUES
    ('test_persona','pattern','Legacy unreviewed auto memory','feedback_loop'),
    ('test_persona','fact','Explicit human memory','florin_explicit');`);
  check(await recall(), ['Explicit human memory'], 'legacy automatic memories are preserved but not trusted; explicit memories still work');
  await db.exec(`UPDATE ai_brain_documents SET persona_keys=ARRAY['not_a_persona'] WHERE id='${id(300)}'`);
  await assert.rejects(review(await version()), /Nessuna persona valida/); checks++;
  check((await query("SELECT has_function_privilege('service_role','silvio_review_learning(uuid,text,text,text)','EXECUTE') AS ok"))[0].ok,
    false, 'service worker cannot manufacture human approvals');
  check((await query("SELECT has_function_privilege('anon','get_persona_memory(text,int)','EXECUTE') AS ok"))[0].ok,
    false, 'anonymous callers cannot read private memory');
  await db.exec(`GRANT SELECT ON profiles TO authenticated;
    GRANT USAGE ON SCHEMA auth TO authenticated;
    SET ROLE authenticated; SET test.actor='${staff}'`);
  check((await query('SELECT * FROM silvio_learning_reviews')).length, 0, 'RLS hides review records from staff');
  await assert.rejects(query("UPDATE silvio_learning_reviews SET decision='approved'"), /permission denied/); checks++;
  await db.exec('RESET ROLE');
  console.log(`PASS ${checks} SQL checks. Temporary DB only; vector ranking and full migration replay not tested.`);
} finally { await db.close(); }
