import {PGlite} from '@electric-sql/pglite';import {readFileSync,readdirSync} from 'node:fs';import {it,expect} from 'vitest';
const late=readFileSync('supabase/migrations/20290311175000_recovered_dependency_completion.sql','utf8');
const receiptBoundary=readFileSync('supabase/migrations/20281107090000_crea_commessa_preventivo_alias_famiglia.sql','utf8');
it('leaves existing production functions intact without a deferred-replay marker',async()=>{
 const db=new PGlite();try{await db.exec(`create role anon;create role authenticated;create role service_role;create function commessa_salva() returns text language sql as $$select 'production-current'$$;`);await db.exec(late);expect((await db.query<{value:string}>('select commessa_salva() as value')).rows[0].value).toBe('production-current');expect((await db.query('select * from private.recovered_dependency_patches')).rows).toEqual([]);}finally{await db.close()}
},60000);
it('restores every deferred body exactly once and keeps strict preflight checks',()=>{
 const names=readdirSync('supabase/migrations').filter(n=>/^2026/.test(n));let count=0;
 for(const name of names){const sql=readFileSync('supabase/migrations/'+name,'utf8');const match=sql.match(/DO \$defer_recovered_(\d+)\$ BEGIN IF [\s\S]*? THEN\n([\s\S]*?)\nELSE INSERT INTO private\.recovered_dependency_patches/);if(!match)continue;count++;const barrier=match[1]==='4'?receiptBoundary:late;expect(barrier).toContain(`WHERE id='${name}'`);expect(barrier).toContain(match[2]);expect(barrier.match(new RegExp('DO \\$complete_recovered_'+match[1]+'\\$', 'g'))).toHaveLength(1);}
 expect(count).toBeGreaterThanOrEqual(10);expect(receiptBoundary).toContain("RAISE EXCEPTION 'Ricezioni cambiate dalla baseline'");expect(receiptBoundary).toContain('CHECK-71: funzione % diversa dalla baseline verificata');
});
