/**
 * Fase 5 (14/11/2026): le emesse importate da XML «pagate» senza alcun incasso registrato si
 * riconoscono, e una nuova non nasce pagata senza la data dell'incasso. Migrazione vera su PGlite.
 */
import { afterAll, beforeAll, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";

const pg = new PGlite();
const az = "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

beforeAll(async () => {
  await pg.exec(`
    create role anon; create role authenticated; create role service_role;
    create table invoices(id uuid primary key, company_id uuid, external_provider text, status text, document_type text default 'invoice',
      total numeric, paid_amount numeric default 0, payment_date date, storico_esterno boolean default false, deleted_at timestamptz);
    create table invoice_payments(id uuid default gen_random_uuid(), invoice_id uuid, amount numeric);
    create table scadenze(id uuid primary key default gen_random_uuid(), invoice_id uuid, prima_nota_entry_id uuid);
    create table order_installments(id uuid primary key default gen_random_uuid(), invoice_id uuid);
    create table bank_transactions(id uuid default gen_random_uuid(), linked_scadenza_id uuid, linked_installment_id uuid);
  `);
  const m = readFileSync("supabase/migrations/20290320150100_emesse_importate_pagate_senza_incasso.sql", "utf8");
  await pg.exec(m);
  await pg.exec(m);
  await pg.exec(`insert into invoices (id, company_id, external_provider, status, total, paid_amount, payment_date, storico_esterno) values
    ('${id(1)}', '${az}', 'xml_import', 'paid', 100, 100, '2026-03-31', false),   -- pagata senza prova
    ('${id(2)}', '${az}', 'xml_import', 'paid', 100, 100, '2026-03-31', false),   -- pagata con incasso registrato
    ('${id(3)}', '${az}', 'xml_import', 'paid', 100, 100, '2025-06-30', true),    -- storico, senza prova
    ('${id(4)}', '${az}', 'xml_import', 'issued', 100, 40, '2026-04-10', false),  -- parziale senza prova
    ('${id(5)}', '${az}', 'xml_import', 'paid', 100, 100, '2026-05-31', false),   -- incassata dallo scadenzario
    ('${id(6)}', '${az}', 'xml_import', 'paid', 100, 100, '2026-05-31', false),   -- bonifico abbinato
    ('${id(7)}', '${az}', 'xml_import', 'issued', 100, 0, null, false),           -- da incassare
    ('${id(8)}', '${az}', 'fattureincloud', 'paid', 100, 100, '2026-05-31', false); -- da un gestionale vero
    insert into invoice_payments (invoice_id, amount) values ('${id(2)}', 100);
    insert into scadenze (id, invoice_id, prima_nota_entry_id) values ('${id(50)}', '${id(5)}', gen_random_uuid()), ('${id(60)}', '${id(6)}', null);
    insert into bank_transactions (linked_scadenza_id) values ('${id(60)}');`);
});
afterAll(() => pg.close());

it("riconosce solo le pagate (anche in parte) senza incasso, scadenzario o bonifico", async () => {
  const r = await pg.query<{ invoice_id: string; storico: boolean }>("select invoice_id, storico from fatture_importate_senza_incasso($1) order by invoice_id", [az]);
  expect(r.rows).toEqual([
    { invoice_id: id(1), storico: false },
    { invoice_id: id(3), storico: true },
    { invoice_id: id(4), storico: false },
  ]);
});

it("una importata da XML non nasce pagata senza la data dell'incasso", async () => {
  await expect(pg.query(`insert into invoices (id, company_id, external_provider, status, total, paid_amount) values ($1, $2, 'xml_import', 'paid', 50, 50)`, [id(9), az]))
    .rejects.toThrow(/non nasce pagata/);
  await expect(pg.query(`insert into invoices (id, company_id, external_provider, status, total, paid_amount) values ($1, $2, 'xml_import', 'issued', 50, 20)`, [id(10), az]))
    .rejects.toThrow(/non nasce pagata/);
  // Da incassare, o con la data: entra. Un gestionale esterno non è toccato.
  await pg.query(`insert into invoices (id, company_id, external_provider, status, total, paid_amount) values ($1, $2, 'xml_import', 'issued', 50, 0)`, [id(11), az]);
  await pg.query(`insert into invoices (id, company_id, external_provider, status, total, paid_amount, payment_date) values ($1, $2, 'xml_import', 'paid', 50, 50, '2026-01-31')`, [id(12), az]);
  await pg.query(`insert into invoices (id, company_id, external_provider, status, total, paid_amount) values ($1, $2, 'fattureincloud', 'paid', 50, 50)`, [id(13), az]);
});
