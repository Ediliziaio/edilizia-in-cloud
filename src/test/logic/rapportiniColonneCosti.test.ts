// I soldi dei rapportini non passano dalle letture dirette: con il GRANT per colonna un «*» darebbe errore a tutti.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { COLONNE_RAPPORTINO, COLONNE_RAPPORTINO_CON_AUTORE } from "@/lib/campo/colonneRapportino";

const tutti = (d: string): string[] => readdirSync(d).flatMap((n) => {
  const p = join(d, n);
  return statSync(p).isDirectory() ? tutti(p) : /\.tsx?$/.test(n) ? [p] : [];
});
const sorgenti = tutti("src").filter((f) => !f.includes("/test/") && !f.includes("/integrations/")).map((f) => [f, readFileSync(f, "utf8")] as const);

describe("costi dei rapportini", () => {
  it("le colonne di tutti non contengono i soldi", () => {
    for (const c of [COLONNE_RAPPORTINO, COLONNE_RAPPORTINO_CON_AUTORE] as string[]) {
      expect(c).not.toMatch(/costo_manodopera|presenze_registrate/);
      expect(c).not.toMatch(/(^|,\s*)\*/);
    }
  });
  it("nessuna lettura diretta con «*» o delle colonne dei soldi", () => {
    const fuori: string[] = [];
    for (const [f, testo] of sorgenti) {
      for (const m of testo.matchAll(/from\(["']campo_rapportini["']\)([\s\S]{0,420}?)\.select\(([^)]*)\)/g)) {
        if (m[1].includes(".from(")) continue;
        if (/^\s*["'`]\*|costo_manodopera|presenze_registrate/.test(m[2]) || m[2].trim() === "") fuori.push(`${f}: ${m[2].slice(0, 50)}`);
      }
    }
    expect(fuori).toEqual([]);
  });
});
