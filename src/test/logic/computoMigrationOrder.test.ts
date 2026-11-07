import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

it('rinvia gli abbinamenti del computo alla fondazione senza perdere vincoli o colonne', async () => {
 const db = new PGlite();
 try {
  const early = readFileSync('supabase/migrations/20260508140000_computo_voci_match_columns.sql','utf8');
  await db.exec(early);
  await db.exec(`create table public.computo_voci_estratte(id uuid primary key);`);
  const foundation = readFileSync('supabase/migrations/20260915000001_computo_metrico_ai.sql','utf8');
  const start = foundation.indexOf('-- Completa le colonne di abbinamento');
  const end = foundation.indexOf('CREATE INDEX idx_computo_voci_upload',start);
  await db.exec(foundation.slice(start,end));
  await db.exec(early);
  await db.exec(`insert into computo_voci_estratte(id,match_type,matched_name) values(gen_random_uuid(),'manual','Test');`);
  expect((await db.query('select match_type,matched_name from computo_voci_estratte')).rows).toEqual([{match_type:'manual',matched_name:'Test'}]);
  await expect(db.exec(`insert into computo_voci_estratte(id,match_type) values(gen_random_uuid(),'non_valido')`)).rejects.toThrow(/check constraint/);
 } finally { await db.close(); }
},30000);
