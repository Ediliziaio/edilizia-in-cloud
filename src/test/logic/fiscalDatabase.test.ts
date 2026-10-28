import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { it, expect } from "vitest";
const c = "10000000-0000-4000-8000-000000000001",
  other = "20000000-0000-4000-8000-000000000001",
  u = "10000000-0000-4000-8000-000000000002";
async function setup() {
  const db = new PGlite();
  await db.exec(`
 create schema auth;create role authenticated;create role anon;create type app_role as enum('super_admin');
 create function auth.uid() returns uuid language sql stable as $$select '${u}'::uuid$$;
 create function e_amministratore_di(uuid) returns boolean language sql stable as $$select $1='${c}'::uuid and coalesce(current_setting('test.admin',true),'yes')='yes'$$;
 create function has_role(uuid,app_role) returns boolean language sql stable as $$select false$$;
 create function utente_bloccato() returns boolean language sql stable as $$select false$$;
 create function utente_e_cliente_esterno() returns boolean language sql stable as $$select false$$;
 create function utente_sola_lettura(uuid) returns boolean language sql stable as $$select coalesce(current_setting('test.readonly',true),'no')='yes'$$;
 create function data_detrazione_iva(date,timestamptz) returns date language sql immutable as $$select coalesce($2::date,$1)$$;
 create function liquidazione_iva_periodo(uuid,text,integer,integer,integer) returns jsonb language sql stable as $$select '{"calcolabile":false,"iva_vendite":0,"iva_acquisti":0,"saldo":0,"motivo":"Dati non verificati"}'::jsonb$$;
 create table companies(id uuid primary key);insert into companies values('${c}'),('${other}');
 create table f24_entries(id uuid primary key default gen_random_uuid(),company_id uuid,anno integer,mese integer,tributo_code text,tributo_descrizione text,importo numeric,stato text,data_scadenza date,data_pagamento date,note text,created_at timestamptz default now(),updated_at timestamptz default now(),unique(company_id,anno,mese,tributo_code));
 create table ritenute_garanzia(id uuid primary key default gen_random_uuid(),company_id uuid,importo numeric,stato text,data_svincolo_effettiva date,note text,created_at timestamptz default now());
 create table documenti_fiscali(id uuid primary key default gen_random_uuid(),company_id uuid,data_emissione date,imponibile_totale numeric,iva_totale numeric,totale_documento numeric,riepilogo_iva jsonb,esigibilita_iva text,deleted_at timestamptz,stato text,sdi_stato text);
 create table fatture_ricevute(id uuid primary key default gen_random_uuid(),company_id uuid,data_fattura date,data_ricezione_sdi timestamptz,imponibile_totale numeric,iva_totale numeric,totale_documento numeric,riepilogo_iva jsonb,aliquota_reverse_charge numeric,stato text);
 grant usage on schema auth,public to authenticated;grant select,insert,update,delete on f24_entries,ritenute_garanzia,documenti_fiscali,fatture_ricevute to authenticated;
 alter table f24_entries enable row level security;create policy tenant on f24_entries to authenticated using(company_id='${c}'::uuid) with check(company_id='${c}'::uuid);
 alter table ritenute_garanzia enable row level security;create policy tenant on ritenute_garanzia to authenticated using(company_id='${c}'::uuid) with check(company_id='${c}'::uuid);
 `);
  await db.exec(
    readFileSync(
      "supabase/migrations/20261026220848_fiscalita_conferme_tracciate.sql",
      "utf8",
    ),
  );
  await db.exec(
    readFileSync(
      "supabase/migrations/20261026221710_fiscalita_rls_initplan.sql",
      "utf8",
    ),
  );
  await db.exec(
    readFileSync(
      "supabase/migrations/20261026221859_fiscalita_rls_auth_uid_cache.sql",
      "utf8",
    ),
  );
  await db.exec("set role authenticated");
  return db;
}
async function preview(db: PGlite) {
  return (
    await db.query<{ v: { versione: string; registrazioni: unknown[] } }>(
      "select fiscalita_f24_anteprima($1,2001,9) v",
      [c],
    )
  ).rows[0].v;
}
const confirm = (
  db: PGlite,
  version: string,
  rows: unknown[] = [{ tributo_code: "1001", importo: 123.45 }],
) =>
  db.query("select fiscalita_f24_conferma($1,2001,9,$2,$3,$4)", [
    c,
    version,
    JSON.stringify(rows),
    "Prospetto del consulente verificato",
  ]);
