import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

/**
 * Le due migrazioni dei materiali per fase sul motore PostgreSQL vero
 * (PGlite): tabelle, trigger, RLS e funzioni come andranno in produzione.
 * Attorno, le tabelle esistenti ridotte alle colonne che servono, con le
 * stesse regole di accesso di produzione per order_items.
 */
const migrazioni = [
  "supabase/migrations/20281023011000_materiali_per_fase_base_dati.sql",
  "supabase/migrations/20281023012000_materiali_per_fase_validazione_e_acquisti.sql",
].map((f) => readFileSync(f, "utf8")).join("\n");

const A = "a0000000-0000-0000-0000-000000000001";
const B = "a0000000-0000-0000-0000-000000000002";
const ADMIN = "10000000-0000-0000-0000-000000000001";
const UFFICIO = "10000000-0000-0000-0000-000000000002";
const TECNICO = "10000000-0000-0000-0000-000000000003";
const ACQUISTI = "10000000-0000-0000-0000-000000000004";
const ESTRANEO = "10000000-0000-0000-0000-000000000005";
const COMMESSA = "c0000000-0000-0000-0000-000000000001";
const FASE_EL = "e0000000-0000-0000-0000-000000000001";
const FASE_MUR = "e0000000-0000-0000-0000-000000000002";
const FORNITORE = "f0000000-0000-0000-0000-000000000001";

export const schemaMateriali = `
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
  can_view_orders boolean default false, can_edit_orders boolean default false);
create function has_role(u uuid, r app_role) returns boolean language sql stable as $$select exists(select 1 from user_roles where user_id=u and role=r)$$;
create function get_user_company_id(u uuid) returns uuid language sql stable as $$select company_id from profiles where id=u$$;
create function chiamante_anonimo() returns boolean language sql stable as $$select auth.uid() is null$$;
create function utente_bloccato() returns boolean language sql stable as $$select coalesce((select is_blocked from profiles where id=auth.uid()),false)$$;
create function utente_e_cliente_esterno() returns boolean language sql stable as $$select false$$;
${readFileSync("src/test/fixtures/moduleCompanyPermission.sql", "utf8")}
create table orders(id uuid primary key, company_id uuid, order_code text);
create table order_work_phases(id uuid primary key default gen_random_uuid(), company_id uuid not null, order_id uuid not null references orders(id) on delete cascade,
  name text not null, position int not null default 0);
create table computo_uploads(id uuid primary key default gen_random_uuid(), company_id uuid);
create table computo_voci_estratte(id uuid primary key default gen_random_uuid(), company_id uuid);
create table article_templates(id uuid primary key default gen_random_uuid(), company_id uuid, prezzo_acquisto_netto numeric, standard_cost numeric, vat_rate numeric);
create table suppliers(id uuid primary key, company_id uuid);
create table order_attachments(id uuid primary key default gen_random_uuid(), order_id uuid);
create table order_items(id uuid primary key default gen_random_uuid(), order_id uuid not null references orders(id) on delete cascade,
  name text not null, description text, quantity integer default 1, status text default 'da_ordinare', position int default 0,
  supplier_id uuid, purchase_price numeric default 0, article_template_id uuid, categoria text,
  phase_id uuid references order_work_phases(id) on delete set null, quantity_received integer default 0,
  natura_riga text not null default 'materiale');
alter table order_items enable row level security;
create policy oi_scrive on order_items for all to authenticated
  using (has_permission_for_company(auth.uid(), 'can_edit_orders', (select company_id from orders o where o.id = order_id)))
  with check (has_permission_for_company(auth.uid(), 'can_edit_orders', (select company_id from orders o where o.id = order_id)));
create policy oi_legge on order_items for select to authenticated
  using (has_permission_for_company(auth.uid(), 'can_view_orders', (select company_id from orders o where o.id = order_id)));
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

const seme = `
insert into companies values ('${A}'), ('${B}');
insert into auth.users values ('${ADMIN}'), ('${UFFICIO}'), ('${TECNICO}'), ('${ACQUISTI}'), ('${ESTRANEO}');
insert into profiles(id, company_id) values ('${ADMIN}','${A}'), ('${UFFICIO}','${A}'), ('${TECNICO}','${A}'), ('${ACQUISTI}','${A}'), ('${ESTRANEO}','${B}');
insert into user_roles(user_id, role) values ('${ADMIN}','company_admin'), ('${UFFICIO}','company_staff'), ('${TECNICO}','company_staff'),
  ('${ACQUISTI}','company_staff'), ('${ESTRANEO}','company_admin');
