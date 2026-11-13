import { afterAll, beforeAll, beforeEach, describe, it, expect } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
const pg = new PGlite();
const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const company = id(1),
  other = id(2),
  user = id(3),
  account = id(4),
  tx = id(10),
  pn1 = id(20),
  pn2 = id(21),
  job1 = id(30),
  job2 = id(31),
  doc1 = id(40),
  doc2 = id(41),
  hr = id(50);
async function rpc<T = unknown>(fn: string, args: unknown[]) {
  return (
    await pg.query<{ v: T }>(
      `select public.${fn}(${args.map((_, i) => `$${i + 1}`).join(",")}) v`,
      args,
    )
  ).rows[0].v;
}
const detail = () => rpc<any>("bank_movimento_dettaglio", [company, tx]);
beforeAll(async () => {
  await pg.exec(await readFile("src/test/fixtures/bankWorkspace.sql", "utf8"));
  await pg.exec(await readFile("src/test/fixtures/bankRecalc.sql", "utf8"));
  await pg.exec(
    `create trigger recalc_ins after insert on bank_reconciliations for each row when(new.ripartita) execute function private.movimento_ripartito_ricalcola();create trigger recalc_upd after update of unmatched_at on bank_reconciliations for each row when(new.ripartita and old.unmatched_at is distinct from new.unmatched_at) execute function private.movimento_ripartito_ricalcola();`,
  );
  await pg.exec(
    await readFile(
      "supabase/migrations/20290316140000_bank_movimenti_workspace_ripartizioni.sql",
      "utf8",
    ),
  );
  // Repeat the actual migration: deployment retries must be safe.
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
}, 30_000);
beforeEach(async () => {
  await pg.exec(`reset role;select set_config('test.role','service_role',false);select set_config('test.user','${user}',false);select set_config('test.external','false',false);select set_config('test.blocked','false',false);
 truncate bank_transaction_contexts,bank_reconciliations,prima_nota_entries,bank_transactions,bank_accounts,test_permissions,documenti_fiscali,invoices,scadenze,company_costs,suppliers,fattura_ordine,orders,mezzi,hr_profili,hr_cedolini,employees,companies cascade;
 insert into companies values('${company}'),('${other}');insert into test_permissions values('${company}',true,true,true);
 insert into bank_accounts(id,company_id,account_name) values('${account}','${company}','Banca prova');
 insert into bank_transactions(id,company_id,account_id,booking_date,amount,transaction_type,description) values('${tx}','${company}','${account}','2026-11-12',1000,'credit','Saldo fatture novembre');
 insert into orders(id,company_id,order_code,description) values('${job1}','${company}','C-ALFA','Casa Alfa'),('${job2}','${company}','C-BETA','Casa Beta');
 insert into documenti_fiscali(id,company_id,ordine_id,numero,totale_da_pagare,cliente_snapshot) values('${doc1}','${company}','${job1}','FT-ALFA-101',400,'{"ragione_sociale":"Cliente Alfa"}'),('${doc2}','${company}','${job2}','FT-BETA-102',600,'{"ragione_sociale":"Cliente Beta"}');
 insert into prima_nota_entries(id,company_id,documento_fiscale_id,amount,direction,description,entry_date,payment_method) values('${pn1}','${company}','${doc1}',400,'entrata','Incasso Alfa','2026-11-12','bonifico'),('${pn2}','${company}','${doc2}',600,'entrata','Incasso Beta','2026-11-12','bonifico');
 insert into hr_profili(id,company_id,nome,cognome) values('${hr}','${company}','Persona','Riservata');
 select set_config('test.role','authenticated',false);set role authenticated;`);
});
afterAll(() => pg.close());
describe("registro bancario e ripartizioni reali PostgreSQL", () => {
  it("mostra tutti gli abbinamenti, le due commesse, senza creare pagamenti duplicati", async () => {
    await rpc("bank_associa_pagamenti", [company, tx, [pn1, pn2]]);
    const d = await detail();
    expect(d.links.financial).toHaveLength(2);
    expect(
      d.links.financial
        .flatMap((f: any) => f.jobs.map((j: any) => j.id))
        .sort(),
    ).toEqual([job1, job2]);
    expect(d.links.matched).toBe(1000);
    expect(d.links.remaining).toBe(0);
    expect(d.reconciliation_status).toBe("reconciled");
    await pg.exec("reset role");
    expect(
      (
        await pg.query(
          "select count(*) n,sum(amount) amount from prima_nota_entries",
        )
      ).rows[0],
    ).toEqual({ n: 2, amount: "1000" });
  });
  it("rifiuta il sovra-abbinamento e annulla anche la prima quota se la seconda fallisce", async () => {
    await pg.exec(
      `reset role;update prima_nota_entries set amount=700 where id='${pn2}';set role authenticated;`,
    );
    await expect(
      rpc("bank_associa_pagamenti", [company, tx, [pn1, pn2]]),
    ).rejects.toThrow(/superano/);
    expect((await detail()).links.financial).toHaveLength(0);
    await pg.exec("reset role");
    expect(
      (
        await pg.query<{ n: number }>(
          "select count(*) n from prima_nota_entries where bank_transaction_id is not null",
        )
      ).rows[0].n,
    ).toBe(0);
  });
  it("un pagamento già abbinato non viene usato due volte", async () => {
    await rpc("bank_associa_pagamenti", [company, tx, [pn1]]);
    await expect(
      rpc("bank_associa_pagamenti", [company, tx, [pn1]]),
    ).rejects.toThrow(/già collegato/);
    expect((await detail()).links.remaining).toBe(600);
  });
  it("scollegare la prova conserva il pagamento e libera soltanto la sua quota", async () => {
    await rpc("bank_associa_pagamenti", [company, tx, [pn1, pn2]]);
    const d = await detail();
    await rpc("scollega_riga_ripartita", [
      d.links.financial.find((f: any) => f.label.includes("ALFA")).id,
    ]);
    const after = await detail();
    expect(after.links.financial).toHaveLength(1);
    expect(after.links.history).toHaveLength(1);
    expect(after.links.remaining).toBe(400);
    expect(after.reconciliation_status).toBe("parziale");
    await pg.exec("reset role");
    expect(
      (
        await pg.query(
          `select amount,bank_transaction_id from prima_nota_entries where id='${pn1}'`,
        )
      ).rows[0],
    ).toEqual({ amount: "400", bank_transaction_id: null });
  });
  it("rimuovere il pagamento originario libera la prova e conserva lo storico", async () => {
    await rpc("bank_associa_pagamenti", [company, tx, [pn1, pn2]]);
    await pg.exec(`delete from prima_nota_entries where id='${pn1}'`);
    const d = await detail();
    expect(d.links.remaining).toBe(400);
    expect(d.links.financial).toHaveLength(1);
    expect(d.links.history).toHaveLength(1);
    expect(d.links.history[0].label).toContain("ALFA");
    await pg.exec(
      `reset role;select set_config('test.role','service_role',false);update bank_transactions set amount=400,description='Saldo FT-ALFA-101',reconciliation_status='pending';update bank_reconciliations set unmatched_at=now() where prima_nota_id='${pn2}';select set_config('test.role','authenticated',false);set role authenticated;`,
    );
    expect(await rpc("bank_suggerisci_riconciliazioni", [company])).toBe(0);
  });
  it("correggere l’importo del pagamento invalida l’abbinamento precedente", async () => {
    await rpc("bank_associa_pagamenti", [company, tx, [pn1]]);
    await pg.exec(`update prima_nota_entries set amount=450 where id='${pn1}'`);
    const d = await detail();
    expect(d.links.financial).toHaveLength(0);
    expect(d.links.remaining).toBe(1000);
    expect(d.links.history).toHaveLength(1);
    expect(
      (
        await pg.query<{ bank_transaction_id: string | null }>(
          `select bank_transaction_id from prima_nota_entries where id='${pn1}'`,
        )
      ).rows[0].bank_transaction_id,
    ).toBeNull();
  });
  it("uno storno della Prima nota libera la prova del pagamento originario", async () => {
    await rpc("bank_associa_pagamenti", [company, tx, [pn1]]);
    await pg.exec(
      `insert into prima_nota_entries(company_id,amount,direction,description,reversal_of) values('${company}',400,'uscita','Storno Alfa','${pn1}')`,
    );
    expect((await detail()).links.financial).toHaveLength(0);
    expect((await detail()).links.history).toHaveLength(1);
  });
  it("un’uscita si collega a più pagamenti senza duplicare il costo", async () => {
    await pg.exec(
      `reset role;select set_config('test.role','service_role',false);update bank_transactions set amount=-1000,transaction_type='debit';update prima_nota_entries set direction='uscita';select set_config('test.role','authenticated',false);set role authenticated;`,
    );
    await rpc("bank_associa_pagamenti", [company, tx, [pn1, pn2]]);
    expect((await detail()).links.remaining).toBe(0);
    expect(
      (
        await pg.query<{ n: number }>(
          "select count(*) n from prima_nota_entries",
        )
      ).rows[0].n,
    ).toBe(2);
  });
  it("un movimento non contabilizzato non registra né collega pagamenti", async () => {
    await pg.exec(
      `reset role;select set_config('test.role','service_role',false);update bank_transactions set status='pending';select set_config('test.role','authenticated',false);set role authenticated;`,
    );
    await expect(
      rpc("bank_associa_pagamenti", [company, tx, [pn1]]),
    ).rejects.toThrow(/non è disponibile/);
    await expect(
      rpc("bank_conferma_ripartizione", [company, tx, "[]", null]),
    ).rejects.toThrow(/contabilizzato/);
  });
  it("l’analisi a lotti raggiunge anche i movimenti oltre la prima pagina", async () => {
    await pg.exec(
      `reset role;select set_config('test.role','service_role',false);insert into bank_transactions(company_id,account_id,booking_date,amount,transaction_type,description) select '${company}','${account}','2026-11-11',5,'credit','Generico' from generate_series(1,120);insert into bank_transactions(company_id,account_id,booking_date,amount,transaction_type,description) values('${company}','${account}','2026-11-10',400,'credit','Saldo FT-ALFA-101');select set_config('test.role','authenticated',false);set role authenticated;`,
    );
    expect(await rpc("bank_suggerisci_riconciliazioni", [company])).toBe(0);
    expect(await rpc("bank_suggerisci_riconciliazioni", [company])).toBe(1);
  });
  it("più commesse e destinatari descrivono il bonifico senza aumentare il contante", async () => {
    const rows = [
      { kind: "commessa", target_id: job1, amount: 400 },
      { kind: "commessa", target_id: job2, amount: 600 },
      { kind: "dipendente", target_id: hr, amount: 1000 },
    ];
    const rev = await rpc("bank_context_save", [
      company,
      tx,
      JSON.stringify(rows),
      0,
    ]);
    expect(rev).toBe(1);
    const d = await detail();
    expect(d.links.contexts).toHaveLength(3);
    expect(d.links.matched).toBe(0);
    expect(d.links.remaining).toBe(1000);
    await expect(
      rpc("bank_context_save", [
        company,
        tx,
        JSON.stringify([{ kind: "commessa", target_id: job1, amount: 1001 }]),
        1,
      ]),
    ).rejects.toThrow(/superano/);
    expect((await detail()).links.contexts).toHaveLength(3);
  });
  it("quote duplicate, centesimi non validi e riferimenti di altre aziende sono rifiutati", async () => {
    for (const rows of [
      [
        { kind: "commessa", target_id: job1, amount: 500 },
        { kind: "commessa", target_id: job1, amount: 500 },
      ],
      [{ kind: "commessa", target_id: job1, amount: 1.001 }],
      [{ kind: "commessa", target_id: other, amount: 10 }],
    ])
      await expect(
        rpc("bank_context_save", [company, tx, JSON.stringify(rows), 0]),
      ).rejects.toThrow();
  });
  it("le note usano una revisione: una finestra vecchia non cancella le nuove annotazioni", async () => {
    await rpc("bank_movimento_note", [
      company,
      tx,
      "Acconto opere speciali",
      "Fornitori",
      0,
    ]);
    await expect(
      rpc("bank_movimento_note", [company, tx, "vecchio testo", "Altro", 0]),
    ).rejects.toMatchObject({ code: "PT409" });
    expect((await detail()).note).toBe("Acconto opere speciali");
  });
  it("ricerca sulle note, fatture e commesse; importi italiani e date", async () => {
    await rpc("bank_associa_pagamenti", [company, tx, [pn1, pn2]]);
    await rpc("bank_movimento_note", [
      company,
      tx,
      "Vetrata esclusiva",
      "Fornitori",
      0,
    ]);
    for (const search of [
      "Vetrata esclusiva",
      "FT-ALFA-101",
      "Casa Beta",
      "1.000,00",
      "12/11/2026",
    ]) {
      const r = await rpc<any>("bank_movimenti_elenco", [
        company,
        JSON.stringify({ search }),
        0,
        50,
      ]);
      expect(r.count, search).toBe(1);
    }
    expect(
      (
        await rpc<any>("bank_movimenti_elenco", [
          company,
          JSON.stringify({ search: "%" }),
          0,
          50,
        ])
      ).count,
    ).toBe(0);
  });
  it("totali e conteggio comprendono tutte le pagine e restano separati per valuta", async () => {
    await pg.exec(
      `reset role;select set_config('test.role','service_role',false);insert into bank_transactions(company_id,account_id,booking_date,amount,currency,transaction_type) select '${company}','${account}','2026-11-11',10,'EUR','credit' from generate_series(1,75);insert into bank_transactions(company_id,account_id,booking_date,amount,currency,transaction_type) values('${company}','${account}','2026-11-11',-25,'USD','debit');select set_config('test.role','authenticated',false);set role authenticated;`,
    );
    const a = await rpc<any>("bank_movimenti_elenco", [company, "{}", 0, 50]);
    const b = await rpc<any>("bank_movimenti_elenco", [company, "{}", 50, 50]);
    expect(a.count).toBe(77);
    expect(a.rows).toHaveLength(50);
    expect(b.rows).toHaveLength(27);
    expect(a.totals.find((r: any) => r.currency === "EUR").income).toBe(1750);
    expect(a.totals.find((r: any) => r.currency === "USD").expenses).toBe(25);
  });
  it("una lettura non produce abbinamenti e le proposte non registrano incassi", async () => {
    await pg.exec(
      `reset role;select set_config('test.role','service_role',false);update bank_transactions set amount=400,description='Bonifico FT-ALFA-101';select set_config('test.role','authenticated',false);set role authenticated;`,
    );
    expect(await rpc("bank_suggerisci_riconciliazioni", [company])).toBe(1);
    let d = await detail();
    expect(d.reconciliation_status).toBe("suggestion");
    expect(d.links.financial).toHaveLength(0);
    await rpc("bank_scarta_suggerimento", [company, tx]);
    expect(await rpc("bank_suggerisci_riconciliazioni", [company])).toBe(0);
  });
  it("una coppia scollegata non viene suggerita di nuovo", async () => {
    await rpc("bank_associa_pagamenti", [company, tx, [pn1]]);
    const first = (await detail()).links.financial[0];
    await rpc("bank_scollega_pagamento", [first.id]);
    await pg.exec(
      `reset role;select set_config('test.role','service_role',false);update bank_transactions set amount=400,description='Bonifico FT-ALFA-101';select set_config('test.role','authenticated',false);set role authenticated;`,
    );
    expect(await rpc("bank_suggerisci_riconciliazioni", [company])).toBe(0);
  });
  it("sola lettura, aziende diverse, utenti bloccati e portale clienti non scrivono", async () => {
    await expect(rpc("bank_movimento_dettaglio", [other, tx])).rejects.toThrow(
      /permesso/,
    );
    await pg.exec(
      "reset role;update test_permissions set write=false;set role authenticated",
    );
    expect((await detail()).id).toBe(tx);
    await expect(
      rpc("bank_movimento_note", [company, tx, "no", null, 0]),
    ).rejects.toThrow(/permesso/);
    for (const key of ["test.blocked", "test.external"]) {
      await pg.exec(`select set_config('${key}','true',false)`);
      await expect(detail()).rejects.toThrow(/permesso/);
      await pg.exec(`select set_config('${key}','false',false)`);
    }
  });
  it("i riferimenti al personale non sono visibili o modificabili senza accesso HR", async () => {
    await rpc("bank_context_save", [
      company,
      tx,
      JSON.stringify([{ kind: "dipendente", target_id: hr, amount: 1000 }]),
      0,
    ]);
    await pg.exec(
      "reset role;update test_permissions set hr=false;set role authenticated",
    );
    const d = await detail();
    expect(d.links.contexts).toHaveLength(0);
    await expect(
      rpc("bank_context_save", [company, tx, "[]", 1]),
    ).rejects.toThrow(/riservati/);
  });
  it("anonimo non può invocare le procedure e i dati bancari importati restano immutabili", async () => {
    await expect(
      pg.exec("update bank_transactions set amount=999"),
    ).rejects.toThrow(/non si possono riscrivere/);
    await pg.exec("reset role;set role anon");
    await expect(detail()).rejects.toThrow(/permission denied/);
  });
});
