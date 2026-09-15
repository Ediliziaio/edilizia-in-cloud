import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { daMisurare } from "@/lib/velocity/webVitalsReporter";

describe("misure di velocità: app sempre, sito pubblico a campione", () => {
  it("le pagine dell'app si misurano sempre", () => {
    expect(daMisurare("app.ediliziaincloud.com", false, 0.99)).toBe(true);
    expect(daMisurare("admin.ediliziaincloud.com", false, 0.99)).toBe(true);
  });

  it("il sito pubblico solo nel 5% delle visite", () => {
    expect(daMisurare("www.ediliziaincloud.com", false, 0.01)).toBe(true);
    expect(daMisurare("www.ediliziaincloud.com", false, 0.2)).toBe(false);
  });

  it("i browser automatici mai", () => {
    expect(daMisurare("app.ediliziaincloud.com", true, 0)).toBe(false);
  });

  it("la funzione non chiede l'utente per la chiave pubblica", () => {
    const sorgente = readFileSync("supabase/functions/web-vitals-collect/index.ts", "utf8");
    expect(sorgente).toMatch(/if \(haUtente\(token\)\)/);
  });

  it("il campo «name» dei moduli Meta diventa il nome del contatto", () => {
    const sorgente = readFileSync("supabase/functions/meta-process-leads/index.ts", "utf8");
    expect(sorgente).toMatch(/pick\("full_name", "name"\)/);
  });
});