insert into staff_permissions(user_id, company_id, can_view_orders, can_edit_orders, can_validate_bom, can_manage_purchasing) values
  ('${UFFICIO}','${A}', true, true, false, false),
  ('${TECNICO}','${A}', true, false, true, false),
  ('${ACQUISTI}','${A}', true, false, false, true);
insert into orders values ('${COMMESSA}','${A}','C-2028-001');
insert into order_work_phases(id, company_id, order_id, name, position) values
  ('${FASE_EL}','${A}','${COMMESSA}','Impianto elettrico',1), ('${FASE_MUR}','${A}','${COMMESSA}','Opere murarie',2);
insert into suppliers values ('${FORNITORE}','${A}');
`;

let db: PGlite;
beforeAll(async () => {
  db = new PGlite();
  await db.exec(schemaMateriali);
  await db.exec("begin;" + migrazioni + ";commit;");
  // Idempotente: una seconda applicazione non deve fallire.
  await db.exec("begin;" + migrazioni + ";commit;");
}, 120_000);
afterAll(async () => db?.close());
beforeEach(async () => { await db.exec("begin;" + seme); });
afterEach(async () => { await db.exec("rollback"); });

async function come(utente: string | null) {
  await db.exec("reset role");
  await db.query("select set_config('test.user', $1, true)", [utente ?? ""]);
  if (utente) await db.exec("set local role authenticated");
}
async function fallisce(fn: () => Promise<unknown>, atteso?: RegExp) {
  await db.exec("savepoint prova");
  let errore: unknown = null;
  try { await fn(); } catch (e) { errore = e; }
  await db.exec("rollback to savepoint prova");
  expect(errore, "doveva fallire").not.toBeNull();
  if (atteso) expect(String((errore as Error).message)).toMatch(atteso);
}
async function q<T = Record<string, unknown>>(sql: string, params: unknown[] = []) {
  return (await db.query<T>(sql, params)).rows;
}
const righeGenerate = (extra: Record<string, unknown>[] = []) => JSON.stringify([
  { chiave: "scatola 503|pz||computo", descrizione: "Scatola 503", unita_misura: "pz", quantita_netta: 37, quantita_calcolata: 37, origine: "computo", origini: [], phase_id: FASE_EL },
  { chiave: "cavo fs17|m|450/750 v|computo", descrizione: "Cavo FS17 1x2,5", specifiche: "450/750 V", unita_misura: "m", quantita_netta: 666, quantita_calcolata: 732.6, sfrido: 10, origine: "computo", origini: [], phase_id: FASE_EL },
  { chiave: "malta|kg||computo", descrizione: "Malta cementizia", unita_misura: "kg", quantita_calcolata: 250, origine: "computo", phase_id: FASE_MUR },
  ...extra,
]);
async function genera(righe = righeGenerate()) {
  await come(UFFICIO);
  return (await q<{ r: { inserite: number; sostituite: number } }>(`select materiali_salva_generazione($1, $2::jsonb, '[{"motivo":"Oneri"}]'::jsonb, '[]'::jsonb, null) r`, [COMMESSA, righe]))[0].r;
}
async function stato(fase: string, azione: string, nota: string | null = null) {
  return (await q<{ stato: string; validata_da: string | null }>(`select * from materiali_fase_cambia_stato($1,$2,$3)`, [fase, azione, nota]))[0];
}
const materiali = (fase: string) => q<{ id: string; name: string; quantity: number; unita_misura: string; quantita_calcolata: string }>(
  `select id, name, quantity, unita_misura, quantita_calcolata from order_items where phase_id=$1 order by name`, [fase]);

describe("generazione: materiali della commessa nella fase giusta", () => {
  it("scrive order_items da ordinare con unità, specifiche e quantità intera per eccesso; registra la generazione", async () => {
    const r = await genera();
    expect(r.inserite).toBe(3);
    const el = await materiali(FASE_EL);
    expect(el.map((m) => [m.name, m.quantity, m.unita_misura, Number(m.quantita_calcolata)])).toEqual([
      ["Cavo FS17 1x2,5", 733, "m", 732.6],
      ["Scatola 503", 37, "pz", 37],
    ]);
    expect((await q<{ escluse: unknown[] }>(`select escluse from materiali_generazioni`))[0].escluse).toEqual([{ motivo: "Oneri" }]);
  });

  it("rigenerando sostituisce le righe generate, tiene le manuali e le quantità cambiate a mano", async () => {
    await genera();
    await q(`update order_items set quantity = 800 where name = 'Cavo FS17 1x2,5'`);
    await q(`insert into order_items(order_id, name, quantity, phase_id) values ($1,'Nastro isolante',10,$2)`, [COMMESSA, FASE_EL]);
    const r = await genera();
    expect([r.inserite, r.sostituite]).toEqual([3, 3]);
    expect((await materiali(FASE_EL)).map((m) => [m.name, m.quantity])).toEqual([
      ["Cavo FS17 1x2,5", 800], ["Nastro isolante", 10], ["Scatola 503", 37],
    ]);
  });

  it("una riga generata già in un ordine non si raddoppia né si cancella", async () => {
    await genera();
    await come(null);
    const [po] = await q<{ id: string }>(`insert into purchase_orders(company_id, supplier_id, order_id) values ($1,$2,$3) returning id`, [A, FORNITORE, COMMESSA]);
    await q(`insert into purchase_order_items(purchase_order_id, order_item_id, quantity) select $1, id, quantity from order_items where name='Scatola 503'`, [po.id]);
    const r = await genera();
    expect(r.inserite).toBe(2);
    expect((await materiali(FASE_EL)).filter((m) => m.name === "Scatola 503")).toHaveLength(1);
  });

  it("chi non modifica le commesse non genera; un'altra azienda nemmeno", async () => {
    await come(TECNICO);
    await fallisce(() => q(`select materiali_salva_generazione($1, $2::jsonb)`, [COMMESSA, righeGenerate()]), /row-level security/);
    await come(ESTRANEO);
    await fallisce(() => q(`select materiali_salva_generazione($1, $2::jsonb)`, [COMMESSA, righeGenerate()]), );
  });
});

describe("validazione del tecnico per fase", () => {
  it("bozza → da validare → validata, con chi e quando, e le notifiche giuste", async () => {
    await genera();
    expect((await stato(FASE_EL, "invia_validazione")).stato).toBe("da_validare");
    await come(null);
    expect((await q<{ user_id: string }>(`select user_id from notifications where title='Materiali da validare' order by user_id`)).map((n) => n.user_id))
      .toEqual([ADMIN, TECNICO]);

    // In verifica: l'ufficio non tocca le quantità; il tecnico sì (con la sua funzione).
    await come(UFFICIO);
    await fallisce(() => q(`update order_items set quantity = 1 where phase_id=$1`, [FASE_EL]), /in verifica/);
    await fallisce(() => stato(FASE_EL, "valida"), /Solo chi valida/);
    await come(TECNICO);
    const scatola = (await materiali(FASE_EL)).find((m) => m.name === "Scatola 503")!;
    await q(`select materiali_tecnico_aggiorna($1, 40, 'IP40')`, [scatola.id]);
    const v = await stato(FASE_EL, "valida");
    expect([v.stato, v.validata_da]).toEqual(["validata", TECNICO]);

    // Validata: niente quantità, niente righe nuove; il fornitore sì.
    await come(UFFICIO);
    await fallisce(() => q(`update order_items set quantity = 1 where id=$1`, [scatola.id]), /validati/);
    await fallisce(() => q(`insert into order_items(order_id, name, phase_id) values ($1,'Altro',$2)`, [COMMESSA, FASE_EL]), /validati/);
    await q(`update order_items set supplier_id=$2 where id=$1`, [scatola.id, FORNITORE]);
    // L'altra fase resta libera.
    await q(`update order_items set quantity = 300 where phase_id=$1`, [FASE_MUR]);

    await come(null);
    expect((await q<{ user_id: string }>(`select user_id from notifications where title='Materiali validati da acquistare' order by user_id`)).map((n) => n.user_id))
      .toEqual([ADMIN, ACQUISTI]);
    expect((await q<{ user_id: string }>(`select user_id from notifications where title='Materiali validati'`)).map((n) => n.user_id)).toEqual([UFFICIO]);
  });

  it("non si saltano stati, lo stato non si scrive a mano, il rimando vuole una nota", async () => {
    await genera();
    await come(TECNICO);
    await fallisce(() => stato(FASE_EL, "valida"), /inviati al tecnico/);
    await come(UFFICIO);
    await stato(FASE_EL, "invia_validazione");
    await fallisce(() => q(`update materiali_fasi_validazione set stato='validata'`), /permission denied/);
    await come(TECNICO);
    await fallisce(() => stato(FASE_EL, "rimanda"), /nota/);
    expect((await stato(FASE_EL, "rimanda", "Mancano le cassette 294x152")).stato).toBe("bozza");
    await come(null);
    expect((await q<{ body: string }>(`select body from notifications where title='Materiali da correggere'`))[0].body).toContain("cassette");
  });

  it("rigenerare una fase validata non si può; una fase vuota non si invia", async () => {
    await genera();
    await stato(FASE_EL, "invia_validazione");
    await fallisce(() => genera(), /Impianto elettrico/);
    await come(null);
    await q(`insert into order_work_phases(id, company_id, order_id, name) values (gen_random_uuid(), $1, $2, 'Vuota')`, [A, COMMESSA]);
    const [vuota] = await q<{ id: string }>(`select id from order_work_phases where name='Vuota'`);
    await come(UFFICIO);
    await fallisce(() => stato(vuota.id, "invia_validazione"), /non ha materiali/);
  });

  it("cancellare la commessa porta via fasi e materiali anche se validati", async () => {
    await genera();
    await stato(FASE_EL, "invia_validazione");
    await come(null);
    await q(`delete from orders where id=$1`, [COMMESSA]);
    expect(await q(`select * from order_items`)).toHaveLength(0);
  });

  it("anon non esegue le funzioni; un'altra azienda non vede la fase", async () => {
    await come(ESTRANEO);
    await fallisce(() => stato(FASE_EL, "invia_validazione"), /non trovata/);
    await db.exec("reset role; set local role anon");
    await fallisce(() => q(`select materiali_fase_cambia_stato($1,'valida',null)`, [FASE_EL]), /permission denied/);
    await db.exec("reset role");
  });
});

describe("ufficio acquisti", () => {
  async function validata() {
    await genera();
    await stato(FASE_EL, "invia_validazione");
    await come(TECNICO);
    await stato(FASE_EL, "valida");
    await come(ACQUISTI);
    return (await materiali(FASE_EL)).map((m) => m.id);
  }

  it("assegna il fornitore e chiede l'offerta sui materiali validati, collegandoli", async () => {
    const ids = await validata();
    expect((await q<{ n: number }>(`select acquisti_assegna_fornitore($1::uuid[], $2) n`, [ids, FORNITORE]))[0].n).toBe(2);
    const [{ rfq }] = await q<{ rfq: string }>(`select acquisti_richiedi_offerta($1::uuid[], 'Materiale elettrico', $2::uuid[], null) rfq`, [ids, [FORNITORE]]);
    const voci = await q<{ descrizione: string; quantita: string; unita_misura: string; note: string | null }>(
      `select descrizione, quantita, unita_misura, note from supplier_rfq_items where rfq_id=$1 order by descrizione`, [rfq]);
    expect(voci.map((v) => [v.descrizione, Number(v.quantita), v.unita_misura, v.note])).toEqual([
      ["Cavo FS17 1x2,5", 733, "m", "450/750 V"], ["Scatola 503", 37, "pz", null],
    ]);
    await come(null);
    expect((await q(`select * from order_items where supplier_rfq_item_id is not null`))).toHaveLength(2);
    // Una seconda volta no.
    await come(ACQUISTI);
    await fallisce(() => q(`select acquisti_richiedi_offerta($1::uuid[], 'x')`, [ids]), /già in una richiesta/);
    // E il tecnico non può più rimandare indietro la fase.
    await come(TECNICO);
    await fallisce(() => stato(FASE_EL, "rimanda", "rivedere"), /già in una richiesta/);
  });

  it("materiali di una fase non validata non vanno all'ufficio acquisti", async () => {
    await genera();
    await stato(FASE_MUR, "invia_validazione");
    await come(ACQUISTI);
    const ids = (await materiali(FASE_MUR)).map((m) => m.id);
    await fallisce(() => q(`select acquisti_richiedi_offerta($1::uuid[], 'x')`, [ids]), /non ancora validate/);
  });

  it("chi non ha né acquisti né modifica commesse non compra", async () => {
    const ids = await validata();
    await come(TECNICO);
    await fallisce(() => q(`select acquisti_assegna_fornitore($1::uuid[], $2)`, [ids, FORNITORE]), /ufficio acquisti/);
  });
});

describe("scomposizioni proposte dall'AI e conteggi delle tavole", () => {
  it("entrano spente; le accende solo chi valida i materiali, e resta scritto chi", async () => {
    await come(null);
    const [s] = await q<{ id: string }>(`insert into scomposizioni_voce(company_id, nome, parole_chiave, origine, attiva) values ($1,'Punto presa',array['punto presa'],'ai',false) returning id`, [A]);
    await q(`insert into scomposizioni_voce_componenti(scomposizione_id, company_id, descrizione, quantita_per_unita) values ($1,$2,'Scatola 503',1)`, [s.id, B]);
    expect((await q<{ company_id: string }>(`select company_id from scomposizioni_voce_componenti`))[0].company_id).toBe(A);
    await come(UFFICIO);
    await fallisce(() => q(`update scomposizioni_voce set attiva = true where id=$1`, [s.id]), /Solo chi valida/);
    await come(TECNICO);
    await q(`update scomposizioni_voce set attiva = true where id=$1`, [s.id]);
    await come(null);
    expect((await q<{ approvata_da: string }>(`select approvata_da from scomposizioni_voce where id=$1`, [s.id]))[0].approvata_da).toBe(TECNICO);
  });

  it("una scomposizione senza codice né parole chiave non si salva", async () => {
    await come(UFFICIO);
    await fallisce(() => q(`insert into scomposizioni_voce(company_id, nome) values ($1,'Vuota')`, [A]), /criterio/);
  });

  it("conteggi: si confermano con chi e quando; tavola e fase devono essere della commessa", async () => {
    await come(null);
    const [doc] = await q<{ id: string }>(`insert into order_attachments(order_id) values ($1) returning id`, [COMMESSA]);
    const [altro] = await q<{ id: string }>(`insert into order_attachments(order_id) values (gen_random_uuid()) returning id`);
    await come(UFFICIO);
    const [k] = await q<{ id: string }>(`insert into planimetrie_conteggi(company_id, order_id, phase_id, documento_id, simbolo, quantita, metodo) values ($1,$2,$3,$4,'PA',37,'testo') returning id`, [A, COMMESSA, FASE_EL, doc.id]);
    await q(`update planimetrie_conteggi set confermato = true where id=$1`, [k.id]);
    expect((await q<{ confermato_da: string }>(`select confermato_da from planimetrie_conteggi where id=$1`, [k.id]))[0].confermato_da).toBe(UFFICIO);
    await fallisce(() => q(`insert into planimetrie_conteggi(company_id, order_id, documento_id, simbolo, quantita, metodo) values ($1,$2,$3,'PA',1,'testo')`, [A, COMMESSA, altro.id]),
      /non è un documento di questa commessa/);
    await come(ESTRANEO);
    expect(await q(`select * from planimetrie_conteggi`)).toHaveLength(0);
  });
});
