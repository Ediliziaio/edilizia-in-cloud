import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { it, expect } from "vitest";
const company = "10000000-0000-4000-8000-000000000001",
  person = "10000000-0000-4000-8000-000000000002",
  user = "10000000-0000-4000-8000-000000000003",
  other = "20000000-0000-4000-8000-000000000001";
async function setup() {
  const db = new PGlite();
  await db.exec(`create schema private;create schema auth;create role authenticated;create role anon;create type app_role as enum('super_admin');
 create function auth.uid() returns uuid language sql stable as $$select '${user}'::uuid$$;
 create function e_amministratore_di(uuid) returns boolean language sql stable as $$select $1='${company}'::uuid and coalesce(current_setting('test.admin',true),'yes')='yes'$$;
 create function has_role(uuid,app_role) returns boolean language sql stable as $$select false$$;
 create function utente_bloccato() returns boolean language sql stable as $$select false$$;
 create function utente_e_cliente_esterno() returns boolean language sql stable as $$select false$$;
 create function utente_sola_lettura(uuid) returns boolean language sql stable as $$select coalesce(current_setting('test.readonly',true),'no')='yes'$$;
 create function hr_profilo_da_user(uuid,uuid) returns uuid language sql stable as $$select case when $2='${company}'::uuid then '${person}'::uuid end$$;
 create table companies(id uuid primary key);insert into companies values('${company}'),('${other}');
 create table hr_profili(id uuid primary key,company_id uuid,employee_id uuid,nome text,cognome text,buono_pasto_abilitato boolean,rimborso_km_abilitato boolean);
 insert into hr_profili values('${person}','${company}','${person}','Test','Persona',true,true);
 create table hr_chiusure_mensili(company_id uuid,mese date,stato text);
 create table hr_giornate(id uuid primary key default gen_random_uuid(),company_id uuid,profilo_id uuid,data date,ore_lavorate numeric);
 create table hr_impostazioni_benefit(company_id uuid primary key,buono_pasto_attivo boolean,buono_pasto_modalita text,buono_pasto_valore numeric,buono_pasto_soglia_ore numeric,km_tariffa_eur numeric);
 insert into hr_impostazioni_benefit values('${company}',true,'entrambi',8,6,0.35);
 create table hr_buoni_pasto(id uuid primary key default gen_random_uuid(),company_id uuid,profilo_id uuid,giorno date,tipo text,importo numeric,stato text,updated_at timestamptz,note text);
 create unique index pasto_fisso on hr_buoni_pasto(profilo_id,giorno) where tipo='fisso';
 create table hr_rimborsi_km(id uuid primary key default gen_random_uuid(),company_id uuid,profilo_id uuid,giorno date,km numeric,tariffa_eur_km numeric,importo numeric,stato text,updated_at timestamptz,note text);
 create table hr_paghe_documenti(id uuid primary key default gen_random_uuid(),company_id uuid,hr_profilo_id uuid,employee_id uuid,anno int,mese int,sostituito_da uuid);
 grant usage on schema public,auth to authenticated;grant select on hr_profili,hr_giornate,hr_chiusure_mensili,hr_paghe_documenti to authenticated;
 grant select,insert,update,delete on hr_buoni_pasto,hr_rimborsi_km,hr_impostazioni_benefit to authenticated;`);
  const prior = readFileSync(
    "supabase/migrations/20261026202733_hr_chiusura_mese_autorizzata.sql",
    "utf8",
  );
  const guard = prior.slice(
    prior.indexOf("create function private.hr_blocca_mese_chiuso()"),
    prior.indexOf("create trigger hr_guard_mese_giornate"),
  );
  await db.exec(guard);
  await db.exec(
    readFileSync(
      "supabase/migrations/20261026211248_hr_paghe_registri_benefit.sql",
      "utf8",
    ),
  );
  return db;
}
const register = (
  db: PGlite,
  type = "tfr_quota",
  amount = 100,
  request = "30000000-0000-4000-8000-000000000001",
  storno: string | null = null,
) =>
  db.query<{ id: string }>(
    "select hr_paghe_registra($1,$2,$3,$4,$5,$6,$7,$8,null,$9) id",
    [
      company,
      request,
      person,
      "2026-10-01",
      type,
      amount,
      "Riferimento consulente verificato",
      "consulente",
      storno,
    ],
  );
