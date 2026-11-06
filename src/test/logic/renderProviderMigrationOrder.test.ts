import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

it('inizializza provider e prezzi prima delle fondazioni successive senza duplicare le righe', async () => {
 const db = new PGlite();
 try {
  await db.exec('create table platform_settings(key text primary key,value text)');
  const sql = readFileSync('supabase/migrations/20260515072000_render_provider_gemini_openrouter_openai_chain.sql','utf8');
  await db.exec(sql); await db.exec(sql);
  expect((await db.query('select provider_key from render_provider_config order by provider_key')).rows).toEqual([{provider_key:'gemini'},{provider_key:'openai'},{provider_key:'openrouter_image'}]);
  expect((await db.query('select * from render_provider_pricing')).rows).toHaveLength(4);
  expect((await db.query("select relrowsecurity from pg_class where relname in ('render_provider_config','render_provider_pricing')")).rows).toEqual([{relrowsecurity:true},{relrowsecurity:true}]);
 } finally { await db.close(); }
},30000);
