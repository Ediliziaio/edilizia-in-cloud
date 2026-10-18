/** Real repository SQL in memory; auth/assignment/timbrature lookup are fixture stubs.
 * No remote DB, payroll integration, storage, network or true concurrent connections. */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { laborHourlyCost, laborLineCost, reviewHourlyCost } from "@/lib/campo/laborCostReview";
import { costoOrarioDipendente } from "@/lib/costoOrarioDipendente";

const c = "11111111-1111-4111-a111-111111111111";
const u = "22222222-2222-4222-a222-222222222222";
const capo = "22222222-2222-4222-a222-222222222223";
const e = "33333333-3333-4333-a333-333333333333";
const e2 = "33333333-3333-4333-a333-333333333334";
const o = "44444444-4444-4444-a444-444444444444";
const o2 = "44444444-4444-4444-a444-444444444445";
const p = "55555555-5555-4555-a555-555555555555";
const db = new PGlite();
const sql = (name: string) => readFileSync(resolve(process.cwd(), "supabase", name), "utf8");

beforeAll(async () => {
  await db.exec(`create role anon; create role authenticated; create schema auth;
    create function auth.uid() returns uuid language sql as $$select '${u}'::uuid$$;
    create function auth.role() returns text language sql as $$select 'authenticated'::text$$;
    create function has_permission_for_company(uuid,text,uuid) returns boolean language sql as $$select true$$;
    create function campo_e_ufficio(uuid) returns boolean language sql as $$select true$$;
    create function campo_lavoro_su_commessa(uuid) returns boolean language sql as $$select true$$;
    create function campo_mio_ruolo(uuid) returns jsonb language sql as $$select '{}'::jsonb$$;
    create function hr_profilo_da_user(uuid,uuid) returns uuid language sql as $$select $1$$;
    create function campo_ore_timbrate_cantiere(uuid,uuid,date) returns jsonb language sql as
      $$select jsonb_build_object('ore',nullif(current_setting('test.timbrate',true),'')::numeric)$$;
    create table profiles(id uuid primary key, company_id uuid, first_name text, last_name text);
    create table user_roles(user_id uuid, role text);
    create table campo_regole_azienda(company_id uuid primary key,chi_compila text,ore_dalle text,avviso_scostamento_minuti integer);
    create table employees(id uuid primary key,company_id uuid,user_id uuid,first_name text,last_name text,
      costo_orario numeric,gross_salary numeric,monthly_hours numeric,inps_rate numeric,
      profilo_costo text,role_type text,qualifica text,area text);
    create function user_can_access_company(uuid) returns boolean language sql as $$select true$$;
    create table costo_personale_parametri(company_id uuid,profilo text,mensilita numeric,inps numeric,inail numeric,
      cassa_edile numeric,tfr numeric,altri numeric,ore_produttive numeric,primary key(company_id,profilo));
    create table orders(id uuid primary key,company_id uuid,deleted_at timestamptz,percentuale_avanzamento integer default 0);
    create table order_work_phases(id uuid primary key,company_id uuid,order_id uuid references orders,name text,
      percentuale integer default 0,status text default 'da_iniziare',updated_at timestamptz default now());
    create table order_work_subphases(id uuid primary key,phase_id uuid references order_work_phases,fatta boolean default false);
    create table order_items(id uuid primary key,order_id uuid references orders);
    create table warehouse_stock(id uuid primary key,company_id uuid);
    create table order_employees(id uuid primary key default gen_random_uuid(),order_id uuid references orders,
      employee_id uuid references employees,phase_id uuid,hourly_rate numeric not null,hours_worked numeric not null,total_cost numeric not null);
    create table campo_rapportini(id uuid primary key default gen_random_uuid(),company_id uuid not null,user_id uuid not null,
      order_id uuid references orders,data_lavoro date default current_date,stato text default 'inviato',approvato boolean default false,
      descrizione_lavori text default 'Simulazione',ore_lavorate numeric(4,1) default 0,ore_straordinario numeric default 0,
      presenze jsonb default '[]',presenze_registrate jsonb,costo_manodopera numeric,costo_registrato_at timestamptz,
      foto_urls text[] default '{}',fasi_lavorate jsonb default '[]',materiali_usati jsonb default '[]',percentuale_avanzamento integer default 0,
      lavoro_completato boolean default false,firma_cliente_url text,firma_cliente_nome text,pdf_url text);
    create function test_fail_phase() returns trigger language plpgsql as $$begin
      if new.name='errore' and new.percentuale is distinct from old.percentuale then raise exception 'Guasto fase'; end if; return new; end$$;
    create trigger fail_phase before update on order_work_phases for each row execute function test_fail_phase();`);
  // Le funzioni del costo orario così come stanno nella migrazione in produzione.
  const costo = sql("migrations/20281019040000_costo_orario_edile_per_tipo.sql");
  for (const nome of ["costo_personale_preset", "profilo_costo_dipendente", "costo_orario_calcolato", "costo_orario_dipendente"]) {
    await db.exec(costo.match(new RegExp(`create or replace function public\\.${nome}\\([\\s\\S]*?\\$\\$;`))![0]);
  }
  await db.exec(sql("migrations/20281004140000_ore_persona_si_contano_una_volta.sql"));
  await db.exec(sql("migrations/20281004150000_rapportino_conflitto_ore_anticipato.sql"));
  await db.exec(`create trigger trg_rapportino_costo_manodopera before update on campo_rapportini
    for each row execute function fn_rapportino_costo_manodopera()`);
  await db.exec(sql("migrations/20281018180000_campo_rapportini_protocollo.sql"));
  await db.exec(sql("migrations-pending/campo_rapportini_collegamenti_atomici.sql"));
}, 30000);
afterAll(() => db.close());
beforeEach(async () => {
  await db.exec(`truncate campo_rapportini,order_employees,order_work_subphases,order_work_phases,order_items,warehouse_stock,orders,employees,profiles;
    set test.timbrate='';
    insert into orders(id,company_id) values('${o}','${c}'),('${o2}','${c}');
    insert into order_work_phases(id,company_id,order_id,name) values('${p}','${c}','${o}','Posa');
    insert into profiles values('${u}','${c}','Mario','Rossi'),('${capo}','${c}','Luca','Capo');
    insert into employees(id,company_id,user_id,first_name,last_name,costo_orario)
      values('${e}','${c}','${u}','Mario','Rossi',25),('${e2}','${c}',null,'Anna','Verdi',30);`);
});
async function create(hours: number, options: { order?: string; author?: string; offset?: number; presences?: unknown; phases?: unknown } = {}) {
  return (await db.query<{ id: string }>(`insert into campo_rapportini(company_id,user_id,order_id,ore_lavorate,data_lavoro,presenze,fasi_lavorate)
    values($1,$2,$3,$4,current_date+$5::integer,$6,$7) returning id`,
    [c, options.author ?? u, options.order ?? o, hours, options.offset ?? 0,
      JSON.stringify(options.presences === undefined ? [] : options.presences), JSON.stringify(options.phases ?? [])])).rows[0].id;
}
const approve = (id: string) => db.query("update campo_rapportini set stato='approvato',approvato=true where id=$1", [id]);
const ledger = async (order = o) => (await db.query<{ hours: string; cost: string }>(
  "select coalesce(sum(hours_worked),0)::text as hours,coalesce(sum(total_cost),0)::text as cost from order_employees where order_id=$1", [order])).rows[0];

