/// <reference types="node" />
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
const A = "11111111-1111-4111-8111-111111111111",
  B = "22222222-2222-4222-8222-222222222222",
  U = "33333333-3333-4333-8333-333333333333",
  D = "44444444-4444-4444-8444-444444444444",
  K = "55555555-5555-4555-8555-555555555555";
const sql = readFileSync(
  "supabase/migrations/20281027073933_ritenute_bonifici_parlanti.sql",
  "utf8",
);
function fn(file: string, name: string) {
  const text = readFileSync(`supabase/migrations/${file}`, "utf8"),
    start = text.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`);
  if (start < 0) throw Error("Missing actual legacy function");
  return text.slice(
    start,
    text.indexOf("$function$;", text.indexOf("AS $function$", start)) + 12,
  );
}
async function setup() {
  const db = new PGlite();
  await db.exec(`create schema auth;create role authenticated;create role anon;create type app_role as enum('super_admin');
  create function auth.uid() returns uuid language sql stable as $$select '${U}'::uuid$$;
  create function e_amministratore_di(uuid) returns boolean language sql stable as $$select $1='${A}'::uuid and coalesce(current_setting('test.admin',true),'yes')='yes'$$;
  create function has_role(uuid,app_role) returns boolean language sql stable as $$select false$$;
  create function user_can_read_accountant_company(uuid) returns boolean language sql stable as $$select false$$;
  create function utente_bloccato() returns boolean language sql stable as $$select false$$;
  create function utente_e_cliente_esterno() returns boolean language sql stable as $$select false$$;
  create function utente_sola_lettura(uuid) returns boolean language sql stable as $$select coalesce(current_setting('test.readonly',true),'no')='yes'$$;
  create function get_my_company_id() returns uuid language sql stable as $$select '${A}'::uuid$$;
  create function fiscalita_verifica_scrittura(uuid) returns void language plpgsql set search_path=public as $$begin if not e_amministratore_di($1) or utente_sola_lettura($1) then raise exception 'Operazione fiscale non autorizzata';end if;end$$;
  create function stato_documento_da_sdi(text,text) returns text language sql as $$select 'consegnata'::text$$;
  create function documento_stornato_totale(uuid) returns numeric language sql as $$select 0::numeric$$;
  create table companies(id uuid primary key);insert into companies values('${A}'),('${B}');
  create table documenti_fiscali(id uuid primary key,company_id uuid,numero text,tipo text,stato text,deleted_at timestamptz,totale_da_pagare numeric,importo_pagato numeric default 0,pagato_at timestamptz,updated_at timestamptz,sdi_stato text,sdi_id_trasmissione text,iva_totale numeric default 1000);
  insert into documenti_fiscali(id,company_id,numero,tipo,stato,totale_da_pagare,sdi_stato) values('${D}','${A}','TEST/26','fattura','consegnata',11000,'RC');
  create table movimenti_cassa_native(id uuid primary key default gen_random_uuid(),company_id uuid,documento_id uuid,importo numeric,tipo text,metodo text,data_movimento date,riferimento text,note text);
  create table prima_nota_entries(id uuid primary key default gen_random_uuid(),company_id uuid,direction text,category text,description text,amount numeric,entry_date date,payment_method text,reference_number text,is_auto boolean,auto_source text,documento_fiscale_id uuid,notes text,movimento_id uuid references movimenti_cassa_native(id) on delete cascade);
  create table scadenze(id uuid primary key default gen_random_uuid(),company_id uuid,notes text,paid_amount numeric default 0,amount numeric,status text,paid_date date,prima_nota_entry_id uuid,updated_at timestamptz);
  insert into scadenze(company_id,notes,amount,status) values('${A}','[DOC:${D}]',11000,'da_pagare');
  create table bank_reconciliations(movimento_id uuid,unmatched_at timestamptz,transaction_id uuid);
  create table bank_transactions(id uuid,linked_scadenza_id uuid,reconciliation_status text,reconciled_at timestamptz);
  create table fiscalita_periodi(company_id uuid,mese date,stato text);
  create table fiscalita_storico(id uuid default gen_random_uuid(),company_id uuid,tabella text,record_id text,azione text,prima jsonb,dopo jsonb,attore uuid);
  grant usage on schema auth,public to authenticated;grant select on documenti_fiscali,movimenti_cassa_native,prima_nota_entries,scadenze,fiscalita_storico to authenticated;`);
  await db.exec(
    fn(
      "20280920130000_incasso_una_sola_riga_in_prima_nota.sql",
      "registra_incasso_atomico",
    ),
  );
  await db.exec(
    fn(
      "20280925020200_bonifico_su_fattura_interna.sql",
      "storna_incasso_atomico",
    ),
  );
  await db.exec(
    fn(
      "20280924235959_fatture_sdi_esiti_e_scarti.sql",
      "update_fattura_stato_on_movimento",
    ),
  );
  await db.exec(
    "create trigger actual_legacy_receipt_trigger after insert or update or delete on movimenti_cassa_native for each row execute function update_fattura_stato_on_movimento()",
  );
  await db.exec(sql);
  await db.exec("set role authenticated");
  return db;
}
const save = (db: PGlite, patch: Record<string, unknown> = {}) => {
  const p = {
    company: A,
    doc: D,
    lordo: 11000,
    ritenuta: 991.8,
    commissioni: 2,
    netto: 10006.2,
    date: "2026-10-01",
    bank: "Banca prova",
    ref: "TRN-123456",
    key: K,
    confirmed: true,
    ...patch,
  };
  return db.query<{ id: string }>(
    "select registra_bonifico_parlante($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) id",
    Object.values(p),
  );
};
it("settles gross once, posts net only, certifies and reverses while retaining tax history", async () => {
  const db = await setup();
  try {
    const id = (await save(db)).rows[0].id;
    expect(
      (
        await db.query(
          "select importo_pagato,stato,iva_totale,sdi_stato from documenti_fiscali",
        )
      ).rows[0],
    ).toEqual({
      importo_pagato: "11000",
      stato: "pagata",
      iva_totale: "1000",
      sdi_stato: "RC",
    });
    expect(
      (
        await db.query<{ amount: string }>(
          "select amount from prima_nota_entries",
        )
      ).rows[0].amount,
    ).toBe("10006.2");
    expect(
      (await db.query("select paid_amount,status from scadenze")).rows[0],
    ).toEqual({ paid_amount: "11000", status: "pagata" });
    expect(
      (
        await db.query(
          "select importo,importo_netto_banca from movimenti_cassa_native",
        )
      ).rows[0],
    ).toEqual({ importo: "11000", importo_netto_banca: "10006.20" });
    expect((await save(db)).rows[0].id).toBe(id);
    expect(
      (await db.query("select * from prima_nota_entries")).rows,
    ).toHaveLength(1);
    const move = (
      await db.query<{ movimento_id: string }>(
        "select movimento_id from ritenute_bonifici",
      )
    ).rows[0].movimento_id;
    await expect(
      db.query("select storna_incasso_atomico($1,$2)", [A, move]),
    ).rejects.toThrow("storno documentato");
    await db.query(
      "select aggiorna_ritenuta_bonifico($1,$2,1,'certifica','Certificazione banca 2026 verificata')",
      [A, id],
    );
    await expect(
      db.query(
        "select aggiorna_ritenuta_bonifico($1,$2,1,'storna','Operazione stornata')",
        [A, id],
      ),
    ).rejects.toThrow("cambiata");
    await db.query(
      "select aggiorna_ritenuta_bonifico($1,$2,2,'storna','Bonifico restituito, contabile storno 123')",
      [A, id],
    );
    expect(
      (await db.query("select importo_pagato,stato from documenti_fiscali"))
        .rows[0],
    ).toEqual({ importo_pagato: "0", stato: "consegnata" });
    expect(
      (await db.query("select * from prima_nota_entries")).rows,
    ).toHaveLength(0);
    expect(
      (await db.query("select * from movimenti_cassa_native")).rows,
    ).toHaveLength(0);
    expect(
      (
        await db.query(
          "select stato,movimento_id,ritenuta from ritenute_bonifici",
        )
      ).rows[0],
    ).toEqual({ stato: "stornata", movimento_id: null, ritenuta: "991.80" });
    expect(
      (await db.query("select * from fiscalita_storico")).rows,
    ).toHaveLength(3);
  } finally {
    await db.close();
  }
}, 30000);
it("rejects malformed, unconfirmed, foreign-tenant, read-only, closed-month and duplicate writes", async () => {
  const db = await setup();
  try {
    for (const patch of [
      { confirmed: false },
      { netto: 11000 },
      { ritenuta: 0 },
      { commissioni: -2 },
      { lordo: NaN },
      { lordo: 11000.001 },
      { company: B },
      { ref: "" },
      { bank: "" },
      { date: "2090-01-01" },
      { date: "2014-01-01" },
    ])
      await expect(save(db, patch)).rejects.toThrow();
    await db.exec("set test.readonly='yes'");
    await expect(save(db)).rejects.toThrow("autorizzata");
    await db.exec("set test.readonly='no'");
    await db.exec(
      `reset role;insert into fiscalita_periodi values('${A}','2026-10-01','chiuso');set role authenticated`,
    );
    await expect(save(db)).rejects.toThrow("chiuso");
    await db.exec(
      "reset role;delete from fiscalita_periodi;set role authenticated",
    );
    await save(db, {
      lordo: 5500,
      ritenuta: 495.9,
      commissioni: 0,
      netto: 5004.1,
    });
    expect(
      (await db.query<{ stato: string }>("select stato from documenti_fiscali"))
        .rows[0].stato,
    ).toBe("parzialmente_pagata");
    await expect(save(db, { netto: 10007.2, commissioni: 1 })).rejects.toThrow(
      "dati diversi",
    );
    await expect(
      save(db, { key: "66666666-6666-4666-8666-666666666666" }),
    ).rejects.toThrow("già registrata");
    await expect(
      db.exec("update ritenute_bonifici set netto=1"),
    ).rejects.toThrow("permission denied");
    await db.exec("set test.admin='no'");
    expect(
      (await db.query("select * from ritenute_bonifici")).rows,
    ).toHaveLength(0);
  } finally {
    await db.close();
  }
}, 30000);
it("rolls all receipt, invoice and journal changes back if the audit insert fails", async () => {
  const db = await setup();
  try {
    await db.exec(
      `reset role;create function fail_audit() returns trigger language plpgsql as $$begin raise exception 'audit unavailable';end$$;create trigger fail_audit before insert on fiscalita_storico for each row execute function fail_audit();set role authenticated;`,
    );
    await expect(save(db)).rejects.toThrow("audit unavailable");
    for (const table of [
      "ritenute_bonifici",
      "movimenti_cassa_native",
      "prima_nota_entries",
    ])
      expect((await db.query(`select * from ${table}`)).rows).toHaveLength(0);
    expect(
      (
        await db.query<{ importo_pagato: string }>(
          "select importo_pagato from documenti_fiscali",
        )
      ).rows[0].importo_pagato,
    ).toBe("0");
  } finally {
    await db.close();
  }
}, 30000);

it("preserves the other receipt when reversing one of two instalments with the actual legacy trigger", async () => {
  const db = await setup();
  try {
    const one = (
      await save(db, {
        lordo: 5500,
        ritenuta: 495.9,
        commissioni: 0,
        netto: 5004.1,
      })
    ).rows[0].id;
    await save(db, {
      lordo: 5500,
      ritenuta: 495.9,
      commissioni: 0,
      netto: 5004.1,
      ref: "TRN-second",
      key: "66666666-6666-4666-8666-666666666666",
    });
    await db.query(
      "select aggiorna_ritenuta_bonifico($1,$2,1,'storna','Storno documentato primo acconto')",
      [A, one],
    );
    expect(
      (await db.query("select importo_pagato,stato from documenti_fiscali"))
        .rows[0],
    ).toEqual({ importo_pagato: "5500.00", stato: "parzialmente_pagata" });
    expect(
      (await db.query("select paid_amount,status from scadenze")).rows[0],
    ).toEqual({ paid_amount: "5500", status: "parziale" });
    expect(
      (await db.query("select amount from prima_nota_entries")).rows,
    ).toEqual([{ amount: "5004.1" }]);
  } finally {
    await db.close();
  }
}, 30000);
