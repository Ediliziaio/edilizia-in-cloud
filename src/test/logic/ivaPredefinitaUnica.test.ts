import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { IVA_PREDEFINITA_PCT } from "@/lib/preventivi/ivaPredefinita";

// L'IVA di riserva è una sola per tutti i preventivatori: chi scrive `?? 22` o `?? 10` a mano la fa divergere.
const CARTELLE = ["src/hooks", "src/lib", "src/pages/azienda", "src/components"];
const ESCLUSI = /ContractImportDialog|TariffeTab|ivaPredefinita|\/test\//;
// «iva…» preceduto da un non-lettera (così «rivalsa» non conta) e seguito da `?? numero`; oppure `ivaDefault: numero` diverso da 0.
const RIGA = /(^|[^a-zA-Z])iva[_a-zA-Z]*\)?\??\s*\?\?\s*[1-9]\d*\b|ivaDefault:\s*[1-9]\d*/;

function file(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) return file(p);
    return /\.(ts|tsx)$/.test(n) && !ESCLUSI.test(p) ? [p] : [];
  });
}

describe("IVA di riserva unica", () => {
  it("vale 10%", () => expect(IVA_PREDEFINITA_PCT).toBe(10));

  it("nessun preventivatore scrive un'aliquota di riserva a mano", () => {
    const trovate = CARTELLE.flatMap(file).flatMap((f) =>
      readFileSync(f, "utf8").split("\n").map((r, i) => (RIGA.test(r) ? `${f}:${i + 1}: ${r.trim()}` : "")).filter(Boolean),
    );
    expect(trovate).toEqual([]);
  });
});
