/**
 * Fatture ricevute segnate pagate senza pagamento registrato (27/11/2026).
 *
 * La RPC dell'elenco prende i saldi da private.fatture_ricevute_calcola_saldi (qui
 * finta, con i numeri scritti a mano) e, per le rate «pagate» il cui
 * private.fornitore_residuo_rata è ancora > 0.005 — la stessa definizione di
 * pagamenti_segnati_da_sistemare — sposta l'importo dal pagato al residuo.
 */
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/20290628120000_ricevute_segnata_non_registrata.sql", "utf8");
const id = (n: number) => `00000000-0000-4000-a000-${String(n).padStart(12, "0")}`;
const [azienda, fattura, costo, altra] = [1, 2, 3, 4].map(id);
let db: PGlite;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth; create schema private;
    create function auth.uid() returns uuid language sql as $$select '${id(100)}'::uuid$$;
    create function public.get_my_company_id() returns uuid language sql as $$select '${azienda}'::uuid$$;
    create function public.puo_vedere_documenti_fornitore() returns boolean language sql as $$select true$$;
    create function public.utente_bloccato() returns boolean language sql as $$select false$$;
    create function public.utente_e_cliente_esterno() returns boolean language sql as $$select false$$;
    create function public.user_can_read_accountant_company(uuid) returns boolean language sql as $$select false$$;
    create function public.e_super_admin_dentro(uuid) returns boolean language sql as $$select false$$;

    create table public.company_costs (id uuid primary key, company_id uuid, annullato_il timestamptz);
    create table public.rate_fornitori (id uuid, company_id uuid, company_cost_id uuid, fattura_ricevuta_id uuid,
      importo numeric, stato text, residuo_finto numeric);
    create function private.fornitore_residuo_rata(p_rata public.rate_fornitori) returns numeric
      language sql as $$select p_rata.residuo_finto$$;

    create table private.saldi_finti (id uuid, dovuto numeric, pagato numeric, residuo numeric, iva_split numeric,
      pagata_il date, data_saldo date, rate_pagate integer, rate_totali integer, stornata boolean);
    create function private.fatture_ricevute_calcola_saldi(uuid, integer, uuid)
      returns setof private.saldi_finti language sql as $$select * from private.saldi_finti$$;
    create function public.fatture_ricevute_saldi(p_company_id uuid, p_anno integer default null)
      returns table(id uuid) language sql as $$select null::uuid$$;
  `);
  await db.exec(migration);
}, 20_000);

beforeEach(async () => {
  await db.exec(`
    truncate company_costs, rate_fornitori, private.saldi_finti;
    insert into company_costs values ('${costo}', '${azienda}', null);
    -- Due rate da 1.263,42: la prima «pagata» a mano, la seconda da pagare.
    insert into private.saldi_finti values
      ('${fattura}', 2526.84, 1263.42, 1263.42, 0, null, null, 1, 2, false),
      ('${altra}', 500, 500, 0, 0, '2026-10-01', '2026-10-01', 1, 1, false);
    insert into rate_fornitori values
      ('${id(10)}', '${azienda}', '${costo}', '${fattura}', 1263.42, 'pagata', 1263.42),
      ('${id(11)}', '${azienda}', '${costo}', '${fattura}', 1263.42, 'da_pagare', 1263.42);
  `);
});
afterAll(async () => { await db?.close(); });

const riga = async (f: string) => (await db.query<Record<string, unknown>>(`
  select s.pagato::float8, s.residuo::float8, s.pagata_il::text, s.data_saldo::text,
    s.segnata_non_registrata::float8 segnata
  from public.fatture_ricevute_saldi($1, 2026) s where s.id = $2`, [azienda, f])).rows[0];

describe("fattura segnata pagata senza pagamento registrato", () => {
  it("la rata scoperta torna nel residuo e la riga lo dice", async () => {
    expect(await riga(fattura)).toEqual({ pagato: 0, residuo: 2526.84, pagata_il: null, data_saldo: null, segnata: 1263.42 });
  });

  it("una fattura tutta «pagata» a mano non dice più «pagata il»", async () => {
    await db.exec(`
      update private.saldi_finti set pagato = 2526.84, residuo = 0, pagata_il = '2026-11-04', data_saldo = '2026-11-04' where id = '${fattura}';
      update rate_fornitori set stato = 'pagata';`);
    expect(await riga(fattura)).toEqual({ pagato: 0, residuo: 2526.84, pagata_il: null, data_saldo: null, segnata: 2526.84 });
  });

  it("il residuo non supera mai il dovuto", async () => {
    await db.exec(`update rate_fornitori set residuo_finto = 9999 where stato = 'pagata'`);
    expect(await riga(fattura)).toMatchObject({ pagato: 0, residuo: 2526.84 });
  });

  it("pagata davvero, rata da pagare, costo annullato o centesimi: niente cambia", async () => {
    const nulla = null as number | string | null;
    const prima = { pagato: 1263.42, residuo: 1263.42, pagata_il: nulla, data_saldo: nulla, segnata: nulla };
    await db.exec(`update rate_fornitori set residuo_finto = 0 where stato = 'pagata'`);
    expect(await riga(fattura)).toEqual(prima);
    await db.exec(`update rate_fornitori set residuo_finto = 0.005 where stato = 'pagata'`);
    expect(await riga(fattura)).toEqual(prima);
    await db.exec(`update rate_fornitori set residuo_finto = 1263.42; update company_costs set annullato_il = now()`);
    expect(await riga(fattura)).toEqual(prima);
    expect(await riga(altra)).toEqual({ pagato: 500, residuo: 0, pagata_il: "2026-10-01", data_saldo: "2026-10-01", segnata: null });
  });
});
