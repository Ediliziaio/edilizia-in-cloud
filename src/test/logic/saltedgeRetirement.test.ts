import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";

const retirement = readFileSync(resolve("supabase/migrations/20261027131446_retire_enable_banking_connector.sql"), "utf8");

describe("Ritiro del vecchio connettore senza cancellazioni contabili", () => {
  it("funziona anche senza pg_cron", async () => {
    const db = new PGlite();
    try { await db.exec(retirement); } finally { await db.close(); }
  });
  it("rimuove solo il job obsoleto, e' idempotente e preserva i dati", async () => {
    const db = new PGlite();
    try {
      await db.exec(`
        create schema cron;
        create table cron.job(jobid bigint primary key, jobname text);
        create function cron.unschedule(bigint) returns boolean language sql as
          'with removed as (delete from cron.job where jobid=$1 returning 1) select exists(select 1 from removed)';
        insert into cron.job values (1,'bank-eb-nightly-sync'),(2,'bank-auto-reconcile');
        create table bank_accounts(id int primary key, current_balance numeric);
        create table bank_transactions(id int primary key, amount numeric, note text);
        insert into bank_accounts values (1,123.45);
        insert into bank_transactions values (1,-10,'Nota conservata');
      `);
      await db.exec(retirement);
      await db.exec(retirement);
      expect((await db.query("select jobname from cron.job")).rows).toEqual([{ jobname: "bank-auto-reconcile" }]);
      expect((await db.query("select current_balance from bank_accounts")).rows).toEqual([{ current_balance: "123.45" }]);
      expect((await db.query("select amount,note from bank_transactions")).rows).toEqual([{ amount: "-10", note: "Nota conservata" }]);
    } finally { await db.close(); }
  });
});
