// La migrazione 20290415160000_bollette_utenze su un database vero (PGlite): utenza dal POD/PDR,
// più utenze nello stesso documento, doppione o conguaglio, nota di credito, destinazioni con
// validità, costo sulla commessa sotto l'interruttore, isolamento fra aziende. Nessuna AI.
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

const id = (n: number) => `00000000-0000-4000-a000-${String(n).padStart(12, "0")}`;
const [AZ, ALTRA, UTENTE, ESTRANEO, COMM_A, COMM_B, SEDE, UNITA, COMM_ALTRA] = [1, 2, 3, 4, 5, 6, 7, 8, 9].map(id);
let db: PGlite;
let prossimo = 100;

async function come(utente: string | null, ruolo = "authenticated") {
  await db.exec(`select set_config('test.user', '${utente ?? ""}', false), set_config('test.role', '${ruolo}', false)`);
}
async function fattura(over: { numero?: string; tipo?: string; piva?: string; data?: string; company?: string; costo?: boolean } = {}) {
  const f = id(prossimo++);
  let costo: string | null = null;
  if (over.costo !== false) {
    costo = id(prossimo++);
    await db.query(`insert into company_costs(id, company_id) values ($1, $2)`, [costo, over.company ?? AZ]);
  }
  await db.query(
    `insert into fatture_ricevute(id, company_id, cedente_piva, cedente_ragione_sociale, numero_fattura, data_fattura, tipo_documento, imponibile_totale, company_cost_id)
     values ($1,$2,$3,'Energia Spa',$4,$5,$6,100,$7)`,
    [f, over.company ?? AZ, over.piva ?? "IT01111111111", over.numero ?? `N${prossimo}`, over.data ?? "2026-10-10", over.tipo ?? "TD01", costo],
  );
  return { f, costo };
}
type Ut = { codice: string; tipo_utenza?: string; periodo_dal?: string; periodo_al?: string; importo: number; letture?: string; consumo?: number };
async function registra(f: string, utenze: Ut[], extra: Record<string, unknown> = {}) {
  await come(null, "service_role");
  const r = await db.query<{ r: Record<string, unknown> }>(`select bolletta_registra($1, $2::jsonb) as r`, [f, JSON.stringify({ utenze, ...extra })]);
  return r.rows[0].r;
}
const bolletta = async (f: string) => (await db.query<Record<string, unknown>>(`select * from bollette where fattura_ricevuta_id=$1`, [f])).rows[0];
const utenzaDi = async (codice: string, company = AZ) =>
  (await db.query<{ id: string }>(`select id from utenze where company_id=$1 and codice_chiave=$2`, [company, codice])).rows[0]?.id;
async function collega(utenza: string, tipo: string | null, dest: string | null, dal: string | null = null, chi = UTENTE) {
  await come(chi);
  return (await db.query<{ r: Record<string, unknown> }>(`select utenza_collega_destinazione($1,$2,$3,$4::date) as r`, [utenza, tipo, dest, dal])).rows[0].r;
}
const costo = async (c: string) => (await db.query<{ order_id: string | null; allocations: unknown }>(`select order_id, allocations from company_costs where id=$1`, [c])).rows[0];

