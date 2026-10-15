import { beforeAll, afterAll, beforeEach, afterEach, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { moduleConversionSchema, moduleMigration, seedModules, A, B, U, Q } from '../fixtures/moduleConversionDatabase';
let db: PGlite;
beforeAll(async()=>{db=new PGlite();await db.exec(moduleConversionSchema);await db.exec(moduleMigration);},60000);
afterAll(async()=>db?.close());
beforeEach(async()=>{await db.exec('begin;'+seedModules);});
afterEach(async()=>{await db.exec('rollback');});
async function rpc(modulo='rst',preview=true,impronta:string|null=null,group=false) {
  return (await db.query<{r:any}>('select converti_modulo_commessa_atomic($1,$2,$3,$4,$5) r',[modulo,Q,group,preview,impronta])).rows[0].r;
}
async function convert(modulo='rst',group=false){const p=await rpc(modulo,true,null,group);return rpc(modulo,false,p.impronta,group);}
async function rows(table:string){return (await db.query<any>(`select * from ${table}`)).rows;}
async function secondary(active=true,expired=false,permission=true){await db.exec(`
 update profiles set company_id='${B}' where id='${U}';
 insert into multi_company_access values('${U}','${A}',${active?"'active'":"'revoked'"},${expired?"now()-interval '1 day'":'null'},'company_staff');
 insert into staff_permissions values('${U}','${A}',${permission});`);}
describe('conversione moduli sul motore PostgreSQL reale',()=>{
 it('anteprima non scrive commesse o fasi',async()=>{const p=await rpc();expect(p.materiali).toEqual([]);expect(p.fasi).toHaveLength(2);expect(p.imponibile).toBe(4333.5);expect(await rows('orders')).toHaveLength(0);});
 it('RST: computo solo lavorazioni, quantità decimali conservate, costi stimati non diventano acquisti',async()=>{
  await convert();expect(await rows('order_items')).toHaveLength(0);const f=await rows('order_work_phases');expect(f).toHaveLength(2);expect(f[1].notes).toContain('85.5 mq');expect(f.every(x=>x.importo_venduto===null)).toBe(true);
  const o=(await rows('orders'))[0];expect(Number(o.total_amount)).toBe(4333.5);expect(Number(o.vat_rate)).toBe(22);expect(o.client_name).toBe('Mario Rossi');expect(o.work_address).toContain('Via Roma 1');expect(o.rst_progetto_id).toBe(Q);expect((await rows('rst_progetti'))[0].ordine_id).toBe(o.id);
 });
 it('FV: solo componenti negli acquisti; pratiche e ore nelle fasi',async()=>{await convert('fv');const m=await rows('order_items');expect(m).toHaveLength(1);expect(m[0].name).toBe('Marca 450');expect(Number(m[0].quantity)).toBe(12);expect(Number(m[0].unit_price)).toBe(140);expect(Number(m[0].purchase_price)).toBe(100);const f=await rows('order_work_phases');expect(f.map(x=>x.name)).toEqual(['Pratica di connessione','Posa impianto']);expect(f[1].notes).toContain('7.5 h');expect(Number((await rows('orders'))[0].total_amount)).toBe(10000);});
 it('servizio storico con quantità nulla mantiene la singola prestazione, zero resta escluso',async()=>{await db.exec('update fv_servizi_progetto set quantita=null');const p=await rpc('fv');expect(p.fasi.map((f:any)=>f.name)).toContain('Pratica di connessione');});
 it('FV: prezzo manuale imponibile e IVA zero restano invariati, nessun articolo di rettifica',async()=>{await db.exec('update fv_progetti set prezzo_vendita_manuale=8765.43,iva_aliquota=0');const p=await convert('fv');expect(p.imponibile).toBe(8765.43);expect(p.aliquota).toBe(0);expect(p.totale).toBe(8765.43);expect(p.materiali).toHaveLength(1);});
 it('RST: capitoli raggruppati senza perdere descrizioni e misure',async()=>{await db.exec("update rst_computo_voci set capitolo_nome='Opere'");const p=await convert('rst',true);expect(p.fasi).toHaveLength(1);expect(p.fasi[0].notes).toContain('Rimozione pavimento');expect(p.fasi[0].notes).toContain('85.5 mq');});
 it('quantità zero o negative escluse, nessun falso acquisto di riepilogo',async()=>{await db.exec('update fv_componenti_progetto set quantita=0; update fv_servizi_progetto set quantita=-1;update fv_manodopera_progetto set ore=0');const p=await convert('fv');expect(p.esclusi).toBe(3);expect(p.materiali).toEqual([]);expect(p.fasi).toEqual([]);expect(await rows('order_items')).toHaveLength(0);});
 it('materiale con quantità decimale mantiene il valore di riga e la misura originale',async()=>{await db.exec('update fv_componenti_progetto set quantita=2.5');const p=await convert('fv');expect(p.materiali[0].quantity).toBe(1);expect(p.materiali[0].unit_price).toBe(350);expect(p.materiali[0].description).toContain('2.5 unità');});
 it('profilo portale risolto dal contatto CRM, senza confondere i due UUID',async()=>{await db.exec(`insert into marketing_contacts values('${B}','${A}','${U}');update rst_progetti set cliente_id='${B}'`);await convert();expect((await rows('orders'))[0].customer_id).toBe(U);});
 it('contatto di altra azienda non collegato al cliente della commessa',async()=>{await db.exec(`insert into marketing_contacts values('${B}','${B}','${U}');update rst_progetti set cliente_id='${B}'`);await convert();expect((await rows('orders'))[0].customer_id).toBeNull();});
 it('seconda conversione bloccata',async()=>{await convert();await expect(convert()).rejects.toThrow('già diventato');});
 it('preventivo cambiato dopo anteprima richiede nuova verifica',async()=>{const p=await rpc();await db.exec('update rst_computo_voci set quantita=100');await expect(rpc('rst',false,p.impronta)).rejects.toThrow('è cambiato');});
 it('errore fase annulla anche commessa, materiali e collegamento',async()=>{const p=await rpc('fv');await db.exec("alter table order_work_phases add constraint prova check(name<>'Posa impianto');savepoint tentativo");await expect(rpc('fv',false,p.impronta)).rejects.toThrow();await db.exec('rollback to tentativo');expect(await rows('orders')).toHaveLength(0);expect(await rows('order_items')).toHaveLength(0);expect((await rows('fv_progetti'))[0].ordine_id).toBeNull();});
 it('stati mancanti producono errore chiaro senza scritture',async()=>{await db.exec('delete from order_statuses');await expect(convert()).rejects.toThrow('stato commessa');});
 it('errore lettura dettaglio non diventa preventivo senza righe',async()=>{await db.exec('drop table fv_servizi_progetto');await expect(rpc('fv')).rejects.toThrow('does not exist');});
 it('importo mancante impedisce conversione',async()=>{await db.exec('update rst_progetti set totale=0,totale_imponibile=0');await expect(rpc()).rejects.toThrow('prezzo di vendita');});
 it('annullato impedisce conversione',async()=>{await db.exec('update fv_progetti set annullato=true');await expect(rpc('fv')).rejects.toThrow('annullato');});
});
describe('accessi multi-azienda senza nuovi permessi',()=>{
 it('staff secondario autorizzato può convertire',async()=>{await secondary();await convert();expect(await rows('orders')).toHaveLength(1);});
 it('amministratore della propria azienda non diventa admin della secondaria',async()=>{await secondary(true,false,false);await expect(convert()).rejects.toThrow('permesso');});
 it.each([[false,false],[true,true]])('accesso attivo=%s scaduto=%s respinto',async(active,expired)=>{await secondary(active,expired);await expect(convert()).rejects.toThrow(/revocato|permesso/);});
 it('solo assegnati ritrova la commessa che crea, senza ampliare la visibilità',async()=>{await db.exec("select set_config('test.assigned','true',false)");await convert();expect((await rows('orders'))[0].assigned_to).toBe(U);});
 it('anteprima non consuma numeri commessa',async()=>{await db.exec("create sequence prova_codici;create or replace function prossimo_numero_commessa(c uuid) returns text language sql as $$select nextval('prova_codici')::text$$");await rpc();expect((await db.query<any>('select is_called from prova_codici')).rows[0].is_called).toBe(false);});
 it.each([0,4,10,22])('RST: aliquota %s e prezzo contrattuale scontato conservati',async(iva)=>{await db.query('update rst_progetti set iva_pct=$1,totale_imponibile=12345.67,prezzo_manuale=12995.44',[iva]);const p=await convert();expect(p.imponibile).toBe(12345.67);expect(p.aliquota).toBe(iva);expect(p.materiali).toHaveLength(0);});
 it('sorgenti e prezzi di dettaglio restano invariati dopo conversione',async()=>{const before=await rows('fv_componenti_progetto');await convert('fv');expect(await rows('fv_componenti_progetto')).toEqual(before);const q=(await rows('fv_progetti'))[0];expect(Number(q.prezzo_vendita_iva_inclusa)).toBe(11000);expect(q.prezzo_vendita_manuale).toBeNull();});
 it('solo assegnati non può convertire preventivo altrui',async()=>{await db.exec(`select set_config('test.assigned','true',false);update rst_progetti set created_by='${B}'`);await expect(convert()).rejects.toThrow('permesso');});
 it.each(['blocked','customer'])('utente %s respinto',async(flag)=>{await db.query('select set_config($1,$2,false)',['test.'+flag,'true']);await expect(convert()).rejects.toThrow('autorizzata');});
 it('ruolo authenticated esegue la nuova RPC con i propri controlli',async()=>{await db.exec('set local role authenticated');const p=await rpc();expect(p.fasi).toHaveLength(2);});
 it('ruolo anon non può eseguire la RPC nemmeno con un identificativo utente impostato',async()=>{await db.exec('set local role anon');await expect(rpc()).rejects.toThrow('permission denied for function');});
 it('sessione anonima respinta',async()=>{await db.exec("select set_config('test.user','',false)");await expect(convert()).rejects.toThrow('autorizzata');});
 it('creazione ordinaria conserva materiali, magazzino, rate e provvigioni',async()=>{await db.exec(`insert into warehouse_stock values('${B}',10)`);await db.query('select create_order_atomic($1,$2,$3,$4,$5)',[{company_id:A,total_amount:1000,vat_rate:10},[{name:'Materiale',quantity:2,unit_price:100,purchase_price:70,stock_item_id:B}],{salesperson_id:U,commission_type:'percent',commission_value:5},U,[{label:'Acconto',type:'deposit',amount:200}]]);expect(Number((await rows('warehouse_stock'))[0].quantity)).toBe(8);expect((await rows('warehouse_movements'))[0].performed_by).toBe(U);expect(Number((await rows('order_installments'))[0].amount)).toBe(200);expect(Number((await rows('order_salespeople'))[0].commission_amount)).toBe(50);});
 it('generic writer usa il permesso della destinataria, non quello della sessione precedente',async()=>{await secondary();await db.exec(`select set_config('test.company','${B}',false);select set_config('test.admin','false',false)`);await db.query('select create_order_atomic($1)',[{company_id:A,total_amount:10}]);expect(await rows('orders')).toHaveLength(1);});
 it('generic writer non accetta p_user_id per simulare accesso secondario',async()=>{await secondary();await db.exec("select set_config('test.user','',false)");await expect(db.query('select create_order_atomic($1,$2,$3,$4)',[{company_id:A},[],null,U])).rejects.toThrow('permesso');});
 it('azienda estranea respinta anche con riga staff residua',async()=>{await db.exec(`update profiles set company_id='${B}';insert into staff_permissions values('${U}','${A}',true)`);await expect(convert()).rejects.toThrow('accessibile');});
});