describe("Simulazioni con il motore SQL reale della manodopera", () => {
  it("7,62 ore personali e approvazione ripetuta producono un solo costo", async () => {
    const id = await create(7.62); await approve(id); await approve(id);
    expect(await ledger()).toEqual({ hours: "7.62", cost: "190.50" });
  });
  it("le presenze sostituiscono le ore dell'autore; il sub non prende una tariffa dipendente", async () => {
    const id = await create(8, { author: capo, presences: [{ employee_id: e, ore: 4 }, { employee_id: e2, ore: 3 }, { subappaltatore_id: p, ore: 8 }] });
    await approve(id); expect(await ledger()).toEqual({ hours: "7", cost: "190.00" });
  });
  it("4 ore su A e 5 su B sono due lavori validi, non una duplicazione", async () => {
    await approve(await create(4)); await approve(await create(5, { order: o2 }));
    expect(await ledger()).toEqual({ hours: "4.00", cost: "100.00" });
    expect(await ledger(o2)).toEqual({ hours: "5.00", cost: "125.00" });
  });
  it("oltre 24 ore fra cantieri diversi blocca anche il secondo costo", async () => {
    await approve(await create(16)); const second = await create(9, { order: o2 });
    await expect(approve(second)).rejects.toThrow("più di 24 ore");
    expect(await ledger(o2)).toEqual({ hours: "0", cost: "0" });
  });
  it("capo e operaio non possono registrare due volte le stesse ore senza timbrature", async () => {
    await approve(await create(4)); const second = await create(0, { author: capo, presences: [{ employee_id: e, ore: 4 }] });
    await expect(approve(second)).rejects.toThrow("una volta sola");
    expect(await ledger()).toEqual({ hours: "4.00", cost: "100.00" });
  });
  it.each([7.49, 7.5, 8, 8.5])("suddivisione di 4+4 ore, timbrate=%s, tolleranza esatta di 30 minuti", async timbrate => {
    await approve(await create(4)); await db.query("select set_config('test.timbrate',$1,false)", [String(timbrate)]);
    const second = await create(0, { author: capo, presences: [{ employee_id: e, ore: 4 }] });
    if (timbrate + 0.5 < 8) {
      await expect(approve(second)).rejects.toThrow("timbrate"); expect((await ledger()).cost).toBe("100.00");
    } else { await approve(second); expect((await ledger()).cost).toBe("200.00"); }
  });
  it("un guasto di fase annulla le righe del vero registro costi", async () => {
    const id = await create(4, { phases: [{ phase_id: p, percentuale: 60 }] });
    await db.query("update order_work_phases set name='errore' where id=$1", [p]);
    await expect(approve(id)).rejects.toThrow("Guasto fase"); expect(await ledger()).toEqual({ hours: "0", cost: "0" });
    expect((await db.query("select stato,costo_registrato_at from campo_rapportini where id=$1", [id])).rows[0]).toEqual({ stato: "inviato", costo_registrato_at: null });
    await db.query("update order_work_phases set name='Posa' where id=$1", [p]); await approve(id);
    expect((await ledger()).cost).toBe("100.00");
  });
  it("revoca e riapprovazione usano snapshot e tariffa corrente senza perdere il secondo rapporto", async () => {
    const first = await create(4, { offset: -1 }); await approve(first);
    await db.query("update employees set costo_orario=30 where id=$1", [e]);
    await approve(await create(6)); expect((await ledger()).cost).toBe("280.00");
    await db.query("update campo_rapportini set stato='rifiutato',approvato=false where id=$1", [first]);
    expect(await ledger()).toEqual({ hours: "6.00", cost: "180.00" });
    await approve(first); expect(await ledger()).toEqual({ hours: "10.00", cost: "300.00" });
  });
  it("una scheda senza tariffa mantiene le ore ma non inventa il costo", async () => {
    await db.query("update employees set costo_orario=null where id=$1", [e]);
    await approve(await create(4)); expect(await ledger()).toEqual({ hours: "4.00", cost: "0.00" });
  });
  it("un dipendente duplicato nelle presenze non può raddoppiare il costo nello stesso rapporto", async () => {
    await expect(create(0, { author: capo, presences: [{ employee_id: e, ore: 4 }, { employee_id: e, ore: 4 }] })).rejects.toMatchObject({ code: "22023" });
    expect(await ledger()).toEqual({ hours: "0", cost: "0" });
  });
  it("non sposta il rapporto durante la revoca, lasciando costi sulla commessa sbagliata", async () => {
    const id = await create(4); await approve(id);
    await expect(db.query("update campo_rapportini set stato='rifiutato',approvato=false,order_id=$2 where id=$1", [id, o2])).rejects.toMatchObject({ code: "22023" });
    expect((await ledger()).cost).toBe("100.00"); expect((await ledger(o2)).cost).toBe("0");
    await db.query("update campo_rapportini set stato='rifiutato',approvato=false where id=$1", [id]);
    expect(Number((await ledger()).cost)).toBe(0);
  });
  it.each([null, {}, [null], [{ employee_id: e, ore: -1 }], [{ employee_id: e, ore: 25 }],
    [{ employee_id: e, ore: true }], [{ employee_id: e, ore: "NaN" }], [{ employee_id: e, ore: "4,5" }],
    [{ employee_id: e, subappaltatore_id: p, ore: 4 }], [{ employee_id: p, ore: 4 }]])("blocca presenze non valide %j", async presences => {
    await expect(create(0, { presences })).rejects.toMatchObject({ code: "22023" });
  });
  it.each([-0.01, -1, 24.01, 25, Number.NaN, Number.POSITIVE_INFINITY])("blocca ore personali non valide %s", async hours => {
    await expect(create(hours)).rejects.toMatchObject({ code: hours === Infinity ? "22003" : "22023" });
  });
});

