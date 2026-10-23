import { existsSync, readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

/**
 * acquisti_materiali_da_ordinare: la lettura dell'ufficio acquisti sul motore
 * PostgreSQL vero (PGlite), sopra le due migrazioni dei materiali per fase.
 * order_items tiene le regole di produzione (serve il permesso sulle
 * commesse): chi ha solo «Ufficio acquisti» legge i materiali validati
 * soltanto attraverso la funzione, e soltanto i campi della pipeline.
 *
 * La migrazione è in supabase/migrations-pending finché non viene applicata;
 * dopo, la si cerca in supabase/migrations.
 */
const NOME = "20281023120000_acquisti_materiali_da_ordinare_lettura.sql";
const percorso = [`supabase/migrations/${NOME}`, `supabase/migrations-pending/${NOME}`].find((p) => existsSync(p))!;
const migrazione = readFileSync(percorso, "utf8");
const migrazioni = [
  "supabase/migrations/20281023011000_materiali_per_fase_base_dati.sql",
  "supabase/migrations/20281023012000_materiali_per_fase_validazione_e_acquisti.sql",
].map((f) => readFileSync(f, "utf8")).join("\n");

const A = "a0000000-0000-0000-0000-000000000001";
const B = "a0000000-0000-0000-0000-000000000002";
const ADMIN = "10000000-0000-0000-0000-000000000001";
const ACQUISTI = "10000000-0000-0000-0000-000000000002"; // solo «Ufficio acquisti»
const NESSUNO = "10000000-0000-0000-0000-000000000003"; // staff senza permessi
const VEDE = "10000000-0000-0000-0000-000000000004"; // solo «vede le commesse»
const ESTRANEO = "10000000-0000-0000-0000-000000000005"; // amministratore di B
const CLIENTE = "10000000-0000-0000-0000-000000000006"; // cliente esterno di A
const ASSEGNATI = "10000000-0000-0000-0000-000000000007"; // acquisti, solo commesse assegnate
const SUPER = "10000000-0000-0000-0000-000000000008";
const C1 = "c0000000-0000-0000-0000-000000000001";
const C2 = "c0000000-0000-0000-0000-000000000002";
const C_CESTINO = "c0000000-0000-0000-0000-000000000003";
const C_B = "c0000000-0000-0000-0000-000000000004";
const F_VALIDATA = "e0000000-0000-0000-0000-000000000001";
const F_BOZZA = "e0000000-0000-0000-0000-000000000002";
const F_C2 = "e0000000-0000-0000-0000-000000000003";
const F_CESTINO = "e0000000-0000-0000-0000-000000000004";
const F_B = "e0000000-0000-0000-0000-000000000005";

const schema = `
create schema auth;
create role anon; create role authenticated; create role service_role;
create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.user',true),'')::uuid$$;
create type app_role as enum ('super_admin','company_admin','company_staff','customer');
create table companies(id uuid primary key);
create table profiles(id uuid primary key, company_id uuid, is_blocked boolean default false);
create table user_roles(id uuid primary key default gen_random_uuid(), user_id uuid, role app_role);
create table multi_company_access(user_id uuid, company_id uuid, status text, expires_at timestamptz, access_role text);
create table staff_permissions(user_id uuid, company_id uuid, sola_lettura boolean default false,
  can_view_orders boolean default false, can_edit_orders boolean default false, only_assigned boolean default false);
create function has_role(u uuid, r app_role) returns boolean language sql stable as $$select exists(select 1 from user_roles where user_id=u and role=r)$$;
create function get_user_company_id(u uuid) returns uuid language sql stable as $$select company_id from profiles where id=u$$;
create function chiamante_anonimo() returns boolean language sql stable as $$select auth.uid() is null$$;
create function utente_bloccato() returns boolean language sql stable security definer as $$select coalesce((select is_blocked from profiles where id=auth.uid()),false)$$;
create function utente_e_cliente_esterno() returns boolean language sql stable security definer as $$
  select exists (select 1 from user_roles ur where ur.user_id = auth.uid() and ur.role = 'customer')
     and not exists (select 1 from user_roles ur where ur.user_id = auth.uid() and ur.role <> 'customer')$$;
-- Azienda in cui si lavora: quella scelta (test.azienda) se ammessa, altrimenti la propria.
create function get_effective_company_id() returns uuid language sql stable security definer as $$
  select coalesce(
    (select nullif(current_setting('test.azienda', true), '')::uuid where exists (
       select 1 from multi_company_access m where m.user_id = auth.uid()
          and m.company_id = nullif(current_setting('test.azienda', true), '')::uuid and m.status = 'active')),
    (select company_id from profiles where id = auth.uid()))$$;
-- Come in produzione per «solo le commesse assegnate» (il magazzino non serve qui).
create function can_see_order(_order_id uuid, _assigned_to uuid, _warehouse_id uuid default null) returns boolean
  language plpgsql stable security definer as $$
declare solo boolean;
begin
  if has_role(auth.uid(), 'super_admin') or (has_role(auth.uid(), 'company_admin') and get_effective_company_id() = get_user_company_id(auth.uid())) then
    return true;
  end if;
  select bool_or(only_assigned) into solo from staff_permissions where user_id = auth.uid() and company_id = get_effective_company_id();
  if coalesce(solo, false) then return _assigned_to = auth.uid(); end if;
  return true;
end $$;
${readFileSync("src/test/fixtures/moduleCompanyPermission.sql", "utf8")}
create table orders(id uuid primary key, company_id uuid, order_code text, assigned_to uuid, destination_warehouse_id uuid,
  deleted_at timestamptz, total_amount numeric, customer_name text);
create table order_work_phases(id uuid primary key default gen_random_uuid(), company_id uuid not null, order_id uuid not null references orders(id) on delete cascade,
  name text not null, position int not null default 0);
create table computo_uploads(id uuid primary key default gen_random_uuid(), company_id uuid);
create table computo_voci_estratte(id uuid primary key default gen_random_uuid(), company_id uuid);
create table article_templates(id uuid primary key default gen_random_uuid(), company_id uuid, prezzo_acquisto_netto numeric, standard_cost numeric, vat_rate numeric);
create table suppliers(id uuid primary key, company_id uuid);
create table order_attachments(id uuid primary key default gen_random_uuid(), order_id uuid);
create table order_items(id uuid primary key default gen_random_uuid(), order_id uuid not null references orders(id) on delete cascade,
  name text not null, description text, quantity integer default 1, status text default 'da_ordinare', position int default 0,
  supplier_id uuid, purchase_price numeric default 0, unit_price numeric default 0, discount numeric default 0, vat_rate numeric default 22,
  stock_item_id uuid, posizioni jsonb, article_template_id uuid, categoria text,
  phase_id uuid references order_work_phases(id) on delete set null, quantity_received integer default 0,
  natura_riga text not null default 'materiale');
alter table order_items enable row level security;
alter table orders enable row level security;
alter table order_work_phases enable row level security;
create policy oi_legge on order_items for select to authenticated
  using (has_permission_for_company(auth.uid(), 'can_view_orders', (select company_id from orders o where o.id = order_id)));
create policy o_legge on orders for select to authenticated using (has_permission_for_company(auth.uid(), 'can_view_orders', company_id));
create policy w_legge on order_work_phases for select to authenticated using (has_permission_for_company(auth.uid(), 'can_view_orders', company_id));
create table purchase_orders(id uuid primary key default gen_random_uuid(), company_id uuid, supplier_id uuid, order_id uuid,
  status text default 'bozza', oda_number text);
create table purchase_order_items(id uuid primary key default gen_random_uuid(), company_id uuid,
  purchase_order_id uuid references purchase_orders(id) on delete cascade, order_item_id uuid, description text, quantity numeric);
create table supplier_rfqs(id uuid primary key default gen_random_uuid(), company_id uuid, rfq_number text default 'RDO-1', titolo text not null,
  descrizione text, order_id uuid, scadenza_offerte date, status text not null default 'bozza', created_by uuid);
create table supplier_rfq_items(id uuid primary key default gen_random_uuid(), rfq_id uuid references supplier_rfqs(id) on delete cascade, company_id uuid,
  descrizione text not null, quantita numeric not null, unita_misura text, article_template_id uuid, note text, posizione int not null default 0);
create table supplier_rfq_suppliers(id uuid primary key default gen_random_uuid(), rfq_id uuid, company_id uuid, supplier_id uuid);
create table notifications(id uuid primary key default gen_random_uuid(), company_id uuid not null, user_id uuid not null, type text not null,
  title text not null, body text, entity_type text, entity_id uuid, action_url text, is_read boolean default false);
grant usage on schema auth to authenticated, anon, service_role;
grant all on all tables in schema public to authenticated, service_role;
`;

const RFQ = "d0000000-0000-0000-0000-000000000001";
const RFQ_ITEM = "d1000000-0000-0000-0000-000000000001";
const seme = `
insert into companies values ('${A}'), ('${B}');
insert into profiles(id, company_id) values ('${ADMIN}','${A}'), ('${ACQUISTI}','${A}'), ('${NESSUNO}','${A}'), ('${VEDE}','${A}'),
  ('${ESTRANEO}','${B}'), ('${CLIENTE}','${A}'), ('${ASSEGNATI}','${A}'), ('${SUPER}','${B}');
insert into user_roles(user_id, role) values ('${ADMIN}','company_admin'), ('${ACQUISTI}','company_staff'), ('${NESSUNO}','company_staff'),
  ('${VEDE}','company_staff'), ('${ESTRANEO}','company_admin'), ('${CLIENTE}','customer'), ('${ASSEGNATI}','company_staff'), ('${SUPER}','super_admin');
insert into staff_permissions(user_id, company_id, can_view_orders, can_manage_purchasing, only_assigned) values
  ('${ACQUISTI}','${A}', false, true, false),
  ('${NESSUNO}','${A}', false, false, false),
  ('${VEDE}','${A}', true, false, false),
  ('${ASSEGNATI}','${A}', false, true, true);
insert into orders(id, company_id, order_code, assigned_to, deleted_at, total_amount, customer_name) values
  ('${C1}','${A}','C-001', null, null, 100000, 'Comune di Prova'),
  ('${C2}','${A}','C-002', '${ASSEGNATI}', null, 50000, 'Privato'),
  ('${C_CESTINO}','${A}','C-003', null, now(), 1, 'Cestino'),
  ('${C_B}','${B}','B-001', null, null, 1, 'Altra azienda');
insert into order_work_phases(id, company_id, order_id, name, position) values
  ('${F_VALIDATA}','${A}','${C1}','Impianto elettrico',1), ('${F_BOZZA}','${A}','${C1}','Opere murarie',2),
  ('${F_C2}','${A}','${C2}','Idraulica',1), ('${F_CESTINO}','${A}','${C_CESTINO}','Fase cestino',1), ('${F_B}','${B}','${C_B}','Fase B',1);
insert into supplier_rfqs(id, company_id, titolo) values ('${RFQ}','${A}','Cavi');
insert into supplier_rfq_items(id, rfq_id, company_id, descrizione, quantita) values ('${RFQ_ITEM}','${RFQ}','${A}','Cavo',100);
insert into order_items(order_id, phase_id, name, quantity, purchase_price, unit_price, natura_riga, position, supplier_rfq_item_id) values
  ('${C1}','${F_VALIDATA}','Cavo FS17', 100, 0.8, 2.5, 'materiale', 1, '${RFQ_ITEM}'),
  ('${C1}','${F_VALIDATA}','Scatola 503', 37, 0.3, 1.2, 'materiale', 2, null),
  ('${C1}','${F_VALIDATA}','Posa cavi', 1, 0, 900, 'lavorazione', 3, null),
  ('${C1}','${F_BOZZA}','Malta', 250, 0.1, 0.4, 'materiale', 1, null),
  ('${C2}','${F_C2}','Tubo multistrato', 50, 2, 5, 'materiale', 1, null),
  ('${C_CESTINO}','${F_CESTINO}','Materiale nel cestino', 1, 1, 1, 'materiale', 1, null),
  ('${C_B}','${F_B}','Materiale di B', 1, 1, 1, 'materiale', 1, null);
insert into materiali_fasi_validazione(phase_id, stato) values
  ('${F_VALIDATA}','validata'), ('${F_BOZZA}','bozza'), ('${F_C2}','validata'), ('${F_CESTINO}','validata'), ('${F_B}','validata');
`;

let db: PGlite;
beforeAll(async () => {
  db = new PGlite();
  await db.exec(schema);
  await db.exec("begin;" + migrazioni + ";commit;");
  await db.exec("begin;" + migrazione + ";commit;");
  // Idempotente: una seconda applicazione non deve fallire.
  await db.exec("begin;" + migrazione + ";commit;");
}, 120_000);
afterAll(async () => db?.close());
beforeEach(async () => { await db.exec("begin;" + seme); });
afterEach(async () => { await db.exec("rollback"); });

async function come(utente: string | null, azienda: string | null = null) {
  await db.exec("reset role");
  await db.query("select set_config('test.user', $1, true)", [utente ?? ""]);
  await db.query("select set_config('test.azienda', $1, true)", [azienda ?? ""]);
  await db.exec(utente ? "set local role authenticated" : "set local role anon");
}
/** Il proprietario delle tabelle, per preparare i dati della prova. */
async function sistema() {
  await db.exec("reset role");
  await db.query("select set_config('test.user', '', true)");
}
async function q<T = Record<string, unknown>>(sql: string, params: unknown[] = []) {
  return (await db.query<T>(sql, params)).rows;
}
const leggi = (azienda = A) =>
  q<Record<string, unknown> & { name: string }>(`select * from acquisti_materiali_da_ordinare($1)`, [azienda]);
const nomi = async (azienda = A) => (await leggi(azienda)).map((r) => r.name);

describe("acquisti_materiali_da_ordinare", () => {
  it("solo «Ufficio acquisti»: le tabelle delle commesse restano chiuse, la funzione dà i materiali validati", async () => {
    await come(ACQUISTI);
    expect(await q(`select id from order_items`)).toHaveLength(0);
    expect(await q(`select id from orders`)).toHaveLength(0);
    expect(await nomi()).toEqual(["Cavo FS17", "Scatola 503", "Tubo multistrato"]);
  });

  it("niente bozze, niente lavorazioni, niente cestino, niente altre aziende", async () => {
    await come(ACQUISTI);
    const n = await nomi();
    for (const escluso of ["Malta", "Posa cavi", "Materiale nel cestino", "Materiale di B"]) expect(n).not.toContain(escluso);
    expect(await nomi(B)).toEqual([]);
  });

  it("solo i campi della pipeline: niente prezzi di vendita, sconti, totali o cliente", async () => {
    await come(ACQUISTI);
    const [cavo] = await leggi();
    expect(Object.keys(cavo).sort()).toEqual([
      "commessa", "description", "fase", "id", "locale", "name", "order_id", "origine_materiale", "origini", "phase_id",
      "posizione_fase", "posizioni", "purchase_price", "quantita_calcolata", "quantity", "rfq_id", "specifiche", "status",
      "stock_item_id", "supplier_id", "supplier_rfq_item_id", "unita_misura", "vat_rate",
    ]);
    expect([cavo.commessa, cavo.fase, cavo.posizione_fase, cavo.rfq_id]).toEqual(["C-001", "Impianto elettrico", 1, RFQ]);
  });

  it("senza permessi, cliente esterno, utente bloccato: niente", async () => {
    await come(NESSUNO);
    expect(await leggi()).toEqual([]);
    await come(CLIENTE);
    expect(await leggi()).toEqual([]);
    await sistema();
    await q(`update profiles set is_blocked = true where id = $1`, [ACQUISTI]);
    await come(ACQUISTI);
    expect(await leggi()).toEqual([]);
  });

  it("l'amministratore di un'altra azienda non legge A, nemmeno passando il suo id", async () => {
    await come(ESTRANEO);
    expect(await leggi(A)).toEqual([]);
    expect(await nomi(B)).toEqual(["Materiale di B"]);
  });

  it("l'azienda deve essere quella in cui si lavora; con un accesso multi-azienda attivo sì", async () => {
    await sistema();
    await q(`insert into staff_permissions(user_id, company_id, can_manage_purchasing) values ($1, $2, true)`, [ACQUISTI, B]);
    await come(ACQUISTI);
    expect(await leggi(B)).toEqual([]);
    await sistema();
    await q(`insert into multi_company_access values ($1, $2, 'active', null, 'company_staff')`, [ACQUISTI, B]);
    await come(ACQUISTI, B);
    expect(await nomi(B)).toEqual(["Materiale di B"]);
    expect(await leggi(A)).toEqual([]);
  });

  it("continua a funzionare: amministratore, chi vede le commesse, super admin", async () => {
    await come(ADMIN);
    expect(await nomi()).toEqual(["Cavo FS17", "Scatola 503", "Tubo multistrato"]);
    await come(VEDE);
    expect(await nomi()).toEqual(["Cavo FS17", "Scatola 503", "Tubo multistrato"]);
    await come(SUPER);
    expect(await nomi()).toEqual(["Cavo FS17", "Scatola 503", "Tubo multistrato"]);
  });

  it("«solo le commesse assegnate» vale anche qui", async () => {
    await come(ASSEGNATI);
    expect(await nomi()).toEqual(["Tubo multistrato"]);
  });

  it("anon non la può chiamare", async () => {
    await come(null);
    await db.exec("savepoint prova");
    await expect(q(`select * from acquisti_materiali_da_ordinare($1)`, [A])).rejects.toThrow(/permission denied/);
    await db.exec("rollback to savepoint prova");
  });
});

describe("la migrazione", () => {
  it("è idempotente, chiusa ad anon e non cambia le regole delle tabelle", () => {
    expect(migrazione).toMatch(/SET LOCAL lock_timeout = '3s'/);
    expect(migrazione).toMatch(/CREATE OR REPLACE FUNCTION public\.acquisti_materiali_da_ordinare\(p_company uuid\)/);
    expect(migrazione).toMatch(/REVOKE ALL ON FUNCTION public\.acquisti_materiali_da_ordinare\(uuid\) FROM PUBLIC, anon;/);
    expect(migrazione).toMatch(/GRANT EXECUTE ON FUNCTION public\.acquisti_materiali_da_ordinare\(uuid\) TO authenticated, service_role;/);
    expect(migrazione).toMatch(/can_see_order\(o\.id, o\.assigned_to, o\.destination_warehouse_id\)/);
    expect(migrazione).toMatch(/utente_bloccato\(\) or public\.utente_e_cliente_esterno\(\)/);
    expect(migrazione).toMatch(/get_effective_company_id\(\)/);
    expect(migrazione).not.toMatch(/\bunit_price\b|\bdiscount\b|\btotal_amount\b|\bcustomer_/);
    expect(migrazione).not.toMatch(/CREATE POLICY|ALTER POLICY/);
  });

  it("il hook legge dalla funzione, non dalle tabelle delle commesse", () => {
    const hook = readFileSync("src/hooks/useAcquistiDaOrdinare.ts", "utf8");
    expect(hook).toContain('supabase.rpc("acquisti_materiali_da_ordinare" as never');
    expect(hook).not.toMatch(/from\("order_items"\)|from\("orders"\)|from\("order_work_phases"\)/);
  });
});
