import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

/**
 * La migrazione dei conteggi dai disegni CAD sul motore PostgreSQL vero
 * (PGlite): metodo 'dwg' e unità nei conteggi, mappa dei blocchi per azienda
 * con le sue regole di accesso. Attorno, le tabelle e le funzioni esistenti
 * ridotte all'essenziale (l'accesso: azienda del profilo + permesso).
 */
const migrazione = readFileSync("supabase/migrations/20281023040000_conteggi_da_disegni_cad.sql", "utf8");

const A = "a0000000-0000-0000-0000-000000000001";
const B = "a0000000-0000-0000-0000-000000000002";
const UFFICIO = "10000000-0000-0000-0000-000000000001";
const LETTORE = "10000000-0000-0000-0000-000000000002";
const ESTRANEO = "10000000-0000-0000-0000-000000000003";
const COMMESSA = "c0000000-0000-0000-0000-000000000001";
const SCOMP_A = "50000000-0000-0000-0000-000000000001";
const SCOMP_B = "50000000-0000-0000-0000-000000000002";

const schema = `
create schema auth;
create role anon; create role authenticated; create role service_role;
create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.user',true),'')::uuid$$;
create table companies(id uuid primary key);
create table profiles(id uuid primary key, company_id uuid, can_edit boolean default false);
create function utente_bloccato() returns boolean language sql stable as $$select false$$;
create function materiali_utente_in_azienda(_c uuid) returns boolean language sql stable as $$select exists(select 1 from profiles where id=auth.uid() and company_id=_c)$$;
create function materiali_puo(_p text, _c uuid) returns boolean language sql stable as $$select exists(select 1 from profiles where id=auth.uid() and company_id=_c and can_edit)$$;
create table orders(id uuid primary key, company_id uuid);
create table scomposizioni_voce(id uuid primary key, company_id uuid not null, nome text not null);
create table planimetrie_conteggi(id uuid primary key default gen_random_uuid(), company_id uuid not null, order_id uuid not null,
  simbolo text not null, quantita numeric(14,2) not null, metodo text not null, confidenza numeric(4,3),
  constraint planimetrie_conteggi_metodo_check check (metodo in ('testo','vettoriale','ai_immagine','manuale')));
grant usage on schema auth to authenticated, anon, service_role;
grant all on all tables in schema public to authenticated, service_role;
`;

const seme = `
insert into companies values ('${A}'), ('${B}');
insert into auth.users values ('${UFFICIO}'), ('${LETTORE}'), ('${ESTRANEO}');
insert into profiles values ('${UFFICIO}','${A}',true), ('${LETTORE}','${A}',false), ('${ESTRANEO}','${B}',true);
insert into orders values ('${COMMESSA}','${A}');
insert into scomposizioni_voce values ('${SCOMP_A}','${A}','Punto presa'), ('${SCOMP_B}','${B}','Altro');
`;

let db: PGlite;
beforeAll(async () => {
  db = new PGlite();
  await db.exec(schema);
  await db.exec("begin;" + migrazione + ";commit;");
  // Idempotente: una seconda applicazione non deve fallire.
  await db.exec("begin;" + migrazione + ";commit;");
}, 120_000);
afterAll(async () => db?.close());
beforeEach(async () => { await db.exec("begin;" + seme); });
afterEach(async () => { await db.exec("rollback"); });

async function come(utente: string) {
  await db.exec("reset role");
  await db.query("select set_config('test.user', $1, true)", [utente]);
  await db.exec("set local role authenticated");
}
async function fallisce(fn: () => Promise<unknown>, atteso?: RegExp) {
  await db.exec("savepoint prova");
  let errore: unknown = null;
  try { await fn(); } catch (e) { errore = e; }
  await db.exec("rollback to savepoint prova");
  expect(errore, "doveva fallire").not.toBeNull();
  if (atteso) expect(String((errore as Error).message)).toMatch(atteso);
}
const q = async <T = Record<string, unknown>>(sql: string, p: unknown[] = []) => (await db.query<T>(sql, p)).rows;

