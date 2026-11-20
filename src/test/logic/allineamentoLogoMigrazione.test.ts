import { readFileSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { expect, it } from "vitest";

it("conserva le anagrafiche, salva le tre posizioni e non azzera la preferenza se la migrazione si ripete", async () => {
  const db = new PGlite();
  try {
    await db.exec("create table public.anagrafica_azienda(id int primary key, ragione_sociale text, scala_logo int); insert into public.anagrafica_azienda values(1, 'Impresa esistente', 175);");
    const sql = readFileSync(path.resolve("supabase/migrations/20290422120000_allineamento_logo_documenti.sql"), "utf8");
    await db.exec(`begin; ${sql} commit;`);
    expect((await db.query("select * from public.anagrafica_azienda")).rows).toEqual([{ id: 1, ragione_sociale: "Impresa esistente", scala_logo: 175, allineamento_logo: "left" }]);
    for (const posizione of ["center", "right", "left"]) {
      await db.query("update public.anagrafica_azienda set allineamento_logo = $1 where id = 1", [posizione]);
      expect((await db.query("select allineamento_logo from public.anagrafica_azienda")).rows).toEqual([{ allineamento_logo: posizione }]);
    }
    await expect(db.exec("update public.anagrafica_azienda set allineamento_logo = 'bottom'")).rejects.toThrow(/check constraint/);
    await expect(db.exec("update public.anagrafica_azienda set allineamento_logo = null")).rejects.toThrow(/not-null constraint/);
    await db.exec("update public.anagrafica_azienda set allineamento_logo = 'right'");
    await db.exec(`begin; ${sql} commit;`);
    expect((await db.query("select allineamento_logo from public.anagrafica_azienda")).rows).toEqual([{ allineamento_logo: "right" }]);
  } finally { await db.close(); }
}, 15000);
