import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { beforeAll, afterAll, beforeEach, it, expect } from "vitest";
const company="10000000-0000-4000-a000-000000000001", order="10000000-0000-4000-a000-000000000002", other="10000000-0000-4000-a000-000000000003", request="10000000-0000-4000-a000-000000000004";
let db:PGlite;
beforeAll(async()=>{
 db=new PGlite();await db.waitReady;
 await db.exec(`create role authenticated;create role anon;create schema auth;
 create function auth.uid() returns uuid language sql as $$select '${company}'::uuid$$;
 create function utente_bloccato() returns boolean language sql as $$select false$$;
 create function utente_e_cliente_esterno() returns boolean language sql as $$select false$$;
 create function user_can_access_company(p uuid) returns boolean language sql as $$select p='${company}'::uuid$$;
 create function assert_permesso(p text,q text) returns void language plpgsql as $$begin if current_setting('test.permesso',true)='no' then raise exception 'Permesso negato';end if;end$$;
 create function has_permission_for_company(u uuid,p text,c uuid) returns boolean language sql as $$select current_setting('test.permesso',true) is distinct from 'no' and c='${company}'::uuid$$;
 create function can_see_order(p uuid,a uuid,b uuid) returns boolean language sql as $$select p='${order}'::uuid$$;
 create table companies(id uuid primary key);
 create table orders(id uuid primary key,company_id uuid,assigned_to uuid,destination_warehouse_id uuid);
 create table suppliers(id uuid primary key,company_id uuid);
 create table article_templates(id uuid primary key,company_id uuid);
 create table article_families(id uuid primary key,company_id uuid);
 create table order_items(id uuid primary key default gen_random_uuid(),order_id uuid,name text check(name<>'ERRORE'),quantity numeric,purchase_price numeric,vat_rate numeric,costo_stimato_iniziale numeric,prezzo_da_definire boolean default false,origine_materiale text);
 create function commessa_aggiungi_voci(p_commessa uuid,p_voci jsonb) returns jsonb language plpgsql as $$declare r jsonb; ids uuid[]:='{}';nuovo uuid;begin for r in select value from jsonb_array_elements(p_voci) loop insert into order_items(order_id,name,quantity,purchase_price,vat_rate) values(p_commessa,r->>'name',(r->>'quantity')::numeric,(r->>'purchase_price')::numeric,(r->>'vat_rate')::numeric) returning id into nuovo;ids:=ids||nuovo;end loop;return jsonb_build_object('ids',to_jsonb(ids),'voci_inserite',cardinality(ids));end$$;`);
 await db.exec(readFileSync('supabase/migrations/20290420110000_preparazione_forniture_atomica.sql','utf8'));
 await db.exec(readFileSync('supabase/migrations/20290420110000_preparazione_forniture_atomica.sql','utf8'));
 await db.exec(`insert into companies values('${company}'),('${other}');insert into orders values('${order}','${company}',null,null),('${other}','${other}',null,null);`);
 await db.exec(`insert into suppliers values('${other}','${other}');insert into article_templates values('${other}','${other}');insert into article_families values('${other}','${other}');`);
},60000);
beforeEach(async()=>{await db.exec("reset role;truncate preparazioni_forniture_salvataggi,order_items;set test.permesso='si';set role authenticated;");});
afterAll(async()=>{await db?.close();});
const row=(name="Materiale",pending=false)=>({name,quantity:3,purchase_price:pending?0:100,vat_rate:22,prezzo_da_definire:pending,preparazione_prezzo:{versione:1,modo:"totale",ivato:true,valore:pending?"":"366"}});
const save=(rows:Record<string,unknown>[]=[row()],job=order,id=request)=>db.query('select commessa_prepara_forniture($1,$2::jsonb,$3) result',[job,JSON.stringify(rows),id]);
it('salva righe, metadati e stima iniziale nella stessa transazione',async()=>{
 const r=await save([row(),row('Secondo',true)]);expect((r.rows[0] as {result:{ids:unknown[]}}).result.ids).toHaveLength(2);
 await db.exec('reset role');const rows=await db.query('select origine_materiale,prezzo_da_definire,costo_stimato_iniziale,preparazione_prezzo from order_items order by name');
 expect(rows.rows[0]).toMatchObject({origine_materiale:'manuale',prezzo_da_definire:false,costo_stimato_iniziale:'100',preparazione_prezzo:{ivato:true}});
 expect(rows.rows[1]).toMatchObject({prezzo_da_definire:true,costo_stimato_iniziale:null});
});
it('un retry identico restituisce gli stessi ID, senza duplicazioni',async()=>{
 const a=await save(),b=await save();expect(b.rows).toEqual(a.rows);await db.exec('reset role');expect((await db.query('select * from order_items')).rows).toHaveLength(1);
});
it('rifiuta il riuso della richiesta con dati cambiati',async()=>{await save();await expect(save([row('Diverso')])).rejects.toThrow(/dati diversi/);});
it('la seconda riga fallita annulla anche la prima e la richiesta',async()=>{
 await expect(save([row(),row('ERRORE')])).rejects.toThrow();await db.exec('reset role');expect((await db.query('select * from order_items')).rows).toHaveLength(0);expect((await db.query('select * from preparazioni_forniture_salvataggi')).rows).toHaveLength(0);
});
it('nega altre aziende e utenti senza permesso',async()=>{
 await expect(save([row()],other)).rejects.toThrow(/Accesso negato/);await db.exec("set test.permesso='no'");await expect(save()).rejects.toThrow(/Permesso mancante/);
});
it('non espone direttamente il registro di idempotenza',async()=>{await expect(db.query('select * from preparazioni_forniture_salvataggi')).rejects.toThrow(/permission denied/);});
it('non accetta stock, righe esistenti o flag prezzo incoerenti',async()=>{
 await expect(save([{...row(),stock_item_id:other}])).rejects.toThrow(/magazzino/);
 await expect(save([{...row(),prezzo_da_definire:true}])).rejects.toThrow(/costo confermato/);
});
it.each(['supplier_id','article_template_id','family_id'])('nega riferimenti di altre aziende: %s',async field=>{
 await expect(save([{...row(),[field]:other}])).rejects.toThrow(/non accessibile/);
});
