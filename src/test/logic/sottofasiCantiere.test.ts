// src/test/logic/sottofasiCantiere.test.ts
/**
 * Chi scrive order_work_subphases nell'app (07/10/2026). Il database lascia al
 * cantiere solo «fatta»; qui si tiene ferma la lista dei punti che scrivono, perché
 * uno nuovo vada guardato (ufficio con «Ordini e Commesse», oppure solo `fatta`).
 */
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const leggi = (percorso: string) => readFileSync(resolve(process.cwd(), percorso), "utf8");
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
const SCRITTURA = /\.from\(\s*["']order_work_subphases["']\s*\)\s*\.(update|insert|upsert|delete)\(/;

describe("chi scrive le sottofasi", () => {
  it("solo questi file", () => {
    const scrivono = file.filter((p) => SCRITTURA.test(readFileSync(p, "utf8"))).map(relativo).sort();
    expect(scrivono).toEqual([
      "src/hooks/useSottofasi.ts",
      "src/pages/campo/CampoAvanzamento.tsx",
    ]);
  });

  it("l'app di cantiere scrive solo «fatta», e non crea né toglie", () => {
    const pagina = leggi("src/pages/campo/CampoAvanzamento.tsx");
    const scritture = [...pagina.matchAll(/\.from\(\s*["']order_work_subphases["']\s*\)\s*\.update\(([\s\S]*?)\)\s*\.eq\(/g)].map((m) => m[1].trim());
    expect(scritture).toEqual(["{ fatta }"]);
    expect(pagina).not.toMatch(/\.from\(\s*["']order_work_subphases["']\s*\)\s*\.(insert|upsert|delete)\(/);
  });

  it("il rapportino e l'approvazione non scrivono le sottofasi: le spunte le applica il database", () => {
    for (const percorso of [
      "src/pages/campo/CampoRapportino.tsx",
      "src/components/orders/OrdineRapportiniCampo.tsx",
      "src/components/orders/AvanzamentoDaApprovare.tsx",
    ]) {
      expect(leggi(percorso)).not.toMatch(/order_work_subphases["']\s*\)\s*\.(update|insert|upsert|delete)\(/);
    }
  });
});
