import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/20290423121000_fatture_ricevute_saldi.sql", "utf8");
const id = (n: number) => `00000000-0000-4000-a000-${String(n).padStart(12, "0")}`;
const [azienda, altra, fattura, costo, scadenza] = [1, 2, 3, 4, 5].map(id);
let db: PGlite;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth; create schema private;
    create function auth.uid() returns uuid language sql as $$select '${id(100)}'::uuid$$;
    create function public.get_my_company_id() returns uuid language sql as $$select '${azienda}'::uuid$$;
    create function public.puo_vedere_documenti_fornitore() returns boolean language sql as $$
      select current_setting('test.legge', true) = 'si'$$;
    create function public.utente_bloccato() returns boolean language sql as $$select false$$;
    create function public.utente_e_cliente_esterno() returns boolean language sql as $$select false$$;
    create function public.user_can_read_accountant_company(uuid) returns boolean language sql as $$select false$$;
    create function public.e_super_admin_dentro(uuid) returns boolean language sql as $$select false$$;
    create function public.e_nota_credito_ricevuta(text) returns boolean language sql as $$select $1 in ('TD04','TD08','passive_credit_note')$$;
    create function public.e_autofattura_ricevuta(text) returns boolean language sql as $$select $1 = 'TD17'$$;

    create table public.fatture_ricevute (
      id uuid primary key, company_id uuid, company_cost_id uuid, data_fattura date default '2026-11-20',
      stato text default 'contabilizzata', tipo_documento text default 'TD01', pagata_il date,
      netto_a_pagare numeric, totale_documento numeric, imponibile_totale numeric,
      iva_totale numeric, ritenuta_importo numeric, riepilogo_iva jsonb, piano_pagamento jsonb
    );
    create table public.company_costs (id uuid primary key, company_id uuid, is_paid boolean default false, paid_date date, annullato_il timestamptz);
    create table public.scadenze (id uuid primary key, company_id uuid, cost_id uuid, direction text, status text, amount numeric, paid_amount numeric);
    create table public.prima_nota_entries (company_id uuid, cost_id uuid, scadenza_id uuid, direction text, amount numeric);
    create table public.rate_fornitori (company_id uuid, fattura_ricevuta_id uuid, importo numeric, stato text, pagata_il date);
    create table public.note_credito_storni (company_id uuid, fattura_id uuid, importo numeric);
    create table private.anticipi (company_id uuid, costo_id uuid, importo numeric);
    create function private.anticipi_compensazioni_al(uuid, date) returns setof private.anticipi
      language sql as $$select * from private.anticipi where company_id = $1$$;
  `);
  await db.exec(migration);
}, 20_000);

beforeEach(async () => {
  await db.exec(`
    reset role;
    set test.legge = 'si';
    truncate fatture_ricevute, company_costs, scadenze, prima_nota_entries, rate_fornitori, note_credito_storni, private.anticipi;
    insert into company_costs(id, company_id) values ('${costo}', '${azienda}');
    insert into fatture_ricevute(id, company_id, company_cost_id, totale_documento, netto_a_pagare)
      values ('${fattura}', '${azienda}', '${costo}', 1000, 1000);
  `);
});
afterAll(async () => { await db?.close(); });

const saldi = (company = azienda, anno = 2026) => db.query(`
  select s.id, s.dovuto::float8, s.pagato::float8, s.residuo::float8, s.iva_split::float8,
    s.rate_pagate, s.rate_totali, s.stornata
  from public.fatture_ricevute_saldi($1, $2) s order by s.id`, [company, anno]);

describe("Saldi delle fatture ricevute", () => {
  it("usa l'importo della Ri.Ba. pagata e conta una sola volta la relativa scrittura", async () => {
    await db.exec(`insert into rate_fornitori values
      ('${azienda}', '${fattura}', 300, 'pagata', '2026-11-20'),
      ('${azienda}', '${fattura}', 700, 'da_pagare', null),
      ('${azienda}', '${fattura}', 60, 'stornata', null);
      insert into prima_nota_entries values ('${azienda}', '${costo}', null, 'uscita', 300);`);
    expect((await saldi()).rows).toEqual([{
      id: fattura, dovuto: 1_000, pagato: 300, residuo: 700, iva_split: 0,
      rate_pagate: 1, rate_totali: 2, stornata: false,
    }]);
  });

  it("sottrae lo storno dai versamenti, conta l'anticipo e riduce il debito con la nota", async () => {
    await db.exec(`insert into scadenze values ('${scadenza}', '${azienda}', '${costo}', 'uscita', 'parziale', 950, 270);
      insert into prima_nota_entries values
      ('${azienda}', '${costo}', '${scadenza}', 'uscita', 100),
      ('${azienda}', null, '${scadenza}', 'uscita', 200),
      ('${azienda}', '${costo}', '${scadenza}', 'entrata', 50);
      insert into private.anticipi values ('${azienda}', '${costo}', 20);
      insert into note_credito_storni values ('${azienda}', '${fattura}', 50);`);
    expect((await saldi()).rows[0]).toMatchObject({ pagato: 270, residuo: 680 });
  });

  it("toglie solo l'IVA split e riconosce un totale già espresso al netto", async () => {
    await db.exec(`update fatture_ricevute set totale_documento = 1220, netto_a_pagare = 1220,
      imponibile_totale = 1000, iva_totale = 220,
      riepilogo_iva = '[{"esigibilita":"S","imposta":200},{"esigibilita":"I","imposta":20}]';
      insert into prima_nota_entries values ('${azienda}', '${costo}', null, 'uscita', 300);`);
    expect((await saldi()).rows[0]).toMatchObject({ dovuto: 1020, pagato: 300, residuo: 720, iva_split: 200 });
    await db.exec("update fatture_ricevute set totale_documento = 1020, netto_a_pagare = 1020;");
    expect((await saldi()).rows[0]).toMatchObject({ dovuto: 1020, residuo: 720 });
    await db.exec("update fatture_ricevute set netto_a_pagare = 1000;");
    expect((await saldi()).rows[0]).toMatchObject({ dovuto: 1000, residuo: 700 });
  });

  it("mantiene dalla fattura il pagamento segnato, con importo netto", async () => {
    await db.exec("update fatture_ricevute set company_cost_id = null, netto_a_pagare = 800, pagata_il = '2026-11-20';");
    expect((await saldi()).rows[0]).toMatchObject({ dovuto: 800, pagato: 800, residuo: 0 });
  });

  it("un costo condiviso con una fattura di un altro anno non duplica i versamenti", async () => {
    await db.exec(`insert into fatture_ricevute(id, company_id, company_cost_id, data_fattura) values
      ('${id(8)}', '${azienda}', '${costo}', '2025-01-01');
      insert into prima_nota_entries values ('${azienda}', '${costo}', null, 'uscita', 250);`);
    expect((await saldi()).rows).toEqual([expect.objectContaining({ id: fattura, pagato: null, residuo: null })]);
  });

  it("note di credito e documenti senza importo non diventano debiti fittizi", async () => {
    await db.exec(`insert into fatture_ricevute(id, company_id, tipo_documento, totale_documento) values
      ('${id(8)}', '${azienda}', 'TD04', -60), ('${id(9)}', '${azienda}', 'TD01', null);`);
    expect((await saldi()).rows.slice(1)).toEqual([
      expect.objectContaining({ id: id(8), pagato: null, residuo: null }),
      expect.objectContaining({ id: id(9), residuo: null }),
    ]);
  });

  it("limita i risultati all'azienda autorizzata senza aprire i registri sottostanti", async () => {
    await db.exec("set role authenticated;");
    expect((await saldi()).rows).toHaveLength(1);
    await expect(saldi(altra)).rejects.toMatchObject({ code: "42501" });
    await expect(db.query("select * from prima_nota_entries")).rejects.toMatchObject({ code: "42501" });
    await db.exec("set test.legge = 'no';");
    await expect(saldi()).rejects.toMatchObject({ code: "42501" });
    await db.exec("reset role; set role anon;");
    await expect(saldi()).rejects.toMatchObject({ code: "42501" });
  });
});
