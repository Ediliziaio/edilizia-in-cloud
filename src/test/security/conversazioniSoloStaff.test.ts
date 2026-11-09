/**
 * Le conversazioni dell'azienda sono dello staff: il 09/11/2026 un subappaltatore
 * vero leggeva l'elenco con le anteprime, perché bastava appartenere all'azienda.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const CARTELLA = "supabase/migrations";
const ultima = readdirSync(CARTELLA)
  .filter((f) => f.endsWith(".sql"))
  .sort()
  .filter((f) => /create\s+or\s+replace\s+function\s+public\.conversazioni_puo_accedere/i.test(readFileSync(join(CARTELLA, f), "utf8")))
  .at(-1)!;
const sql = readFileSync(join(CARTELLA, ultima), "utf8");

describe("conversazioni_puo_accedere", () => {
  it("chiede un ruolo interno oltre all'appartenenza all'azienda", () => {
    expect(sql).toMatch(/from public\.user_roles/i);
    for (const esterno of ["customer", "subcontractor", "employee", "worker", "referrer", "accountant"]) {
      expect(sql).toContain(`'${esterno}'`);
    }
  });

  it("non si apre ad anon", () => {
    expect(sql).toMatch(/revoke all on function public\.conversazioni_puo_accedere\(uuid\) from public, anon/i);
  });

  it("conta solo gli accessi multi-azienda attivi e non scaduti", () => {
    expect(sql).toMatch(/mca\.status = 'active'/);
    expect(sql).toMatch(/mca\.expires_at is null or mca\.expires_at > now\(\)/);
  });
});
