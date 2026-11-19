import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
const pg=new PGlite();
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,"0")}`;
const company=id(1),other=id(2),user=id(3),invoice=id(10),tx=id(20),rec=id(30),payment=id(40),pn=id(50);
async function rpc<T = Record<string,unknown>>(fn:string,args:unknown[]):Promise<T>{return(await pg.query<{v:T}>(`select to_jsonb(${fn}(${args.map((_,i)=>`$${i+1}`).join(",")})) v`,args)).rows[0].v;}
beforeAll(async()=>{
  await pg.exec(`create role anon;create role authenticated;create role service_role;create schema private;create schema auth;
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.user',true),'')::uuid$$;
    create function public.utente_bloccato() returns boolean language sql stable as $$select false$$;
    create function auth.role() returns text language sql stable as $$select 'authenticated'::text$$;
    create function user_can_access_company(uuid) returns boolean language sql stable as $$select $1=nullif(current_setting('test.company',true),'')::uuid$$;
    create function utente_sola_lettura(uuid) returns boolean language sql stable as $$select coalesce(current_setting('test.readonly',true),'false')='true'$$;
    create function contabilita_puo_scrivere(uuid) returns boolean language sql stable as $$select user_can_access_company($1) and not utente_sola_lettura($1)$$;
    create function puo_incassare_fatture(uuid) returns boolean language sql stable as $$select contabilita_puo_scrivere($1)$$;
    create function puo_gestire_scadenze(uuid) returns boolean language sql stable as $$select contabilita_puo_scrivere($1)$$;
    create table invoices(id uuid primary key,company_id uuid,deleted_at timestamptz,document_type text default 'invoice',invoice_number text,client_company_name text,total numeric,paid_amount numeric,status text,external_provider text,payment_date date);
    create table invoice_payments(id uuid primary key,company_id uuid,invoice_id uuid,amount numeric,payment_date date,payment_method text,reference text,created_by uuid);
    create table documenti_fiscali(id uuid primary key,company_id uuid);
    create table fatture_ricevute(id uuid primary key,company_id uuid,company_cost_id uuid);
    create table bank_transactions(id uuid primary key,company_id uuid,account_id uuid,amount numeric,amount_eur numeric,currency text default 'EUR',booking_date date,value_date date,description text,reconciliation_status text default 'pending',chiuso_senza_documento text);
    create table bank_reconciliations(id uuid primary key,company_id uuid,transaction_id uuid,matched_amount numeric,unmatched_at timestamptz,unmatch_reason text,prima_nota_id uuid,invoice_id uuid,documento_id uuid,movimento_id uuid,scadenza_id uuid,fattura_ricevuta_id uuid);
    create table prima_nota_entries(id uuid primary key default gen_random_uuid(),company_id uuid,bank_account_id uuid,direction text,category text,description text,amount numeric check(amount>0),entry_date date not null,payment_method text,bank_transaction_id uuid,account_label text,is_auto boolean default false,auto_source text,created_by uuid,payment_payload jsonb,invoice_id uuid,documento_fiscale_id uuid,movimento_id uuid,scadenza_id uuid,cost_id uuid,reversal_of uuid,reference_number text,reconciliation_method text);
    grant usage on schema public,auth to authenticated;`);
  await pg.exec(await readFile("supabase/migrations/20290421183000_prima_nota_fonti_allineate.sql","utf8"));
  await pg.exec(await readFile("supabase/migrations/20290421190000_prima_nota_incassi_storici_prudenti.sql","utf8"));
  await pg.exec(await readFile("supabase/migrations/20290421192000_prima_nota_pagamenti_manual_gia_presenti.sql","utf8"));
  const modifica=await readFile("supabase/migrations/20290421182000_prima_nota_conti_specifici.sql","utf8");
  await pg.exec(modifica.slice(modifica.indexOf("CREATE OR REPLACE FUNCTION public.prima_nota_modifica")));
  await pg.exec(await readFile("supabase/migrations/20290421193000_prima_nota_incassi_cumulativi.sql","utf8"));
  await pg.exec(await readFile("supabase/migrations/20290421193000_prima_nota_incassi_cumulativi.sql","utf8"));
  await pg.exec(await readFile("supabase/migrations/20290421194000_prima_nota_incassi_importati_da_confrontare.sql","utf8"));
  await pg.exec(`create function registra_pagamento_costo(p_costo uuid,p_richiesta uuid,p_importo numeric,p_data date,p_metodo text,p_riferimento text,p_banca uuid,p_esistente uuid)
    returns jsonb language plpgsql set search_path='public' as $$declare pn public.prima_nota_entries;begin
    select * into pn from public.prima_nota_entries where id=p_esistente and cost_id=p_costo;
  if p_banca is null then raise exception 'Scegli il movimento bancario da collegare'; end if;
    return jsonb_build_object('prima_nota_id',pn.id);end$$;`);
  await pg.exec(await readFile("supabase/migrations/20290421200000_pagamenti_misti_prove_bancarie.sql","utf8"));
  await pg.exec(await readFile("supabase/migrations/20290421200000_pagamenti_misti_prove_bancarie.sql","utf8"));
  await pg.exec(await readFile("supabase/migrations/20290421201000_prima_nota_cassa_banche_distinte.sql","utf8"));
  await pg.exec(await readFile("supabase/migrations/20290421201000_prima_nota_cassa_banche_distinte.sql","utf8"));
  await pg.exec(`create function dettaglio_pagamento_costo(p_costo uuid) returns jsonb language sql as $$
    select jsonb_build_object('movimenti',jsonb_agg(jsonb_build_object('id',p.id,'metodo',p.payment_method))) from prima_nota_entries p where p.cost_id=p_costo$$;`);
  await pg.exec(await readFile("supabase/migrations/20290421202000_pagamenti_identita_conto_dettaglio.sql","utf8"));
  await pg.exec(await readFile("supabase/migrations/20290421202000_pagamenti_identita_conto_dettaglio.sql","utf8"));
  await pg.exec(await readFile("supabase/migrations/20290421194000_prima_nota_incassi_importati_da_confrontare.sql","utf8"));
  await pg.exec(`create trigger bank_proof_payment_removed before delete or update of amount,direction,bank_transaction_id on prima_nota_entries for each row execute function private.bank_proof_payment_lifecycle();`);
},30000);
beforeEach(async()=>{
  await pg.exec(`reset role;truncate prima_nota_entries,invoice_payments,invoices,documenti_fiscali,fatture_ricevute,bank_transactions,bank_reconciliations cascade;
    select set_config('test.company','${company}',false),set_config('test.user','${user}',false),set_config('test.readonly','false',false);
    insert into invoices(id,company_id,invoice_number,client_company_name,total,paid_amount,status) values('${invoice}','${company}','1/217','Cliente prova',11000,0,'issued');
    insert into bank_transactions(id,company_id,amount,booking_date,description) values('${tx}','${company}',11000,'2026-11-17','Bonifico fattura 1/217');`);
});
afterAll(()=>pg.close());
const count=async()=>Number((await pg.query<{n:number}>("select count(*)::int n from prima_nota_entries")).rows[0].n);
const pay=async(reference:string|null=null,amount=11000)=>pg.query<Record<string, unknown>>("insert into invoice_payments(id,company_id,invoice_id,amount,payment_date,payment_method,reference,created_by) values($1,$2,$3,$4,'2026-11-17','bonifico',$5,$6)",[payment,company,invoice,amount,reference,user]);
const reconcile=async()=>{
  await pg.query<Record<string, unknown>>("insert into bank_reconciliations(id,company_id,transaction_id,invoice_id,matched_amount) values($1,$2,$3,$4,11000)",[rec,company,tx,invoice]);
  await pg.exec(`update bank_transactions set reconciliation_status='reconciled' where id='${tx}'`);
};
describe("Prima nota e fonti finanziarie",()=>{
  it("una riconciliazione crea il movimento mancante senza aggiungere pagamenti della fattura",async()=>{
    await reconcile();expect(await count()).toBe(1);
    expect((await pg.query<Record<string, unknown>>("select amount::float amount,bank_transaction_id from prima_nota_entries")).rows).toEqual([{amount:11000,bank_transaction_id:tx}]);
    expect((await pg.query<Record<string, unknown>>("select count(*)::int n from invoice_payments")).rows[0].n).toBe(0);
    expect((await pg.query<Record<string, unknown>>("select paid_amount from invoices")).rows[0].paid_amount).toBe("0");
    await pg.exec(`update bank_transactions set reconciliation_status='reconciled' where id='${tx}'`);expect(await count()).toBe(1);
  });
  it("il pagamento bancario e il successivo riallineamento non duplicano l'incasso",async()=>{
    await reconcile();await pay(`recon:${rec}`);
    await rpc("public.prima_nota_allinea_fonti",[company,false,"both"]);expect(await count()).toBe(1);
    expect(Number((await pg.query<Record<string, unknown>>("select sum(amount) totale from prima_nota_entries")).rows[0].totale)).toBe(11000);
  });
  it("un incasso già registrato manualmente viene collegato, conservando identità e importo",async()=>{
    await pg.query<Record<string, unknown>>("insert into prima_nota_entries(id,company_id,direction,amount,entry_date,invoice_id) values($1,$2,'entrata',11000,'2026-11-17',$3)",[pn,company,invoice]);
    await reconcile();expect(await count()).toBe(1);
    expect((await pg.query<Record<string, unknown>>("select id,bank_transaction_id from prima_nota_entries")).rows).toEqual([{id:pn,bank_transaction_id:tx}]);
  });
  it("un caso ambiguo resta da verificare e non aggiunge denaro alla prima nota",async()=>{
    await pg.query<Record<string, unknown>>("insert into prima_nota_entries(company_id,direction,amount,entry_date,invoice_id) values($1,'entrata',5000,'2026-11-17',$2)",[company,invoice]);
    await reconcile();expect(await count()).toBe(1);
    const p=await rpc<{da_verificare:unknown[]}>("public.prima_nota_allinea_fonti",[company,true,"both"]);expect(p.da_verificare).toHaveLength(1);
  });
  it("collegare una prova approvata alla propria banca mantiene valida la riconciliazione",async()=>{
    await pg.query("insert into prima_nota_entries(id,company_id,direction,amount,entry_date,invoice_id) values($1,$2,'entrata',11000,'2026-11-17',$3)",[pn,company,invoice]);
    await pg.query("insert into bank_reconciliations(id,company_id,transaction_id,prima_nota_id,matched_amount) values($1,$2,$3,$4,11000)",[rec,company,tx,pn]);
    await pg.exec("update bank_transactions set reconciliation_status='reconciled'");
    expect((await pg.query<{bank_transaction_id:string}>("select bank_transaction_id from prima_nota_entries")).rows[0].bank_transaction_id).toBe(tx);
    expect((await pg.query<{unmatched_at:null}>("select unmatched_at from bank_reconciliations")).rows[0].unmatched_at).toBeNull();
    await pg.exec("update prima_nota_entries set amount=10000");
    expect((await pg.query<{unmatched_at:unknown}>("select unmatched_at from bank_reconciliations")).rows[0].unmatched_at).not.toBeNull();
  });
  it("un incasso non bancario alimenta la prima nota e segue modifica e cancellazione del pagamento",async()=>{
    await pay(null,2000);expect(await count()).toBe(1);
    const prima=(await pg.query<Record<string, unknown>>("select id from prima_nota_entries")).rows[0].id;
    await pg.query<Record<string, unknown>>("update invoice_payments set amount=1800 where id=$1",[payment]);
    expect((await pg.query<Record<string, unknown>>("select id,amount from prima_nota_entries")).rows).toEqual([{id:prima,amount:"1800"}]);
    await pg.query<Record<string, unknown>>("delete from invoice_payments where id=$1",[payment]);expect(await count()).toBe(0);
  });
  it("la registrazione dalla prima nota non viene ricopiata dal trigger del registro pagamenti",async()=>{
    await pg.query<Record<string, unknown>>("insert into prima_nota_entries(id,company_id,direction,amount,entry_date,invoice_id) values($1,$2,'entrata',11000,'2026-11-17',$3)",[pn,company,invoice]);
    await pay(`prima_nota:${pn}`);expect(await count()).toBe(1);
  });
  it("rappresenta il rimborso della nota di credito come uscita",async()=>{
    await pg.exec(`update invoices set document_type='credit_note'`);await pay();
    expect((await pg.query<Record<string, unknown>>("select direction,amount from prima_nota_entries")).rows).toEqual([{direction:"uscita",amount:"11000"}]);
  });
  it("non ricopia gli incassi nativi già gestiti dal loro movimento di cassa",async()=>{
    await pg.query<Record<string, unknown>>("insert into documenti_fiscali values($1,$2)",[invoice,company]);await pay();expect(await count()).toBe(0);
  });
  it("l'anteprima non scrive e il controllo si applica anche senza una banca collegata",async()=>{
    // Simula un pagamento storico precedente all'installazione del ponte.
    await pg.exec("alter table invoice_payments disable trigger z_prima_nota_ponte_pagamento");await pay(null,2000);
    await pg.exec("alter table invoice_payments enable trigger z_prima_nota_ponte_pagamento");
    const p=await rpc<{total:number}>("public.prima_nota_allinea_fonti",[company,true,"both"]);expect(p.total).toBe(1);expect(await count()).toBe(0);
    await rpc("public.prima_nota_allinea_fonti",[company,false,"both"]);await rpc("public.prima_nota_allinea_fonti",[company,false,"both"]);expect(await count()).toBe(1);
  });
  it("annullare la riconciliazione rimuove solo la copia bancaria generata dal ponte",async()=>{
    await reconcile();await pg.exec(`update bank_reconciliations set unmatched_at=now();update bank_transactions set reconciliation_status='pending'`);expect(await count()).toBe(0);
  });
  it("rifiuta utenti in sola lettura e accessi ad altre aziende",async()=>{
    await pg.exec("select set_config('test.readonly','true',false)");await expect(rpc("public.prima_nota_allinea_fonti",[company,false,"both"])).rejects.toThrow(/permesso/);
    await pg.exec("select set_config('test.readonly','false',false)");await expect(rpc("public.prima_nota_allinea_fonti",[other,false,"both"])).rejects.toThrow(/permesso/);
  });
  it("una riconciliazione mista completa solo la quota mancante senza ricopiare l'incasso nativo",async()=>{
    await pg.query<Record<string, unknown>>("insert into bank_reconciliations(id,company_id,transaction_id,invoice_id,matched_amount) values($1,$2,$3,$4,7000),($5,$2,$3,$6,4000)",[rec,company,tx,invoice,id(31),id(11)]);
    await pg.query<Record<string, unknown>>("insert into prima_nota_entries(id,company_id,direction,amount,entry_date,invoice_id,bank_transaction_id) values($1,$2,'entrata',4000,'2026-11-17',$3,$4)",[pn,company,id(11),tx]);
    await pg.exec("update bank_transactions set reconciliation_status='reconciled'");
    expect(await count()).toBe(2);
    expect(Number((await pg.query<Record<string, unknown>>("select sum(amount) totale from prima_nota_entries")).rows[0].totale)).toBe(11000);
    await pg.exec("update bank_transactions set reconciliation_status='reconciled'");expect(await count()).toBe(2);
  });
  it("l'anteprima conta una sola volta il bonifico raggiunto sia dalla banca sia dal pagamento",async()=>{
    await pg.exec("alter table bank_transactions disable trigger z_prima_nota_ponte_banca;alter table invoice_payments disable trigger z_prima_nota_ponte_pagamento");
    await reconcile();await pay(`recon:${rec}`);
    await pg.exec("alter table bank_transactions enable trigger z_prima_nota_ponte_banca;alter table invoice_payments enable trigger z_prima_nota_ponte_pagamento");
    const p=await rpc<{total:number}>("public.prima_nota_allinea_fonti",[company,true,"both"]);expect(p.total).toBe(1);expect(await count()).toBe(0);
  });
  it("non collega un pagamento di un'altra azienda a una registrazione manuale",async()=>{
    await pay(null,2000);
    await expect(pg.query<Record<string, unknown>>("insert into prima_nota_entries(company_id,invoice_id,invoice_payment_id,direction,amount,entry_date) values($1,$2,$3,'entrata',2000,'2026-11-17')",[other,invoice,payment])).rejects.toThrow(/non corrisponde/);
  });
  it("un saldo importato senza rate usa il pagato effettivo e non il totale della fattura",async()=>{
    await pg.query<Record<string, unknown>>("update invoices set external_provider='fattureincloud',paid_amount=500,payment_date='2026-11-16' where id=$1",[invoice]);
    const p=await rpc<{total:number}>("public.prima_nota_allinea_fonti",[company,true,"both"]);expect(p.total).toBe(1);expect(await count()).toBe(0);
    await rpc("public.prima_nota_allinea_fonti",[company,false,"both"]);
    expect(Number((await pg.query<Record<string, unknown>>("select amount from prima_nota_entries")).rows[0].amount)).toBe(500);
    await rpc("public.prima_nota_allinea_fonti",[company,false,"both"]);expect(await count()).toBe(1);
  });
  it("un saldo importato senza data effettiva resta da verificare",async()=>{
    await pg.query<Record<string, unknown>>("update invoices set external_provider='fattureincloud',paid_amount=500 where id=$1",[invoice]);
    const p=await rpc<{da_verificare:unknown[]}>("public.prima_nota_allinea_fonti",[company,false,"both"]);expect(p.da_verificare).toHaveLength(1);expect(await count()).toBe(0);
  });
  it("un saldo storico non viene ricopiato quando potrebbe essere già nella prima nota manuale",async()=>{
    await pg.query("update invoices set external_provider='fattureincloud',paid_amount=500,payment_date='2026-11-16' where id=$1",[invoice]);
    await pg.query("insert into prima_nota_entries(company_id,direction,amount,entry_date) values($1,'entrata',500,'2026-11-16')",[company]);
    const esito=await rpc<{total:number;da_verificare:unknown[]}>("public.prima_nota_allinea_fonti",[company,false,"both"]);
    expect(esito.total).toBe(0);expect(esito.da_verificare).toHaveLength(1);expect(await count()).toBe(1);
  });
  it("un pagamento del registro non ricopia un movimento manuale senza il collegamento alla fattura",async()=>{
    await pg.query("insert into prima_nota_entries(company_id,direction,amount,entry_date) values($1,'entrata',500,'2026-11-17')",[company]);
    await pay(null,500);
    expect(await count()).toBe(1);
    const esito=await rpc<{da_verificare:unknown[]}>("public.prima_nota_allinea_fonti",[company,false,"both"]);
    expect(esito.da_verificare).toHaveLength(1);
  });
  it("un movimento manuale già riferito alla fattura diventa il movimento del pagamento, mantenendo id e importo",async()=>{
    await pg.query("insert into prima_nota_entries(id,company_id,invoice_id,direction,amount,entry_date) values($1,$2,$3,'entrata',500,'2026-11-17')",[pn,company,invoice]);
    await pay(null,500);expect(await count()).toBe(1);
    expect((await pg.query<{id:string;invoice_payment_id:string}>("select id,invoice_payment_id from prima_nota_entries")).rows[0]).toEqual({id:pn,invoice_payment_id:payment});
    await pg.exec("update invoice_payments set amount=450");
    expect((await pg.query<{id:string;amount:string}>("select id,amount from prima_nota_entries")).rows[0]).toEqual({id:pn,amount:"450"});
  });
  it("due quote di fattura con riferimento allo stesso incasso non duplicano la cassa e il totale non si modifica come singola fattura",async()=>{
    await pg.query("insert into invoices(id,company_id,total) values($1,$2,400)",[id(11),company]);
    await pg.query("insert into prima_nota_entries(id,company_id,direction,amount,entry_date) values($1,$2,'entrata',1000,'2026-11-17')",[pn,company]);
    await pay(`prima_nota:${pn}`,600);
    await pg.query("insert into invoice_payments(id,company_id,invoice_id,amount,payment_date,reference) values($1,$2,$3,400,'2026-11-17',$4)",[id(41),company,id(11),`prima_nota:${pn}`]);
    expect(await count()).toBe(1);
    const esito=await rpc<{total:number;da_verificare:unknown[]}>("public.prima_nota_allinea_fonti",[company,false,"both"]);
    expect(esito.total).toBe(0);expect(esito.da_verificare).toHaveLength(0);
    await expect(rpc("public.prima_nota_modifica",[pn,JSON.stringify({direction:"entrata",description:"Incasso",amount:1000,entry_date:"2026-11-17"})])).rejects.toMatchObject({code:"PT409"});
  });
  it("la stessa controparte e lo stesso importo con una data differente richiedono verifica",async()=>{
    await pg.exec("update invoices set client_company_name='VISMARA CLAUDIO'");
    await pg.query("insert into prima_nota_entries(company_id,direction,amount,entry_date,description) values($1,'entrata',500,'2026-11-27','CLAUDIO VISMARA')",[company]);
    await pay(null,500);expect(await count()).toBe(1);
    const esito=await rpc<{da_verificare:unknown[]}>("public.prima_nota_allinea_fonti",[company,false,"both"]);
    expect(esito.da_verificare).toHaveLength(1);
  });
  it("un pagamento automatico di costo senza collegamento al documento bancario non viene ricopiato",async()=>{
    await pg.query("insert into prima_nota_entries(company_id,direction,amount,entry_date,is_auto,auto_source,cost_id,account_label) values($1,'entrata',11000,'2026-11-17',true,'company_cost_payment',$2,'banca')",[company,id(61)]);
    await reconcile();expect(await count()).toBe(1);
    const esito=await rpc<{da_verificare:unknown[]}>("public.prima_nota_allinea_fonti",[company,true,"both"]);
    expect(esito.da_verificare).toHaveLength(1);
  });
  it("un pagamento senza riferimento bancario non aggiunge una seconda entrata a una fattura già riconciliata",async()=>{
    await reconcile();await pay(null,11000);expect(await count()).toBe(1);
    const esito=await rpc<{da_verificare:unknown[]}>("public.prima_nota_allinea_fonti",[company,true,"both"]);
    expect(esito.da_verificare).toHaveLength(1);
  });
  it("una quota automatica già in cassa impedisce di ricopiare l'intero bonifico cumulativo",async()=>{
    await pg.query("insert into prima_nota_entries(company_id,direction,amount,entry_date,is_auto,auto_source,account_label) values($1,'entrata',7000,'2026-11-17',true,'company_cost_payment','banca')",[company]);
    await pg.query("insert into bank_reconciliations(id,company_id,transaction_id,invoice_id,matched_amount) values($1,$2,$3,$4,7000),($5,$2,$3,$6,4000)",[rec,company,tx,invoice,id(31),id(11)]);
    await pg.exec("update bank_transactions set reconciliation_status='reconciled'");
    expect(await count()).toBe(1);
    const esito=await rpc<{da_verificare:unknown[]}>("public.prima_nota_allinea_fonti",[company,true,"from_banking"]);
    expect(esito.da_verificare).toHaveLength(1);
  });
  it("un incasso storico importato richiede confronto anche se collegato a un'altra fattura della stessa controparte",async()=>{
    await pg.query("insert into prima_nota_entries(company_id,invoice_id,direction,amount,entry_date,description,reconciliation_method) values($1,$2,'entrata',500,'2026-11-27','Cliente prova','imported')",[company,id(11)]);
    await pay(null,500);expect(await count()).toBe(1);
    const esito=await rpc<{da_verificare:unknown[]}>("public.prima_nota_allinea_fonti",[company,false,"from_invoices"]);
    expect(esito.da_verificare).toHaveLength(1);
  });
  const costo=id(70),ricevuta=id(71),banca1=id(72),banca2=id(73);
  const quota=async(n:number,amount:number,bank:string|null,metodo='bonifico')=>pg.query("insert into prima_nota_entries(id,company_id,cost_id,direction,amount,entry_date,bank_account_id,payment_method,account_label) values($1,$2,$3,'uscita',$4,'2026-11-17',$5,$6,$7)",[id(n),company,costo,amount,bank,metodo,metodo==='contanti'?'cassa':'banca']);
  const riconciliaCosto=async(importo:number)=>{
    await pg.query("update bank_transactions set amount=$1,account_id=$2 where id=$3",[-importo,banca1,tx]);
    await pg.query("insert into fatture_ricevute(id,company_id,company_cost_id) values($1,$2,$3)",[ricevuta,company,costo]);
    await pg.query("insert into bank_reconciliations(id,company_id,transaction_id,fattura_ricevuta_id,matched_amount) values($1,$2,$3,$4,$5)",[rec,company,tx,ricevuta,importo]);
    await pg.exec("update bank_transactions set reconciliation_status='reconciled'");
  };
  it("una fattura metà contanti e metà bonifico collega soltanto la quota bancaria, anche se uguale",async()=>{
    await quota(80,100,null,'contanti');await quota(81,100,banca1);await riconciliaCosto(100);
    expect(await count()).toBe(2);
    expect((await pg.query<{id:string;bank_transaction_id:string|null}>("select id,bank_transaction_id from prima_nota_entries order by id")).rows).toEqual([{id:id(80),bank_transaction_id:null},{id:id(81),bank_transaction_id:tx}]);
  });
  it("sceglie il conto corretto fra due bonifici uguali da banche diverse",async()=>{
    await quota(80,100,banca1);await quota(81,100,banca2);await riconciliaCosto(100);
    expect(await count()).toBe(2);
    expect((await pg.query<{id:string}>("select id from prima_nota_entries where bank_transaction_id=$1",[tx])).rows).toEqual([{id:id(80)}]);
  });
  it("una banca con Cassa nel nome resta una banca quando il conto è identificato",async()=>{
    await quota(80,100,banca1);await pg.query("update prima_nota_entries set account_label='Cassa di Risparmio' where id=$1",[id(80)]);await riconciliaCosto(100);
    expect((await pg.query<{id:string}>("select id from prima_nota_entries where bank_transaction_id=$1",[tx])).rows).toEqual([{id:id(80)}]);
    await expect(rpc("public.registra_pagamento_costo",[costo,id(90),100,'2026-11-17','bonifico',null,tx,id(80)])).resolves.toMatchObject({prima_nota_id:id(80)});
    expect((await rpc<{movimenti:{bank_account_id:string}[]}>('public.dettaglio_pagamento_costo',[costo])).movimenti[0].bank_account_id).toBe(banca1);
  });
  it("gli altri acconti della stessa fattura non impediscono l’identificazione della quota esatta",async()=>{
    await quota(80,100,banca1);await quota(81,40,banca1);await quota(82,60,banca1);await riconciliaCosto(40);
    expect(await count()).toBe(3);
    expect((await pg.query<{id:string}>("select id from prima_nota_entries where bank_transaction_id=$1",[tx])).rows).toEqual([{id:id(81)}]);
  });
  it("due quote uguali sulla stessa banca restano da verificare senza duplicare o scegliere a caso",async()=>{
    await quota(80,100,banca1);await quota(81,100,banca1);await riconciliaCosto(100);
    expect(await count()).toBe(2);
    expect((await rpc<{esito:string}>("private.prima_nota_allinea_banca",[tx,false])).esito).toBe('da_verificare');
  });
  it("un pagamento già in contanti non diventa una prova bancaria e non genera una nuova uscita",async()=>{
    await quota(80,100,null,'contanti');await riconciliaCosto(100);expect(await count()).toBe(1);
    expect((await rpc<{esito:string}>("private.prima_nota_allinea_banca",[tx,false])).esito).toBe('da_verificare');
    await expect(rpc("public.registra_pagamento_costo",[costo,id(90),100,'2026-11-17','contanti',null,tx,id(80)])).rejects.toMatchObject({code:'23514'});
  });
});
