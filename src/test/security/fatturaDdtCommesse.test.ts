import { PGlite } from "@electric-sql/pglite";
import { existsSync, readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
/* eslint-disable @typescript-eslint/no-explicit-any -- JSON returned by the real SQL functions. */

const file = "20290423109000_fatture_ddt_commesse_multiple.sql";
const sql = readFileSync(existsSync(`supabase/migrations/${file}`) ? `supabase/migrations/${file}` : `work/${file}`, "utf8");
const permessiSql = readFileSync('supabase/migrations/20290423110000_fatture_ddt_permessi_documenti.sql', 'utf8');
const id = (n: number) => `00000000-0000-4000-a000-${String(n).padStart(12, "0")}`;
const azienda=id(1), altra=id(2), fattura=id(3), costo=id(4), fornitore=id(5), commessaA=id(6), commessaB=id(7), commessaC=id(8);
let db: PGlite;
const xml = (ddt: Array<{ n: number; r?: number[] }>, linee = '<DettaglioLinee><NumeroLinea>1</NumeroLinea><Descrizione>Materiali</Descrizione><PrezzoTotale>100</PrezzoTotale></DettaglioLinee>') =>
  `<FatturaElettronica><FatturaElettronicaBody><DatiGenerali>${ddt.map(d=>`<DatiDDT><NumeroDDT>D-${d.n}</NumeroDDT><DataDDT>2026-11-20</DataDDT>${(d.r??[]).map(r=>`<RiferimentoNumeroLinea>${r}</RiferimentoNumeroLinea>`).join('')}</DatiDDT>`).join('')}</DatiGenerali><DatiBeniServizi>${linee}</DatiBeniServizi></FatturaElettronicaBody></FatturaElettronica>`;
const setXml = async (value: string, base=100) => {
  await db.query('update company_costs set amount=$1 where id=$2',[base,costo]);
  return db.query("update fatture_ricevute set xml_raw=$1,imponibile_totale=$2,totale_documento=$2 where id=$3",[value,base,fattura]);
};
async function bolla(n: number, commessa: string | null=commessaA, collega=true, supplier=fornitore) {
  await db.query("insert into ddt_ricezione(id,company_id,numero_ddt,supplier_id,order_id) values($1,$2,$3,$4,$5)",[id(100+n),azienda,`D-${n}`,supplier,commessa]);
  if(collega) await db.query("insert into fattura_ddt(id,company_id,fattura_ricevuta_id,numero_ddt,data_ddt,ddt_ricezione_id) values($1,$2,$3,$4,'2026-11-20',$5)",[id(200+n),azienda,fattura,`D-${n}`,id(100+n)]);
}
const piano = async () => (await db.query<{ p: Record<string, any> }>("select public.fattura_ddt_riepilogo($1) p",[fattura])).rows[0].p;
const leggiCosto = async () => (await db.query<Record<string, any>>("select * from company_costs where id=$1",[costo])).rows[0];
beforeAll(async()=>{
  db=new PGlite();
  await db.exec(`create role anon;create role authenticated;create role service_role;create schema private;create schema auth;
    create function auth.uid() returns uuid language sql as $$select case when coalesce(current_setting('test.noauth',true),'no')='si' then null else '${azienda}'::uuid end$$;
    create function utente_bloccato() returns boolean language sql as $$select false$$;
    create function utente_e_cliente_esterno() returns boolean language sql as $$select false$$;
    create function user_can_access_company(uuid) returns boolean language sql as $$select $1='${azienda}'::uuid$$;
    create function has_permission_for_company(uuid,text,uuid) returns boolean language sql as $$select coalesce(current_setting('test.permesso',true),'si')<>'no'$$;
    create function e_super_admin_dentro(uuid) returns boolean language sql as $$select false$$;
    create function get_my_company_id() returns uuid language sql as $$select '${azienda}'::uuid$$;
    create function puo_vedere_documenti_fornitore() returns boolean language sql as $$select coalesce(current_setting('test.documenti',true),'si')<>'no'$$;
    create function user_can_read_accountant_company(uuid) returns boolean language sql as $$select false$$;
    create function puo_registrare_costi(uuid) returns boolean language sql as $$select auth.uid() is not null and public.user_can_access_company($1) and public.has_permission_for_company(auth.uid(),'can_edit_costs',$1)$$;
    create function azienda_collegamento_automatico(uuid) returns boolean language sql as $$select coalesce(current_setting('test.automatico',true),'si')<>'no'$$;
    create function e_nota_credito_ricevuta(text) returns boolean language sql as $$select $1='TD04'$$;
    create table orders(id uuid primary key,company_id uuid,order_code text,deleted_at timestamptz);
    create table company_costs(id uuid primary key,company_id uuid,amount numeric default 100,order_id uuid,allocations jsonb default '[]',quota_magazzino numeric,quota_magazzino_righe jsonb,purchase_order_id uuid,order_external_team_id uuid,annullato_il timestamptz,updated_at timestamptz);
    create table fatture_ricevute(id uuid primary key,company_id uuid,company_cost_id uuid,purchase_order_id uuid,fornitore_id uuid,xml_raw text,indice_corpo integer default 0,imponibile_totale numeric,totale_documento numeric,stato text default 'contabilizzata',tipo_documento text default 'TD01',aggancio_oda_manuale boolean default false,da_leggere boolean default true);
    create table ddt_ricezione(id uuid primary key,company_id uuid,numero_ddt text,order_id uuid,supplier_id uuid,purchase_order_id uuid,warehouse_id uuid,destinazione text);
    create table fattura_ddt(id uuid primary key,company_id uuid,fattura_ricevuta_id uuid references fatture_ricevute(id) on delete cascade,numero_ddt text,data_ddt date,ddt_ricezione_id uuid references ddt_ricezione(id) on delete set null);
    create table ddt_ordini_acquisto(ddt_id uuid,purchase_order_id uuid,company_id uuid);
    create table purchase_orders(id uuid primary key,company_id uuid,order_id uuid,delivery_warehouse_id uuid);
    create table order_items(id uuid primary key,order_id uuid);
    create table ddt_righe(id uuid,company_id uuid,ddt_ricezione_id uuid,order_item_id uuid);
    create table ddt_consegne(id uuid,company_id uuid,ddt_id uuid,tipo text,order_id uuid,warehouse_id uuid,destinazione text,order_item_id uuid);
    create table goods_receipts(id uuid,company_id uuid,ddt_ricezione_id uuid,order_item_id uuid,warehouse_id uuid);
    create table fattura_ricevuta_ordini(fattura_id uuid);
  `);
  await db.exec(sql);
  await db.exec(sql); // Idempotenza della migrazione completa, inclusi i trigger.
  await db.exec(permessiSql);
},20000);
afterAll(async()=>{await db?.close();});
beforeEach(async()=>{
  await db.exec(`reset role;set test.noauth='no';set test.permesso='si';set test.documenti='si';set test.automatico='si';
    truncate fatture_ricevute,company_costs,ddt_ricezione,orders,ddt_righe,order_items,purchase_orders,ddt_ordini_acquisto,ddt_consegne,goods_receipts,fattura_ricevuta_ordini cascade;
    insert into orders values('${commessaA}','${azienda}','C-A',null),('${commessaB}','${azienda}','C-B',null),('${commessaC}','${azienda}','C-C',null);
    insert into company_costs(id,company_id) values('${costo}','${azienda}');
    insert into fatture_ricevute(id,company_id,company_cost_id,fornitore_id,imponibile_totale,totale_documento) values('${fattura}','${azienda}','${costo}','${fornitore}',100,100);`);
});

describe('Fattura, più DDT e più commesse',()=>{
  it('10 riferimenti, 8 DDT collegati: segnala i due mancanti e quello senza cantiere, senza ripartire il costo',async()=>{
    await setXml(xml(Array.from({length:10},(_,i)=>({n:i+1}))));
    for(let n=1;n<=8;n++)await bolla(n,n===8?null:commessaA);
    const p=await piano();
    expect(p.ddt).toHaveLength(10);
    expect(p.ddt.filter((d:any)=>d.esito==='mancante').map((d:any)=>d.numero)).toEqual(['D-9','D-10']);
    expect(p.ddt.filter((d:any)=>d.esito==='senza_destinazione').map((d:any)=>d.numero)).toEqual(['D-8']);
    expect(p.completo).toBe(false);expect((await leggiCosto()).order_id).toBeNull();
    expect((await db.query('select da_leggere,stato from fatture_ricevute')).rows).toEqual([{da_leggere:true,stato:'contabilizzata'}]);
  });
  it('il decimo DDT completa tutti i riferimenti e aggiorna la commessa, anche se la fattura resta non letta',async()=>{
    await setXml(xml(Array.from({length:10},(_,i)=>({n:i+1}))));
    for(let n=1;n<=10;n++)await bolla(n);
    expect((await leggiCosto()).order_id).toBe(commessaA);expect((await piano()).allineata).toBe(true);
    expect((await db.query('select da_leggere from fatture_ricevute')).rows[0]).toEqual({da_leggere:true});
  });
  it('ripartisce più commesse per righe XML, con trasporto proporzionale, e segue i cambi di cantiere dei DDT',async()=>{
    const linee=[600,400,100].map((n,i)=>`<DettaglioLinee><NumeroLinea>${i+1}</NumeroLinea><Descrizione>${i===2?'Trasporto':'Materiali'}</Descrizione><PrezzoTotale>${n}</PrezzoTotale></DettaglioLinee>`).join('');
    await setXml(xml([{n:1,r:[1]},{n:2,r:[2]}],linee),1100);
    await bolla(1);await bolla(2,commessaB);
    const p=await piano();expect(p.completo,p.motivo).toBe(true);
    expect((await leggiCosto()).allocations).toEqual([expect.objectContaining({order_id:commessaA,importo:660,pct:60}),expect.objectContaining({order_id:commessaB,importo:440,pct:40})]);
    await db.query('update ddt_ricezione set order_id=$1 where id=$2',[commessaC,id(102)]);
    expect((await leggiCosto()).allocations.map((q:any)=>q.order_id)).toEqual([commessaA,commessaC]);
    await db.query('update ddt_ricezione set order_id=$1 where id=$2',[commessaA,id(102)]);
    expect((await leggiCosto()).order_id).toBe(commessaA);expect((await leggiCosto()).allocations).toEqual([]);
  });
  it('non inventa percentuali quando più commesse non hanno riferimenti alle righe',async()=>{
    await setXml(xml([{n:1},{n:2}]));await bolla(1);await bolla(2,commessaB);
    expect((await piano()).completo).toBe(false);expect((await leggiCosto()).allocations).toEqual([]);
  });
  it('scollegare una bolla rimuove solo una ripartizione ancora posseduta dall’automatismo',async()=>{
    await setXml(xml([{n:1}]));await bolla(1);
    expect((await leggiCosto()).order_id).toBe(commessaA);
    await db.query('delete from fattura_ddt where fattura_ricevuta_id=$1',[fattura]);
    expect((await leggiCosto()).order_id).toBeNull();expect((await piano()).ddt[0].esito).toBe('mancante');
  });
  it('una scelta manuale successiva resta protetta anche se viene svuotata',async()=>{
    await setXml(xml([{n:1}]));await bolla(1);
    await db.query('update company_costs set order_id=$1 where id=$2',[commessaB,costo]);
    await db.query('update ddt_ricezione set order_id=$1 where id=$2',[commessaC,id(101)]);
    expect((await leggiCosto()).order_id).toBe(commessaB);expect((await piano()).manuale).toBe(true);
    await db.query('update company_costs set order_id=null where id=$1',[costo]);
    await db.query('update ddt_ricezione set order_id=$1 where id=$2',[commessaA,id(101)]);
    expect((await leggiCosto()).order_id).toBeNull();
  });
  it('non modifica assegnazioni già presenti, costi condivisi o fatture collegate a ordini',async()=>{
    await db.query('update company_costs set order_id=$1 where id=$2',[commessaB,costo]);
    await setXml(xml([{n:1}]));await bolla(1);
    expect((await leggiCosto()).order_id).toBe(commessaB);
    await db.query('update company_costs set order_id=null where id=$1',[costo]);
    await db.exec(`insert into fatture_ricevute(id,company_id,company_cost_id) values('${id(9)}','${azienda}','${costo}')`);
    await db.query('select public.fattura_ddt_allinea_commesse($1)',[fattura]);
    expect((await leggiCosto()).order_id).toBeNull();expect((await piano()).gestita_altrove).toBe(true);
  });
  it('mantiene spento l’automatismo aziendale e permette di consultare le destinazioni',async()=>{
    await db.exec("set test.automatico='no'");await setXml(xml([{n:1}]));await bolla(1);
    expect((await piano()).completo).toBe(true);expect((await piano()).automatico).toBe(false);expect((await leggiCosto()).order_id).toBeNull();
  });
  it('considera gli ordini e le voci del DDT e segue gli aggiornamenti in entrambi i percorsi',async()=>{
    await setXml(xml([{n:1}]));await bolla(1,null);
    await db.exec(`insert into purchase_orders(id,company_id,order_id) values('${id(20)}','${azienda}','${commessaA}');insert into ddt_ordini_acquisto values('${id(101)}','${id(20)}','${azienda}')`);
    expect((await leggiCosto()).order_id).toBe(commessaA);
    await db.query('update purchase_orders set order_id=$1 where id=$2',[commessaB,id(20)]);
    expect((await leggiCosto()).order_id).toBe(commessaB);
    await db.exec(`delete from ddt_ordini_acquisto;insert into order_items values('${id(21)}','${commessaA}');insert into ddt_righe values('${id(22)}','${azienda}','${id(101)}','${id(21)}')`);
    expect((await leggiCosto()).order_id).toBe(commessaA);
    await db.query('update order_items set order_id=$1 where id=$2',[commessaC,id(21)]);
    expect((await leggiCosto()).order_id).toBe(commessaC);
  });
  it('magazzino è una destinazione valida, non un DDT senza cantiere',async()=>{
    await setXml(xml([{n:1}]));await bolla(1,null);
    await db.query("update ddt_ricezione set destinazione='magazzino' where id=$1",[id(101)]);
    expect((await piano()).ddt[0].esito).toBe('collegato');expect((await leggiCosto()).quota_magazzino).toBe('100');
  });
  it('se le consegne effettive hanno più cantieri non assegna tutto alla sola testata del DDT',async()=>{
    await setXml(xml([{n:1}]));await bolla(1);
    await db.exec(`insert into ddt_consegne(id,company_id,ddt_id,tipo,order_id) values('${id(70)}','${azienda}','${id(101)}','consegna','${commessaB}')`);
    expect((await piano()).ddt[0].esito).toBe('piu_destinazioni');expect((await leggiCosto()).order_id).toBeNull();
    await db.exec('delete from ddt_consegne');expect((await leggiCosto()).order_id).toBe(commessaA);
  });
  it('XML con namespace, assenza di costo e contabilizzazione successiva non cambiano la lettura',async()=>{
    await db.query('update fatture_ricevute set company_cost_id=null,da_leggere=false where id=$1',[fattura]);
    await setXml(xml([{n:1}]).replace('<FatturaElettronica>','<FatturaElettronica xmlns="urn:fattura">'));await bolla(1);
    expect((await piano()).senza_costo).toBe(true);expect((await leggiCosto()).order_id).toBeNull();
    await db.query('update fatture_ricevute set company_cost_id=$1 where id=$2',[costo,fattura]);
    expect((await leggiCosto()).order_id).toBe(commessaA);
    expect((await db.query('select da_leggere from fatture_ricevute')).rows[0]).toEqual({da_leggere:false});
  });
  it('XML illeggibile e nota di credito non producono una ripartizione automatica',async()=>{
    await setXml('<xml non valido');await bolla(1);expect((await piano()).completo).toBe(false);
    await db.query("update fatture_ricevute set tipo_documento='TD04' where id=$1",[fattura]);
    await setXml(xml([{n:1}]));expect((await piano()).completo).toBe(false);expect((await leggiCosto()).order_id).toBeNull();
  });
  it('non scambia fornitore, azienda, corpo XML o fatture di nota credito',async()=>{
    const primo=xml([{n:99}]).replace(/<\/?FatturaElettronica>/g,'');
    const secondo=xml([{n:1}]).replace(/<\/?FatturaElettronica>/g,'');
    await db.query('update fatture_ricevute set indice_corpo=1 where id=$1',[fattura]);
    await setXml(`<FatturaElettronica>${primo}${secondo}</FatturaElettronica>`);await bolla(1,commessaA,true,id(55));
    expect((await piano()).ddt).toHaveLength(1);expect((await piano()).ddt[0].esito).toBe('fornitore_da_verificare');
    expect((await leggiCosto()).order_id).toBeNull();
    await db.exec(`update fatture_ricevute set company_id='${altra}' where id='${fattura}'`);
    await expect(piano()).rejects.toMatchObject({code:'42501'});
  });
  it('non espone funzioni private o modifiche senza autorizzazione',async()=>{
    await db.exec("set test.noauth='si'");await expect(piano()).rejects.toMatchObject({code:'42501'});
    await expect(db.query('select public.fattura_ddt_allinea_commesse($1)',[fattura])).rejects.toMatchObject({code:'42501'});
    const grants=await db.query("select has_function_privilege('anon','public.fattura_ddt_riepilogo(uuid)','execute') a,has_function_privilege('authenticated','private.fattura_ddt_allinea(uuid)','execute') p");
    expect(grants.rows[0]).toEqual({a:false,p:false});
  });
  it('la contabilità può leggere la verifica anche senza Costi; senza accesso ai documenti la RPC nega',async()=>{
    await setXml(xml([{n:1}]));await bolla(1);
    await db.exec("set test.permesso='no';set role authenticated");
    expect((await piano()).ddt).toHaveLength(1);
    await expect(db.query('select public.fattura_ddt_allinea_commesse($1)',[fattura])).rejects.toMatchObject({code:'42501'});
    await db.exec("set test.documenti='no'");await expect(piano()).rejects.toMatchObject({code:'42501'});
  });
});