const transition = (
  db: PGlite,
  state: string,
  rev: number,
  reason = "Prospetto e registrazioni verificati",
) =>
  db.query("select fiscalita_transizione_periodo($1,'2001-09-01',$2,$3,$4)", [
    c,
    rev,
    state,
    reason,
  ]);
it("keeps preview read-only and confirms only explicit sourced amounts without payment", async () => {
  const db = await setup();
  try {
    const p = await preview(db);
    expect(p.registrazioni).toEqual([]);
    expect((await db.query("select * from fiscalita_storico")).rows).toEqual(
      [],
    );
    await confirm(db, p.versione);
    expect(
      (
        await db.query(
          "select importo,stato,data_scadenza,data_pagamento from f24_entries",
        )
      ).rows,
    ).toEqual([
      {
        importo: "123.45",
        stato: "da_pagare",
        data_scadenza: null,
        data_pagamento: null,
      },
    ]);
    expect(
      (await db.query("select attore from fiscalita_storico")).rows,
    ).toEqual([{ attore: u }]);
    await expect(confirm(db, p.versione)).rejects.toThrow("cambiate");
    await expect(
      db.query("select f24_componi($1,2001,9,false)", [c]),
    ).rejects.toThrow("automatica");
  } finally {
    await db.close();
  }
}, 30000);
it("rolls back a partial failure and denies another company or read-only writes", async () => {
  const db = await setup();
  try {
    const p = await preview(db);
    await expect(
      confirm(db, p.versione, [
        { tributo_code: "1001", importo: 100 },
        { tributo_code: "3918", importo: 10 },
      ]),
    ).rejects.toThrow("Codice");
    expect((await db.query("select * from f24_entries")).rows).toHaveLength(0);
    expect(
      (await db.query("select * from fiscalita_storico")).rows,
    ).toHaveLength(0);
    await db.exec("select set_config('test.readonly','yes',false)");
    await expect(confirm(db, p.versione)).rejects.toThrow("autorizzata");
    await db.exec("select set_config('test.readonly','no',false)");
    await expect(
      db.query("select fiscalita_f24_anteprima($1,2001,9)", [other]),
    ).rejects.toThrow("autorizzata");
  } finally {
    await db.close();
  }
}, 30000);
it("closes and reopens only with revision and reason, blocking late amounts but not SDI metadata", async () => {
  const db = await setup();
  try {
    await confirm(db, (await preview(db)).versione);
    await db.query(
      "insert into documenti_fiscali(company_id,data_emissione,iva_totale,stato) values($1,'2001-09-15',22,'emessa')",
      [c],
    );
    await db.query(
      "insert into fatture_ricevute(company_id,data_fattura,iva_totale,stato) values($1,'2001-09-15',22,'letta')",
      [c],
    );
    await transition(db, "chiuso", 0);
    await expect(db.exec("update f24_entries set importo=999")).rejects.toThrow(
      "chiuso",
    );
    await expect(
      db.exec("update documenti_fiscali set iva_totale=999"),
    ).rejects.toThrow("chiuso");
    await expect(
      db.exec("update fatture_ricevute set data_fattura='2001-10-01'"),
    ).rejects.toThrow("chiuso");
    await db.exec("update documenti_fiscali set sdi_stato='consegnata'");
    await expect(db.exec("delete from fatture_ricevute")).rejects.toThrow(
      "chiuso",
    );
    await expect(
      db.exec(
        "update documenti_fiscali set company_id='20000000-0000-4000-8000-000000000001'",
      ),
    ).rejects.toThrow("Identità");
    await expect(transition(db, "aperto", 1, "")).rejects.toThrow("motivo");
    await expect(transition(db, "aperto", 0)).rejects.toThrow("cambiato");
    await transition(db, "aperto", 1, "Rettifica autorizzata dal consulente");
    await db.exec("update f24_entries set importo=124");
    expect(
      (
        await db.query(
          "select * from fiscalita_storico where tabella='fiscalita_periodi'",
        )
      ).rows,
    ).toHaveLength(2);
    await expect(db.exec("delete from fiscalita_storico")).rejects.toThrow(
      "permission denied",
    );
  } finally {
    await db.close();
  }
}, 30000);
it("requires a specific release reference and records no incoming bank payment", async () => {
  const db = await setup();
  try {
    await db.query(
      "insert into ritenute_garanzia(company_id,importo,stato) values($1,100,'trattenuta')",
      [c],
    );
    const row = (
      await db.query<{ id: string; hash: string }>(
        "select id,md5(to_jsonb(r)::text) hash from ritenute_garanzia r",
      )
    ).rows[0];
    const p = (
      await db.query<{ v: { versione: string } }>(
        "select fiscalita_svincolo_anteprima($1,$2) v",
        [c, row.id],
      )
    ).rows[0].v;
    expect(p.versione).toBe(row.hash);
    await expect(
      db.query("select fiscalita_svincolo_anteprima($1,$2)", [other, row.id]),
    ).rejects.toThrow("autorizzata");
    await expect(
      db.query(
        "select fiscalita_svincola($1,$2,'stale','2001-09-10','Verbale verificato')",
        [c, row.id],
      ),
    ).rejects.toThrow("cambiata");
    await expect(
      db.exec(
        "update ritenute_garanzia set stato='svincolata',data_svincolo_effettiva='2001-09-10'",
      ),
    ).rejects.toThrow("riferimento");
    const r = await db.query<{ v: { incasso_registrato: boolean } }>(
      "select fiscalita_svincola($1,$2,$3,'2001-09-10','Verbale di svincolo verificato') v",
      [c, row.id, row.hash],
    );
    expect(r.rows[0].v.incasso_registrato).toBe(false);
    expect(
      (
        await db.query(
          "select prima->>'stato' prima,dopo->>'stato' dopo from fiscalita_storico where azione='UPDATE'",
        )
      ).rows,
    ).toEqual([{ prima: "trattenuta", dopo: "svincolata" }]);
  } finally {
    await db.close();
  }
}, 30000);
it("refuses empty or future closure, anonymous execution and rewriting settled amounts", async () => {
  const db = await setup();
  try {
    await expect(transition(db, "chiuso", 0)).rejects.toThrow("Nessuna");
    await confirm(db, (await preview(db)).versione);
    await expect(
      db.exec(
        "update f24_entries set stato='pagato',data_pagamento='2001-09-16'",
      ),
    ).rejects.toThrow("quietanza");
    await db.exec(
      "update f24_entries set stato='pagato',data_pagamento='2001-09-16',note='Quietanza esterna verificata 123'",
    );
    await expect(db.exec("update f24_entries set importo=1")).rejects.toThrow(
      "immutabile",
    );
    expect(
      (
        await db.query<{ allowed: boolean }>(
          "select has_function_privilege('anon','fiscalita_f24_conferma(uuid,integer,integer,text,jsonb,text)','execute') allowed",
        )
      ).rows[0].allowed,
    ).toBe(false);
    await expect(
      db.query(
        "select fiscalita_transizione_periodo($1,'2099-01-01',0,'chiuso','Periodo futuro')",
        [c],
      ),
    ).rejects.toThrow("concluso");
  } finally {
    await db.close();
  }
}, 30000);

it("prevents mismatched VAT months and direct API bypasses before any audit row is created", async () => {
  const db = await setup();
  try {
    const p = await preview(db);
    await expect(
      confirm(db, p.versione, [{ tributo_code: "6001", importo: 100 }]),
    ).rejects.toThrow("coerenti");
    await expect(
      db.query(
        "insert into f24_entries(company_id,anno,mese,tributo_code,importo,stato,note) values($1,2001,9,'3918',100,'da_pagare','Prospetto verificato')",
        [c],
      ),
    ).rejects.toThrow("supportato");
    await expect(
      confirm(db, p.versione, [{ tributo_code: "6009", importo: 100.001 }]),
    ).rejects.toThrow("valido");
    expect(
      (await db.query("select * from fiscalita_storico")).rows,
    ).toHaveLength(0);
    await confirm(db, p.versione, [{ tributo_code: "6009", importo: 100 }]);
    await expect(db.exec("update f24_entries set mese=1")).rejects.toThrow(
      "coerenti",
    );
  } finally {
    await db.close();
  }
}, 30000);
