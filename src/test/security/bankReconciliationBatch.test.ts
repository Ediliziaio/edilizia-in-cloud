import { afterAll, beforeAll, beforeEach, describe, it, expect } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
const pg = new PGlite();
const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const company = id(1),
  user = id(3),
  account = id(4),
  tx = id(10),
  doc = id(40);
async function rpc<T = unknown>(name: string, args: unknown[]) {
  return (
    await pg.query<{ v: T }>(
      `select public.${name}(${args.map((_, i) => `$${i + 1}`).join(",")}) v`,
      args,
    )
  ).rows[0].v;
}
beforeAll(async () => {
  await pg.exec(await readFile("src/test/fixtures/bankWorkspace.sql", "utf8"));
  await pg.exec(await readFile("src/test/fixtures/bankRecalc.sql", "utf8"));
  await pg.exec(
    await readFile(
      "supabase/migrations/20290316140000_bank_movimenti_workspace_ripartizioni.sql",
      "utf8",
    ),
  );
  await pg.exec(
    await readFile(
      "supabase/migrations/20290316141000_bank_workspace_conflicts_no_retry.sql",
      "utf8",
    ),
  );
  await pg.exec(
    await readFile(
      "supabase/migrations/20290316142000_bank_proof_memory_snapshots.sql",
      "utf8",
    ),
  );
  await pg.exec(
    `create function user_can_access_company(uuid) returns boolean language sql stable as $$select not public.utente_sola_lettura($1)$$;`,
  );
  await pg.exec(
    await readFile(
      "supabase/migrations/20290105110000_movimento_senza_fattura.sql",
      "utf8",
    ),
  );
  await pg.exec(
    await readFile("supabase/migrations/20290317090000_bank_riconciliazione_lotti.sql", "utf8"),
  );
  await pg.exec(
    await readFile("supabase/migrations/20290317090000_bank_riconciliazione_lotti.sql", "utf8"),
  );
  await pg.exec(await readFile("supabase/migrations/20290317091000_bank_guard_documento_canonico.sql", "utf8"));
  await pg.exec(await readFile("supabase/migrations/20290317092000_bank_imported_amounts_scope.sql", "utf8"));
  await pg.exec(await readFile("supabase/migrations/20290317093000_bank_details_match_type.sql", "utf8"));
  await pg.exec("alter table invoices add column paid_amount numeric default 0,add column total numeric,add column status text;");
}, 30000);
beforeEach(async () => {
  await pg.exec(`reset role;select set_config('test.user','${user}',false);select set_config('test.role','service_role',false);
 truncate invoices,private.bank_imported_allocations,private.bank_reconciliation_batches,private.bank_adjustment_payments,bank_transactions,bank_reconciliations,bank_accounts,test_permissions,documenti_fiscali,prima_nota_entries cascade;
 insert into test_permissions values('${company}',true,true,true);
 insert into bank_accounts(id,company_id,account_name)values('${account}','${company}','Banca');
 insert into bank_transactions(id,company_id,account_id,booking_date,amount,transaction_type,description,debtor_name)values('${tx}','${company}','${account}','2026-11-12',100,'credit','FT-ALFA-101 saldo fattura','Cliente Alfa');
 insert into documenti_fiscali(id,company_id,numero,totale_da_pagare,cliente_snapshot,data_scadenza) values('${doc}','${company}','FT-ALFA-101',100,'{"ragione_sociale":"Cliente Alfa"}','2026-11-10');
 select set_config('test.role','authenticated',false);set role authenticated;`);
});
afterAll(() => pg.close());
describe("PostgreSQL: proposte e conferma in lotto", () => {
  it("combina importo, identità, numero e data e spiega i riscontri", async () => {
    const p = await rpc<any[]>("bank_proposte_movimento", [company, tx, ""]);
    expect(p[0].forte).toBe(true);
    expect(p[0].motivi).toHaveLength(4);
    expect(p[0].incongruenze).toEqual([]);
    await pg.exec(
      `reset role;select set_config('test.role','service_role',false);update bank_transactions set debtor_name='Sconosciuto',description='Pagamento';select set_config('test.role','authenticated',false);set role authenticated;`,
    );
    expect(
      (await rpc<any[]>("bank_proposte_movimento", [company, tx, ""]))[0].forte,
    ).toBe(false);
  });
  it("una proposta scartata resta manuale e un altro tenant è negato", async () => {
    await pg.exec(
      `reset role;update bank_transactions set proposta_rifiutata_at=now();set role authenticated;`,
    );
    const p = await rpc<any[]>("bank_proposte_movimento", [company, tx, ""]);
    expect(p[0].forte).toBe(false);
    expect(p[0].incongruenze.join(" ")).toContain("scartata");
    await expect(
      rpc("bank_proposte_movimento", [id(99), tx, ""]),
    ).rejects.toThrow();
  });
  it("classifica un giroconto senza creare incassi o costi ed è idempotente", async () => {
    const item = {
      id: tx,
      mode: "none",
      category: "Giroconto",
      expected_remaining: 100,
      revision: 0,
      note: "Trasferimento proprio",
    };
    const a = await rpc<any>("bank_conferma_lotto", [
      company,
      id(70),
      JSON.stringify([item]),
    ]);
    expect(a.count).toBe(1);
    expect(
      await rpc("bank_conferma_lotto", [
        company,
        id(70),
        JSON.stringify([item]),
      ]),
    ).toEqual(a);
    await pg.exec("reset role");
    expect(
      (await pg.query<{n:number}>("select count(*) n from prima_nota_entries")).rows[0].n,
    ).toBe(0);
    expect(
      (
        await pg.query<{chiuso_senza_documento:string;category:string}>(
          "select chiuso_senza_documento,category from bank_transactions",
        )
      ).rows[0],
    ).toEqual({
      chiuso_senza_documento: "nessun_costo",
      category: "Giroconto",
    });
  });
  it("rifiuta residui obsoleti e annulla tutto il lotto se una riga fallisce", async () => {
    const a = {
      id: tx,
      mode: "none",
      category: "Giroconto",
      expected_remaining: 100,
      revision: 0,
    };
    await expect(
      rpc("bank_conferma_lotto", [
        company,
        id(71),
        JSON.stringify([{ ...a, expected_remaining: 99 }]),
      ]),
    ).rejects.toThrow(/cambiato/);
    await expect(
      rpc("bank_conferma_lotto", [
        company,
        id(72),
        JSON.stringify([a, { ...a, id: id(11) }]),
      ]),
    ).rejects.toThrow();
    await pg.exec("reset role");
    expect(
      (await pg.query<{chiuso_senza_documento:string|null}>("select chiuso_senza_documento from bank_transactions"))
        .rows[0].chiuso_senza_documento,
    ).toBeNull();
    expect(
      (
        await pg.query<{n:number}>(
          "select count(*) n from private.bank_reconciliation_batches",
        )
      ).rows[0].n,
    ).toBe(0);
  });
  it("il riepilogo conta tutto il filtro anche con una pagina di una sola riga", async () => {
    await pg.exec(
      `reset role;select set_config('test.role','service_role',false);insert into bank_transactions(id,company_id,account_id,amount,transaction_type,booking_date)values('${id(11)}','${company}','${account}',200,'credit','2026-11-12');select set_config('test.role','authenticated',false);set role authenticated;`,
    );
    const page = await rpc<any>("bank_movimenti_elenco", [company, "{}", 0, 1]);
    expect(page.rows).toHaveLength(1);
    expect(page.totals[0].unreconciled_count).toBe(2);
    expect(page.totals[0].unreconciled_amount).toBe(300);
  });
  it("aggiorna subito il residuo importato e lo ripristina una sola volta", async()=>{
    await pg.exec(`reset role;insert into invoices(id,company_id,invoice_number,total,paid_amount,status) values('${doc}','${company}','FT-EST-1',100,0,'issued');insert into bank_reconciliations(id,company_id,transaction_id,invoice_id,matched_amount) values('${id(80)}','${company}','${tx}','${doc}',40);`);
    await pg.query("select private.bank_record_imported($1,$2,$3)",[company,tx,JSON.stringify({esterne:[{invoice_id:doc,importo:40,numero:'FT-EST-1',provider:'fattureincloud'}]})]);
    expect((await pg.query<{paid_amount:string}>("select paid_amount from invoices")).rows[0].paid_amount).toBe('40');
    await pg.query("select private.bank_reverse_imported($1)",[id(80)]);
    await pg.query("select private.bank_reverse_imported($1)",[id(80)]);
    expect((await pg.query<{paid_amount:string}>("select paid_amount from invoices")).rows[0].paid_amount).toBe('0');
  });

});
