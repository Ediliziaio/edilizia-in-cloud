/// <reference types="node" />
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, expect, it } from "vitest";

const db = new PGlite();
const ordine = "a0000000-0000-4000-8000-000000000001";
const azienda = "a0000000-0000-4000-8000-000000000002";
const rata = "a0000000-0000-4000-8000-000000000003";
const nota = "a0000000-0000-4000-8000-000000000004";

beforeAll(async () => {
  await db.exec(`
    create schema private;
    create role anon;
    create role authenticated;
    create table orders (id uuid primary key, company_id uuid);
    create table order_installments (
      id uuid primary key, order_id uuid references orders(id), position int, type text,
      amount numeric, is_paid boolean, paid_date date, invoice_id uuid, documento_fiscale_id uuid
    );
    create table prima_nota_entries (
      id uuid primary key, company_id uuid, order_id uuid, installment_id uuid references order_installments(id),
      is_auto boolean default false, direction text, entry_date date, amount numeric,
      invoice_id uuid, bank_transaction_id uuid, documento_fiscale_id uuid, movimento_id uuid,
      sal_sub_id uuid, cost_id uuid, unita_movimento_id uuid, reversal_of uuid
    );
    create table ordini_variazione (
      order_id uuid, company_id uuid, status text, impatto_economico numeric, offline_signed_on date,
      firmato_il timestamptz, approval_recorded_at timestamptz, richiesto_il timestamptz, created_at timestamptz
    );
    insert into orders values ('${ordine}', '${azienda}');
    insert into order_installments(id,order_id,position,type,amount,is_paid,paid_date)
      values ('${rata}','${ordine}',0,'deposit',400,true,'2026-11-01');
  `);
  const migrazione = await readFile("supabase/migrations/20290502081600_rata_incasso_prima_nota_coerenti.sql", "utf8");
  await db.exec(migrazione.slice(0, migrazione.indexOf("-- Rispetta le regole della funzione corrente")));
}, 20000);

afterAll(() => db.close());

const registra = (importo: number, data: string) => db.query(
  `insert into prima_nota_entries(id, company_id, order_id, installment_id, direction, amount, entry_date)
     values ($1, $2, $3, $4, 'entrata', $5, $6)`, [nota, azienda, ordine, rata, importo, data],
);

it("sincronizza la data, conserva l'importo e riapre la rata insieme all'eliminazione", async () => {
  await expect(registra(250, "2026-11-01")).rejects.toMatchObject({ code: "PT409" });
  await registra(400, "2026-11-01");

  await expect(db.query("update prima_nota_entries set amount = 250 where id = $1", [nota]))
    .rejects.toMatchObject({ code: "23514" });
  await db.query("update prima_nota_entries set entry_date = '2026-11-09' where id = $1", [nota]);
  expect((await db.query("select amount::int, paid_date::text, is_paid from order_installments")).rows)
    .toEqual([{ amount: 400, paid_date: "2026-11-09", is_paid: true }]);
  await expect(db.query("update order_installments set is_paid = false where id = $1", [rata]))
    .rejects.toMatchObject({ code: "23514" });

  await db.query("delete from prima_nota_entries where id = $1", [nota]);
  expect((await db.query("select amount::int, paid_date::text, is_paid from order_installments")).rows)
    .toEqual([{ amount: 400, paid_date: null, is_paid: false }]);
  await expect(registra(400, "2026-11-09")).rejects.toMatchObject({ code: "PT409" });
});
