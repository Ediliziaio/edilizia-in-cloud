import {beforeAll,afterAll,beforeEach,afterEach,it,expect} from 'vitest';
import type {PGlite} from '@electric-sql/pglite';
import {fattureMaterialiDatabase,COMPANY,ORDER} from '../fixtures/fasiMaterialiDatabase';
let db:PGlite;
beforeAll(async()=>{db=await fattureMaterialiDatabase();},60000);afterAll(()=>db.close());
beforeEach(async()=>db.exec('begin'));afterEach(async()=>db.exec('rollback'));
async function seed(){const ids:string[]=[];for(const [i,amount]of [1800,143,93,346.5,550,590].entries())ids.push((await db.query<{id:string}>("insert into order_items(order_id,name,quantity,unit_price,position) values($1,$2,1,$3,$4) returning id",[ORDER,`Fase ${i+1}  Descrizione del lavoro`,amount,i])).rows[0].id);return ids;}
it('le sei lavorazioni diventano sei fasi senza cambiare righe o prezzi e senza generare materiali',async()=>{
 const ids=await seed();const before=(await db.query('select id,name,quantity,unit_price,discount_percent from order_items order by position')).rows;
 await db.query("select riclassifica_righe_storiche($1,$2,$3,'lavorazione')",[COMPANY,ORDER,ids]);
 expect((await db.query('select id,name,quantity,unit_price,discount_percent from order_items order by position')).rows).toEqual(before);
 const phases=(await db.query<{importo_venduto:string}>('select * from order_work_phases where order_id=$1 order by position',[ORDER])).rows;
 expect(phases).toHaveLength(6);expect(phases.map(p=>Number(p.importo_venduto))).toEqual([1800,143,93,346.5,550,590]);
 expect((await db.query('select * from order_items where natura_riga=\'materiale\'')).rows).toHaveLength(0);
 await db.query("select riclassifica_righe_storiche($1,$2,$3,'lavorazione')",[COMPANY,ORDER,ids]);expect((await db.query('select id from order_work_phases')).rows).toHaveLength(6);
});
it('non permette la classificazione senza permesso',async()=>{const ids=await seed();await db.exec("select set_config('test.permission','false',true)");await expect(db.query("select riclassifica_righe_storiche($1,$2,$3,'lavorazione')",[COMPANY,ORDER,ids])).rejects.toThrow('permesso');});
it('protegge lavorazioni da acquisti, anche da schermate già aperte',async()=>{const ids=await seed();await db.query("select riclassifica_righe_storiche($1,$2,$3,'lavorazione')",[COMPANY,ORDER,ids]);await expect(db.query('insert into purchase_order_items(order_item_id) values($1)',[ids[0]])).rejects.toThrow('non un materiale da acquistare');});
it('una fase già organizzata non viene cancellata dalla riclassificazione inversa',async()=>{const ids=await seed();await db.query("select riclassifica_righe_storiche($1,$2,$3,'lavorazione')",[COMPANY,ORDER,ids]);await db.query("update order_work_phases set status='in_corso' where legacy_order_item_id=$1",[ids[0]]);await expect(db.query("select riclassifica_righe_storiche($1,$2,$3,'materiale')",[COMPANY,ORDER,[ids[0]]])).rejects.toThrow();});

it('conserva anche una fase solo calendarizzata, senza avanzamento o squadra',async()=>{const ids=await seed();await db.query("select riclassifica_righe_storiche($1,$2,$3,'lavorazione')",[COMPANY,ORDER,ids]);await db.query("update order_work_phases set start_date='2026-10-20',end_date='2026-10-21' where legacy_order_item_id=$1",[ids[0]]);await expect(db.query("select riclassifica_righe_storiche($1,$2,$3,'materiale')",[COMPANY,ORDER,[ids[0]]])).rejects.toThrow('già utilizzata');});