const moneyCases = [0, 0.01, 0.1, 0.25, 1, 1.5, 7.62, 8, 23.99, 24]
  .flatMap(hours => [0, 0.01, 1.005, 12.37, 25, 25.75, 99.95, 125.125].map(rate => ({ hours, rate })));
describe("Confronto importi frontend e numeric PostgreSQL (80 combinazioni)", () => {
  it.each([2.01, 77.99, 45300, 123.45].flatMap(cost => [0.25, 2, 7.62, 1760].map(hours => ({ cost, hours }))))("tariffa media/piena $cost / $hours come numeric SQL", async ({ cost, hours }) => {
    const actual = (await db.query<{ value: string }>("select round($1::numeric / $2::numeric,2)::text as value", [String(cost), String(hours)])).rows[0].value;
    expect(laborHourlyCost(cost, hours)).toBe(Number(actual));
  });
  it.each(moneyCases)("ore=$hours × tariffa=$rate", async ({ hours, rate }) => {
    const actual = (await db.query<{ value: string }>("select round($1::numeric * $2::numeric,2)::text as value", [String(hours), String(rate)])).rows[0].value;
    expect(laborLineCost(hours, rate)).toBe(Number(actual));
  });
  it.each([0, 1, 28, 33.5])("formula da stipendio, INPS=%s", async inps => {
    await db.query("update employees set costo_orario=null,gross_salary=2123.45,monthly_hours=173,inps_rate=$2 where id=$1", [e, inps]);
    const actual = (await db.query<{ rate: string }>("select costo_orario_dipendente($1)::text as rate", [e])).rows[0].rate;
    expect(reviewHourlyCost({ id: e, user_id: u, gross_salary: 2123.45, monthly_hours: 173, inps_rate: inps }).amount).toBe(Number(actual));
  });
  it.each([
    { costo_orario: null, gross_salary: 2000, monthly_hours: 160, inps_rate: 0 },
    { costo_orario: null, gross_salary: 2000, monthly_hours: 160, inps_rate: null },
    { costo_orario: 25.555, gross_salary: 2000, monthly_hours: null, inps_rate: null },
    { costo_orario: null, gross_salary: 2000, monthly_hours: null, inps_rate: 28 },
    { costo_orario: 0, gross_salary: 2000, monthly_hours: 0, inps_rate: 0 },
    { costo_orario: null, gross_salary: 160.8, monthly_hours: 160, inps_rate: 0 },
    { costo_orario: 0, gross_salary: 2000, monthly_hours: 160, inps_rate: 33.5 },
  ])("helper usato nelle altre schermate = funzione SQL, dati=$cost_orario/$monthly_hours/$inps_rate", async employee => {
    await db.query("update employees set costo_orario=$2,gross_salary=$3,monthly_hours=$4,inps_rate=$5 where id=$1",
      [e, employee.costo_orario, employee.gross_salary, employee.monthly_hours, employee.inps_rate]);
    const actual = (await db.query<{ rate: string }>("select costo_orario_dipendente($1)::text as rate", [e])).rows[0].rate;
    expect(costoOrarioDipendente({ ...employee, ore_settimana: 40 })).toBe(Number(actual));
  });
  it.each([
    { role_type: "operaio", qualifica: "Muratore", area: "cantiere", profilo_costo: null, inps_rate: 28 },
    { role_type: "staff_interno", qualifica: null, area: "amministrazione", profilo_costo: null, inps_rate: null },
    { role_type: "operaio", qualifica: "Apprendista muratore", area: "cantiere", profilo_costo: null, inps_rate: null },
    { role_type: "Posatore Infissi", qualifica: null, area: null, profilo_costo: "impiegato", inps_rate: 11.61 },
  ])("tipo di dipendente: app = funzione SQL ($role_type/$qualifica/$profilo_costo)", async t => {
    await db.query("update employees set costo_orario=null,gross_salary=2123.45,monthly_hours=168,inps_rate=$2,role_type=$3,qualifica=$4,area=$5,profilo_costo=$6 where id=$1",
      [e, t.inps_rate, t.role_type, t.qualifica, t.area, t.profilo_costo]);
    const actual = (await db.query<{ rate: string }>("select costo_orario_dipendente($1)::text as rate", [e])).rows[0].rate;
    expect(costoOrarioDipendente({ ...t, gross_salary: 2123.45, monthly_hours: 168 })).toBe(Number(actual));
  });
  it("i valori dell'azienda vincono su quelli edili, uguali in app e nel database", async () => {
    const valori = { mensilita: 13, inps: 30.5, inail: 3.2, cassa_edile: 0, tfr: 7.41, altri: 1.5, ore_produttive: 87 };
    await db.query("insert into costo_personale_parametri values ($1,'operaio',$2,$3,$4,$5,$6,$7,$8)",
      [c, valori.mensilita, valori.inps, valori.inail, valori.cassa_edile, valori.tfr, valori.altri, valori.ore_produttive]);
    await db.query("update employees set company_id=$2,costo_orario=null,gross_salary=1987.65,monthly_hours=173,inps_rate=null,role_type='operaio',qualifica=null,area=null,profilo_costo=null where id=$1", [e, c]);
    const actual = (await db.query<{ rate: string }>("select costo_orario_dipendente($1)::text as rate", [e])).rows[0].rate;
    await db.query("delete from costo_personale_parametri");
    expect(costoOrarioDipendente({ role_type: "operaio", gross_salary: 1987.65, monthly_hours: 173, inps_rate: null }, { operaio: valori })).toBe(Number(actual));
    expect(Number(actual)).toBe(20.4);
  });
});