describe("conteggi dai disegni CAD", () => {
  it("il metodo 'dwg' e l'unità in metri sono ammessi; un'unità diversa no", async () => {
    await q(`insert into planimetrie_conteggi(company_id, order_id, simbolo, quantita, metodo, confidenza, unita) values ($1,$2,'Corrugato',12.5,'dwg',1,'m')`, [A, COMMESSA]);
    await q(`insert into planimetrie_conteggi(company_id, order_id, simbolo, quantita, metodo) values ($1,$2,'PA',3,'testo')`, [A, COMMESSA]);
    await fallisce(() => q(`insert into planimetrie_conteggi(company_id, order_id, simbolo, quantita, metodo, unita) values ($1,$2,'X',1,'dwg','kg')`, [A, COMMESSA]), /unita_check/);
    await fallisce(() => q(`insert into planimetrie_conteggi(company_id, order_id, simbolo, quantita, metodo) values ($1,$2,'X',1,'magia')`, [A, COMMESSA]), /metodo_check/);
  });
});

describe("mappa blocco → simbolo", () => {
  it("chi modifica le commesse la scrive; il nome si salva in maiuscolo; un nome per azienda", async () => {
    await come(UFFICIO);
    await q(`insert into dwg_mappa_blocchi(company_id, nome_blocco, simbolo, scomposizione_id) values ($1,' presa_10a ','Punto presa 10/16A',$2)`, [A, SCOMP_A]);
    expect((await q<{ nome_blocco: string }>(`select nome_blocco from dwg_mappa_blocchi`))[0].nome_blocco).toBe("PRESA_10A");
    await fallisce(() => q(`insert into dwg_mappa_blocchi(company_id, nome_blocco, simbolo) values ($1,'PRESA_10A','Altro')`, [A]), /duplicate|unique/i);
  });

  it("la scomposizione deve essere della stessa azienda", async () => {
    await come(UFFICIO);
    await fallisce(() => q(`insert into dwg_mappa_blocchi(company_id, nome_blocco, simbolo, scomposizione_id) values ($1,'LUCE','Punto luce',$2)`, [A, SCOMP_B]), /non è di questa azienda/);
  });

  it("chi non ha il permesso legge ma non scrive; un'altra azienda non vede niente", async () => {
    await come(UFFICIO);
    await q(`insert into dwg_mappa_blocchi(company_id, nome_blocco, simbolo) values ($1,'LUCE','Punto luce')`, [A]);
    await come(LETTORE);
    expect(await q(`select * from dwg_mappa_blocchi`)).toHaveLength(1);
    await fallisce(() => q(`insert into dwg_mappa_blocchi(company_id, nome_blocco, simbolo) values ($1,'PRESA','Punto presa')`, [A]), /row-level security/);
    expect(await q(`update dwg_mappa_blocchi set simbolo='x' returning id`)).toHaveLength(0);
    await come(ESTRANEO);
    expect(await q(`select * from dwg_mappa_blocchi`)).toHaveLength(0);
    await fallisce(() => q(`insert into dwg_mappa_blocchi(company_id, nome_blocco, simbolo) values ($1,'PRESA','Punto presa')`, [A]), /row-level security/);
    expect(await q(`delete from dwg_mappa_blocchi returning id`)).toHaveLength(0);
  });

  it("l'azienda di una voce non si cambia", async () => {
    await come(UFFICIO);
    const [v] = await q<{ id: string }>(`insert into dwg_mappa_blocchi(company_id, nome_blocco, simbolo) values ($1,'LUCE','Punto luce') returning id`, [A]);
    await db.exec("reset role");
    await q(`update dwg_mappa_blocchi set company_id=$1 where id=$2`, [B, v.id]);
    expect((await q<{ company_id: string }>(`select company_id from dwg_mappa_blocchi where id=$1`, [v.id]))[0].company_id).toBe(A);
  });
});
