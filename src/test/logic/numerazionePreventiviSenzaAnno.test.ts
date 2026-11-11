/**
 * Numerazione dei preventivi senza anno: a gennaio non ricomincia (11/11/2026).
 * La migrazione 20290312250000 gira davvero su PGlite, sopra tabelle ridotte all'osso.
 *
 *   · formato senza anno ({PREFIX}-{NNN}): il primo numero del nuovo anno continua
 *     dal contatore dell'anno prima, anche se in quotes il massimo è più basso
 *     (i numeri delle bozze con computo non stanno in quotes);
 *   · se in quotes c'è un numero più alto del contatore, vince quello;
 *   · formato con l'anno: riparte da 1 come prima.
 */
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

const MIGRAZIONE = "supabase/migrations/20290312250000_numerazione_preventivi_senza_anno.sql";
const AZIENDA = "00000000-0000-4000-a000-000000000001";
const ANNO = new Date().getUTCFullYear();

let db: PGlite;

beforeAll(async () => {
  db = new PGlite();
  await db.waitReady;
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create function public.user_can_access_company(uuid) returns boolean language sql as 'select true';
    create table public.preventivo_impostazioni (company_id uuid primary key, numero_prefisso text, numero_formato text);
    create table public.quotes (id serial primary key, company_id uuid not null, quote_number text);
    create table public.quote_number_counters (company_id uuid not null, anno integer not null, ultimo integer not null, primary key (company_id, anno));
  `);
  await db.exec(readFileSync(MIGRAZIONE, "utf8"));
});

afterAll(async () => { await db?.close(); });

beforeEach(async () => {
  await db.exec("truncate public.preventivo_impostazioni, public.quotes, public.quote_number_counters");
});

async function prossimo(): Promise<string> {
  const r = await db.query<{ n: string }>("select public.generate_quote_number($1) as n", [AZIENDA]);
  return r.rows[0].n;
}

async function formato(f: string) {
  await db.query("insert into public.preventivo_impostazioni values ($1, 'PV', $2)", [AZIENDA, f]);
}

describe("formato senza anno", () => {
  it("a gennaio continua dal contatore dell'anno prima, non dal MAX di quotes", async () => {
    await formato("{PREFIX}-{NNN}");
    await db.query("insert into public.quotes (company_id, quote_number) values ($1, 'PV-240')", [AZIENDA]);
    // L'anno scorso si è arrivati a 251: 241-251 sono finiti nelle bozze con computo.
    await db.query("insert into public.quote_number_counters values ($1, $2, 251)", [AZIENDA, ANNO - 1]);
    expect(await prossimo()).toBe("PV-252");
    expect(await prossimo()).toBe("PV-253");
  });

  it("se quotes ha un numero più alto del contatore, si parte da quello", async () => {
    await formato("{PREFIX}-{NNN}");
    await db.query("insert into public.quotes (company_id, quote_number) values ($1, 'PV-300')", [AZIENDA]);
    await db.query("insert into public.quote_number_counters values ($1, $2, 251)", [AZIENDA, ANNO - 1]);
    expect(await prossimo()).toBe("PV-301");
  });

  it("senza storia parte da 1", async () => {
    await formato("{PREFIX}-{NNN}");
    expect(await prossimo()).toBe("PV-001");
  });

  it("il contatore di un'altra azienda non conta", async () => {
    await formato("{PREFIX}-{NNN}");
    await db.query("insert into public.quote_number_counters values ('00000000-0000-4000-a000-000000000009', $1, 900)", [ANNO - 1]);
    expect(await prossimo()).toBe("PV-001");
  });
});

describe("formato con l'anno: come prima", () => {
  it("{YYYY}: il nuovo anno riparte da 1 anche col contatore vecchio alto", async () => {
    await formato("{PREFIX}-{YYYY}-{NNN}");
    await db.query("insert into public.quote_number_counters values ($1, $2, 251)", [AZIENDA, ANNO - 1]);
    expect(await prossimo()).toBe(`PV-${ANNO}-001`);
  });

  it("{YY}: idem, e il MAX dell'anno in quotes vale ancora", async () => {
    await formato("{PREFIX}{YY}/{NNN}");
    const yy = String(ANNO).slice(-2);
    await db.query("insert into public.quote_number_counters values ($1, $2, 251)", [AZIENDA, ANNO - 1]);
    await db.query("insert into public.quotes (company_id, quote_number) values ($1, $2)", [AZIENDA, `PV${yy}/007`]);
    expect(await prossimo()).toBe(`PV${yy}/008`);
  });
});

describe("la migrazione", () => {
  it("tiene gli stessi diritti e non scrive righe", () => {
    const sql = readFileSync(MIGRAZIONE, "utf8");
    expect(sql).toContain("REVOKE ALL ON FUNCTION public.generate_quote_number(uuid) FROM PUBLIC, anon;");
    expect(sql).toContain("GRANT EXECUTE ON FUNCTION public.generate_quote_number(uuid) TO authenticated, service_role;");
    expect(sql).toMatch(/SECURITY DEFINER/);
    // Fuori dal corpo della funzione nessuna scrittura di righe.
    const fuori = sql.replace(/AS \$function\$[\s\S]*?\$function\$;/, "");
    expect(fuori).not.toMatch(/^\s*(insert|update|delete)\s/im);
  });
});
