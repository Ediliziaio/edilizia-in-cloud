import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { it, expect } from "vitest";
import {
  moduleConversionSchema,
  moduleMigration,
  seedModules,
  A,
  Q,
} from "../fixtures/moduleConversionDatabase";
import {
  workCopySchema,
  workCopyMigration,
} from "../fixtures/workCopyDatabase";
import { MATERIALS_MIGRATION } from "../fixtures/fasiMaterialiDatabase";
it("duplicare una commessa riclassificata conserva le lavorazioni fuori dagli acquisti", async () => {
  const db = new PGlite();
  try {
    await db.exec(moduleConversionSchema);
    await db.exec(moduleMigration);
    await db.exec(workCopySchema);
    await db.exec(workCopyMigration);
    await db.exec(
      "alter table order_items add natura_riga text not null default 'materiale';alter table order_work_phases add legacy_order_item_id uuid unique;",
    );
    const migration = readFileSync(MATERIALS_MIGRATION, "utf8");
    const start = migration.indexOf(
      "create or replace function public.duplica_lavoro_atomic",
    );
    const end = migration.indexOf(
      "create function public.solo_materiali_acquistabili",
      start,
    );
    await db.exec(migration.slice(start, end));
    await db.exec(seedModules);
    const p = (
      await db.query<any>(
        "select converti_modulo_commessa_atomic('fv',$1,false,true) r",
        [Q],
      )
    ).rows[0].r;
    const order = (
      await db.query<any>(
        "select converti_modulo_commessa_atomic('fv',$1,false,false,$2) r",
        [Q, p.impronta],
      )
    ).rows[0].r.id;
    await db.query(
      "update order_items set natura_riga='lavorazione',phase_id=(select id from order_work_phases where order_id=$1 limit 1) where order_id=$1",
      [order],
    );
    const before = (
      await db.query<any>("select to_jsonb(o) r from orders o where id=$1", [
        order,
      ])
    ).rows[0].r;
    const preview = (
      await db.query<any>(
        "select duplica_lavoro_atomic('commessa',$1,false,true) r",
        [order],
      )
    ).rows[0].r;
    expect(Number(preview.materiali)).toBe(0);
    const result = (
      await db.query<any>(
        "select duplica_lavoro_atomic('commessa',$1,false,false,$2,$3) r",
        [order, preview.impronta, "90000000-0000-4000-8000-000000000006"],
      )
    ).rows[0].r;
    expect(
      (
        await db.query<any>(
          "select natura_riga from order_items where order_id=$1",
          [result.id],
        )
      ).rows.every((r) => r.natura_riga === "lavorazione"),
    ).toBe(true);
    expect(
      (
        await db.query<any>("select to_jsonb(o) r from orders o where id=$1", [
          order,
        ])
      ).rows[0].r,
    ).toEqual(before);
    expect(
      (
        await db.query<any>("select company_id from orders where id=$1", [
          result.id,
        ])
      ).rows[0].company_id,
    ).toBe(A);
  } finally {
    await db.close();
  }
}, 60000);
