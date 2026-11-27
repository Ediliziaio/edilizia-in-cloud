import { PGlite } from "@electric-sql/pglite";
import { existsSync, readFileSync } from "node:fs";
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from "vitest";

const azienda = "a0000000-0000-4000-a000-000000000001";
const altraAzienda = "b0000000-0000-4000-a000-000000000001";
const id = (n: number) => `c0000000-0000-4000-a000-${String(n).padStart(12, "0")}`;
const costo = id(1), pagamento = id(10), altroPagamento = id(11);
const versione = "2026-11-27T10:00:00Z";
const correzione = "supabase/migrations/20290627100000_pagamento_costo_permessi_staff.sql";
let db: PGlite;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create schema auth; create schema private;
    create role authenticated; create role anon; create role service_role;
    create type public.app_role as enum ('super_admin');
    create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.persona',true),'')::uuid$$;
    create function auth.jwt() returns jsonb language sql as $$select '{"role":"authenticated"}'::jsonb$$;
    create function public.user_can_access_company(uuid) returns boolean language sql as $$select $1='${azienda}'$$;
    create function public.e_amministratore_di(uuid) returns boolean language sql as $$select $1='${azienda}' and current_setting('test.admin',true)='yes'$$;
    create function public.has_role(uuid,public.app_role) returns boolean language sql as $$select false$$;
    create function public.utente_bloccato() returns boolean language sql as $$select current_setting('test.blocked',true)='yes'$$;
    create function public.utente_sola_lettura(uuid) returns boolean language sql as $$select current_setting('test.readonly',true)='yes'$$;
    create function public.puo_vedere_costi(uuid,uuid) returns boolean language sql as $$select $2='${azienda}' and current_setting('test.costs',true)='yes'$$;
    create function public.utente_e_cliente_esterno() returns boolean language sql as $$select false$$;
    create function public.get_my_company_id() returns uuid language sql as $$select '${azienda}'::uuid$$;
    create function public.puo_vedere_documenti_fornitore() returns boolean language sql as $$select current_setting('test.costs',true)='yes'$$;
    create function public.e_super_admin_dentro(uuid) returns boolean language sql as $$select false$$;
    create function public.user_can_write_accountant_company(uuid) returns boolean language sql as $$select false$$;
    create function public.costo_stornato_da_note(uuid) returns numeric language sql as $$select 0::numeric$$;
    create function public.anticipi_compensati_costo(uuid,uuid,date) returns numeric language sql as $$select 0::numeric$$;
    create function public.anticipi_compensazioni_costo(uuid,uuid,date) returns table(data date) language sql as $$select null::date where false$$;
    create function public.anticipo_costo_ha_storico(uuid,uuid) returns boolean language sql as $$select false$$;
    create table public.companies(id uuid primary key);
    insert into public.companies values ('${azienda}'), ('${altraAzienda}');
    create table public.company_costs(id uuid primary key,company_id uuid,name text,amount numeric,vat_rate numeric,is_paid boolean default false,paid_date date,annullato_il timestamptz,due_date date,updated_at timestamptz);
    create table public.prima_nota_entries(id uuid primary key default gen_random_uuid(),company_id uuid,cost_id uuid,invoice_id uuid,is_auto boolean default false,auto_source text,direction text,amount numeric,
      entry_date date,updated_at timestamptz default '${versione}',bank_transaction_id uuid,documento_fiscale_id uuid,movimento_id uuid,unita_movimento_id uuid,sal_sub_id uuid,
      payment_request_id uuid,description text,scadenza_id uuid,reversal_of uuid references public.prima_nota_entries(id),category text,order_id uuid,supplier_id uuid,bank_account_id uuid,account_label text,payment_method text,created_by uuid);
    create table public.scadenze(id uuid primary key,company_id uuid,cost_id uuid,direction text,amount numeric,paid_amount numeric,status text,due_date date,paid_date date,
      prima_nota_entry_id uuid references public.prima_nota_entries(id) on delete set null);
    create table public.fatture_ricevute(company_id uuid,company_cost_id uuid,tipo_documento text,totale_documento numeric,stato text,pagata_il date,pagamento_segnato_da uuid,pagamento_segnato_at timestamptz,id uuid primary key default gen_random_uuid());
    create table public.invoice_payments(company_id uuid,reference text);
    create table public.sal_sub_pagamenti(prima_nota_id uuid references public.prima_nota_entries(id));
    create table public.bank_reconciliations(prima_nota_id uuid,unmatched_at timestamptz);
    create table public.unita_movimenti(prima_nota_id uuid,storno_prima_nota_id uuid);
    create table public.rate_fornitori(id uuid primary key,company_id uuid,company_cost_id uuid,stato text,importo numeric,pagata_il date,scadenza date,updated_at timestamptz default '${versione}');
    create table private.saldi_rapidi_fatture_ricevute(id uuid,company_id uuid,movimento_id uuid,fattura_id uuid,costo_id uuid,annullato_at timestamptz,segnato_at timestamptz,
      importo_movimento numeric,data_saldo date,rate jsonb default '[]',scadenze_precedenti jsonb default '[]',annullato_da uuid);
    grant usage on schema auth,public,private to authenticated;
    grant select,insert,update,delete on all tables in schema public to authenticated;
    alter table public.prima_nota_entries enable row level security;
    create policy lettura on public.prima_nota_entries for select to authenticated using(company_id='${azienda}' and (current_setting('test.admin',true)='yes' or current_setting('test.ledger',true)='yes'));
    create policy aggiornamento on public.prima_nota_entries for update to authenticated using(company_id='${azienda}' and current_setting('test.admin',true)='yes');
    create policy eliminazione on public.prima_nota_entries for delete to authenticated using(company_id='${azienda}' and current_setting('test.admin',true)='yes');
  `);
  await db.exec(readFileSync("src/test/fixtures/finance-deletion-helpers.sql", "utf8"));
  // Usa il ricalcolo effettivo più recente, comprese le compensazioni degli anticipi.
  const compensazioni = readFileSync("supabase/migrations/20290423106000_compensazioni_anticipi_fornitori.sql", "utf8");
  const sincronizzazione = compensazioni.match(/CREATE OR REPLACE FUNCTION public\.spesa_pagamento_sincronizza\(p_costo uuid\)[\s\S]*?end \$function\$;/i)?.[0];
  if (!sincronizzazione) throw new Error("Funzione di sincronizzazione non trovata");
  await db.exec(sincronizzazione);
  const rapido = readFileSync("supabase/migrations/20290430150100_annulla_saldo_fattura_ricevuta_singolo.sql", "utf8");
  for (const nome of ["private.blocca_saldo_rapido_ricevuta", "private.conserva_date_scadenze_saldo_rapido", "public.annulla_saldo_fattura_ricevuta"]) {
    const inizio = rapido.indexOf(`create or replace function ${nome}(`);
    const fine = rapido.indexOf("end $$;", inizio);
    const sql = nome === "private.conserva_date_scadenze_saldo_rapido"
      ? rapido.slice(inizio, rapido.indexOf("$$;", rapido.indexOf("as $$", inizio) + 5) + 3)
      : rapido.slice(inizio, fine + "end $$;".length);
    if (inizio < 0 || !sql) throw new Error(`Funzione ${nome} non trovata`);
    await db.exec(sql);
  }
  await db.exec(`create trigger costo_rate after update of is_paid on public.company_costs for each row execute function public.costo_allinea_rate_fornitori();
    create trigger rate_costo after update on public.rate_fornitori for each row execute function public.rate_fornitori_allinea_costo();`);
  await db.exec(readFileSync("supabase/migrations/20290421121000_prima_nota_elimina_registrazione.sql", "utf8"));
  const vecchia = readFileSync("supabase/migrations/20290618100000_togli_il_pagamento_dalla_fattura.sql", "utf8");
  await db.exec(vecchia.slice(0, vecchia.indexOf("CREATE OR REPLACE FUNCTION public.dettaglio_pagamento_costo")));
  if (existsSync(correzione)) await db.exec(readFileSync(correzione, "utf8"));
}, 20_000);
afterAll(async () => { await db.close(); });
beforeEach(async () => {
  await db.exec(`begin; set local test.persona='${id(999)}'; set local test.blocked='no'; set local test.admin='no'; set local test.readonly='no'; set local test.costs='yes'; set local test.ledger='yes';
    insert into public.company_costs(id,company_id,name,amount,vat_rate,due_date) values ('${costo}','${azienda}','Costo prova',273,22,current_date);
    insert into public.prima_nota_entries(id,company_id,cost_id,is_auto,auto_source,direction,amount,entry_date,description,payment_request_id)
    values ('${pagamento}','${azienda}','${costo}',true,'company_cost_payment','uscita',333.06,current_date,'Pagamento di prova','${pagamento}');`);
});
afterEach(async () => { await db.exec("rollback"); });

async function togli(p = pagamento, v = versione) {
  await db.exec("savepoint tentativo");
  try {
    const r = await db.query<{ risultato: Record<string, unknown> }>("select public.pagamento_costo_annulla($1,$2) risultato", [p, v]);
    await db.exec("release savepoint tentativo");
    return r.rows[0].risultato;
  } catch (e) {
    await db.exec("rollback to savepoint tentativo; release savepoint tentativo");
    throw e;
  }
}

it.each([
  { nome: "Chiara: accesso a prima nota", ledger: "yes", user: id(991) },
  { nome: "Federica: nessun accesso a prima nota", ledger: "no", user: id(992) },
])("$nome può togliere il pagamento autorizzato, conservando l'audit e riaprendo fattura e rata", async ({ ledger, user }) => {
  await db.exec(`set local test.persona='${user}'; set local test.ledger='${ledger}';
    insert into public.rate_fornitori values ('${id(20)}','${azienda}','${costo}','da_pagare',333.06,null,current_date);
    insert into public.fatture_ricevute(company_id,company_cost_id,totale_documento) values ('${azienda}','${costo}',333.06);
    insert into public.scadenze values ('${id(21)}','${azienda}','${costo}','uscita',333.06,333.06,'pagata',current_date,current_date,'${pagamento}');
    update public.company_costs set is_paid=true,paid_date=current_date where id='${costo}'; set local role authenticated;`);
  expect(await togli()).toMatchObject({ annullato: true, via: "prima_nota" });
  await db.exec("reset role");
  expect((await db.query("select count(*)::int n from public.prima_nota_entries")).rows[0]).toEqual({ n: 0 });
  expect((await db.query("select count(*)::int n from public.prima_nota_cancellazioni")).rows[0]).toEqual({ n: 1 });
  expect((await db.query("select deleted_by, snapshot->>'id' as movimento from public.prima_nota_cancellazioni")).rows[0]).toEqual({ deleted_by: user, movimento: pagamento });
  expect((await db.query("select is_paid from public.company_costs where id=$1", [costo])).rows[0]).toEqual({ is_paid: false });
  expect((await db.query("select stato from public.rate_fornitori where company_cost_id=$1", [costo])).rows[0]).toEqual({ stato: "da_pagare" });
  expect((await db.query("select status, paid_amount from public.scadenze where cost_id=$1", [costo])).rows[0]).toMatchObject({ status: "da_pagare", paid_amount: "0" });
  expect((await db.query("select pagata_il from public.fatture_ricevute where company_cost_id=$1", [costo])).rows[0]).toEqual({ pagata_il: null });
});

it.each(["blocked", "readonly", "costs"])("rifiuta la rimozione se manca il requisito %s", async (requisito) => {
  await db.exec(`set local test.${requisito}='${requisito === "costs" ? "no" : "yes"}'; set local role authenticated;`);
  await expect(togli()).rejects.toMatchObject({ code: "42501" });
  await db.exec("reset role");
  expect((await db.query("select count(*)::int n from public.prima_nota_entries")).rows[0]).toEqual({ n: 1 });
});

it("non amplia il permesso di eliminare una registrazione di prima nota generica", async () => {
  await db.exec(`update public.prima_nota_entries set cost_id=null,is_auto=false,auto_source=null where id='${pagamento}'; set local role authenticated;`);
  await expect(togli()).rejects.toMatchObject({ code: "42501" });
});

it("mantiene il percorso invoker per una registrazione generica eliminata dall'amministratore", async () => {
  await db.exec(`update public.prima_nota_entries set cost_id=null,is_auto=false,auto_source=null where id='${pagamento}'; set local test.admin='yes'; set local role authenticated;`);
  expect(await togli()).toMatchObject({ annullato: true, via: "prima_nota" });
  await db.exec("reset role");
  expect((await db.query("select count(*)::int n from public.prima_nota_entries")).rows[0]).toEqual({ n: 0 });
});

it("non permette allo staff la vecchia eliminazione generica tramite RPC diretta", async () => {
  await db.exec("set local role authenticated; savepoint tentativo");
  await expect(db.query("select public.prima_nota_elimina_registrazione($1,$2)", [pagamento, versione])).rejects.toMatchObject({ code: "42501" });
  await db.exec("rollback to savepoint tentativo; release savepoint tentativo");
});

it("il percorso interno controlla comunque i permessi anche se chiamato direttamente", async () => {
  await db.exec("set local test.costs='no'; set local role authenticated; savepoint tentativo");
  await expect(db.query("select private.pagamento_costo_annulla_dedicato($1,$2)", [pagamento, versione])).rejects.toMatchObject({ code: "42501" });
  await db.exec("rollback to savepoint tentativo; release savepoint tentativo; reset role");
  expect((await db.query("select count(*)::int n from public.prima_nota_entries")).rows[0]).toEqual({ n: 1 });
});

it("non esegue la cancellazione senza identità autenticata", async () => {
  await db.exec("set local test.persona=''; set local role authenticated");
  await expect(togli()).rejects.toMatchObject({ code: "42501" });
});

it("non permette allo staff di eliminare direttamente la registrazione via RLS", async () => {
  await db.exec("set local role authenticated");
  const r = await db.query("delete from public.prima_nota_entries where id=$1 returning id", [pagamento]);
  expect(r.rows).toHaveLength(0);
});

it("non elimina un pagamento bancario collegato", async () => {
  await db.exec(`update public.prima_nota_entries set bank_transaction_id='${id(50)}' where id='${pagamento}'; set local role authenticated;`);
  await expect(togli()).rejects.toMatchObject({ code: "P0001" });
});

it.each(["banca", "sal", "unita"])("non scollega un pagamento con collegamento esterno a %s", async (tipo) => {
  if (tipo === "banca") await db.exec(`insert into public.bank_reconciliations values ('${pagamento}',null)`);
  if (tipo === "sal") await db.exec(`insert into public.sal_sub_pagamenti values ('${pagamento}')`);
  if (tipo === "unita") await db.exec(`insert into public.unita_movimenti values ('${pagamento}',null)`);
  await db.exec("set local role authenticated");
  await expect(togli()).rejects.toMatchObject({ code: "P0001" });
  await db.exec("reset role");
  expect((await db.query("select count(*)::int n from public.prima_nota_entries")).rows[0]).toEqual({ n: 1 });
  expect((await db.query("select count(*)::int n from public.prima_nota_cancellazioni")).rows[0]).toEqual({ n: 0 });
});

it("non elimina una versione del pagamento non più attuale", async () => {
  await db.exec("set local role authenticated");
  await expect(togli(pagamento, "2020-01-01T00:00:00Z")).rejects.toMatchObject({ code: "PT409" });
});

it("non cancella nuovamente il pagamento né duplica l'audit al secondo tentativo", async () => {
  await db.exec("set local role authenticated");
  expect(await togli()).toMatchObject({ annullato: true });
  await expect(togli()).rejects.toMatchObject({ code: "P0002" });
  await db.exec("reset role");
  expect((await db.query("select count(*)::int n from public.prima_nota_cancellazioni")).rows[0]).toEqual({ n: 1 });
});

it("rifiuta il comando se manca la versione del movimento", async () => {
  await db.exec("set local role authenticated; savepoint tentativo");
  await expect(db.query("select public.pagamento_costo_annulla($1,null)", [pagamento])).rejects.toMatchObject({ code: "PT409" });
  await db.exec("rollback to savepoint tentativo; release savepoint tentativo");
});

it("non elimina un pagamento già annullato", async () => {
  await db.exec(`insert into public.prima_nota_entries(id,company_id,cost_id,is_auto,auto_source,direction,amount,reversal_of)
    values ('${id(12)}','${azienda}','${costo}',true,'storno_pagamento','entrata',333.06,'${pagamento}'); set local role authenticated;`);
  await expect(togli()).rejects.toMatchObject({ code: "P0001" });
  await db.exec("reset role");
  expect((await db.query("select count(*)::int n from public.prima_nota_entries")).rows[0]).toEqual({ n: 2 });
});

it("non elimina un movimento automatico proveniente da un altro documento", async () => {
  await db.exec(`update public.prima_nota_entries set auto_source='altra_origine' where id='${pagamento}'; set local role authenticated;`);
  await expect(togli()).rejects.toMatchObject({ code: "P0001" });
});

it("impedisce a un'azienda di operare sul pagamento di un'altra anche conoscendone l'UUID", async () => {
  await db.exec(`insert into public.company_costs(id,company_id,name,amount,vat_rate) values ('${id(2)}','${altraAzienda}','Altro costo',100,22);
    insert into public.prima_nota_entries(id,company_id,cost_id,is_auto,auto_source,direction,amount)
    values ('${id(15)}','${altraAzienda}','${id(2)}',true,'company_cost_payment','uscita',122); set local role authenticated;`);
  await expect(togli(id(15))).rejects.toMatchObject({ code: "P0002" });
  await db.exec("reset role");
  expect((await db.query("select count(*)::int n from public.prima_nota_entries where company_id=$1", [altraAzienda])).rows[0]).toEqual({ n: 1 });
});

it("non segue un collegamento al costo di un'altra azienda", async () => {
  await db.exec(`insert into public.company_costs(id,company_id,name,amount,vat_rate) values ('${id(2)}','${altraAzienda}','Altro costo',100,22);
    update public.prima_nota_entries set cost_id='${id(2)}' where id='${pagamento}'; set local role authenticated;`);
  await expect(togli()).rejects.toMatchObject({ code: "42501" });
  await db.exec("reset role");
  expect((await db.query("select count(*)::int n from public.prima_nota_entries")).rows[0]).toEqual({ n: 1 });
});

it("non riapre automaticamente più rate già chiuse senza sapere quale correggere", async () => {
  await db.exec(`update public.prima_nota_entries set amount=200 where id='${pagamento}';
    insert into public.prima_nota_entries(id,company_id,cost_id,is_auto,auto_source,direction,amount,entry_date,description,payment_request_id)
    values ('${altroPagamento}','${azienda}','${costo}',true,'company_cost_payment','uscita',133.06,current_date,'Altra quota','${altroPagamento}');
    insert into public.rate_fornitori values ('${id(30)}','${azienda}','${costo}','pagata',200,current_date,current_date),('${id(31)}','${azienda}','${costo}','pagata',133.06,current_date,current_date);
    update public.company_costs set is_paid=true where id='${costo}'; set local role authenticated;`);
  await expect(togli()).rejects.toMatchObject({ code: "P0001" });
});

it("annulla un saldo rapido con la funzione reale e riapre fattura, rata e costo", async () => {
  await db.exec(`update public.prima_nota_entries set payment_request_id='${id(41)}' where id='${pagamento}';
    insert into public.fatture_ricevute(id,company_id,company_cost_id,totale_documento,pagata_il,pagamento_segnato_at)
      values ('${id(42)}','${azienda}','${costo}',333.06,current_date,'${versione}');
    insert into public.rate_fornitori values ('${id(43)}','${azienda}','${costo}','pagata',333.06,current_date,current_date,'${versione}');
    update public.company_costs set is_paid=true,paid_date=current_date where id='${costo}';
    insert into private.saldi_rapidi_fatture_ricevute(id,company_id,movimento_id,fattura_id,costo_id,segnato_at,importo_movimento,data_saldo,rate)
      values ('${id(41)}','${azienda}','${pagamento}','${id(42)}','${costo}','${versione}',333.06,current_date,
        jsonb_build_array(jsonb_build_object('id','${id(43)}','stato','da_pagare','pagata_il',null,'updated_at','${versione}')));
    set local role authenticated;`);
  expect(await togli()).toMatchObject({ annullato: true, via: "saldo_rapido", fattura_id: id(42) });
  await db.exec("reset role");
  expect((await db.query("select count(*)::int n from public.prima_nota_entries where reversal_of=$1", [pagamento])).rows[0]).toEqual({ n: 1 });
  expect((await db.query("select is_paid from public.company_costs where id=$1", [costo])).rows[0]).toEqual({ is_paid: false });
  expect((await db.query("select stato from public.rate_fornitori where id=$1", [id(43)])).rows[0]).toEqual({ stato: "da_pagare" });
  expect((await db.query("select pagata_il from public.fatture_ricevute where id=$1", [id(42)])).rows[0]).toEqual({ pagata_il: null });
});

it("non annulla un saldo rapido se la rata è stata modificata nel frattempo", async () => {
  await db.exec(`update public.prima_nota_entries set payment_request_id='${id(41)}' where id='${pagamento}';
    insert into public.fatture_ricevute(id,company_id,company_cost_id,totale_documento,pagata_il,pagamento_segnato_at)
      values ('${id(42)}','${azienda}','${costo}',333.06,current_date,'${versione}');
    insert into public.rate_fornitori values ('${id(43)}','${azienda}','${costo}','pagata',333.06,current_date,current_date,'${versione}');
    update public.company_costs set is_paid=true,paid_date=current_date where id='${costo}';
    insert into private.saldi_rapidi_fatture_ricevute(id,company_id,movimento_id,fattura_id,costo_id,segnato_at,importo_movimento,data_saldo,rate)
      values ('${id(41)}','${azienda}','${pagamento}','${id(42)}','${costo}','${versione}',333.06,current_date,
        jsonb_build_array(jsonb_build_object('id','${id(43)}','stato','da_pagare','pagata_il',null,'updated_at','2025-01-01T00:00:00Z')));
    set local role authenticated;`);
  await expect(togli()).rejects.toMatchObject({ code: "PT409" });
  await db.exec("reset role");
  expect((await db.query("select count(*)::int n from public.prima_nota_entries")).rows[0]).toEqual({ n: 1 });
  expect((await db.query("select is_paid from public.company_costs where id=$1", [costo])).rows[0]).toEqual({ is_paid: true });
  expect((await db.query("select stato from public.rate_fornitori where id=$1", [id(43)])).rows[0]).toEqual({ stato: "pagata" });
});

it("non espone il comando agli anonimi o la funzione di cancellazione interna agli autenticati", async () => {
  const r = await db.query<{ comando_privato: boolean; anonimo: boolean; percorso_anonimo: boolean }>(`select
    has_function_privilege('authenticated','private.pagamento_costo_rimuovi(uuid,timestamptz)','EXECUTE') as comando_privato,
    has_function_privilege('anon','public.pagamento_costo_annulla(uuid,timestamptz)','EXECUTE') as anonimo,
    has_function_privilege('anon','private.pagamento_costo_annulla_dedicato(uuid,timestamptz)','EXECUTE') as percorso_anonimo`);
  expect(r.rows[0]).toEqual({ comando_privato: false, anonimo: false, percorso_anonimo: false });
});

it("mantiene invoker il comando pubblico e rende idempotente la migrazione", async () => {
  await db.exec(readFileSync(correzione, "utf8"));
  const r = await db.query<{ definito_con_privilegi: boolean }>("select prosecdef as definito_con_privilegi from pg_proc where oid='public.pagamento_costo_annulla(uuid,timestamptz)'::regprocedure");
  expect(r.rows[0].definito_con_privilegi).toBe(false);
});

it("elimina solo la quota indicata e conserva l'altro pagamento", async () => {
  await db.exec(`update public.prima_nota_entries set amount=200 where id='${pagamento}';
    insert into public.prima_nota_entries(id,company_id,cost_id,is_auto,auto_source,direction,amount,entry_date,description,payment_request_id)
    values ('${altroPagamento}','${azienda}','${costo}',true,'company_cost_payment','uscita',133.06,current_date,'Altra quota','${altroPagamento}');
    update public.company_costs set is_paid=true where id='${costo}'; set local role authenticated;`);
  expect(await togli()).toMatchObject({ annullato: true, via: "prima_nota" });
  await db.exec("reset role");
  expect((await db.query("select id,amount from public.prima_nota_entries")).rows).toEqual([{ id: altroPagamento, amount: "133.06" }]);
  expect((await db.query("select is_paid from public.company_costs where id=$1", [costo])).rows[0]).toEqual({ is_paid: false });
});
