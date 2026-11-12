import { afterAll, beforeAll, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
const db = new PGlite();
const company='00000000-0000-0000-0000-000000000001', order='00000000-0000-0000-0000-000000000010', unit='00000000-0000-0000-0000-000000000020';
const misura='00000000-0000-0000-0000-000000000011', version='00000000-0000-0000-0000-000000000030';
const sql=readFileSync('supabase/proposals/20261111162503_commesse_incassi_crediti_budget.sql','utf8');
function fn(name:string, source=sql) {
  const start=source.search(new RegExp('create or replace function public\\.'+name+'\\(', 'i'));
  if(start<0) throw new Error(name);
  const rest=source.slice(start), tag=rest.match(/AS (\$function\$|\$\$)/i)?.[1];
  if(!tag) throw new Error('body '+name);
  const body=rest.indexOf(tag),end=rest.indexOf(tag,body+tag.length)+tag.length;
  return rest.slice(0,end)+';';
}
beforeAll(async()=>{
  await db.exec(`create role anon; create role authenticated; create schema auth;
    create function auth.uid() returns uuid language sql as $$ select '${company}'::uuid $$;`);
  const cols=JSON.parse(readFileSync('src/test/fixtures/priorityDatabaseSchema.json','utf8')) as {table_name:string;column_name:string;data_type:string;udt_name:string}[];
  for(const table of new Set(cols.map(c=>c.table_name))) {
    const fields=cols.filter(c=>c.table_name===table).map(c=>`"${c.column_name}" ${c.data_type==='USER-DEFINED'?'text':c.data_type==='ARRAY'?(c.udt_name==='_uuid'?'uuid[]':'text[]'):c.data_type}${c.column_name==='id'?' primary key default gen_random_uuid()':''}`);
    await db.exec(`create table public.${table}(${fields.join(',')});`);
  }
  await db.exec(`create unique index pn_reverse on prima_nota_entries(reversal_of) where reversal_of is not null;
    alter table prima_nota_entries add constraint cash_fk foreign key(movimento_id) references movimenti_cassa_native(id) on delete cascade;
    create function public.get_order_company_id(uuid) returns uuid language sql as $$ select company_id from public.orders where id=$1 $$;
    create function public.utente_bloccato() returns boolean language sql as $$ select false $$;
    create function public.user_can_access_company(uuid) returns boolean language sql as $$ select $1='${company}'::uuid $$;
    create function public.azienda_ancora_esiste(uuid) returns boolean language sql as $$ select true $$;
    create function public.has_permission_for_company(uuid,text,uuid) returns boolean language sql as $$ select $3='${company}'::uuid $$;
    create function public.puo_incassare_fatture(uuid) returns boolean language sql as $$ select $1='${company}'::uuid $$;
    create function public.puo_modificare_commessa(uuid) returns boolean language sql as $$ select public.get_order_company_id($1)='${company}'::uuid $$;
    create function public.generale_unita_assicura(uuid) returns public.unita_immobiliari language sql as $$ select u from public.unita_immobiliari u where order_id=$1 $$;
    create function public.documento_stornato_totale(uuid) returns numeric language sql as $$ select coalesce(sum(totale_da_pagare),0) from public.documenti_fiscali where documento_correlato_id=$1 and tipo='nota_credito' and stato='emessa' $$;
    create function public.nc_collegate_importo(uuid) returns numeric language sql as $$ select coalesce(sum(total),0) from public.invoices where credited_invoice_id=$1 and document_type='credit_note' and status<>'cancelled' $$;
    create function public.scadenze_documento_incassa(uuid,uuid,numeric,date,uuid) returns void language sql as $$ select $$;
    create function public.stato_documento_da_sdi(text,text) returns text language sql as $$ select 'emessa'::text $$;
    create function public.storna_incasso_atomico(uuid,uuid) returns void language sql as $$ delete from public.movimenti_cassa_native where company_id=$1 and id=$2 $$;
    insert into orders(id,company_id,total_amount,vat_rate,order_type,valorizzazione) values
      ('${order}','${company}',1000,10,'cliente',null),('${misura}','${company}',1000,22,'appaltatore_lavoro','a_misura');
    insert into unita_immobiliari(id,order_id,company_id,sigla,stato_vendita,prezzo_listino) values ('${unit}','${order}','${company}','A1','prenotata',1000);
    insert into orders(id,company_id,total_amount,vat_rate,order_type) values('00000000-0000-0000-0000-000000000012','${company}',100,10,'cliente');
    insert into unita_immobiliari(id,order_id,company_id,sigla,stato_vendita,prezzo_listino) values('00000000-0000-0000-0000-000000000022','00000000-0000-0000-0000-000000000012','${company}','Storica','prenotata',100);
    insert into unita_movimenti(id,unita_id,company_id,tipo,importo,data) values('00000000-0000-0000-0000-000000000088','00000000-0000-0000-0000-000000000022','${company}','acconto',80,current_date);
    insert into commesse_generali(order_id,company_id) values('${order}','${company}');
    insert into generale_piano_versioni(id,company_id,generale_id,stato,numero) values('${version}','${company}','${order}','bozza',1);`);
  // Execute the exact DDL and routines that will be applied remotely.
  await db.exec(sql.slice(0,sql.indexOf('CREATE OR REPLACE FUNCTION public.generale_unita_elenco')));
  for(const name of ['commessa_documenti_credito','commesse_importi_finanziari','commessa_crediti_misura','rate_importi','rate_incassi','rate_da_incassare','generale_budget_voce_blocco','generale_budget_completo_guardia','generale_piano_nuova_versione']) await db.exec(fn(name));
  const native=readFileSync('supabase/migrations/20281031110000_generale_piano_economico.sql','utf8');
  await db.exec(fn('generale_piano_approva',native));
  await db.exec(`create trigger a_generale_budget_voce_blocco before insert or update or delete on generale_piano_voci for each row execute function generale_budget_voce_blocco();
    create trigger generale_budget_completo_guardia before update of stato on generale_piano_versioni for each row execute function generale_budget_completo_guardia();`);
  const cash=readFileSync('supabase/migrations/20280924235959_fatture_sdi_esiti_e_scarti.sql','utf8');
  await db.exec(fn('update_fattura_stato_on_movimento',cash));
  await db.exec('create trigger cash_status after insert or update or delete on movimenti_cassa_native for each row execute function update_fattura_stato_on_movimento();');
  await db.exec(readFileSync('supabase/proposals/20261111165729_commesse_cassa_unita_coerenza.sql','utf8'));
  const quadroUnita=readFileSync('supabase/proposals/20261111171123_commesse_quadro_cassa_unita.sql','utf8');
  await db.exec(fn('rate_da_incassare',quadroUnita));
  await db.exec(fn('commessa_incassi_unita',quadroUnita));
});
afterAll(()=>db.close());
const reg=(req:string,net=100,cash=110,type='acconto')=>db.query<{id:string}>('select generale_unita_incasso_registra($1,$2,$3,$4,$5,current_date,null) id',[order,req,type,net,cash]);
let movement:string;
it('registra una sola entrata e rende idempotente il tentativo ripetuto',async()=>{
  const req='00000000-0000-0000-0000-000000000100';
  movement=(await reg(req)).rows[0].id;
  expect((await reg(req)).rows[0].id).toBe(movement);
  expect((await db.query('select amount,unita_movimento_id from prima_nota_entries')).rows).toEqual([{amount:'110.00',unita_movimento_id:movement}]);
  await expect(reg(req,101,111.1)).rejects.toThrow('dati diversi');
  expect((await db.query('select sum(importo) collected from rate_incassi($1) where order_id=$2',[company,order])).rows[0]).toEqual({collected:'110.00'});
});
it('rifiuta superamento del prezzo, date future, contante mancante e altre aziende',async()=>{
  await expect(reg(crypto.randomUUID(),1001,1101.1)).rejects.toThrow('residuo');
  await expect(db.query('select generale_unita_incasso_registra($1,$2,$3,10,11,current_date+1,null)',[order,crypto.randomUUID(),'acconto'])).rejects.toThrow('non futura');
  await expect(reg(crypto.randomUUID(),10,null as unknown as number)).rejects.toThrow('effettivo');
  await db.query('update orders set company_id=$1 where id=$2',['00000000-0000-0000-0000-000000000099',order]);
  await expect(reg(crypto.randomUUID())).rejects.toThrow('permesso');
  await db.query('update orders set company_id=$1 where id=$2',[company,order]);
});
it('la permuta copre il prezzo senza produrre cassa',async()=>{
  await reg(crypto.randomUUID(),50,0,'permuta');
  expect((await db.query('select count(*)::int n from prima_nota_entries')).rows[0]).toEqual({n:1});
  expect((await db.query<{c:unknown}>('select commessa_incassi_unita($1) c',[order])).rows[0].c).toMatchObject({incassato:110,residuo:935});
});
it('una fattura emessa riusa la prima nota e non crea una seconda entrata, anche nel callback ricorsivo',async()=>{
  const doc=crypto.randomUUID();
  await db.query("insert into documenti_fiscali(id,company_id,ordine_id,tipo,stato,numero,totale_da_pagare,importo_pagato) values($1,$2,$3,'fattura','bozza','Demo',110,0)",[doc,company,order]);
  await db.query('insert into generale_fatture(company_id,generale_id,documento_id,movimento_id) values($1,$2,$3,$4)',[company,order,doc,movement]);
  expect((await db.query('select count(*)::int n from prima_nota_entries')).rows[0]).toEqual({n:1});
  await db.query("update documenti_fiscali set stato='in_invio' where id=$1",[doc]);
  await db.query("update documenti_fiscali set stato='emessa' where id=$1",[doc]);
  expect((await db.query('select count(*)::int n from prima_nota_entries')).rows[0]).toEqual({n:1});
  expect((await db.query('select count(*)::int n from movimenti_cassa_native')).rows[0]).toEqual({n:1});
  expect((await db.query('select importo_pagato,stato from public.documenti_fiscali where id=$1',[doc])).rows[0]).toEqual({importo_pagato:'110.00',stato:'pagata'});
});
it('lo storno conserva originale e contropartita, annulla il pagamento fiscale ed è idempotente',async()=>{
  await db.query('select generale_unita_movimento_elimina($1)',[movement]);
  await db.query('select generale_unita_movimento_elimina($1)',[movement]);
  expect((await db.query('select count(*)::int n,sum(case when direction=\'entrata\' then amount else -amount end) saldo from prima_nota_entries')).rows[0]).toEqual({n:2,saldo:'0.00'});
  expect((await db.query('select count(*)::int n from movimenti_cassa_native')).rows[0]).toEqual({n:0});
  await expect(db.query('delete from prima_nota_entries where unita_movimento_id=$1',[movement])).rejects.toThrow('Storna');
  await expect(db.query('update unita_movimenti set stornato_at=null where id=$1',[movement])).rejects.toThrow('definitivo');
  expect((await db.query('select count(*)::int n from rate_incassi($1) where order_id=$2',[company,order])).rows[0]).toEqual({n:0});
});
it('lo storno dalla prima nota aggiorna anche l’unità e protegge entrambe le registrazioni',async()=>{
  const m=(await reg(crypto.randomUUID(),10,11)).rows[0].id;
  const pn=(await db.query<{id:string}>('select id from prima_nota_entries where unita_movimento_id=$1',[m])).rows[0].id;
  await expect(db.query("insert into prima_nota_entries(company_id,order_id,direction,amount,entry_date,reversal_of) values($1,$2,'uscita',12,current_date,$3)",[company,order,pn])).rejects.toThrow('corrispondere');
  const rev=(await db.query<{id:string}>("insert into prima_nota_entries(company_id,order_id,direction,amount,entry_date,reversal_of) values($1,$2,'uscita',11,current_date,$3) returning id",[company,order,pn])).rows[0].id;
  expect((await db.query<{yes:boolean}>('select stornato_at is not null yes from unita_movimenti where id=$1',[m])).rows[0].yes).toBe(true);
  await expect(db.query('delete from prima_nota_entries where id=$1',[rev])).rejects.toThrow('conservano');
  await expect(db.query('update prima_nota_entries set amount=5 where id=$1',[rev])).rejects.toThrow('protetta');
});
it('una stima a misura senza fatture non è un credito né una rata prevista',async()=>{
  expect((await db.query<{c:unknown}>('select commessa_crediti_misura($1) c',[misura])).rows[0].c).toMatchObject({fatturato:0,incassato:0,residuo:0,documenti:[]});
  expect((await db.query('select * from rate_da_incassare($1) where order_id=$2',[company,misura])).rows).toEqual([]);
});
it('il collegamento storico richiede importo e prima nota espliciti e li riusa una sola volta',async()=>{
  const old='00000000-0000-0000-0000-000000000088',oid='00000000-0000-0000-0000-000000000012';
  const pn=(await db.query<{id:string}>("insert into prima_nota_entries(company_id,order_id,direction,amount,entry_date) values($1,$2,'entrata',88,current_date) returning id",[company,oid])).rows[0].id;
  await expect(db.query('select generale_unita_incasso_contabilizza($1,89,$2)',[old,pn])).rejects.toThrow('non corrisponde');
  await db.query('select generale_unita_incasso_contabilizza($1,88,$2)',[old,pn]);
  await db.query('select generale_unita_incasso_contabilizza($1,88,$2)',[old,pn]);
  expect((await db.query('select count(*)::int n,sum(amount) amount from prima_nota_entries where order_id=$1',[oid])).rows[0]).toEqual({n:1,amount:'88'});
});
it('i crediti a misura seguono fatture, pagamenti parziali e note di credito',async()=>{
  const doc=crypto.randomUUID();
  await db.query("insert into invoices(id,company_id,order_id,document_type,status,invoice_number,total,paid_amount,due_date) values($1,$2,$3,'invoice','issued','DEMO/1',610,100,current_date-1)",[doc,company,misura]);
  await db.query("insert into invoices(company_id,credited_invoice_id,document_type,status,total) values($1,$2,'credit_note','issued',61)",[company,doc]);
  expect((await db.query<{c:unknown}>('select commessa_crediti_misura($1) c',[misura])).rows[0].c).toMatchObject({fatturato:549,incassato:100,residuo:449,scaduto:449});
  expect((await db.query('select residuo from rate_da_incassare($1) where order_id=$2',[company,misura])).rows[0]).toEqual({residuo:'449'});
});
it('una fattura nativa parzialmente incassata usa il residuo reale, senza tornare alla stima',async()=>{
  await db.query("insert into documenti_fiscali(company_id,ordine_id,tipo,stato,numero,totale_da_pagare,importo_pagato,data_scadenza) values($1,$2,'fattura','parzialmente_pagata','Nativa Demo',244,44,current_date)",[company,misura]);
  const c=(await db.query<{c:{fatturato:number;incassato:number;residuo:number}}> ('select commessa_crediti_misura($1) c',[misura])).rows[0].c;
  expect(c).toMatchObject({fatturato:793,incassato:144,residuo:649});
  expect((await db.query('select sum(residuo) due from rate_da_incassare($1) where order_id=$2',[company,misura])).rows[0]).toEqual({due:'649.00'});
});
it('il server blocca approvazioni incomplete anche via update diretto',async()=>{
  await db.query("insert into generale_piano_voci(company_id,generale_id,versione_id,descrizione,importo,nota) values($1,$2,$3,'Lavori',0,'[EIC:DA_STIMARE]')",[company,order,version]);
  await expect(db.query('select generale_piano_approva($1,null)',[version])).rejects.toThrow('Budget incompleto');
  await expect(db.query("update generale_piano_versioni set stato='approvata' where id=$1",[version])).rejects.toThrow('Budget incompleto');
  await db.query('update generale_piano_voci set importo=100,nota=null');
  await expect(db.query('select generale_piano_approva($1,null)',[version])).rejects.toThrow('Budget incompleto');
  await db.query('update generale_piano_voci set mese=current_date');
  await db.query('select generale_piano_approva($1,null)',[version]);
  await expect(db.query('delete from generale_piano_voci')).rejects.toThrow('bloccata');
});
it('la nuova versione conserva le note e marca le stime non fornite',async()=>{
  await db.query('delete from generale_piano_versioni where id=$1',[version]);
  const voci=JSON.stringify([{tipo:'costo',categoria:'materiali',descrizione:'Da stimare',mese:null,nota:'origine Demo'},{tipo:'ricavo',categoria:'vendite',descrizione:'Vendite',importo:100,mese:'2026-11-01'}]);
  await db.query('select generale_piano_nuova_versione($1,$2)',[order,voci]);
  expect((await db.query<{nota:string}>("select nota from generale_piano_voci where descrizione='Da stimare'")).rows[0].nota).toBe('origine Demo [EIC:DA_STIMARE]');
});
