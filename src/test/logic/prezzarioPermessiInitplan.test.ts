import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
const db=new PGlite();
const sql=readFileSync('supabase/migrations/20261016112851_prezzario_permessi_initplan.sql','utf8');
beforeAll(async()=>{
  await db.exec(`CREATE ROLE authenticated;CREATE ROLE anon;
    CREATE FUNCTION is_super_admin() RETURNS boolean LANGUAGE sql STABLE AS $$SELECT coalesce(current_setting('test.admin',true),'off')='on'$$;
    CREATE TABLE prezzario_fonte(id int PRIMARY KEY,stato text);CREATE TABLE prezzario_voce(id int PRIMARY KEY,fonte_id int);
    INSERT INTO prezzario_fonte VALUES(1,'pubblicato'),(2,'bozza');INSERT INTO prezzario_voce VALUES(1,1),(2,2);
    ALTER TABLE prezzario_fonte ENABLE ROW LEVEL SECURITY;ALTER TABLE prezzario_voce ENABLE ROW LEVEL SECURITY;
    GRANT SELECT,INSERT,UPDATE,DELETE ON prezzario_fonte,prezzario_voce TO authenticated;
    CREATE POLICY pz_fonte_select ON prezzario_fonte FOR SELECT TO authenticated USING(stato='pubblicato' OR is_super_admin());
    CREATE POLICY pz_fonte_write ON prezzario_fonte FOR ALL TO authenticated USING(is_super_admin()) WITH CHECK(is_super_admin());
    CREATE POLICY pz_voce_select ON prezzario_voce FOR SELECT TO authenticated USING(is_super_admin() OR EXISTS(SELECT 1 FROM prezzario_fonte f WHERE f.id=prezzario_voce.fonte_id AND f.stato='pubblicato'));
    CREATE POLICY pz_voce_write ON prezzario_voce FOR ALL TO authenticated USING(is_super_admin()) WITH CHECK(is_super_admin());`);
},60000);
afterEach(()=>db.exec('ROLLBACK'));afterAll(()=>db.close());
describe('prezzario: autorizzazioni identiche, controlli invarianti',()=>{
  it.each(['on','off'])('visibilità prima/dopo identica: admin %s',async admin=>{
    await db.exec(`BEGIN;SET LOCAL test.admin='${admin}';SET LOCAL ROLE authenticated;`);
    const before=(await db.query('SELECT id FROM prezzario_voce ORDER BY id')).rows;
    await db.exec('RESET ROLE;'+sql+';SET LOCAL ROLE authenticated;');
    expect((await db.query('SELECT id FROM prezzario_voce ORDER BY id')).rows).toEqual(before);
    expect(before).toHaveLength(admin==='on'?2:1);
  });
  it('non-admin non può scrivere né pubblicare una bozza',async()=>{
    await db.exec('BEGIN;'+sql+";SET LOCAL test.admin='off';SET LOCAL ROLE authenticated;");
    expect((await db.query("UPDATE prezzario_fonte SET stato='pubblicato' WHERE id=2 RETURNING id")).rows).toEqual([]);
    expect((await db.query('DELETE FROM prezzario_voce RETURNING id')).rows).toEqual([]);
    await expect(db.exec('INSERT INTO prezzario_voce VALUES(3,1)')).rejects.toThrow(/row-level security/);
  });
  it('admin mantiene scritture, anon non ottiene accesso',async()=>{
    await db.exec('BEGIN;'+sql+";SET LOCAL test.admin='on';SET LOCAL ROLE authenticated;INSERT INTO prezzario_voce VALUES(3,2);RESET ROLE;SET LOCAL ROLE anon;");
    await expect(db.query('SELECT * FROM prezzario_voce')).rejects.toThrow(/permission denied/);
  });
  it('il piano usa InitPlan per i controlli super admin',async()=>{
    await db.exec('BEGIN;'+sql+";SET LOCAL test.admin='off';SET LOCAL ROLE authenticated;");
    const plan=JSON.stringify((await db.query('EXPLAIN (FORMAT JSON) SELECT * FROM prezzario_voce')).rows);
    expect(plan).toContain('InitPlan');
  });
});
