/**
 * «Disconnetti» Meta scollega una sola azienda. Il 09/11/2026 chiamava
 * DELETE /me/permissions: Facebook toglieva l'app all'intero profilo e cadevano
 * i token di tutte le aziende collegate con quel profilo (12 in un colpo).
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sorgente = readFileSync("supabase/functions/meta-api-proxy/index.ts", "utf8");
const inizio = sorgente.indexOf('case "disconnect": {');
const fine = sorgente.indexOf('case "get-ad-accounts": {', inizio);
const ramo = sorgente.slice(inizio, fine);

describe("Disconnetti Meta", () => {
  it("il ramo si trova nella funzione", () => {
    expect(inizio).toBeGreaterThan(-1);
    expect(fine).toBeGreaterThan(inizio);
  });

  it("non chiama Facebook: niente revoca del profilo", () => {
    expect(ramo).not.toMatch(/fetch\(/);
    expect(ramo).not.toMatch(/method:\s*"DELETE"/);
  });

  it("nessun punto della funzione revoca i permessi del profilo", () => {
    expect(sorgente).not.toMatch(/me\/permissions[^;]*DELETE/);
  });

  it("scollega comunque questa azienda e cancella le sue credenziali", () => {
    expect(ramo).toContain('status: "disconnected"');
    expect(ramo).toMatch(/from\("integration_credentials"\)\s*\.delete\(\)\s*\.eq\("integration_id", integration_id\)/);
    expect(ramo).toMatch(/from\("meta_lead_forms"\)\s*\.update\(\{ status: "inactive" \}\)/);
  });
});
