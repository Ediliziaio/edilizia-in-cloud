import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Collaudo 23/11/2026: il capocantiere riceveva 403 sul collaudo della propria commessa perché la funzione leggeva
// `orders` col token dell'utente; le regole restrittive la nascondono a chi non ha diritti d'ufficio.
describe("Collaudo col cliente: la commessa si legge dalla vista", () => {
  const sorgente = readFileSync("supabase/functions/collaudo-commessa/index.ts", "utf8");
  it("col token dell'utente legge orders_visibili, non la tabella", () => {
    expect(sorgente).toMatch(/caller\s*\.from\("orders_visibili"\)/);
    expect(sorgente).not.toMatch(/caller\s*\.from\("orders"\)/);
  });
});
