import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
const company = "10000000-0000-4000-8000-000000000001",
  employee = "10000000-0000-4000-8000-000000000002";
async function setup() {
  const db = new PGlite();
  await db.exec(`create role anon;create role authenticated;create schema auth;
 create function cedolino_visibile_a_chi_chiede(uuid) returns boolean language sql stable as $$select coalesce(current_setting('test.allowed',true),'yes')='yes'$$;
 create table employees(id uuid primary key,company_id uuid,first_name text,last_name text,gross_salary numeric,monthly_hours numeric,is_active boolean);
 insert into employees values('${employee}','${company}','Persona','Test',4000,160,true);
 create function cedolino_ore_periodo(uuid,integer,integer) returns jsonb language sql stable as $$select jsonb_build_object('calcolabile',true,'ore_ordinarie',coalesce(nullif(current_setting('test.hours',true),''),'160')::numeric,'ore_assenza_giustificate',0,'ore_straordinario_25',0,'ore_straordinario_50',0,'ore_straordinario_100',0,'anomalie',case when current_setting('test.anomaly',true)='yes' then '[{"testo":"Spaiata"}]'::jsonb else '[]'::jsonb end)$$;
 create table hr_cedolini(id uuid primary key default gen_random_uuid(),company_id uuid,employee_id uuid,anno integer,mese integer,stato text,documento_id uuid,lordo numeric,netto numeric,contributi_dipendente numeric,ritenute_irpef numeric,contributi_datore numeric not null default 0,generation_method text,data_emissione date,unique(employee_id,anno,mese));
 create table hr_paghe_documenti(id uuid primary key default gen_random_uuid(),company_id uuid,employee_id uuid,anno integer,mese integer,tipo text,sostituito_da uuid,file_path text,cedolino_id uuid,per_dipendente boolean,dati jsonb);
 `);
  await db.exec(
    readFileSync(
      "supabase/migrations/20261026211245_hr_paghe_stime_sicure.sql",
      "utf8",
    ),
  );
  return db;
}
const calc = (db: PGlite, year = 2026) =>
  db.query<{
    v: {
      calcolabile: boolean;
      tipo_risultato: string;
      ritenute_irpef: number;
      lordo: number;
      trattenuta_ore_mancanti: number;
      motivo: string;
    };
  }>("select cedolino_calcola_base($1,$2,10) v", [employee, year]);
it("versions the indicative 2026 tax calculation without changing historical amounts", async () => {
  const db = await setup();
  try {
    const a = (await calc(db, 2025)).rows[0].v,
      b = (await calc(db, 2026)).rows[0].v;
    expect(a.calcolabile && b.calcolabile).toBe(true);
    expect(b.tipo_risultato).toBe("stima_non_validata");
    expect(b.ritenute_irpef).toBeLessThan(a.ritenute_irpef);
    expect(b.lordo).toBe(4000);
    expect(b.trattenuta_ore_mancanti).toBe(0);
    await db.exec("update employees set gross_salary=6000");
    expect((await calc(db, 2026)).rows[0].v.ritenute_irpef).toBe(1682.58);
    expect((await calc(db, 2027)).rows[0].v.calcolabile).toBe(false);
  } finally {
    await db.close();
  }
}, 30000);
it("preserves the original import flow without inventing zeros or reusing amounts from a superseded document", async () => {
  const db = await setup();
  try {
    const id = (
      await db.query<{ id: string }>(
        `insert into hr_paghe_documenti(company_id,employee_id,anno,mese,tipo,file_path,per_dipendente,dati) values('${company}','${employee}',2026,10,'cedolino','originale.pdf',true,'{"lordo":4000,"netto":2800,"contributi_dipendente":350,"ritenute_irpef":850}') returning id`,
      )
    ).rows[0].id;
    await db.query("select paghe_scrivi_cedolino($1,true)", [id]);
    expect(
      (await db.query("select stato,netto,contributi_datore from hr_cedolini"))
        .rows,
    ).toEqual([{ stato: "emesso", netto: "2800", contributi_datore: null }]);
    await db.exec("update hr_paghe_documenti set dati='{}'");
    await db.query("select paghe_scrivi_cedolino($1,true)", [id]);
    expect(
      (
        await db.query(
          "select lordo,netto,contributi_dipendente,ritenute_irpef from hr_cedolini",
        )
      ).rows,
    ).toEqual([
      {
        lordo: null,
        netto: null,
        contributi_dipendente: null,
        ritenute_irpef: null,
      },
    ]);
  } finally {
    await db.close();
  }
}, 30000);
it("never turns missing registrations, zero hours or anomalies into a salary deduction", async () => {
  const db = await setup();
  try {
    for (const hours of ["0", "80", "159"]) {
      await db.query("select set_config('test.hours',$1,false)", [hours]);
      const v = (await calc(db)).rows[0].v;
      expect(v.calcolabile).toBe(false);
      expect(v.motivo).toContain("nessuna trattenuta");
      expect(v.lordo).toBeUndefined();
    }
    await db.exec(
      "select set_config('test.hours','160',false);select set_config('test.anomaly','yes',false)",
    );
    expect((await calc(db)).rows[0].v.calcolabile).toBe(false);
    await db.exec("select set_config('test.allowed','no',false)");
    await expect(calc(db)).rejects.toThrow("Accesso negato");
  } finally {
    await db.close();
  }
}, 30000);
it("requires an original matching person, company and period before an emitted state can commit", async () => {
  const db = await setup();
  try {
    await expect(
      db.exec(
        `insert into hr_cedolini(company_id,employee_id,anno,mese,stato) values('${company}','${employee}',2026,10,'emesso')`,
      ),
    ).rejects.toThrow("PDF originale");
    expect((await db.query("select * from hr_cedolini")).rows).toHaveLength(0);
    await db.exec(
      `insert into hr_cedolini(company_id,employee_id,anno,mese,stato) values('${company}','${employee}',2026,10,'bozza')`,
    );
    await db.exec(
      `insert into hr_paghe_documenti(company_id,employee_id,anno,mese,tipo,file_path,cedolino_id) select company_id,employee_id,2026,9,'cedolino','test.pdf',id from hr_cedolini`,
    );
    await expect(
      db.exec("update hr_cedolini set stato='emesso'"),
    ).rejects.toThrow("PDF originale");
    await db.exec(
      "begin;update hr_paghe_documenti set mese=10;update hr_cedolini set stato='emesso';commit",
    );
    const id = (await db.query<{ id: string }>("select id from hr_cedolini"))
      .rows[0].id;
    expect(
      (
        await db.query<{ v: { stampabile: boolean; motivo: string } }>(
          "select cedolino_per_stampa($1) v",
          [id],
        )
      ).rows[0].v,
    ).toMatchObject({
      stampabile: false,
      motivo: expect.stringContaining("non è una busta paga"),
    });
  } finally {
    await db.close();
  }
}, 30000);