it("keeps an append-only, tenant-scoped ledger with idempotency, explicit signs and traceable reversals", async () => {
  const db = await setup();
  try {
    await db.exec("set role authenticated");
    const id = (await register(db)).rows[0].id;
    expect((await register(db)).rows[0].id).toBe(id);
    await expect(register(db, "tfr_quota", 200)).rejects.toThrow("altri dati");
    await expect(
      register(db, "tfr_anticipo", 10, "30000000-0000-4000-8000-000000000002"),
    ).rejects.toThrow("ridurre");
    await expect(
      db.exec("update hr_paghe_movimenti set importo=999"),
    ).rejects.toThrow("permission denied");
    await expect(db.exec("delete from hr_paghe_movimenti")).rejects.toThrow(
      "permission denied",
    );
    await register(
      db,
      "storno",
      -100,
      "30000000-0000-4000-8000-000000000003",
      id,
    );
    const saldo = await db.query<{ v: { tfr_registrato: number }[] }>(
      "select hr_paghe_saldi($1,'2026-10-31') v",
      [company],
    );
    expect(saldo.rows[0].v[0].tfr_registrato).toBe(0);
    await db.exec("select set_config('test.admin','no',false)");
    expect(
      (await db.query("select * from hr_paghe_movimenti")).rows,
    ).toHaveLength(0);
    await expect(register(db)).rejects.toThrow("non consentita");
  } finally {
    await db.close();
  }
}, 30000);
it("matures only configured meals, cancels deleted days without deleting history and never rewrites settled benefits", async () => {
  const db = await setup();
  try {
    await db.exec(
      `insert into hr_giornate(company_id,profilo_id,data,ore_lavorate) values('${company}','${person}','2026-10-01',8)`,
    );
    expect(
      (await db.query("select importo,stato from hr_buoni_pasto")).rows,
    ).toEqual([{ importo: "8", stato: "maturato" }]);
    await db.exec("delete from hr_giornate");
    expect((await db.query("select stato from hr_buoni_pasto")).rows).toEqual([
      { stato: "annullato" },
    ]);
    await db.exec(
      `insert into hr_giornate(company_id,profilo_id,data,ore_lavorate) values('${company}','${person}','2026-10-01',8)`,
    );
    await expect(
      db.exec("update hr_buoni_pasto set stato='erogato'"),
    ).rejects.toThrow("riferimento");
    await db.exec(
      "update hr_buoni_pasto set stato='erogato',note='Erogazione esterna verificata';update hr_giornate set ore_lavorate=2",
    );
    expect(
      (await db.query("select importo,stato from hr_buoni_pasto")).rows,
    ).toEqual([{ importo: "8", stato: "erogato" }]);
    await expect(
      db.exec("update hr_buoni_pasto set importo=99"),
    ).rejects.toThrow("rettifica separata");
    expect(
      (await db.query("select * from hr_benefit_storico")).rows.length,
    ).toBeGreaterThanOrEqual(4);
  } finally {
    await db.close();
  }
}, 30000);
it("reconciles explicitly, calculates reimbursements on the server, and blocks read-only and closed-period writes", async () => {
  const db = await setup();
  try {
    await db.exec(
      `insert into hr_giornate(company_id,profilo_id,data,ore_lavorate) values('${company}','${person}','2026-10-01',8);update hr_profili set buono_pasto_abilitato=false;set role authenticated`,
    );
    await db.query("select hr_pasti_riconcilia($1,'2026-10-01')", [company]);
    expect((await db.query("select stato from hr_buoni_pasto")).rows).toEqual([
      { stato: "annullato" },
    ]);
    await db.exec(
      `insert into hr_rimborsi_km(company_id,profilo_id,giorno,km,tariffa_eur_km,importo,stato,note) values('${company}','${person}','2026-10-01',10,0.35,999,'da_confermare','Percorso documentato')`,
    );
    expect((await db.query("select importo from hr_rimborsi_km")).rows).toEqual(
      [{ importo: "3.50" }],
    );
    await db.exec("select set_config('test.readonly','yes',false)");
    await expect(register(db)).rejects.toThrow("non consentita");
    await db.exec("select set_config('test.readonly','no',false);reset role");
    await db.exec(
      `insert into hr_chiusure_mensili values('${company}','2026-10-01','chiuso');set role authenticated`,
    );
    await expect(register(db)).rejects.toThrow("riapertura autorizzata");
    await expect(
      db.query("select hr_pasti_riconcilia($1,'2026-10-01')", [company]),
    ).rejects.toThrow("chiuso");
    await expect(db.exec("update hr_rimborsi_km set km=20")).rejects.toThrow(
      "riapertura autorizzata",
    );
  } finally {
    await db.close();
  }
}, 30000);
it("rejects mismatched reconciliation documents and foreign-company people", async () => {
  const db = await setup();
  try {
    const id = (await register(db)).rows[0].id;
    const doc = (
      await db.query<{ id: string }>(
        `insert into hr_paghe_documenti(company_id,employee_id,anno,mese) values('${other}','${person}',2026,10) returning id`,
      )
    ).rows[0].id;
    await db.exec("set role authenticated");
    await expect(
      db.query(
        "insert into hr_paghe_riconciliazioni(company_id,movimento_id,documento_id,motivo,created_by) values($1,$2,$3,'Conferma documento',$4)",
        [company, id, doc, user],
      ),
    ).rejects.toThrow("Documento non coerente");
    await expect(
      db.query(
        "select hr_paghe_registra($1,gen_random_uuid(),$2,'2026-10-01','tfr_quota',100,'Prova altra azienda','azienda')",
        [other, person],
      ),
    ).rejects.toThrow("non consentita");
  } finally {
    await db.close();
  }
}, 30000);
it("avoids fixed/receipt double settlement and does not block attendance updates after a paid receipt", async () => {
  const db = await setup();
  try {
    await db.exec(`insert into hr_giornate(company_id,profilo_id,data,ore_lavorate) values('${company}','${person}','2026-10-01',8);
 insert into hr_buoni_pasto(company_id,profilo_id,giorno,tipo,importo,stato,note) values('${company}','${person}','2026-10-01','ricevuta',10,'maturato','Ricevuta documentata')`);
    await expect(
      db.exec(
        "update hr_buoni_pasto set stato='erogato',note='Pagamento esterno verificato' where tipo='ricevuta'",
      ),
    ).rejects.toThrow("doppio conteggio");
    await db.query("select hr_pasti_riconcilia($1,'2026-10-01')", [company]);
    expect(
      (await db.query("select stato from hr_buoni_pasto where tipo='fisso'"))
        .rows,
    ).toEqual([{ stato: "annullato" }]);
    await db.exec(
      "update hr_buoni_pasto set stato='erogato',note='Pagamento esterno verificato' where tipo='ricevuta';update hr_giornate set ore_lavorate=9",
    );
    expect(
      (await db.query("select stato from hr_buoni_pasto where tipo='ricevuta'"))
        .rows,
    ).toEqual([{ stato: "erogato" }]);
  } finally {
    await db.close();
  }
}, 30000);
it("audits rights and configuration, prevents read-only settings writes and never exposes anonymous RPCs", async () => {
  const db = await setup();
  try {
    await db.exec(
      `update hr_profili set buono_pasto_abilitato=false;set role authenticated;update hr_impostazioni_benefit set buono_pasto_valore=9`,
    );
    const events = await db.query<{ tabella: string }>(
      "select tabella from hr_benefit_storico",
    );
    expect(events.rows.map((r) => r.tabella)).toEqual(
      expect.arrayContaining(["hr_profili_diritti", "hr_impostazioni_benefit"]),
    );
    await db.exec("select set_config('test.readonly','yes',false)");
    await expect(
      db.exec("update hr_impostazioni_benefit set buono_pasto_valore=10"),
    ).rejects.toThrow("non consentita");
    const privileges = await db.query<{ allowed: boolean }>(
      "select has_function_privilege('anon','public.hr_pasti_riconcilia(uuid,date)','execute') allowed",
    );
    expect(privileges.rows[0].allowed).toBe(false);
  } finally {
    await db.close();
  }
}, 30000);
