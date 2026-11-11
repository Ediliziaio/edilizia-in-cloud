import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
let db: PGlite;
const company = "00000000-0000-4000-a000-000000000001";
const other = "00000000-0000-4000-a000-000000000002";
const year = new Date().getFullYear();
const supplier = "00000000-0000-4000-a000-000000000003";
const a = "00000000-0000-4000-a000-000000000011";
const b = "00000000-0000-4000-a000-000000000012";
const child = "00000000-0000-4000-a000-000000000021";
const sql = readFileSync("supabase/migrations/20290218153000_operational_documents_delete.sql", "utf8");
const companyGuard = readFileSync("supabase/migrations/20290218160000_operational_delete_child_company.sql", "utf8");
const numerazione = readFileSync("supabase/migrations/20290131160000_numerazione_ordini_fornitore.sql", "utf8");
function functionSql(name: string) { const start = numerazione.indexOf(`create or replace function public.${name}(`); return numerazione.slice(start, numerazione.indexOf('$function$;', start) + 11); }
async function preview(kind = "oda", ids = [a], co = company) { return (await db.query<{ v: { documents: Array<{ id: string; allowed: boolean; reason: string | null; version: string }>; deleted: number } }>("select operational_documents_delete($1,$2,$3,true) v", [co, kind, ids])).rows[0].v; }
async function remove(kind = "oda", ids = [a], expected?: Record<string, string>) {
  const versions = expected ?? Object.fromEntries((await preview(kind, ids)).documents.map(d => [d.id, d.version]));
  return (await db.query<{ v: { deleted: number } }>("select operational_documents_delete($1,$2,$3,false,$4) v", [company, kind, ids, JSON.stringify(versions)])).rows[0].v;
}
async function order(id = a, number = `ODA-${year}-0001`, status = "bozza") { await db.query("insert into purchase_orders(id,company_id,supplier_id,oda_number,status) values($1,$2,$3,$4,$5)", [id,company,supplier,number,status]); }
beforeAll(async () => {
  db = new PGlite(); await db.waitReady;
  await db.exec(`create schema auth; create role authenticated; create role anon; create type public.app_role as enum ('super_admin');
    create function auth.uid() returns uuid language sql as $$select '${company}'::uuid$$;
    create function user_can_access_company(c uuid) returns boolean language sql as $$select c='${company}'::uuid$$;
    create function utente_bloccato() returns boolean language sql as $$select false$$;
    create function utente_sola_lettura(uuid) returns boolean language sql as $$select false$$;
    create function utente_e_cliente_esterno() returns boolean language sql as $$select false$$;
    create function e_solo_campo() returns boolean language sql as $$select false$$;
    create function e_amministratore_di(uuid) returns boolean language sql as $$select coalesce(current_setting('test.admin',true),'on')='on'$$;
    create function has_role(uuid,app_role) returns boolean language sql as $$select false$$;
    create function has_permission_for_company(uuid,text,uuid) returns boolean language sql as $$select coalesce(current_setting('test.permission',true),'on')='on'$$;
    create function get_my_warehouse_ids() returns uuid[] language sql as $$select '{}'::uuid[]$$;
    create table suppliers(id uuid primary key,company_id uuid,oda_prossimo int,oda_formato text);
    create table numerazione_ordini_fornitore(company_id uuid primary key,prossimo int,formato text);
    create table purchase_orders(id uuid primary key,company_id uuid,supplier_id uuid,oda_number text,status text,sent_at timestamptz,confirmed_at timestamptz,updated_at timestamptz default now(),unique(company_id,oda_number));
    create table supplier_rfqs(id uuid primary key,company_id uuid,rfq_number text,status text,purchase_order_id uuid references purchase_orders(id) on delete set null,supplier_id_aggiudicato uuid);
    create table ddt_ricezione(id uuid primary key,company_id uuid,numero_ddt text,stato text,quantita_ricevuta numeric default 0,signature_url text,company_cost_id uuid,warehouse_id uuid,purchase_order_id uuid references purchase_orders(id) on delete cascade);
    create table surveys(id uuid primary key,company_id uuid,code text,status text,order_id uuid,estimate_id uuid,signed_at timestamptz,client_signature_at timestamptz,client_signature_url text,supplier_order_id uuid);
    create table purchase_order_items(id uuid primary key,purchase_order_id uuid references purchase_orders(id) on delete cascade,quantity_received numeric default 0);
    create table goods_receipts(id uuid primary key,purchase_order_item_id uuid references purchase_order_items(id) on delete cascade);
    create table supplier_rfq_items(id uuid primary key,rfq_id uuid references supplier_rfqs(id) on delete cascade);
    create table supplier_rfq_suppliers(id uuid primary key,rfq_id uuid references supplier_rfqs(id) on delete cascade,status text default 'da_inviare',inviata_at timestamptz,risposta_at timestamptz,totale_offerto numeric);
    create table supplier_rfq_quotes(id uuid primary key,rfq_item_id uuid references supplier_rfq_items(id) on delete cascade);
    create table survey_media(id uuid primary key,survey_id uuid references surveys(id) on delete cascade);
  `);
  await db.exec(functionSql('oda_formatta_numero')); await db.exec(functionSql('generate_oda_number'));
  await db.exec(`begin;${sql}${companyGuard}commit;`);
},30000);
beforeEach(async () => { await db.exec("reset role; set test.admin='on'; set test.permission='on'; truncate purchase_orders,supplier_rfqs,ddt_ricezione,surveys,suppliers,numerazione_ordini_fornitore cascade;"); await db.query("insert into suppliers values($1,$2,null,null)",[supplier,company]); });
afterAll(async () => { await db?.close(); });
describe("Eliminazione documenti e progressivi", () => {
  it("blocca anche un figlio incoerente di un'altra azienda senza cancellare dati", async () => {
    await order();
    await db.exec("alter table purchase_order_items add column company_id uuid;");
    try {
      await db.query("insert into purchase_order_items(id,purchase_order_id,quantity_received,company_id) values($1,$2,0,$3)", [child,a,other]);
      expect((await preview()).documents[0].reason).toContain("aziendali incoerenti");
      await expect(remove()).rejects.toThrow(/non eliminabili/);
      expect((await db.query("select id from purchase_order_items")).rows).toHaveLength(1);
      expect((await db.query("select id from purchase_orders")).rows).toHaveLength(1);
    } finally { await db.exec("alter table purchase_order_items drop column company_id;"); }
  });

  it("verifica senza eliminare e cancella la bozza con righe proprie", async () => { await order(); await db.query("insert into purchase_order_items values($1,$2,0)",[child,a]); expect((await preview()).documents[0].allowed).toBe(true); expect((await db.query("select * from purchase_orders")).rows).toHaveLength(1); expect((await remove()).deleted).toBe(1); expect((await db.query("select * from purchase_order_items")).rows).toHaveLength(0); });
  it("blocca DDT collegati anziché cancellarli in cascata", async () => { await order(); await db.query("insert into ddt_ricezione(id,company_id,stato,purchase_order_id) values($1,$2,'attesa',$3)",[child,company,a]); expect((await preview()).documents[0].allowed).toBe(false); await expect(remove()).rejects.toThrow(/non eliminabili/); expect((await db.query("select * from ddt_ricezione")).rows).toHaveLength(1); });
  it("rileva anche collegamenti ai figli e non solo all'ordine", async () => { await order(); await db.query("insert into purchase_order_items values($1,$2,0)",[child,a]); await db.query("insert into goods_receipts values($1,$2)",[b,child]); expect((await preview()).documents[0].reason).toContain("ricezioni"); });
  it("blocca ordini inviati e quantità ricevute", async () => { await order(); await db.exec(`update purchase_orders set sent_at=now();`); expect((await preview()).documents[0].allowed).toBe(false); await db.exec("update purchase_orders set sent_at=null;"); await db.query("insert into purchase_order_items values($1,$2,1)",[child,a]); expect((await preview()).documents[0].reason).toContain("ricevute"); });
  it("annulla tutto il lotto se una riga non è eliminabile", async () => { await order(); await order(b,`ODA-${year}-0002`,"inviato"); await expect(remove("oda",[a,b])).rejects.toThrow(/non eliminabili/); expect((await db.query("select * from purchase_orders")).rows).toHaveLength(2); });
  it("rifiuta documenti di altre aziende, permessi assenti e chiamate anonime", async () => { await order(); await expect(preview("oda",[a],other)).rejects.toThrow(/permesso/); await db.exec("set test.admin='off';set test.permission='off';"); await expect(preview()).rejects.toThrow(/Permesso/); await db.exec("set role anon;"); await expect(preview()).rejects.toThrow(/permission denied/); await db.exec("reset role;"); });
  it("rifiuta un documento modificato dopo la verifica", async () => { await order(); const old = (await preview()).documents[0].version; await db.exec("update purchase_orders set status='annullato'"); await expect(remove("oda",[a],{[a]:old})).rejects.toThrow(/modificato/); });
  it("recupera il progressivo standard finale senza cambiare i numeri precedenti", async () => { await order(); await order(b,`ODA-${year}-0002`); await remove("oda",[b]); const next = (await db.query<{ v: string }>("select generate_oda_number($1,$2) v",[company,supplier])).rows[0].v; expect(next).toBe(`ODA-${new Date().getFullYear()}-0002`); expect((await db.query<{oda_number:string}>("select oda_number from purchase_orders")).rows[0].oda_number).toBe(`ODA-${year}-0001`); });
  it("non riempie un buco intermedio rinumerando gli ordini successivi", async () => { await order(); await order(b,`ODA-${year}-0002`); await remove(); expect((await db.query<{ v: string }>("select generate_oda_number($1,$2) v",[company,supplier])).rows[0].v).toBe(`ODA-${new Date().getFullYear()}-0003`); });
  it("non tronca i progressivi dopo 9999", async () => { await order(a,`ODA-${year}-9999`); expect((await db.query<{ v: string }>("select generate_oda_number($1,$2) v",[company,supplier])).rows[0].v).toBe(`ODA-${year}-10000`); });
  it("recupera la coda del contatore aziendale e del fornitore", async () => { await db.query("insert into numerazione_ordini_fornitore values($1,12,'ACQ-{n}')",[company]); await order(a,"ACQ-10"); await order(b,"ACQ-11"); await remove("oda",[a,b]); expect((await db.query<{prossimo:number}>("select prossimo from numerazione_ordini_fornitore")).rows[0].prossimo).toBe(10); await db.exec("update suppliers set oda_prossimo=42,oda_formato='F-{n}';"); await order(a,"F-41"); await remove(); expect((await db.query<{oda_prossimo:number}>("select oda_prossimo from suppliers")).rows[0].oda_prossimo).toBe(41); });
  it("non arretra un contatore se esiste un numero successivo", async () => { await db.query("insert into numerazione_ordini_fornitore values($1,12,'ACQ-{n}')",[company]); await order(a,"ACQ-10"); await order(b,"ACQ-11"); await remove(); expect((await db.query<{prossimo:number}>("select prossimo from numerazione_ordini_fornitore")).rows[0].prossimo).toBe(12); });
  it("protegge richieste con offerte e sopralluoghi con foto", async () => { await db.query("insert into supplier_rfqs(id,company_id,status) values($1,$2,'bozza')",[a,company]); await db.query("insert into supplier_rfq_items values($1,$2)",[child,a]); await db.query("insert into supplier_rfq_quotes values($1,$2)",[b,child]); expect((await preview("rfq")).documents[0].allowed).toBe(false); await db.query("insert into surveys(id,company_id,status) values($1,$2,'draft')",[a,company]); await db.query("insert into survey_media values($1,$2)",[child,a]); expect((await preview("surveys")).documents[0].allowed).toBe(false); });
});
