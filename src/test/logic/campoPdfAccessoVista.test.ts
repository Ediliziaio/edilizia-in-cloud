import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Collaudo 23/11/2026: l'operaio riceveva 403 sul PDF del proprio rapportino perché la funzione controllava
// l'accesso sulla tabella grezza, che dal 12/11 una regola restrittiva nasconde a chi non ha diritti d'ufficio.
describe("PDF del rapportino: il controllo d'accesso passa dalla vista", () => {
  const sorgente = readFileSync("supabase/functions/genera-pdf-rapportino/index.ts", "utf8");

  it("col token dell'utente legge campo_rapportini_visibili, non la tabella", () => {
    expect(sorgente).toMatch(/caller\.from\("campo_rapportini_visibili"\)\.select\("id"\)/);
    expect(sorgente).not.toMatch(/caller\.from\("campo_rapportini"\)/);
  });
});
