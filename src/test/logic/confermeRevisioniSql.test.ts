import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
import {afterAll,beforeAll,beforeEach,expect,it} from 'vitest';
const id=(n:number)=>`00000000-0000-4000-a000-${String(n).padStart(12,'0')}`;
const [azienda,po,supplier,item,controllo]=[1,2,3,4,5].map(id);
let db:PGlite;
beforeAll(async()=>{
 db=new PGlite();await db.waitReady;
 await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;
 create function auth.uid() returns uuid language sql stable as $$select '${id(9)}'::uuid$$;
 create function ddt_unita(text) returns text language sql immutable as $$select lower($1)$$;
 create function utente_bloccato() returns boolean language sql stable as $$select coalesce(current_setting('test.blocked',true),'false')='true'$$;
 create function utente_e_cliente_esterno() returns boolean language sql stable as $$select false$$;
 create function utente_sola_lettura(uuid) returns boolean language sql stable as $$select coalesce(current_setting('test.readonly',true),'false')='true'$$;
 create function user_can_access_company(uuid) returns boolean language sql stable as $$select $1='${azienda}'::uuid$$;
 create function materiali_puo(text,uuid) returns boolean language sql stable as $$select user_can_access_company($2)$$;
 create function aziende_con_permesso(text) returns uuid[] language sql stable as $$select array['${azienda}'::uuid]$$;
 create table suppliers(id uuid primary key,name text,email text,vat_number text);
 create table purchase_orders(id uuid primary key,company_id uuid,supplier_id uuid,oda_number text,expected_delivery_date date,payment_terms text,payment_method text,delivery_address text,delivery_warehouse_id uuid,document_details jsonb,notes text,status text,attachment_url text);
 create table purchase_order_items(id uuid primary key,purchase_order_id uuid,description text,sku text,quantity numeric,unit_of_measure text,unit_price numeric,discount_percent numeric,vat_rate numeric,price_pending boolean,riferimento text,misure jsonb,colore text,apertura text,misure_testo text,rfq_item_id uuid,sort_order integer,quantity_received numeric);
 create table supplier_rfq_suppliers(id uuid primary key,company_id uuid,supplier_id uuid,rfq_id uuid);
 create table supplier_rfq_items(id uuid primary key,rfq_id uuid,posizione integer,descrizione text);
 create table procurement_document_events(id uuid primary key,company_id uuid,purchase_order_id uuid,kind text,operation text,payload jsonb,created_at timestamptz default now());
 create table controlli_documento_fornitore(id uuid primary key default gen_random_uuid(),company_id uuid,purchase_order_id uuid,rfq_supplier_id uuid,tipo text,file_hash text,file_path text,file_nome text,stato text constraint controlli_documento_fornitore_stato_check check(stato in('in_lettura','letto')),esito text,righe jsonb,lettura jsonb,accettato_il timestamptz,accettato_da uuid,accettato_motivo text,created_at timestamptz default now(),updated_at timestamptz default now());
 create unique index controlli_documento_fornitore_unico on controlli_documento_fornitore(company_id,coalesce(purchase_order_id,rfq_supplier_id),tipo,file_hash);
 alter table controlli_documento_fornitore enable row level security;
 create function _controllo_documento_puo(uuid) returns void language plpgsql as $$begin if not user_can_access_company($1) then raise exception 'Non autorizzato';end if;end$$;
 create function _controllo_documento_esito(jsonb) returns text language sql immutable as $$select case when exists(select 1 from jsonb_array_elements($1) r where r->>'esito'='rosso') then 'rosso' when exists(select 1 from jsonb_array_elements($1) r where r->>'esito'='da_controllare') then 'da_controllare' else 'verde' end$$;`);
 await db.exec(readFileSync('supabase/migrations/20290313090000_conferme_fornitore_revisioni.sql','utf8'));
},60000);
beforeEach(async()=>{
 await db.exec(`truncate controlli_documento_fornitore,procurement_document_events,purchase_order_items,purchase_orders,suppliers;
 select set_config('test.readonly','false',false),set_config('test.blocked','false',false);
 insert into suppliers values('${supplier}','SIMULAZIONE',null,'00000000000');
 insert into purchase_orders(id,company_id,supplier_id,oda_number,status) values('${po}','${azienda}','${supplier}','ODA-SIM','inviato');
 insert into purchase_order_items(id,purchase_order_id,description,quantity,unit_of_measure,unit_price,price_pending,sort_order,quantity_received) values('${item}','${po}','Finestra P3',10,'pz',0,true,0,0);
 insert into controlli_documento_fornitore(id,company_id,purchase_order_id,tipo,file_hash,stato,esito,righe,base_ordine,impronta_ordine)
 select '${controllo}','${azienda}','${po}','conferma','file1','letto','da_controllare','[{"chiave":"p3","esito":"da_controllare"}]',controllo_documento_base('${po}',null),controllo_documento_base('${po}',null)->>'impronta';`);
});
afterAll(async()=>{await db?.close();});
const base=async()=> (await db.query<{base:{impronta:string;fonte:string;documento:unknown}}>('select controllo_documento_base($1,null) as base',[po])).rows[0].base;
it('un arrivo e lo stato logistico non invalidano il confronto, le quantità ordinate sì',async()=>{
 const prima=await base();await db.exec(`update purchase_order_items set quantity_received=3;update purchase_orders set status='parziale'`);
 expect((await base()).impronta).toBe(prima.impronta);
 await db.exec('update purchase_order_items set quantity=12');expect((await base()).impronta).not.toBe(prima.impronta);
});
it('usa soltanto un invio riuscito e conserva il documento preparato in quel momento',async()=>{
 await db.exec(`insert into procurement_document_events values('${id(20)}','${azienda}','${po}','email','sent','{"context":{"documento":{"numero":"ODA-SIM","righe":[{"descrizione":"VERSIONE INVIATA"}]}}}',now()-interval '1 hour'),('${id(21)}','${azienda}','${po}','email','failed','{"context":{"documento":{"righe":[{"descrizione":"NON INVIATA"}]}}}',now());`);
 const b=await base();expect(b.fonte).toBe('invio');expect(JSON.stringify(b.documento)).toContain('VERSIONE INVIATA');expect(JSON.stringify(b.documento)).not.toContain('NON INVIATA');
});
it('blocca approvazioni obsolete dopo una modifica tecnica',async()=>{
 await db.exec(`update purchase_order_items set misure='{"larghezza":1200,"altezza":1450}'`);
 await expect(db.query('select controllo_documento_approva($1,1,$2)',[controllo,'Verificato originale'])).rejects.toThrow('ordine è cambiato');
});
it('due decisioni sulla stessa versione non si sovrascrivono',async()=>{
 await db.query('select controllo_documento_decidi($1,1,$2,$3,$4)',[controllo,'p3','verde','Verificata la pagina 2']);
 await expect(db.query('select controllo_documento_decidi($1,1,$2,$3,$4)',[controllo,'p3','rosso','Decisione precedente'])).rejects.toThrow('collega');
 expect((await db.query<{versione:number}>('select versione from controlli_documento_fornitore')).rows[0].versione).toBe(2);
});
it('l’approvazione conserva autore e motivazione senza registrare arrivi o cambiare quantità',async()=>{
 await db.query('select controllo_documento_approva($1,1,$2)',[controllo,'Misura concordata con il fornitore']);
 expect((await db.query('select accettato_da,accettato_motivo,versione from controlli_documento_fornitore')).rows[0]).toMatchObject({accettato_da:id(9),versione:2,accettato_motivo:'Misura concordata con il fornitore'});
 expect((await db.query('select quantity,quantity_received from purchase_order_items')).rows[0]).toEqual({quantity:'10',quantity_received:'0'});
});
it.each(['readonly','blocked'])('l’utente %s non può approvare',async flag=>{
 await db.query("select set_config($1,'true',false)",[`test.${flag}`]);
 await expect(db.query('select controllo_documento_approva($1,1,$2)',[controllo,'Confermo originali'])).rejects.toThrow('Non puoi');
});
it('lo stesso file può avere un confronto nuovo sulla nuova revisione',async()=>{
 await db.exec('update purchase_order_items set quantity=12');
 await db.exec(`insert into controlli_documento_fornitore(company_id,purchase_order_id,tipo,file_hash,stato,impronta_ordine) select '${azienda}','${po}','conferma','file1','in_lettura',controllo_documento_base('${po}',null)->>'impronta'`);
 expect((await db.query('select id from controlli_documento_fornitore')).rows).toHaveLength(2);
});
it('la base di un’altra azienda non è leggibile',async()=>{
 await db.exec(`update purchase_orders set company_id='${id(99)}'`);
 await expect(base()).rejects.toThrow('Non puoi leggere');
});
it('i prezzi approvati valorizzano solo le righe pendenti senza cambiare arrivi e quantità',async()=>{
 await db.exec(`update controlli_documento_fornitore set esito='verde',righe='[{"chiave":"${item}","esito":"verde","indici_fornitore":[0]}]',lettura='{"righe":[{"prezzo_unitario":19.8,"unita":"pz","confidenza":99}]}'`);
 await db.query('select controllo_documento_approva($1,1,null)',[controllo]);
 await db.query('select controllo_documento_applica_prezzi($1,2,$2::uuid[])',[controllo,[item]]);
 expect((await db.query('select quantity,quantity_received,unit_price,price_pending,discount_percent from purchase_order_items')).rows[0]).toEqual({quantity:'10',quantity_received:'0',unit_price:'19.8',price_pending:false,discount_percent:'0'});
 expect((await db.query('select versione,decisioni_storico from controlli_documento_fornitore')).rows[0]).toMatchObject({versione:3,decisioni_storico:expect.any(Array)});
});
it('una selezione di prezzi con un id estraneo non applica nulla',async()=>{
 await db.exec(`update controlli_documento_fornitore set esito='verde',righe='[{"chiave":"${item}","esito":"verde","indici_fornitore":[0]}]',lettura='{"righe":[{"prezzo_unitario":19.8,"unita":"pz","confidenza":99}]}'`);
 await db.query('select controllo_documento_approva($1,1,null)',[controllo]);
 await expect(db.query('select controllo_documento_applica_prezzi($1,2,$2::uuid[])',[controllo,[item,id(99)]])).rejects.toThrow('non appartiene');
 expect((await db.query('select unit_price from purchase_order_items')).rows[0]).toEqual({unit_price:'0'});
});
