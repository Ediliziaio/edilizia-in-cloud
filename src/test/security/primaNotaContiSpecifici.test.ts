import { afterAll, beforeAll, beforeEach, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
const pg = new PGlite();
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const company=id(1), other=id(2), bank=id(3), second=id(4), conto=id(5), parent=id(6), nonLiquido=id(7), tx=id(8), pn=id(9);
beforeAll(async () => {
  await pg.exec(`create role anon;create role authenticated;create role service_role;create schema private;create schema auth;
    create function auth.uid() returns uuid language sql as $$select '${id(10)}'::uuid$$;
    create function auth.jwt() returns jsonb language sql as $$select '{"role":"authenticated"}'::jsonb$$;
    create table bank_accounts(id uuid primary key,company_id uuid,display_name text,account_name text,is_active boolean);
    create table bank_transactions(id uuid primary key,company_id uuid,account_id uuid);
    create table contabilita_conti(id uuid primary key,company_id uuid,codice text,descrizione text,natura text,movimentabile boolean,attivo boolean,mastro_id uuid,codice_standard text);
    create table prima_nota_entries(id uuid primary key,company_id uuid,bank_transaction_id uuid,account_label text,direction text,category text,description text,amount numeric,entry_date date,payment_method text,reference_number text,supplier_id uuid,order_id uuid,invoice_id uuid,notes text,attachment_url text,attachment_name text,updated_at timestamptz,payment_request_id uuid unique,cost_id uuid,reversal_of uuid);
    create table company_costs(id uuid primary key,company_id uuid);
    create view bank_accounts_operativi as select * from bank_accounts;
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
  await pg.exec(`create function spesa_pagamento_autorizza(uuid) returns void language plpgsql as $$begin
      if $1<>'${company}'::uuid then raise exception 'Azienda non disponibile' using errcode='42501'; end if;end$$;
    create function registra_pagamento_costo(p_costo uuid,p_richiesta uuid,p_importo numeric,p_data date,p_metodo text,p_riferimento text,p_banca uuid,p_esistente uuid) returns jsonb language plpgsql set search_path='public' as $$
      declare v uuid;begin select id into v from prima_nota_entries where payment_request_id=p_richiesta;
      if v is null then insert into prima_nota_entries(id,company_id,cost_id,payment_request_id,amount,direction,entry_date,payment_method)
      select gen_random_uuid(),company_id,id,p_richiesta,p_importo,'uscita',p_data,p_metodo from company_costs where id=p_costo returning id into v;end if;
      return jsonb_build_object('prima_nota_id',v);end$$;
    create function dettaglio_pagamento_costo(uuid) returns jsonb language plpgsql set search_path='public' as $$
      declare c public.company_costs;begin select * into c from company_costs where id=$1;
      return jsonb_build_object('id',c.id,'company_id',c.company_id,'movimenti',(select jsonb_agg(jsonb_build_object('storno_di',p.reversal_of)) from prima_nota_entries p where cost_id=$1));end$$;`);
  await pg.exec(await readFile("supabase/migrations/20290421195000_pagamenti_costi_conto_effettivo.sql", "utf8"));
  await pg.exec(await readFile("supabase/migrations/20290421195000_pagamenti_costi_conto_effettivo.sql", "utf8"));
  await pg.exec(`create function contabilita_puo_leggere(uuid) returns boolean language sql as $$select $1='${company}'::uuid$$;
    create function has_permission_for_company(uuid,text,uuid) returns boolean language sql as $$select $3='${company}'::uuid$$;
    create function user_can_write_accountant_company(uuid) returns boolean language sql as $$select false$$;
    create function utente_sola_lettura(uuid) returns boolean language sql as $$select false$$;
    create function puo_vedere_costi(uuid,uuid) returns boolean language sql as $$select true$$;
    create function get_my_company_id() returns uuid language sql as $$select '${company}'::uuid$$`);
  // Verifica il nuovo percorso autorizzato insieme al vero trigger dei conti.
  await pg.exec(await readFile("supabase/migrations/20290627101000_registra_pagamenti_permessi_staff.sql", "utf8"));
}, 30000);
beforeEach(async () => {
  await pg.exec(`truncate prima_nota_entries,invoice_payments,invoices,bank_transactions,bank_accounts,contabilita_conti,company_costs cascade;
    insert into company_costs values('${id(20)}','${company}'),('${id(21)}','${other}');
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
const paga = (banca: string | null = bank, piano: string | null = null, costo = id(20)) => pg.query("select registra_pagamento_costo_con_conto($1,$2,50,'2026-11-19','bonifico',null,$3,$4)",[costo,id(22),banca,piano]);
it("il pagamento conserva il conto effettivo e una ripetizione non crea una seconda uscita",async()=>{
  await paga();await paga();
  expect((await pg.query<{n:number;totale:string;conto:string}>("select count(*)::int n,sum(amount) totale,min(account_label) conto from prima_nota_entries")).rows[0]).toEqual({n:1,totale:"50",conto:"Banca Alfa"});
  const d=(await pg.query<{d:{movimenti:{conto:string;metodo:string}[]}}>("select dettaglio_pagamento_costo($1) d",[id(20)])).rows[0].d;
  expect(d.movimenti[0]).toMatchObject({conto:"Banca Alfa",metodo:"bonifico"});
});
it("il pagamento rifiuta una banca esterna senza creare movimenti",async()=>{
  await expect(paga(second)).rejects.toThrow(/questa azienda/);
  expect((await pg.query<{n:number}>("select count(*)::int n from prima_nota_entries")).rows[0].n).toBe(0);
});
it("il pagamento rifiuta conti non di liquidità e banche disattivate",async()=>{
  await expect(paga(null,nonLiquido)).rejects.toThrow(/liquidità/);
  await pg.exec("update bank_accounts set is_active=false");
  await expect(paga()).rejects.toThrow(/attivo/);
  expect((await pg.query<{n:number}>("select count(*)::int n from prima_nota_entries")).rows[0].n).toBe(0);
});
it("la stessa richiesta non può cambiare conto dopo la registrazione",async()=>{
  await paga();
  await expect(paga(null,conto)).rejects.toMatchObject({code:"PT409"});
  expect((await pg.query<{bank_account_id:string}>("select bank_account_id from prima_nota_entries")).rows[0].bank_account_id).toBe(bank);
});
it("la registrazione di un costo esterno viene rifiutata prima di scrivere",async()=>{
  await expect(paga(null,null,id(21))).rejects.toMatchObject({code:"42501"});
});
it("il pagamento in contanti senza un sottoconto configurato usa Cassa",async()=>{
  await pg.query("select registra_pagamento_costo_con_conto($1,$2,50,'2026-11-19','contanti',null,null,null)",[id(20),id(22)]);
  expect((await pg.query<{account_label:string;bank_account_id:null}>("select account_label,bank_account_id from prima_nota_entries")).rows[0]).toEqual({account_label:"cassa",bank_account_id:null});
});
