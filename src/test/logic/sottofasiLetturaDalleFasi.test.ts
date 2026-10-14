// src/test/logic/sottofasiLetturaDalleFasi.test.ts
/**
 * Come l'app legge le sottofasi (12/10/2026): partendo dalle fasi della
 * commessa (o dell'azienda), con le sottofasi annidate. Le regole di accesso si
 * valutano così solo sulle fasi richieste. Qui si tiene ferma la forma: una
 * lettura nuova che parte da order_work_subphases in join con la fase va
 * riportata a SOTTOFASI_NELLA_FASE.
 */
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const file: string[] = [];
const cammina = (cartella: string) => {
  for (const voce of readdirSync(cartella, { withFileTypes: true })) {
    const percorso = resolve(cartella, voce.name);
    if (voce.isDirectory()) { if (voce.name !== "test" && voce.name !== "node_modules") cammina(percorso); }
    else if (/\.(ts|tsx)$/.test(voce.name)) file.push(percorso);
  }
};
cammina(resolve(process.cwd(), "src"));
const relativo = (p: string) => p.replace(`${process.cwd()}/`, "");

describe("lettura delle sottofasi", () => {
  it("nessuna lettura parte dalle sottofasi in join con la fase", () => {
    const join = /\.from\(\s*["']order_work_subphases["']\s*\)\s*\.select\([^)]*order_work_phases!inner/;
    expect(file.filter((p) => join.test(readFileSync(p, "utf8"))).map(relativo)).toEqual([]);
  });

  it("i punti che leggono le sottofasi partono dalle fasi", () => {
    const leggono = file.filter((p) => readFileSync(p, "utf8").includes("SOTTOFASI_NELLA_FASE}")).map(relativo).sort();
    expect(leggono).toEqual([
      "src/components/orders/AvanzamentoDaApprovare.tsx",
      "src/hooks/useSottofasi.ts",
      "src/pages/campo/CampoAvanzamento.tsx",
      "src/pages/campo/CampoLavoroDetail.tsx",
      "src/pages/campo/CampoRapportino.tsx",
    ]);
    for (const p of leggono) {
      expect(readFileSync(resolve(process.cwd(), p), "utf8"), p).toMatch(/\.from\(\s*["']order_work_phases["']\s*\)\s*\.select\(`[^`]*\$\{SOTTOFASI_NELLA_FASE\}`\)/);
    }
  });

  it("nel cantiere fasi e sottofasi si leggono con lo stesso ordine completo (stesse righe oltre il massimo per lettura)", () => {
    const pagina = readFileSync(resolve(process.cwd(), "src/pages/campo/CampoAvanzamento.tsx"), "utf8");
    const ordine = /\.eq\("company_id", companyId!\)\s*(?:\/\/[^\n]*\s*)*\.order\("position", \{ ascending: true \}\)\s*\.order\("id", \{ ascending: true \}\)/g;
    expect(pagina.match(ordine)).toHaveLength(2);
  });
});
