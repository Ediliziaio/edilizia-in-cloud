/** PostgreSQL in memoria: nessuna connessione, dato o migrazione remota. */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

const c = "11111111-1111-4111-a111-111111111111";
const otherC = "11111111-1111-4111-a111-111111111112";
const o = "22222222-2222-4222-a222-222222222221";
const otherO = "22222222-2222-4222-a222-222222222222";
const p = "33333333-3333-4333-a333-333333333331";
const otherP = "33333333-3333-4333-a333-333333333332";
const sub = "44444444-4444-4444-a444-444444444441";
const otherSub = "44444444-4444-4444-a444-444444444442";
const item = "55555555-5555-4555-a555-555555555551";
const otherItem = "55555555-5555-4555-a555-555555555552";
const stock = "66666666-6666-4666-a666-666666666661";
const otherStock = "66666666-6666-4666-a666-666666666662";
const db = new PGlite();

beforeAll(async () => {
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth;
    create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.uid', true), '')::uuid$$;
    create function auth.role() returns text language sql as $$select 'authenticated'::text$$;
    create function public.has_permission_for_company(uuid,text,uuid) returns boolean language sql as $$select true$$;
    create function public.campo_lavoro_su_commessa(uuid) returns boolean language sql as $$select true$$;
    create function public.campo_mio_ruolo(uuid) returns jsonb language sql as $$select '{}'::jsonb$$;
    create table profiles(id uuid primary key, company_id uuid);
    create table user_roles(user_id uuid, role text);
    create table campo_regole_azienda(company_id uuid primary key, chi_compila text, ore_dalle text, avviso_scostamento_minuti integer);
    create table orders(id uuid primary key, company_id uuid, percentuale_avanzamento integer default 0, costo numeric default 0, deleted_at timestamptz);
    create table order_work_phases(id uuid primary key, company_id uuid, order_id uuid references orders, name text,
      percentuale integer default 0, status text default 'da_iniziare', updated_at timestamptz default now());
    create table order_work_subphases(id uuid primary key, phase_id uuid references order_work_phases, fatta boolean default false);
    create table order_items(id uuid primary key, order_id uuid references orders);
    create table warehouse_stock(id uuid primary key, company_id uuid);
    create table campo_rapportini(id uuid primary key default gen_random_uuid(), company_id uuid, order_id uuid references orders,
      user_id uuid, data_lavoro date default current_date, stato text default 'inviato', approvato boolean default false,
      descrizione_lavori text, ore_lavorate numeric default 0, ore_straordinario numeric default 0,
      presenze jsonb default '[]', foto_urls text[] default '{}', fasi_lavorate jsonb default '[]', materiali_usati jsonb default '[]',
      percentuale_avanzamento integer default 0, lavoro_completato boolean default false, firma_cliente_url text,
      firma_cliente_nome text, pdf_url text, updated_at timestamptz default now());
    create function test_costo() returns trigger language plpgsql as $$ begin
      if new.stato='approvato' and old.stato is distinct from 'approvato' then
        update orders set costo=costo+100 where id=new.order_id;
      end if; return new; end $$;
    create trigger a_costo_test after update of stato on campo_rapportini for each row execute function test_costo();
    create function test_sottofase() returns trigger language plpgsql as $$ begin
      update order_work_phases set percentuale=(select round(100.0*count(*) filter(where fatta)/count(*)) from order_work_subphases where phase_id=new.phase_id)
      where id=new.phase_id; return new; end $$;
    create trigger test_sottofase after update on order_work_subphases for each row execute function test_sottofase();
    create function test_fase_errore() returns trigger language plpgsql as $$ begin
      if new.name='errore' and new.percentuale is distinct from old.percentuale then raise exception 'Errore simulato della fase'; end if; return new; end $$;
    create trigger test_fase_errore before update on order_work_phases for each row execute function test_fase_errore();
  `);
  const original = readFileSync(resolve(process.cwd(), "supabase/migrations/20281007141000_rapportino_applica_avanzamento.sql"), "utf8");
  await db.exec(original);
  // Interoperabilità delle due bozze, non solo test della singola funzione.
  const protocol = readFileSync(resolve(process.cwd(), "supabase/migrations/20281018180000_campo_rapportini_protocollo.sql"), "utf8");
  await db.exec(protocol);
  const pending = readFileSync(resolve(process.cwd(), "supabase/migrations-pending/campo_rapportini_collegamenti_atomici.sql"), "utf8");
  await db.exec(pending); await db.exec(pending);
}, 30000);
afterAll(() => db.close());
beforeEach(async () => {
  await db.exec(`truncate campo_rapportini, order_work_subphases, order_work_phases, order_items, warehouse_stock, orders;
    insert into orders(id,company_id) values('${o}','${c}'),('${otherO}','${c}');
    insert into order_work_phases(id,company_id,order_id,name) values('${p}','${c}','${o}','Posa'),('${otherP}','${c}','${otherO}','Posa');
    insert into order_items values('${item}','${o}'),('${otherItem}','${otherO}');
    insert into warehouse_stock values('${stock}','${c}'),('${otherStock}','${otherC}');`);
});
const create = async (phases: unknown = [], materials: unknown = [], extra = "") => {
  const r = await db.query<{ id: string }>(`insert into campo_rapportini(company_id,order_id,fasi_lavorate,materiali_usati ${extra ? "," + extra.split("|")[0] : ""})
    values($1,$2,$3,$4 ${extra ? "," + extra.split("|")[1] : ""}) returning id`, [c, o, JSON.stringify(phases), JSON.stringify(materials)]);
  return r.rows[0].id;
};
const approve = (id: string) => db.query("update campo_rapportini set stato='approvato',approvato=true where id=$1", [id]);
const phase = async () => (await db.query<{ percentuale: number }>("select percentuale from order_work_phases where id=$1", [p])).rows[0].percentuale;

describe("Collegamenti e approvazione, fixture PostgreSQL isolata", () => {
  it("applica la percentuale soltanto all'approvazione", async () => {
    const id = await create([{ phase_id: p, percentuale: 60 }]); expect(await phase()).toBe(0);
    await approve(id); expect(await phase()).toBe(60);
  });
  it("non abbassa un avanzamento successivo", async () => {
    const first = await create([{ phase_id: p, percentuale: 90 }]);
    const second = await create([{ phase_id: p, percentuale: 40 }]);
    await approve(first); await approve(second); expect(await phase()).toBe(90);
  });
  it("un errore di fase annulla anche approvazione e costi della stessa transazione", async () => {
    const id = await create([{ phase_id: p, percentuale: 60 }]);
    await db.query("update order_work_phases set name='errore' where id=$1", [p]);
    await expect(approve(id)).rejects.toThrow("Errore simulato della fase");
    expect((await db.query("select stato from campo_rapportini where id=$1", [id])).rows[0]).toEqual({ stato: "inviato" });
    expect((await db.query("select costo from orders where id=$1", [o])).rows[0]).toEqual({ costo: "0" });
    expect(await phase()).toBe(0);
  });
  it("se fallisce la seconda fase annulla anche l'avanzamento già applicato alla prima", async () => {
    await db.query("update order_work_phases set order_id=$2,name='errore' where id=$1", [otherP, o]);
    const id = await create([{ phase_id: p, percentuale: 40 }, { phase_id: otherP, percentuale: 60 }]);
    await expect(approve(id)).rejects.toThrow("Errore simulato della fase");
    expect(await phase()).toBe(0);
    expect((await db.query("select stato from campo_rapportini where id=$1", [id])).rows[0]).toEqual({ stato: "inviato" });
    expect((await db.query("select costo from orders where id=$1", [o])).rows[0]).toEqual({ costo: "0" });
  });
  it("rifiuta una fase di un'altra commessa anche quando ha lo stesso nome", async () => {
    await expect(create([{ phase_id: otherP, percentuale: 60 }])).rejects.toMatchObject({ code: "22023" });
  });
  it("controlla anche l'azienda della fase", async () => {
    await db.query("update order_work_phases set company_id=$2 where id=$1", [p, otherC]);
    await expect(create([{ phase_id: p, percentuale: 60 }])).rejects.toMatchObject({ code: "22023" });
  });
  it("controlla riferimenti a riga ordine e magazzino senza abbinamenti per nome", async () => {
    const base = { nome: "Malta", quantita: 2, unita: "kg" };
    await expect(create([], [{ ...base, order_item_id: otherItem }])).rejects.toMatchObject({ code: "22023" });
    await expect(create([], [{ ...base, stock_item_id: otherStock }])).rejects.toMatchObject({ code: "22023" });
    await expect(create([], [{ ...base, fase_id: otherP }])).rejects.toMatchObject({ code: "22023" });
    await create([], [{ ...base, order_item_id: item, stock_item_id: stock, fase_id: p }]);
  });
  it("mantiene i materiali liberi senza inventare articoli o movimenti", async () => {
    await create([], [{ nome: "Colla", quantita: 1, unita: "pz" }]);
    expect((await db.query("select count(*)::int as n from order_items")).rows[0]).toEqual({ n: 2 });
  });
  it.each([0, -1, "1,5", "abc", null])("non sostituisce la quantità non valida %s con un pezzo", async quantita => {
    await expect(create([], [{ nome: "Malta", quantita, unita: "kg" }])).rejects.toMatchObject({ code: "22023" });
  });
  it.each([101, -1, "NaN", true])("rifiuta l'avanzamento %s anziché correggerlo silenziosamente", async percentuale => {
    await expect(create([{ phase_id: p, percentuale }])).rejects.toMatchObject({ code: "22023" });
  });
  it("le sottofasi devono appartenere alla fase dichiarata", async () => {
    await db.exec(`insert into order_work_subphases(id,phase_id) values('${sub}','${p}'),('${otherSub}','${otherP}')`);
    await expect(create([{ phase_id: p, percentuale: 50, sottofasi_fatte: [otherSub] }])).rejects.toMatchObject({ code: "22023" });
    const id = await create([{ phase_id: p, percentuale: 50, sottofasi_fatte: [sub] }]); await approve(id);
    expect((await db.query("select fatta from order_work_subphases where id=$1", [sub])).rows[0]).toEqual({ fatta: true });
  });
  it("una fase con sottofasi senza spunte non usa la percentuale dichiarata", async () => {
    await db.exec(`insert into order_work_subphases(id,phase_id) values('${sub}','${p}')`);
    const id = await create([{ phase_id: p, percentuale: 90 }]); await approve(id); expect(await phase()).toBe(0);
  });
  it("un aggiornamento tecnico non applica una seconda volta costi o avanzamento", async () => {
    const id = await create([{ phase_id: p, percentuale: 40 }]); await approve(id);
    await db.query("update campo_rapportini set pdf_url='nuovo.pdf' where id=$1", [id]);
    expect((await db.query("select costo from orders where id=$1", [o])).rows[0]).toEqual({ costo: "100" });
    expect(await phase()).toBe(40);
  });
  it("blocca una modifica silenziosa del contenuto già approvato", async () => {
    const id = await create([{ phase_id: p, percentuale: 40 }]); await approve(id);
    await expect(db.query("update campo_rapportini set descrizione_lavori='Modificato' where id=$1", [id])).rejects.toMatchObject({ code: "22023" });
  });
  it.each([{}, "lista", [null], [{ phase_id: "non-un-id" }], [{ phase_id: p }, { phase_id: p }]])("rifiuta strutture o identità non valide %j", async phases => {
    await expect(create(phases)).rejects.toMatchObject({ code: "22023" });
  });
  it("anche una modifica successiva deve restare nella propria commessa", async () => {
    const id = await create([{ phase_id: p, percentuale: 40 }]);
    await expect(db.query("update campo_rapportini set fasi_lavorate=$2 where id=$1", [id, JSON.stringify([{ phase_id: otherP, percentuale: 40 }])])).rejects.toMatchObject({ code: "22023" });
  });
  it("controlla uno storico importato prima di approvarlo, ma lascia scaricare il PDF", async () => {
    const id = await create();
    // Simula solo nella fixture un dato storico già presente prima del nuovo trigger.
    await db.exec("alter table campo_rapportini disable trigger trg_campo_rapportino_collegamenti");
    await db.query("update campo_rapportini set fasi_lavorate=$2 where id=$1", [id, JSON.stringify([{ phase_id: otherP, percentuale: 40 }])]);
    await db.exec("alter table campo_rapportini enable trigger trg_campo_rapportino_collegamenti");
    await db.query("update campo_rapportini set pdf_url='storico.pdf' where id=$1", [id]);
    await expect(approve(id)).rejects.toMatchObject({ code: "22023" });
    expect((await db.query("select stato from campo_rapportini where id=$1", [id])).rows[0]).toEqual({ stato: "inviato" });
  });
  it("le vecchie voci senza percentuale restano utilizzabili", async () => {
    const id = await create([{ phase_id: p, ore: 8 }]); await approve(id); expect(await phase()).toBe(0);
  });
  it("una proposta generica senza fasi si applica atomicamente e soltanto in salita", async () => {
    const id = await create([], [], "percentuale_avanzamento|70"); await approve(id);
    expect((await db.query("select percentuale_avanzamento as p from orders where id=$1", [o])).rows[0]).toEqual({ p: 70 });
    const second = await create([], [], "percentuale_avanzamento|30"); await approve(second);
    expect((await db.query("select percentuale_avanzamento as p from orders where id=$1", [o])).rows[0]).toEqual({ p: 70 });
  });
  it("una firma cliente non applica l'avanzamento del giornaliero", async () => {
    const id = await create([{ phase_id: p, percentuale: 90 }], [], "firma_cliente_url|'firma-storica.png'");
    await approve(id); expect(await phase()).toBe(0);
  });
  it("ritentare l'approvazione dopo un errore conta una sola volta gli effetti transazionali", async () => {
    const id = await create([{ phase_id: p, percentuale: 60 }]);
    await db.query("update order_work_phases set name='errore' where id=$1", [p]);
    await expect(approve(id)).rejects.toThrow("Errore simulato della fase");
    await db.query("update order_work_phases set name='Posa' where id=$1", [p]);
    await approve(id); await approve(id);
    expect(await phase()).toBe(60);
    expect((await db.query("select costo from orders where id=$1", [o])).rows[0]).toEqual({ costo: "100" });
  });
  it("la funzione non è richiamabile dai client e limita l'attesa dei lock", async () => {
    const r = await db.query<{ allowed: boolean; proconfig: string[] }>(`select has_function_privilege('authenticated', 'public.fn_rapportino_applica_avanzamento()', 'execute') as allowed,
      proconfig from pg_proc where oid='public.fn_rapportino_applica_avanzamento()'::regprocedure`);
    expect(r.rows[0].allowed).toBe(false); expect(r.rows[0].proconfig).toContain("lock_timeout=3s");
  });
  it("non lascia due trigger concorrenti ad applicare l'avanzamento", async () => {
    const r = await db.query<{ tgname: string }>(`select tgname from pg_trigger where tgrelid='public.campo_rapportini'::regclass
      and tgname in ('trg_rapportino_applica_avanzamento','trg_campo_rapportino_avanzamento_approvato')`);
    expect(r.rows).toEqual([{ tgname: "trg_rapportino_applica_avanzamento" }]);
  });
  it("le helper e le verifiche non sono endpoint pubblici", async () => {
    const result = await db.query<{ n: number }>(`select count(*)::int as n from pg_proc p join pg_namespace s on s.oid=p.pronamespace
      where s.nspname='public' and p.proname in ('campo_rapportino_uuid_collegamento','campo_rapportino_verifica_collegamenti','fn_rapportino_applica_avanzamento')
      and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute'))`);
    expect(result.rows[0].n).toBe(0);
  });
});
