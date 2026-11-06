import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

it('non crea override per una demo assente e conserva attivazione/idempotenza quando presente', async () => {
 const db = new PGlite();
 try {
  await db.exec(`create table companies(id uuid primary key);
   create table company_feature_overrides(company_id uuid references companies(id),feature_key text,is_enabled boolean,override_reason text,notes text,updated_at timestamptz,unique(company_id,feature_key));`);
  const sql = readFileSync('supabase/migrations/20260511190000_sr_enable_demo_company.sql','utf8');
  await db.exec(sql);
  expect((await db.query('select * from company_feature_overrides')).rows).toHaveLength(0);
  await db.exec("insert into companies values('778a2c76-1253-49f2-a5e8-283363ac3e29')");
  await db.exec(sql); await db.exec(sql);
  expect((await db.query('select feature_key,is_enabled from company_feature_overrides')).rows).toEqual([{feature_key:'modulo_serramenti_attivo',is_enabled:true}]);
 } finally { await db.close(); }
},30000);
