import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * La pagina Contatti leggeva anche i contatti nel cestino (collaudo 23/11/2026: in Demo 2
 * 297 «contatti» di cui 121 cestinati, tra cui copie di contatti veri di altre aziende).
 * L'elenco e il contatore in testa passano entrambi dal filtro sul cestino.
 */
const sorgente = readFileSync(resolve(__dirname, "../../pages/azienda/marketing/MarketingContacts.tsx"), "utf8");

describe("contatti: mai quelli nel cestino", () => {
  it("la sorgente dell'elenco filtra deleted_at", () => {
    const inizio = sorgente.indexOf("const sorgenteContatti");
    const corpo = sorgente.slice(inizio, sorgente.indexOf("}, [companyId, regoleDeiGruppiAttivi]);", inizio));
    expect(corpo).toContain('.from("marketing_contacts")');
    expect(corpo).toContain('.is("deleted_at", null)');
  });
  it("anche il contatore in testa alla pagina", () => {
    const conteggi = [...sorgente.matchAll(/\.from\("marketing_contacts"\)\s*\.select\("id", \{ count: "exact", head: true \}\)[\s\S]{0,120}/g)].map((m) => m[0]);
    expect(conteggi.length).toBeGreaterThan(0);
    for (const c of conteggi) expect(c).toContain('.is("deleted_at", null)');
  });
});
