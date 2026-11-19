import { afterAll, beforeAll, beforeEach, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
const pg = new PGlite();
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const company=id(1), other=id(2), bank=id(3), second=id(4), conto=id(5), parent=id(6), nonLiquido=id(7), tx=id(8), pn=id(9);
beforeAll(async () => {
  await pg.exec(`create role anon;create role authenticated;create role service_role;create schema private;create schema auth;
    create function auth.uid() returns uuid language sql as $$select '${id(10)}'::uuid$$;
    create table bank_accounts(id uuid primary key,company_id uuid,display_name text,account_name text,is_active boolean);
    create table bank_transactions(id uuid primary key,company_id uuid,account_id uuid);
    create table contabilita_conti(id uuid primary key,company_id uuid,codice text,descrizione text,natura text,movimentabile boolean,attivo boolean,mastro_id uuid,codice_standard text);
    create table prima_nota_entries(id uuid primary key,company_id uuid,bank_transaction_id uuid,account_label text,direction text,category text,description text,amount numeric,entry_date date,payment_method text,reference_number text,supplier_id uuid,order_id uuid,invoice_id uuid,notes text,attachment_url text,attachment_name text,updated_at timestamptz);
    create table invoice_payments(id uuid primary key,company_id uuid,invoice_id uuid,amount numeric,payment_date date,payment_method text,reference text,notes text,created_by uuid,created_at timestamptz default now());
    create table invoices(id uuid primary key,company_id uuid,total numeric,paid_amount numeric,document_type text,deleted_at timestamptz);
    create function prima_nota_modificabile(prima_nota_entries) returns text language sql as $$select null::text$$;
    create function contabilita_genera_da_documenti(p_company uuid,p_anno integer,p_solo uuid default null) returns uuid language plpgsql as $$
      declare r record;k jsonb:='{}';v_banca text;
      begin
        select * into r from prima_nota_entries where id=p_solo and company_id=p_company;
        -- Importo con segno dal punto di vista della contropartita:
        return (k->>v_banca)::uuid;
      end$$;`);
  await pg.exec(await readFile("supabase/migrations/20290421182000_prima_nota_conti_specifici.sql", "utf8"));
  await pg.exec(await readFile("supabase/migrations/20290421185000_prima_nota_banche_archiviate.sql", "utf8"));
}, 30000);
beforeEach(async () => {
  await pg.exec(`truncate prima_nota_entries,invoice_payments,invoices,bank_transactions,bank_accounts,contabilita_conti cascade;
    insert into bank_accounts values('${bank}','${company}','Banca Alfa',null,true),('${second}','${other}','Banca Beta',null,true);
    insert into contabilita_conti values('${parent}','${company}','22','DISPONIBILITA LIQUIDE','attivo',false,true,null,null),
      ('${conto}','${company}','22050001','BCC di prova','attivo',true,true,'${parent}',null),
      ('${nonLiquido}','${company}','05','Crediti verso clienti','attivo',true,true,null,null);
    insert into bank_transactions values('${tx}','${company}','${bank}');`);
});
afterAll(() => pg.close());
const inserisci = (dati: string) => pg.exec(`insert into prima_nota_entries(id,company_id,direction,description,amount,entry_date,${dati.split("=")[0]}) values('${pn}','${company}','uscita','Pagamento',100,'2026-11-19',${dati.slice(dati.indexOf("=")+1)});`);

it("il sottoconto BCC è riconosciuto dal mastro di liquidità e conserva il proprio id", async () => {
  await inserisci(`conto_liquidita_id='${conto}'`);
  expect((await pg.query<{account_label:string}>("select account_label from prima_nota_entries")).rows[0].account_label).toBe("BCC di prova");
  expect((await pg.query<{conto:string}>("select contabilita_genera_da_documenti($1,2026,$2) conto",[company,pn])).rows[0].conto).toBe(conto);
});
it("il conto effettivo di Tesoreria sostituisce l'etichetta generica banca", async () => {
  await inserisci(`bank_account_id='${bank}'`);
  expect((await pg.query<{account_label:string}>("select account_label from prima_nota_entries")).rows[0].account_label).toBe("Banca Alfa");
});
it("rifiuta il conto bancario di un'altra azienda", async () => {
  await expect(inserisci(`bank_account_id='${second}'`)).rejects.toThrow(/questa azienda/);
});
it("rifiuta un conto contabile patrimoniale che non sia di liquidità", async () => {
  await expect(inserisci(`conto_liquidita_id='${nonLiquido}'`)).rejects.toThrow(/liquidità/);
});
it("il collegamento al movimento identifica automaticamente la sua banca", async () => {
  await inserisci(`bank_transaction_id='${tx}'`);
  expect((await pg.query<{bank_account_id:string,account_label:string}>("select bank_account_id,account_label from prima_nota_entries")).rows[0]).toEqual({bank_account_id:bank,account_label:"Banca Alfa"});
  await expect(pg.query("update prima_nota_entries set bank_account_id=$1 where id=$2",[second,pn])).rejects.toThrow(/banca del movimento/);
});
it("una banca chiusa resta associabile ai suoi movimenti storici, mentre le nuove manuali richiedono un conto attivo",async()=>{
  await pg.exec("update bank_accounts set is_active=false");
  await expect(inserisci(`bank_account_id='${bank}'`)).rejects.toThrow(/non è attivo/);
  await inserisci(`bank_transaction_id='${tx}'`);
  expect((await pg.query<{bank_account_id:string}>("select bank_account_id from prima_nota_entries")).rows[0].bank_account_id).toBe(bank);
});
it("la modifica del movimento conserva il riferimento al conto scelto", async () => {
  await inserisci(`account_label='banca'`);
  const dati={direction:"uscita",description:"Pagamento corretto",amount:100,entry_date:"2026-11-19",account_label:"banca",bank_account_id:bank,conto_liquidita_id:conto};
  await pg.query("select prima_nota_modifica($1,$2::jsonb)",[pn,JSON.stringify(dati)]);
  expect((await pg.query<{bank_account_id:string,conto_liquidita_id:string}>("select bank_account_id,conto_liquidita_id from prima_nota_entries")).rows[0]).toEqual({bank_account_id:bank,conto_liquidita_id:conto});
});
it("la migrazione si può ripetere senza duplicare le modifiche al generatore",async()=>{
  await pg.exec(await readFile("supabase/migrations/20290421182000_prima_nota_conti_specifici.sql","utf8"));
});