beforeAll(async () => {
  db = new PGlite();
  await db.waitReady;
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth; create schema private;
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.user',true),'')::uuid$$;
    create function auth.jwt() returns jsonb language sql stable as $$select jsonb_build_object('role', coalesce(nullif(current_setting('test.role',true),''),'authenticated'))$$;
    create table companies(id uuid primary key);
    create table orders(id uuid primary key, company_id uuid, deleted_at timestamptz);
    create table sedi(id uuid primary key, company_id uuid);
    create table unita_immobiliari(id uuid primary key, company_id uuid, order_id uuid);
    create table company_costs(id uuid primary key, company_id uuid, order_id uuid, purchase_order_id uuid, allocations jsonb, updated_at timestamptz);
    create table fatture_ricevute(id uuid primary key, company_id uuid, cedente_piva text, cedente_ragione_sociale text, numero_fattura text, data_fattura date,
      tipo_documento text, totale_documento numeric, imponibile_totale numeric, company_cost_id uuid, order_id_suggerito uuid, updated_at timestamptz);
    create table governo(company_id uuid primary key, acceso boolean);
    create table traccia(company_id uuid, da_id uuid, a_id uuid, regola text, esito text, importo numeric);
    create function partner_tax_key(v text) returns text language sql immutable as $$select regexp_replace(upper(regexp_replace(coalesce(v,''),'[^A-Za-z0-9]','','g')),'^IT(?=[0-9]{11}$)','')$$;
    create function user_can_access_company(c uuid) returns boolean language sql stable as $$select c = nullif(current_setting('test.company',true),'')::uuid$$;
    create function has_permission_for_company(u uuid, p text, c uuid) returns boolean language sql stable as $$select u = '${UTENTE}'::uuid and c = '${AZ}'::uuid$$;
    create function utente_sola_lettura(c uuid) returns boolean language sql stable as $$select false$$;
    create function azienda_collegamento_automatico(c uuid) returns boolean language sql stable as $$select coalesce((select acceso from governo where company_id=c), false)$$;
    create function acquisti_collegamento_registra(p_company uuid, p_da_tipo text, p_da_id uuid, p_da_riga text, p_a_tipo text, p_a_id uuid, p_a_riga text,
      p_regola text, p_esito text, p_prove jsonb, p_percorso jsonb, p_quantita numeric, p_unita text, p_importo numeric, p_versione integer, p_con_ai boolean, p_motivo text)
      returns uuid language plpgsql as $$begin
        if p_esito = 'automatico' and not azienda_collegamento_automatico(p_company) then p_esito := 'proposta'; end if;
        insert into traccia values (p_company, p_da_id, p_a_id, p_regola, p_esito, p_importo); return gen_random_uuid(); end$$;
  `);
  await db.query(`insert into companies values ($1), ($2)`, [AZ, ALTRA]);
  await db.query(`insert into orders values ($1,$3,null), ($2,$3,null), ($4,$5,null)`, [COMM_A, COMM_B, AZ, COMM_ALTRA, ALTRA]);
  await db.query(`insert into sedi values ($1,$2)`, [SEDE, AZ]);
  await db.query(`insert into unita_immobiliari values ($1,$2,$3)`, [UNITA, AZ, COMM_B]);
  for (const f of ["20290415160000_bollette_utenze.sql", "20290415190000_bolletta_registra_robusta.sql"]) {
    await db.exec(readFileSync(`supabase/migrations/${f}`, "utf8").replace(/^SET LOCAL .*$/gm, ""));
  }
});
afterAll(async () => { await db.close(); });
beforeEach(async () => {
  await db.exec(`delete from bollette_righe; delete from bollette; delete from utenze_destinazioni; delete from utenze; delete from traccia; delete from governo;`);
});

describe("utenza dal POD/PDR", () => {
  it("il POD crea l'utenza senza destinazione; un'altra bolletta dello stesso POD, anche con un altro fornitore, trova la stessa", async () => {
    const a = await fattura();
    const r = await registra(a.f, [{ codice: "IT001E02621799", tipo_utenza: "luce", periodo_dal: "2026-09-01", periodo_al: "2026-09-30", importo: 100 }]);
    expect(r).toMatchObject({ stato: "riconosciuta", costo: { esito: "da_collegare" } });
    const b = await fattura({ piva: "IT02222222222" });
    await registra(b.f, [{ codice: "it001e02621799", tipo_utenza: "luce", periodo_dal: "2026-10-01", periodo_al: "2026-10-31", importo: 120 }]);
    expect((await db.query(`select count(*)::int n from utenze`)).rows[0]).toEqual({ n: 1 });
  });

  it("più utenze nello stesso documento: una riga e un'utenza per codice", async () => {
    const a = await fattura();
    await registra(a.f, [
      { codice: "IT001E00000001", tipo_utenza: "luce", periodo_dal: "2026-09-01", periodo_al: "2026-09-30", importo: 60 },
      { codice: "02000000000001", tipo_utenza: "gas", periodo_dal: "2026-09-01", periodo_al: "2026-09-30", importo: 40 },
    ]);
    expect((await db.query(`select count(*)::int n from bollette_righe`)).rows[0]).toEqual({ n: 2 });
    expect((await db.query(`select count(*)::int n from utenze`)).rows[0]).toEqual({ n: 2 });
  });

  it("ripetuta (retry del giro): la fattura ha una sola bolletta", async () => {
    const a = await fattura();
    await registra(a.f, [{ codice: "IT001E00000001", importo: 10 }]);
    expect(await registra(a.f, [{ codice: "IT001E00000001", importo: 10 }])).toMatchObject({ gia_letta: true });
    expect((await db.query(`select count(*)::int n from bollette`)).rows[0]).toEqual({ n: 1 });
  });

  it("una data o un importo non leggibili non fermano il giro: la bolletta si registra con l'avviso", async () => {
    const a = await fattura();
    const r = await registra(a.f, [{ codice: "IT001E00000001", periodo_dal: "31/09/2026", periodo_al: "2026-02-30", importo: "dieci" as unknown as number }]);
    expect(r.stato).toBe("riconosciuta");
    expect(JSON.stringify(r.avvisi)).toMatch(/valore_non_valido/);
    expect((await db.query(`select periodo_dal, importo from bollette_righe`)).rows).toEqual([{ periodo_dal: null, importo: "0.00" }]);
  });

  it("solo il giro del server registra: una persona no", async () => {
    const a = await fattura();
    await come(UTENTE);
    await expect(db.query(`select bolletta_registra($1, '{"utenze":[]}')`, [a.f])).rejects.toThrow(/solo il giro/);
  });
});

describe("doppione o conguaglio", () => {
  const sett = { codice: "IT001E00000001", periodo_dal: "2026-09-01", periodo_al: "2026-09-30" };

  it("stesso periodo e stesso importo fra due ordinarie: doppione sospetto, niente costo", async () => {
    const a = await fattura();
    await registra(a.f, [{ ...sett, importo: 100, letture: "stimate" }]);
    const b = await fattura();
    const r = await registra(b.f, [{ ...sett, importo: 100, letture: "stimate" }]);
    expect(r).toMatchObject({ stato: "doppione_sospetto", costo: { esito: "sospesa" } });
    expect((await bolletta(b.f)).doppione_di).toBe((await bolletta(a.f)).id);
  });

  it("stesso fornitore, numero e anno: doppione anche se il periodo manca", async () => {
    const a = await fattura({ numero: "FT-2026/77" });
    await registra(a.f, [{ codice: "IT001E00000001", importo: 100 }]);
    const b = await fattura({ numero: "FT 2026 77" });
    expect(await registra(b.f, [{ codice: "IT001E00000001", importo: 90 }])).toMatchObject({ stato: "doppione_sospetto" });
  });

  it("conguaglio con letture effettive su un periodo stimato: rettifica legittima, non doppione", async () => {
    const a = await fattura();
    await registra(a.f, [{ ...sett, importo: 100, letture: "stimate" }]);
    const b = await fattura();
    const r = await registra(b.f, [{ ...sett, importo: 100, letture: "effettive" }]);
    expect(r.stato).toBe("riconosciuta");
    expect((await bolletta(b.f)).rettifica_di).toEqual([(await bolletta(a.f)).id]);
  });

  it("conguaglio dichiarato su più mesi già fatturati: rettifica di tutti, i periodi stimati restano", async () => {
    const a = await fattura();
    await registra(a.f, [{ ...sett, importo: 100 }]);
    const b = await fattura();
    await registra(b.f, [{ codice: sett.codice, periodo_dal: "2026-10-01", periodo_al: "2026-10-31", importo: 110 }]);
    const c = await fattura();
    const r = await registra(c.f, [{ codice: sett.codice, periodo_dal: "2026-09-01", periodo_al: "2026-10-31", importo: -35 }], { tipo: "conguaglio" });
    expect(r.stato).toBe("riconosciuta");
    expect(((await bolletta(c.f)).rettifica_di as string[]).length).toBe(2);
    expect((await bolletta(a.f)).stato).toBe("riconosciuta");
  });

  it("nota di credito: storna la bolletta che cita, anche sullo stesso periodo e importo", async () => {
    const a = await fattura({ numero: "FT-10" });
    await registra(a.f, [{ ...sett, importo: 100 }]);
    const nc = await fattura({ tipo: "TD04", numero: "NC-1" });
    const r = await registra(nc.f, [{ ...sett, importo: 100 }], { fatture_collegate: ["FT-10"] });
    expect(r.stato).toBe("riconosciuta");
    expect((await bolletta(nc.f))).toMatchObject({ tipo: "nota_credito", rettifica_di: [(await bolletta(a.f)).id] });
  });

  it("periodo sovrapposto con importo diverso fra ordinarie: avviso, non blocco", async () => {
    const a = await fattura();
    await registra(a.f, [{ ...sett, importo: 100 }]);
    const b = await fattura();
    const r = await registra(b.f, [{ codice: sett.codice, periodo_dal: "2026-09-15", periodo_al: "2026-10-14", importo: 80 }]);
    expect(r.stato).toBe("riconosciuta");
    expect(JSON.stringify(r.avvisi)).toMatch(/periodo_sovrapposto/);
  });

  it("una persona decide: non è un doppione (costo applicato) o lo scarta", async () => {
    const a = await fattura();
    await registra(a.f, [{ ...sett, importo: 100 }]);
    const b = await fattura();
    await registra(b.f, [{ ...sett, importo: 100 }]);
    await db.exec(`select set_config('test.company', '${AZ}', false)`);
    const u = await utenzaDi("IT001E00000001");
    await collega(u!, "commessa", COMM_A);
    await come(UTENTE);
    const r = (await db.query<{ r: Record<string, unknown> }>(`select bolletta_decidi($1, 'non_doppione') as r`, [(await bolletta(b.f)).id])).rows[0].r;
    expect(r.esito).toBe("applicato");
    expect((await costo(b.costo!)).order_id).toBe(COMM_A);
  });
});

describe("destinazione e costo", () => {
  it("una persona collega l'utenza a una commessa: le bollette aperte prendono la commessa (esito manuale)", async () => {
    const a = await fattura();
    await registra(a.f, [{ codice: "IT001E00000001", periodo_dal: "2026-09-01", periodo_al: "2026-09-30", importo: 100 }]);
    const r = await collega((await utenzaDi("IT001E00000001"))!, "commessa", COMM_A);
    expect(r.bollette_riviste).toBe(1);
    expect((await costo(a.costo!)).order_id).toBe(COMM_A);
    expect((await db.query(`select esito, regola from traccia`)).rows).toEqual([{ esito: "manuale", regola: "bolletta_utenza_destinazione" }]);
  });

  it("bolletta che arriva dopo: interruttore spento → proposta, costo intatto; acceso → applicato", async () => {
    await registra((await fattura()).f, [{ codice: "IT001E00000001", importo: 1 }]);
    await collega((await utenzaDi("IT001E00000001"))!, "commessa", COMM_A);
    const spento = await fattura();
    expect(await registra(spento.f, [{ codice: "IT001E00000001", periodo_dal: "2026-09-01", periodo_al: "2026-09-30", importo: 100 }]))
      .toMatchObject({ costo: { esito: "proposta" } });
    expect((await costo(spento.costo!)).order_id).toBeNull();
    await db.query(`insert into governo values ($1, true)`, [AZ]);
    const acceso = await fattura();
    expect(await registra(acceso.f, [{ codice: "IT001E00000001", periodo_dal: "2026-10-01", periodo_al: "2026-10-31", importo: 90 }]))
      .toMatchObject({ costo: { esito: "applicato" } });
    expect((await costo(acceso.costo!)).order_id).toBe(COMM_A);
  });

  it("contatore di cantiere che passa a un'altra commessa: vale la commessa del periodo", async () => {
    await db.query(`insert into governo values ($1, true)`, [AZ]);
    const u = (await registra((await fattura()).f, [{ codice: "IT001E00000009", importo: 1 }]), await utenzaDi("IT001E00000009"))!;
    await collega(u, "commessa", COMM_A);
    await collega(u, "commessa", COMM_B, "2026-10-01");
    const sett = await fattura();
    await registra(sett.f, [{ codice: "IT001E00000009", periodo_dal: "2026-09-01", periodo_al: "2026-09-30", importo: 100 }]);
    const ott = await fattura();
    await registra(ott.f, [{ codice: "IT001E00000009", periodo_dal: "2026-10-01", periodo_al: "2026-10-31", importo: 100 }]);
    expect((await costo(sett.costo!)).order_id).toBe(COMM_A);
    expect((await costo(ott.costo!)).order_id).toBe(COMM_B);
  });

  it("due utenze su due commesse (una via immobile): ripartizione in proporzione; sede = costo generale", async () => {
    await db.query(`insert into governo values ($1, true)`, [AZ]);
    await registra((await fattura()).f, [{ codice: "IT001E00000001", importo: 1 }, { codice: "IT001E00000002", importo: 1 }, { codice: "IT001E00000003", importo: 1 }]);
    await collega((await utenzaDi("IT001E00000001"))!, "commessa", COMM_A);
    await collega((await utenzaDi("IT001E00000002"))!, "immobile", UNITA);
    await collega((await utenzaDi("IT001E00000003"))!, "sede", SEDE);
    const due = await fattura();
    await registra(due.f, [{ codice: "IT001E00000001", importo: 75 }, { codice: "IT001E00000002", importo: 25 }]);
    const alloc = (await costo(due.costo!)).allocations as Array<{ order_id: string; pct: number }>;
    expect(alloc.map((x) => [x.order_id, Number(x.pct)]).sort()).toEqual([[COMM_A, 75], [COMM_B, 25]].sort());
    const sede = await fattura();
    expect(await registra(sede.f, [{ codice: "IT001E00000003", importo: 50 }])).toMatchObject({ costo: { esito: "generale" } });
  });

  it("costo già assegnato da una persona: non si tocca, nemmeno con una proposta", async () => {
    await registra((await fattura()).f, [{ codice: "IT001E00000001", importo: 1 }]);
    await collega((await utenzaDi("IT001E00000001"))!, "commessa", COMM_A);
    const a = await fattura();
    await db.query(`update company_costs set order_id=$1 where id=$2`, [COMM_B, a.costo]);
    expect(await registra(a.f, [{ codice: "IT001E00000001", importo: 100 }])).toMatchObject({ costo: { esito: "gia_assegnato" } });
    expect((await costo(a.costo!)).order_id).toBe(COMM_B);
    expect((await db.query(`select count(*)::int n from traccia where da_id=$1`, [a.f])).rows[0]).toEqual({ n: 0 });
  });
});

describe("isolamento fra aziende", () => {
  it("chi non è dell'azienda non collega; una commessa di un'altra azienda è rifiutata", async () => {
    await registra((await fattura()).f, [{ codice: "IT001E00000001", importo: 1 }]);
    const u = (await utenzaDi("IT001E00000001"))!;
    await expect(collega(u, "commessa", COMM_A, null, ESTRANEO)).rejects.toThrow(/ruolo/);
    await expect(collega(u, "commessa", COMM_ALTRA)).rejects.toThrow(/non è di questa azienda/);
  });

  it("lo stesso POD in due aziende sono due utenze diverse, e i doppioni non si incrociano", async () => {
    const sett = { codice: "IT001E00000001", periodo_dal: "2026-09-01", periodo_al: "2026-09-30", importo: 100 };
    await registra((await fattura()).f, [sett]);
    const altra = await fattura({ company: ALTRA });
    expect(await registra(altra.f, [sett])).toMatchObject({ stato: "riconosciuta" });
    expect((await db.query(`select count(*)::int n from utenze`)).rows[0]).toEqual({ n: 2 });
  });
});
