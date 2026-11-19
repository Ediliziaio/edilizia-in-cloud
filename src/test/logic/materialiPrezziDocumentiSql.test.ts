import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, expect, it } from "vitest";
const id = (n: number) => `00000000-0000-4000-a000-${String(n).padStart(12,"0")}`;
const [c,u,o,s,a,d,r,f] = [1,2,3,4,5,6,7,8].map(id);
const sql = (name: string) => readFileSync(`supabase/migrations/${name}`,"utf8");
const nuova = () => sql("20290421100000_documenti_prezzi_materiali_preparati.sql");
let db: PGlite;
beforeAll(async()=>{
 db=new PGlite(); await db.waitReady;
 await db.exec(readFileSync("src/test/fixtures/ddt_documenti_base.sql","utf8"));
 for(const name of ["20290214100000_ddt_documenti_persistenti.sql","20290214110000_ddt_consegne_materiali.sql","20290214120000_ddt_prezzi_da_fattura.sql","20290214130000_ddt_acquisizione_rifiniture.sql","20290214140000_ddt_compatibilita_righe.sql","20290214150000_ddt_valorizzazione_tenant.sql","20290214160000_ddt_prezzi_magazzino.sql","20290214190000_ddt_fatture_piva_normalizzata.sql"]) await db.exec(sql(name));
 await db.exec(`alter table order_items add column prezzo_fonte text,add column costo_stimato_iniziale numeric,add column prezzo_aggiornato_il timestamptz,add column prezzo_prima_ordine jsonb,add column gruppo_id uuid;
 alter table purchase_order_items add column unit_price numeric,add column discount_percent numeric default 0,add column rfq_item_id uuid,add column riordino_motivo text;
 alter table fatture_ricevute add column tipo_documento text;
 create function utente_sola_lettura(c uuid) returns boolean language sql as $$select false$$;
 create function fattura_ddt_consumi(p_company uuid,p_ddt uuid[],p_escludi uuid default null)
 returns table(fattura_id uuid,riga_id uuid,ddt_id uuid,quantita numeric) language sql stable as $$
 select v.fattura_id,v.riga_id,v.ddt_id,v.quantita from ddt_valorizzazioni v
 where v.company_id=p_company and v.ddt_id=any(p_ddt) and v.fattura_id is distinct from p_escludi $$;`);
 const prezzo = sql("20290313200000_ddt_carico_e_costi_provvisori.sql").match(/CREATE OR REPLACE FUNCTION public\.ddt_valorizza_da_fattura[\s\S]*?end \$function\$;/)?.[0];
 if(!prezzo) throw Error("Funzione canonica prezzi DDT non trovata");
 await db.exec(prezzo);
 const oda = sql("20290103100000_offerta_ordine_su_misura.sql");
 const inizio=oda.indexOf('create or replace function public.materiali_prezzo_da_ordine()');
 await db.exec(oda.slice(inizio,oda.indexOf('$function$;',inizio)+'$function$;'.length));
 await db.exec('create trigger materiali_prezzo_da_ordine after insert or update of unit_price on purchase_order_items for each row execute function materiali_prezzo_da_ordine()');
 await db.exec(nuova()); await db.exec(nuova());
},60000);
beforeEach(async()=>{
 await db.exec(`reset role;truncate ddt_valorizzazioni,fattura_ddt,fatture_ricevute,ddt_consegne,ddt_operazioni_consegna,ddt_righe,ddt_ricezione,purchase_order_items,purchase_orders,order_items,warehouse_movements,warehouse_stock,warehouses,orders,suppliers,profiles,companies cascade;
 select set_config('test.user','${u}',false),set_config('test.company','${c}',false),set_config('test.office','true',false),set_config('test.blocked','false',false);
 insert into companies values('${c}');insert into profiles values('${u}');insert into orders values('${o}','${c}',null);insert into suppliers values('${s}','${c}','08236870963');
 insert into order_items(id,order_id,name,quantity,quantity_received,purchase_price,prezzo_fonte,costo_stimato_iniziale,unita_misura,origine_materiale)
 values('${a}','${o}','Preparato',10,10,10,'ordine',10,'pz','manuale');
 insert into ddt_ricezione(id,company_id,order_id,supplier_id,numero_ddt,data_ricezione,destinazione) values('${d}','${c}','${o}','${s}','SIM-DDT','2026-11-19','cantiere');
 insert into ddt_righe(id,ddt_ricezione_id,company_id,descrizione,quantita,unita_misura,prezzo_unitario) values('${r}','${d}','${c}','Preparato',10,'pz',12);
 insert into fatture_ricevute(id,company_id,fornitore_id,numero_fattura,tipo_documento) values('${f}','${c}','${s}','SIM-FT','TD01');`);
});
afterAll(async()=>{await db?.close();});
const arrivo = async(q=10,articolo=a,riga=r,bolla=d,n=20,origine:string|null=null)=>{
 await db.query(`insert into ddt_operazioni_consegna(id,company_id,ddt_id,payload,created_by) values($1,$2,$3,'{}',$4)`,[id(n),c,bolla,u]);
 await db.query(`insert into ddt_consegne(id,company_id,operazione_id,ddt_id,riga_id,quantita,unita_misura,destinazione,order_id,order_item_id,created_by,tipo,consegna_origine_id)
 values($1,$2,$3,$4,$5,$6,'pz','cantiere',$7,$8,$9,$10,$11)`,[id(n+100),c,id(n),bolla,riga,q,o,articolo,u,origine?'reso':'ingresso',origine]);
};
const fattura=(q=10,p=14,fatt=f)=>db.query("select ddt_valorizza_da_fattura($1,$2,$3::jsonb) v",[d,fatt,JSON.stringify([{riga_id:r,quantita:q,prezzo_unitario:p}])]);
const articolo=()=>db.query("select purchase_price::float8 prezzo,costo_stimato_iniziale::float8 stima,prezzo_fonte fonte,quantity::float8 quantita,quantity_received::float8 ricevuti from order_items where id=$1",[a]).then(x=>x.rows[0]);
it("il DDT confermato valorizza un articolo esistente senza riscrivere la stima né le quantità",async()=>{
 await arrivo();expect(await articolo()).toEqual({prezzo:12,stima:10,fonte:'ddt',quantita:10,ricevuti:10});
});
it("la fattura prevale sul DDT e un retry non duplica arrivi o valorizzazioni",async()=>{
 await arrivo();await fattura();await fattura();
 expect(await articolo()).toEqual({prezzo:14,stima:10,fonte:'fattura',quantita:10,ricevuti:10});
 expect((await db.query('select count(*)::int n from ddt_consegne')).rows).toEqual([{n:1}]);
 expect((await db.query('select count(*)::int n from ddt_valorizzazioni')).rows).toEqual([{n:1}]);
 expect((await db.query('select * from warehouse_movements')).rows).toHaveLength(0);
});
it("una conferma a pari prezzo cambia la fonte da DDT a fattura",async()=>{
 await arrivo();await fattura(10,12);expect(await articolo()).toMatchObject({prezzo:12,fonte:'fattura',stima:10});
});
it("una fattura parziale con prezzo diverso non sostituisce il DDT prima della copertura completa",async()=>{
 await arrivo();await fattura(4,14);expect(await articolo()).toMatchObject({prezzo:12,fonte:'ddt'});
 const f2=id(32);await db.exec(`insert into fatture_ricevute(id,company_id,fornitore_id,numero_fattura) values('${f2}','${c}','${s}','SIM-FT2')`);
 await fattura(6,14,f2);expect(await articolo()).toMatchObject({prezzo:14,fonte:'fattura',stima:10});
});
it("lo zero fatturato è un prezzo confermato e non un prezzo mancante",async()=>{
 await arrivo();await fattura(10,0);expect(await articolo()).toMatchObject({prezzo:0,fonte:'fattura',stima:10});
});
it("due bolle usano il medio delle quantità accettate, al netto dei resi",async()=>{
 await arrivo(4);
 const d2=id(40),r2=id(41);
 await db.exec(`insert into ddt_ricezione(id,company_id,order_id,supplier_id,numero_ddt,data_ricezione,destinazione) values('${d2}','${c}','${o}','${s}','SIM-2','2026-11-19','cantiere');
 insert into ddt_righe(id,ddt_ricezione_id,company_id,descrizione,quantita,unita_misura,prezzo_unitario) values('${r2}','${d2}','${c}','Preparato',6,'pz',20)`);
 await arrivo(6,a,r2,d2,42);expect(await articolo()).toMatchObject({prezzo:16.8,stima:10,fonte:'ddt'});
 await arrivo(2,a,r2,d2,43,id(142));expect(await articolo()).toMatchObject({prezzo:16,stima:10});
});
it("una bolla senza prezzo conserva la stima e la fonte dell'ordine",async()=>{
 await db.exec(`update ddt_righe set prezzo_unitario=null where id='${r}'`);await arrivo();expect(await articolo()).toMatchObject({prezzo:10,fonte:'ordine',stima:10});
});
it("una revisione ODA aggiorna le stime ma non retrocede i prezzi da DDT e fattura",async()=>{
 const po=id(50),pi=id(51);
 await db.exec(`insert into purchase_orders(id,company_id,supplier_id,order_id,status) values('${po}','${c}','${s}','${o}','ricevuto');
 insert into purchase_order_items(id,purchase_order_id,company_id,order_item_id,quantity,unit_price) values('${pi}','${po}','${c}','${a}',10,11)`);
 expect(await articolo()).toMatchObject({prezzo:11,fonte:'ordine',stima:10});
 await arrivo();await db.exec(`update purchase_order_items set unit_price=99 where id='${pi}'`);
 expect(await articolo()).toMatchObject({prezzo:12,fonte:'ddt',stima:10});
 await fattura();await db.exec(`update purchase_order_items set unit_price=101 where id='${pi}'`);
 expect(await articolo()).toMatchObject({prezzo:14,fonte:'fattura',stima:10});
});
it("non prende consegne di un'altra azienda e il helper non è esposto agli utenti",async()=>{
 const altra=id(80);await db.exec(`insert into companies values('${altra}');update ddt_righe set company_id='${altra}' where id='${r}'`);
 await arrivo();expect(await articolo()).toMatchObject({prezzo:10,fonte:'ordine'});
 const permessi=await db.query("select has_function_privilege('authenticated','materiali_prezzo_da_documenti(uuid)','execute') a,has_function_privilege('anon','materiali_prezzo_da_documenti(uuid)','execute') b");
 expect(permessi.rows).toEqual([{a:false,b:false}]);
});
